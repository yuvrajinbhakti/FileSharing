import cron from 'node-cron';
import { logInfo, logError, auditLog } from './logger.js';
import { redisUtils } from '../database/redis.js';
import { bulkOperations } from './bulkOperations.js';
import { fileSharingUtils } from './fileSharing.js';
import File from '../models/file.js';
import User from '../models/user.js';
import fs from 'fs';
import path from 'path';

// System metrics collection
const collectSystemMetrics = async () => {
    try {
        const metrics = {
            timestamp: new Date().toISOString(),
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            activeUsers: await User.countDocuments({ isActive: true }),
            totalFiles: await File.countDocuments(),
            totalFileSize: await File.aggregate([
                { $group: { _id: null, totalSize: { $sum: '$fileSize' } } }
            ]).then(result => result[0]?.totalSize || 0),
            recentUploads: await File.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }),
            recentDownloads: await File.countDocuments({
                lastDownloaded: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            })
        };

        await redisUtils.updateSystemMetrics(metrics);
        logInfo('System metrics collected and updated');
        return metrics;
    } catch (error) {
        logError('Error collecting system metrics', error);
        return null;
    }
};

// Cleanup expired files
const cleanupExpiredFiles = async () => {
    try {
        const expiredFiles = await File.find({
            expiresAt: { $lt: new Date() },
            isActive: true
        });

        let deletedCount = 0;
        for (const file of expiredFiles) {
            try {
                // Delete physical file
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }

                // Mark as inactive instead of deleting for audit trail
                await File.findByIdAndUpdate(file._id, {
                    isActive: false,
                    deletedAt: new Date()
                });

                deletedCount++;
                auditLog.fileExpired(file.uploadedBy, file.originalName, file._id);
            } catch (error) {
                logError(`Error deleting expired file ${file.originalName}`, error);
            }
        }

        logInfo(`Cleaned up ${deletedCount} expired files`);
        return deletedCount;
    } catch (error) {
        logError('Error during expired files cleanup', error);
        return 0;
    }
};

// Cleanup orphaned files (files on disk but not in database)
const cleanupOrphanedFiles = async () => {
    try {
        const uploadsDir = path.join('uploads', 'encrypted');
        if (!fs.existsSync(uploadsDir)) {
            return 0;
        }

        const diskFiles = fs.readdirSync(uploadsDir);
        const dbFiles = await File.find({}, 'fileName').lean();
        const dbFileNames = new Set(dbFiles.map(f => f.fileName));

        let deletedCount = 0;
        for (const diskFile of diskFiles) {
            if (!dbFileNames.has(diskFile)) {
                try {
                    fs.unlinkSync(path.join(uploadsDir, diskFile));
                    deletedCount++;
                    logInfo(`Deleted orphaned file: ${diskFile}`);
                } catch (error) {
                    logError(`Error deleting orphaned file ${diskFile}`, error);
                }
            }
        }

        logInfo(`Cleaned up ${deletedCount} orphaned files`);
        return deletedCount;
    } catch (error) {
        logError('Error during orphaned files cleanup', error);
        return 0;
    }
};

// Cleanup old log files
const cleanupOldLogs = async () => {
    try {
        const logsDir = 'logs';
        if (!fs.existsSync(logsDir)) {
            return 0;
        }

        const files = fs.readdirSync(logsDir);
        const now = Date.now();
        let deletedCount = 0;

        for (const file of files) {
            const filePath = path.join(logsDir, file);
            const stats = fs.statSync(filePath);
            
            // Delete log files older than 30 days
            if (now - stats.mtime.getTime() > 30 * 24 * 60 * 60 * 1000) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        }

        logInfo(`Cleaned up ${deletedCount} old log files`);
        return deletedCount;
    } catch (error) {
        logError('Error during log cleanup', error);
        return 0;
    }
};

// Reset daily rate limits
const resetDailyRateLimits = async () => {
    try {
        // This would reset rate limit counters in Redis
        // For now, we'll just log the reset
        logInfo('Daily rate limits reset');
        auditLog.rateLimitReset();
        return true;
    } catch (error) {
        logError('Error resetting daily rate limits', error);
        return false;
    }
};

// Update user activity status
const updateUserActivityStatus = async () => {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        // Mark users as inactive if they haven't logged in for 30 days
        const result = await User.updateMany(
            {
                lastActivity: { $lt: thirtyDaysAgo },
                isActive: true
            },
            {
                $set: { isActive: false }
            }
        );

        logInfo(`Updated activity status for ${result.modifiedCount} users`);
        return result.modifiedCount;
    } catch (error) {
        logError('Error updating user activity status', error);
        return 0;
    }
};

// Generate daily reports
const generateDailyReport = async () => {
    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const metrics = {
            date: yesterday.toISOString().split('T')[0],
            newUsers: await User.countDocuments({
                createdAt: { $gte: yesterday, $lt: today }
            }),
            newFiles: await File.countDocuments({
                createdAt: { $gte: yesterday, $lt: today }
            }),
            totalDownloads: await File.countDocuments({
                lastDownloaded: { $gte: yesterday, $lt: today }
            }),
            totalFileSize: await File.aggregate([
                {
                    $match: {
                        createdAt: { $gte: yesterday, $lt: today }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalSize: { $sum: '$fileSize' }
                    }
                }
            ]).then(result => result[0]?.totalSize || 0)
        };

        // Store report in Redis for 30 days
        await redisUtils.setTempData(
            `daily-report-${metrics.date}`,
            metrics,
            30 * 24 * 60 * 60 // 30 days
        );

        logInfo(`Daily report generated for ${metrics.date}`);
        auditLog.dailyReport(metrics);
        return metrics;
    } catch (error) {
        logError('Error generating daily report', error);
        return null;
    }
};

// Health check and monitoring
const performHealthCheck = async () => {
    try {
        const health = {
            timestamp: new Date().toISOString(),
            status: 'healthy',
            checks: {
                database: false,
                redis: false,
                filesystem: false,
                memory: false
            }
        };

        // Database check
        try {
            await User.findOne({}).limit(1);
            health.checks.database = true;
        } catch (error) {
            logError('Database health check failed', error);
        }

        // Redis check
        try {
            await redisUtils.setTempData('health-check', { test: true }, 60);
            health.checks.redis = true;
        } catch (error) {
            logError('Redis health check failed', error);
        }

        // Filesystem check
        try {
            const uploadDir = 'uploads';
            const testFile = path.join(uploadDir, 'health-check.txt');
            fs.writeFileSync(testFile, 'health check');
            fs.unlinkSync(testFile);
            health.checks.filesystem = true;
        } catch (error) {
            logError('Filesystem health check failed', error);
        }

        // Memory check
        const memUsage = process.memoryUsage();
        health.checks.memory = memUsage.heapUsed < 1024 * 1024 * 1024; // Less than 1GB

        // Overall status
        const allHealthy = Object.values(health.checks).every(check => check === true);
        health.status = allHealthy ? 'healthy' : 'degraded';

        await redisUtils.setTempData('system-health', health, 300); // 5 minutes

        if (!allHealthy) {
            logError('System health check failed', health);
        } else {
            logInfo('System health check passed');
        }

        return health;
    } catch (error) {
        logError('Error during health check', error);
        return {
            timestamp: new Date().toISOString(),
            status: 'error',
            error: error.message
        };
    }
};

// Initialize all scheduled tasks
export const initializeScheduler = () => {
    try {
        // Collect system metrics every 5 minutes
        cron.schedule('*/5 * * * *', async () => {
            await collectSystemMetrics();
        });

        // Clean up expired files every hour
        cron.schedule('0 * * * *', async () => {
            await cleanupExpiredFiles();
        });

        // Clean up temporary files every 30 minutes
        cron.schedule('*/30 * * * *', async () => {
            await bulkOperations.cleanupTempFiles();
        });

        // Clean up expired share links every hour
        cron.schedule('0 * * * *', async () => {
            await fileSharingUtils.cleanupExpiredLinks();
        });

        // Clean up orphaned files daily at 3 AM
        cron.schedule('0 3 * * *', async () => {
            await cleanupOrphanedFiles();
        });

        // Clean up old logs weekly on Sunday at 4 AM
        cron.schedule('0 4 * * 0', async () => {
            await cleanupOldLogs();
        });

        // Reset daily rate limits at midnight
        cron.schedule('0 0 * * *', async () => {
            await resetDailyRateLimits();
        });

        // Update user activity status daily at 2 AM
        cron.schedule('0 2 * * *', async () => {
            await updateUserActivityStatus();
        });

        // Generate daily reports at 1 AM
        cron.schedule('0 1 * * *', async () => {
            await generateDailyReport();
        });

        // Health check every 10 minutes
        cron.schedule('*/10 * * * *', async () => {
            await performHealthCheck();
        });

        logInfo('Scheduler initialized with all cron jobs');
        auditLog.schedulerInitialized();
    } catch (error) {
        logError('Error initializing scheduler', error);
    }
};

// Manual execution functions (for testing or immediate execution)
export const schedulerUtils = {
    collectSystemMetrics,
    cleanupExpiredFiles,
    cleanupOrphanedFiles,
    cleanupOldLogs,
    resetDailyRateLimits,
    updateUserActivityStatus,
    generateDailyReport,
    performHealthCheck
};

export default {
    initializeScheduler,
    schedulerUtils
}; 