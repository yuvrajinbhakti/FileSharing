import { bulkOperations } from '../utils/bulkOperations.js';
import { logInfo, logError, auditLog } from '../utils/logger.js';
import { redisUtils } from '../database/redis.js';
import File from '../models/file.js';
import fs from 'fs';

// Create bulk download
export const createBulkDownload = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fileIds, zipName, compressionLevel = 6 } = req.body;

        if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
            return res.status(400).json({
                error: 'File IDs are required',
                code: 'MISSING_FILE_IDS'
            });
        }

        // Create bulk download
        const result = await bulkOperations.createBulkDownload(userId, fileIds, {
            zipName,
            compressionLevel
        });

        // Track user activity
        await redisUtils.trackUserActivity(userId, `Created bulk download with ${fileIds.length} files`);

        res.status(200).json({
            success: true,
            message: 'Bulk download created successfully',
            data: result
        });
    } catch (error) {
        logError('Error creating bulk download', error);
        res.status(500).json({
            error: 'Failed to create bulk download',
            code: 'BULK_DOWNLOAD_ERROR'
        });
    }
};

// Download bulk archive
export const downloadBulkArchive = async (req, res) => {
    try {
        const { downloadId } = req.params;
        const userId = req.user.id;

        // Get download info from Redis
        const downloadInfo = await redisUtils.getTempData(downloadId);
        
        if (!downloadInfo) {
            return res.status(404).json({
                error: 'Download not found or expired',
                code: 'DOWNLOAD_NOT_FOUND'
            });
        }

        if (downloadInfo.userId !== userId) {
            return res.status(403).json({
                error: 'Unauthorized access to download',
                code: 'UNAUTHORIZED_DOWNLOAD'
            });
        }

        if (!fs.existsSync(downloadInfo.zipPath)) {
            return res.status(404).json({
                error: 'Download file not found',
                code: 'FILE_NOT_FOUND'
            });
        }

        // Update download count
        downloadInfo.downloadCount = (downloadInfo.downloadCount || 0) + 1;
        await redisUtils.setTempData(downloadId, downloadInfo, 3600);

        // Set headers for download
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${downloadInfo.fileName || 'bulk-download.zip'}"`);

        // Stream the file
        const stream = fs.createReadStream(downloadInfo.zipPath);
        stream.pipe(res);

        // Clean up file after download (delayed)
        setTimeout(() => {
            if (fs.existsSync(downloadInfo.zipPath)) {
                fs.unlinkSync(downloadInfo.zipPath);
            }
        }, 60000); // 1 minute delay

        logInfo(`Bulk download served: ${downloadId}`);
    } catch (error) {
        logError('Error serving bulk download', error);
        res.status(500).json({
            error: 'Failed to serve bulk download',
            code: 'DOWNLOAD_SERVE_ERROR'
        });
    }
};

// Bulk file deletion
export const bulkDeleteFiles = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fileIds, force = false } = req.body;

        if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
            return res.status(400).json({
                error: 'File IDs are required',
                code: 'MISSING_FILE_IDS'
            });
        }

        // Check if user is admin for force delete
        if (force && req.user.role !== 'admin') {
            return res.status(403).json({
                error: 'Admin privileges required for force delete',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }

        const result = await bulkOperations.bulkDeleteFiles(fileIds, userId, { force });

        // Track user activity
        await redisUtils.trackUserActivity(userId, `Bulk deleted ${result.successCount} files`);

        res.status(200).json({
            success: true,
            message: `Bulk deletion completed: ${result.successCount} successful, ${result.failCount} failed`,
            data: result
        });
    } catch (error) {
        logError('Error in bulk file deletion', error);
        res.status(500).json({
            error: 'Failed to delete files',
            code: 'BULK_DELETE_ERROR'
        });
    }
};

// Bulk metadata update
export const bulkUpdateMetadata = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fileIds, updates } = req.body;

        if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
            return res.status(400).json({
                error: 'File IDs are required',
                code: 'MISSING_FILE_IDS'
            });
        }

        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({
                error: 'Updates are required',
                code: 'MISSING_UPDATES'
            });
        }

        const result = await bulkOperations.bulkUpdateMetadata(fileIds, userId, updates);

        // Track user activity
        await redisUtils.trackUserActivity(userId, `Bulk updated metadata for ${result.updatedCount} files`);

        res.status(200).json({
            success: true,
            message: `Bulk update completed: ${result.updatedCount} files updated`,
            data: result
        });
    } catch (error) {
        logError('Error in bulk metadata update', error);
        res.status(500).json({
            error: 'Failed to update file metadata',
            code: 'BULK_UPDATE_ERROR'
        });
    }
};

// Get bulk operation status
export const getBulkOperationStatus = async (req, res) => {
    try {
        const { operationId } = req.params;
        
        const status = await bulkOperations.getBulkOperationStatus(operationId);

        res.status(200).json({
            success: true,
            data: status
        });
    } catch (error) {
        logError('Error getting bulk operation status', error);
        res.status(500).json({
            error: 'Failed to get operation status',
            code: 'STATUS_ERROR'
        });
    }
};

// Get file statistics
export const getFileStatistics = async (req, res) => {
    try {
        const userId = req.user.id;
        const { dateRange = 30, groupBy = 'day' } = req.query;

        const stats = await bulkOperations.getFileStatistics(userId, {
            dateRange: parseInt(dateRange),
            groupBy
        });

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        logError('Error getting file statistics', error);
        res.status(500).json({
            error: 'Failed to get file statistics',
            code: 'STATS_ERROR'
        });
    }
};

// Cleanup temporary files (admin only)
export const cleanupTempFiles = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                error: 'Admin privileges required',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }

        const deletedCount = await bulkOperations.cleanupTempFiles();

        res.status(200).json({
            success: true,
            message: `Cleaned up ${deletedCount} temporary files`,
            data: { deletedCount }
        });
    } catch (error) {
        logError('Error cleaning up temporary files', error);
        res.status(500).json({
            error: 'Failed to cleanup temporary files',
            code: 'CLEANUP_ERROR'
        });
    }
}; 