import File from '../models/file.js';
import { encryptFile, decryptFile, generateKey, generateFileHash } from '../utils/encryption.js';
import { auditLog, logError } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const uploadFile = async (request, response) => {
    try {
        if (!request.file) {
            return response.status(400).json({ 
                error: 'No file uploaded',
                code: 'NO_FILE'
            });
        }

        const userId = request.user.id;
        const originalFile = request.file;
        
        // Generate encryption key
        const encryptionKey = generateKey();
        
        // Create encrypted file path
        const encryptedFileName = `encrypted_${Date.now()}_${originalFile.filename}`;
        const encryptedPath = path.join('uploads', 'encrypted', encryptedFileName);
        
        // Ensure encrypted directory exists
        const encryptedDir = path.dirname(encryptedPath);
        if (!fs.existsSync(encryptedDir)) {
            fs.mkdirSync(encryptedDir, { recursive: true });
        }
        
        // Generate file hash before encryption
        const fileHash = await generateFileHash(originalFile.path);
        
        // Encrypt the file
        const encryptionResult = await encryptFile(originalFile.path, encryptedPath, encryptionKey);
        
        // Create file record in database
        const fileObj = {
            path: encryptionResult.encryptedPath,
            originalName: originalFile.originalname,
            fileName: encryptedFileName,
            fileSize: originalFile.size,
            mimeType: originalFile.mimetype,
            isEncrypted: true,
            encryptionKey: encryptionKey.toString('hex'),
            encryptionIV: encryptionResult.iv,
            encryptionTag: encryptionResult.tag,
            fileHash: fileHash,
            uploadedBy: userId,
            accessLevel: request.body.accessLevel || 'private',
            expiresAt: request.body.expiresAt ? new Date(request.body.expiresAt) : null,
            description: request.body.description || '',
            tags: request.body.tags ? request.body.tags.split(',').map(tag => tag.trim()) : []
        };
        
        const file = await File.create(fileObj);
        
        // Log the upload
        auditLog.fileUpload(
            userId, 
            request.user.username, 
            file._id, 
            originalFile.originalname, 
            originalFile.size, 
            request.ip
        );
        
        response.status(200).json({ 
            message: 'File uploaded successfully',
            file: {
                id: file._id,
                originalName: file.originalName,
                size: file.fileSize,
                uploadDate: file.createdAt,
                accessLevel: file.accessLevel,
                downloadUrl: `${request.protocol}://${request.get('host')}/api/file/${file._id}`
            }
        });
        
    } catch (error) {
        logError('File upload error', error, { 
            userId: request.user?.id, 
            ip: request.ip,
            fileName: request.file?.originalname 
        });
        
        response.status(500).json({ 
            error: 'File upload failed',
            code: 'UPLOAD_ERROR'
        });
    }
};

export const downloadFile = async (request, response) => {
    try {
        const fileId = request.params.fileId;
        const file = await File.findById(fileId);
        
        if (!file || !file.isActive) {
            return response.status(404).json({ 
                error: 'File not found',
                code: 'FILE_NOT_FOUND'
            });
        }
        
        // Check if user can access this file
        const userId = request.user?.id;
        const userRole = request.user?.role;
        
        if (!file.canAccess(userId, userRole)) {
            auditLog.unauthorizedAccess(
                request.ip, 
                request.get('User-Agent'), 
                request.originalUrl, 
                `Unauthorized file access attempt - FileID: ${fileId}`
            );
            
            return response.status(403).json({ 
                error: 'Access denied',
                code: 'ACCESS_DENIED'
            });
        }
        
        // Check if file exists
        if (!fs.existsSync(file.path)) {
            logError('File not found on disk', new Error('File missing'), { fileId, path: file.path });
            return response.status(404).json({ 
                error: 'File not available',
                code: 'FILE_UNAVAILABLE'
            });
        }
        
        // Decrypt file if encrypted
        let downloadPath = file.path;
        if (file.isEncrypted) {
            const tempFileName = `temp_${Date.now()}_${file.originalName}`;
            const tempPath = path.join('uploads', 'temp', tempFileName);
            
            // Ensure temp directory exists
            const tempDir = path.dirname(tempPath);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            try {
                const decryptionKey = Buffer.from(file.encryptionKey, 'hex');
                await decryptFile(file.path, tempPath, decryptionKey);
                downloadPath = tempPath;
                
                // Clean up temp file after download
                response.on('finish', () => {
                    setTimeout(() => {
                        if (fs.existsSync(tempPath)) {
                            fs.unlinkSync(tempPath);
                        }
                    }, 1000); // Delete after 1 second
                });
                
            } catch (decryptError) {
                logError('File decryption failed', decryptError, { fileId, userId });
                return response.status(500).json({ 
                    error: 'File decryption failed',
                    code: 'DECRYPTION_ERROR'
                });
            }
        }
        
        // Update download count and last downloaded
        file.downloadCount++;
        file.lastDownloaded = new Date();
        await file.save();
        
        // Log the download
        auditLog.fileDownload(
            userId, 
            request.user?.username || 'Anonymous', 
            file._id, 
            file.originalName, 
            request.ip, 
            request.get('User-Agent')
        );
        
        // Set appropriate headers
        response.setHeader('Content-Type', file.mimeType);
        response.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
        
        // Send file
        response.download(downloadPath, file.originalName, (err) => {
            if (err) {
                logError('File download error', err, { fileId, userId });
            }
        });
        
    } catch (error) {
        logError('File download error', error, { 
            fileId: request.params.fileId, 
            userId: request.user?.id,
            ip: request.ip 
        });
        
        response.status(500).json({ 
            error: 'File download failed',
            code: 'DOWNLOAD_ERROR'
        });
    }
};

export const deleteFile = async (request, response) => {
    try {
        const fileId = request.params.fileId;
        const file = await File.findById(fileId);
        
        if (!file) {
            return response.status(404).json({ 
                error: 'File not found',
                code: 'FILE_NOT_FOUND'
            });
        }
        
        // Check if user owns the file or is admin
        if (file.uploadedBy.toString() !== request.user.id && request.user.role !== 'admin') {
            return response.status(403).json({ 
                error: 'Access denied - you can only delete your own files',
                code: 'DELETE_ACCESS_DENIED'
            });
        }
        
        // Delete file from disk
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
        
        // Mark file as inactive (soft delete)
        file.isActive = false;
        await file.save();
        
        // Log the deletion
        auditLog.fileDelete(
            request.user.id, 
            request.user.username, 
            file._id, 
            file.originalName, 
            request.ip
        );
        
        response.json({ 
            message: 'File deleted successfully',
            fileId: file._id
        });
        
    } catch (error) {
        logError('File deletion error', error, { 
            fileId: request.params.fileId, 
            userId: request.user.id 
        });
        
        response.status(500).json({ 
            error: 'File deletion failed',
            code: 'DELETE_ERROR'
        });
    }
};

export const getUserFiles = async (request, response) => {
    try {
        const userId = request.user.id;
        const page = parseInt(request.query.page) || 1;
        const limit = parseInt(request.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        const files = await File.find({ 
            uploadedBy: userId, 
            isActive: true 
        })
        .select('-encryptionKey -encryptionIV -encryptionTag -fileHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
        
        const total = await File.countDocuments({ 
            uploadedBy: userId, 
            isActive: true 
        });
        
        response.json({
            files: files.map(file => ({
                id: file._id,
                originalName: file.originalName,
                size: file.fileSize,
                mimeType: file.mimeType,
                downloadCount: file.downloadCount,
                accessLevel: file.accessLevel,
                uploadDate: file.createdAt,
                lastDownloaded: file.lastDownloaded,
                downloadUrl: `${request.protocol}://${request.get('host')}/api/file/${file._id}`
            })),
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        logError('Get user files error', error, { userId: request.user.id });
        response.status(500).json({ 
            error: 'Failed to retrieve files',
            code: 'GET_FILES_ERROR'
        });
    }
};

// Legacy function names for compatibility
export const uploadImage = uploadFile;
export const getImage = downloadFile;