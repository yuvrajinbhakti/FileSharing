import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { logInfo, logError, auditLog } from './logger.js';
import { decryptFile } from './encryption.js';
import { redisUtils } from '../database/redis.js';
import File from '../models/file.js';
import User from '../models/user.js';

// Bulk file download as ZIP
export const createBulkDownload = async (fileIds, userId, options = {}) => {
    try {
        const {
            zipName = `bulk-download-${Date.now()}.zip`,
            includeSubfolders = true,
            compressionLevel = 6
        } = options;

        // Verify user has access to all files
        const files = await File.find({
            _id: { $in: fileIds },
            $or: [
                { uploadedBy: userId },
                { accessLevel: 'public' },
                { allowedUsers: userId }
            ]
        });

        if (files.length === 0) {
            throw new Error('No accessible files found');
        }

        // Create temporary zip file path
        const tempDir = path.join('uploads', 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const zipPath = path.join(tempDir, zipName);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', {
            zlib: { level: compressionLevel }
        });

        archive.pipe(output);

        // Process each file
        for (const file of files) {
            try {
                // Decrypt file to temporary location
                const tempFilePath = path.join(tempDir, `temp_${file._id}`);
                await decryptFile(
                    file.path,
                    tempFilePath,
                    Buffer.from(file.encryptionKey, 'hex'),
                    file.encryptionIV,
                    file.encryptionTag
                );

                // Add to archive
                archive.file(tempFilePath, { name: file.originalName });

                // Clean up temporary file after adding to archive
                setTimeout(() => {
                    if (fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                    }
                }, 5000);
            } catch (error) {
                logError(`Error processing file ${file.originalName} for bulk download`, error);
                continue;
            }
        }

        // Finalize archive
        await archive.finalize();

        // Store download info in Redis for tracking
        const downloadId = require('crypto').randomBytes(16).toString('hex');
        await redisUtils.setTempData(downloadId, {
            zipPath,
            userId,
            fileIds,
            createdAt: new Date(),
            downloadCount: 0
        }, 3600); // 1 hour expiry

        // Log bulk download
        const user = await User.findById(userId);
        auditLog.bulkDownload(userId, user?.username, fileIds.length, zipName);

        logInfo(`Bulk download created: ${zipName} with ${files.length} files`);

        return {
            downloadId,
            zipPath,
            fileName: zipName,
            fileCount: files.length,
            size: fs.statSync(zipPath).size
        };
    } catch (error) {
        logError('Error creating bulk download', error);
        throw error;
    }
};

// Bulk file upload processing
export const processBulkUpload = async (files, userId, options = {}) => {
    try {
        const {
            accessLevel = 'private',
            tags = [],
            description = '',
            expiresAt = null
        } = options;

        const results = [];
        const user = await User.findById(userId);

        for (const file of files) {
            try {
                // This would integrate with the existing file upload logic
                // For now, we'll create a placeholder result
                const result = {
                    originalName: file.originalname,
                    success: true,
                    fileId: require('crypto').randomBytes(12).toString('hex'),
                    size: file.size,
                    mimeType: file.mimetype
                };

                results.push(result);

                // Log each upload
                auditLog.fileUpload(
                    userId,
                    user?.username,
                    result.fileId,
                    result.originalName,
                    result.size,
                    'bulk-upload'
                );
            } catch (error) {
                logError(`Error uploading file ${file.originalname}`, error);
                results.push({
                    originalName: file.originalname,
                    success: false,
                    error: error.message
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        logInfo(`Bulk upload completed: ${successCount} successful, ${failCount} failed`);

        return {
            totalFiles: files.length,
            successCount,
            failCount,
            results
        };
    } catch (error) {
        logError('Error processing bulk upload', error);
        throw error;
    }
};

// Bulk file deletion
export const bulkDeleteFiles = async (fileIds, userId, options = {}) => {
    try {
        const { force = false } = options;

        // Get files to delete
        const files = await File.find({
            _id: { $in: fileIds },
            $or: [
                { uploadedBy: userId },
                ...(force ? [{}] : []) // Allow admin to delete any file if force is true
            ]
        });

        if (files.length === 0) {
            throw new Error('No files found or insufficient permissions');
        }

        const results = [];
        const user = await User.findById(userId);

        for (const file of files) {
            try {
                // Delete physical file
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }

                // Delete from database
                await File.findByIdAndDelete(file._id);

                results.push({
                    fileId: file._id,
                    fileName: file.originalName,
                    success: true
                });

                // Log deletion
                auditLog.fileDelete(
                    userId,
                    user?.username,
                    file._id,
                    file.originalName,
                    'bulk-delete'
                );
            } catch (error) {
                logError(`Error deleting file ${file.originalName}`, error);
                results.push({
                    fileId: file._id,
                    fileName: file.originalName,
                    success: false,
                    error: error.message
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        logInfo(`Bulk deletion completed: ${successCount} successful, ${failCount} failed`);

        return {
            totalFiles: files.length,
            successCount,
            failCount,
            results
        };
    } catch (error) {
        logError('Error in bulk file deletion', error);
        throw error;
    }
};

// Bulk file metadata update
export const bulkUpdateMetadata = async (fileIds, userId, updates) => {
    try {
        const {
            accessLevel,
            tags,
            description,
            expiresAt
        } = updates;

        // Build update object
        const updateObj = {};
        if (accessLevel) updateObj.accessLevel = accessLevel;
        if (tags) updateObj.tags = tags;
        if (description !== undefined) updateObj.description = description;
        if (expiresAt !== undefined) updateObj.expiresAt = expiresAt;

        // Update files
        const result = await File.updateMany(
            {
                _id: { $in: fileIds },
                uploadedBy: userId
            },
            { $set: updateObj }
        );

        // Log bulk update
        const user = await User.findById(userId);
        auditLog.bulkUpdate(userId, user?.username, fileIds.length, Object.keys(updateObj));

        logInfo(`Bulk metadata update completed: ${result.modifiedCount} files updated`);

        return {
            totalFiles: fileIds.length,
            updatedCount: result.modifiedCount,
            updates: updateObj
        };
    } catch (error) {
        logError('Error in bulk metadata update', error);
        throw error;
    }
};

// Get bulk operation status
export const getBulkOperationStatus = async (operationId) => {
    try {
        const operation = await redisUtils.getTempData(operationId);
        if (!operation) {
            return { status: 'not_found' };
        }

        return {
            status: operation.status || 'completed',
            progress: operation.progress || 100,
            totalFiles: operation.totalFiles || 0,
            processedFiles: operation.processedFiles || 0,
            errors: operation.errors || [],
            result: operation.result || null
        };
    } catch (error) {
        logError('Error getting bulk operation status', error);
        return { status: 'error', error: error.message };
    }
};

// Cleanup temporary files
export const cleanupTempFiles = async () => {
    try {
        const tempDir = path.join('uploads', 'temp');
        if (!fs.existsSync(tempDir)) {
            return;
        }

        const files = fs.readdirSync(tempDir);
        const now = Date.now();
        let deletedCount = 0;

        for (const file of files) {
            const filePath = path.join(tempDir, file);
            const stats = fs.statSync(filePath);
            
            // Delete files older than 1 hour
            if (now - stats.mtime.getTime() > 3600000) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        }

        logInfo(`Cleaned up ${deletedCount} temporary files`);
        return deletedCount;
    } catch (error) {
        logError('Error cleaning up temporary files', error);
        return 0;
    }
};

// File statistics aggregation
export const getFileStatistics = async (userId, options = {}) => {
    try {
        const {
            dateRange = 30, // days
            groupBy = 'day'
        } = options;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - dateRange);

        const pipeline = [
            {
                $match: {
                    uploadedBy: userId,
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m',
                            date: '$createdAt'
                        }
                    },
                    totalFiles: { $sum: 1 },
                    totalSize: { $sum: '$fileSize' },
                    avgSize: { $avg: '$fileSize' },
                    fileTypes: { $addToSet: '$mimeType' }
                }
            },
            {
                $sort: { '_id': 1 }
            }
        ];

        const stats = await File.aggregate(pipeline);

        return {
            dateRange,
            groupBy,
            statistics: stats,
            summary: {
                totalFiles: stats.reduce((sum, stat) => sum + stat.totalFiles, 0),
                totalSize: stats.reduce((sum, stat) => sum + stat.totalSize, 0),
                avgFileSize: stats.reduce((sum, stat) => sum + stat.avgSize, 0) / stats.length || 0
            }
        };
    } catch (error) {
        logError('Error getting file statistics', error);
        throw error;
    }
};

export const bulkOperations = {
    createBulkDownload,
    processBulkUpload,
    bulkDeleteFiles,
    bulkUpdateMetadata,
    getBulkOperationStatus,
    cleanupTempFiles,
    getFileStatistics
};

export default bulkOperations; 