import File from '../models/file.js';
import { encryptFile, decryptFile, generateKey, generateFileHash } from '../utils/encryption.js';
import { auditLog, logError, logInfo } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Helper function to ensure directories exist
const ensureDirectoriesExist = () => {
    const requiredDirs = [
        'uploads',
        'uploads/encrypted',
        'uploads/temp',
        'logs'
    ];
    
    requiredDirs.forEach(dir => {
        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                logInfo(`Created directory: ${dir}`);
            }
        } catch (error) {
            logError(`Failed to create directory ${dir}`, error);
        }
    });
};

export const uploadFile = async (request, response) => {
    try {
        // Add detailed request logging
        logInfo('Upload request received', {
            hasFile: !!request.file,
            userId: request.user?.id,
            userRole: request.user?.role,
            contentType: request.get('Content-Type'),
            contentLength: request.get('Content-Length'),
            body: request.body,
            ip: request.ip,
            userAgent: request.get('User-Agent')
        });

        // Check if user is authenticated
        if (!request.user || !request.user.id) {
            logError('Upload request without authenticated user', new Error('User not authenticated'));
            return response.status(401).json({
                error: 'User not authenticated',
                code: 'NOT_AUTHENTICATED'
            });
        }

        // Ensure directories exist before processing upload
        try {
            ensureDirectoriesExist();
        } catch (dirError) {
            logError('Failed to create required directories', dirError);
            return response.status(500).json({
                error: 'Server configuration error - unable to create upload directories',
                code: 'DIRECTORY_CREATION_ERROR'
            });
        }

        // Check if file was uploaded
        if (!request.file) {
            logError('No file in upload request', new Error('No file uploaded'), {
                userId: request.user?.id,
                ip: request.ip
            });
            return response.status(400).json({ 
                error: 'No file uploaded',
                code: 'NO_FILE'
            });
        }

        const userId = request.user.id;
        const originalFile = request.file;
        
        logInfo('Processing file upload', {
            originalname: originalFile.originalname,
            mimetype: originalFile.mimetype,
            size: originalFile.size,
            path: originalFile.path,
            userId: userId,
            fieldname: originalFile.fieldname,
            filename: originalFile.filename
        });
        
        // Validate file exists on disk
        if (!fs.existsSync(originalFile.path)) {
            logError('Uploaded file not found on disk', new Error('File not found'), {
                filePath: originalFile.path,
                userId: userId
            });
            return response.status(400).json({
                error: 'File upload failed - file not found on disk',
                code: 'FILE_NOT_FOUND'
            });
        }

        // Validate file size
        if (originalFile.size === 0) {
            logError('Empty file uploaded', new Error('Empty file'), {
                userId: userId,
                filename: originalFile.originalname
            });
            return response.status(400).json({
                error: 'Cannot upload empty file',
                code: 'EMPTY_FILE'
            });
        }

        // Check file size limit (100MB)
        const maxFileSize = 100 * 1024 * 1024; // 100MB
        if (originalFile.size > maxFileSize) {
            logError('File too large', new Error('File size exceeds limit'), {
                userId: userId,
                filename: originalFile.originalname,
                size: originalFile.size,
                maxSize: maxFileSize
            });
            return response.status(400).json({
                error: 'File too large. Maximum size is 100MB',
                code: 'FILE_TOO_LARGE'
            });
        }
        
        // Generate encryption key
        let encryptionKey;
        try {
            encryptionKey = generateKey();
            logInfo('Encryption key generated successfully', { userId });
        } catch (keyError) {
            logError('Failed to generate encryption key', keyError, { userId });
            return response.status(500).json({
                error: 'Encryption key generation failed',
                code: 'ENCRYPTION_KEY_ERROR'
            });
        }
        
        // Create encrypted file path
        const encryptedFileName = `encrypted_${Date.now()}_${originalFile.filename}`;
        const encryptedPath = path.join('uploads', 'encrypted', encryptedFileName);
        
        // Ensure encrypted directory exists (double check)
        const encryptedDir = path.dirname(encryptedPath);
        if (!fs.existsSync(encryptedDir)) {
            try {
                fs.mkdirSync(encryptedDir, { recursive: true });
                logInfo(`Created encrypted directory: ${encryptedDir}`);
            } catch (dirError) {
                logError('Failed to create encrypted directory', dirError, {
                    dir: encryptedDir,
                    userId: userId
                });
                return response.status(500).json({
                    error: 'Failed to create upload directory',
                    code: 'DIRECTORY_ERROR'
                });
            }
        }
        
        // Generate file hash before encryption
        let fileHash;
        try {
            fileHash = await generateFileHash(originalFile.path);
            logInfo('File hash generated successfully', { userId, fileHash });
        } catch (hashError) {
            logError('Failed to generate file hash', hashError, { userId });
            return response.status(500).json({
                error: 'File hash generation failed',
                code: 'FILE_HASH_ERROR'
            });
        }
        
        // Encrypt the file
        let encryptionResult;
        try {
            encryptionResult = await encryptFile(originalFile.path, encryptedPath, encryptionKey);
            logInfo('File encrypted successfully', { 
                userId, 
                encryptedPath: encryptionResult.encryptedPath 
            });
        } catch (encryptError) {
            logError('File encryption failed', encryptError, { userId });
            return response.status(500).json({
                error: 'File encryption failed',
                code: 'ENCRYPTION_ERROR'
            });
        }
        
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
        
        let file;
        try {
            file = await File.create(fileObj);
            logInfo('File record created in database', { 
                userId, 
                fileId: file._id,
                originalName: file.originalName 
            });
        } catch (dbError) {
            logError('Database error creating file record', dbError, { userId });
            
            // Clean up encrypted file if database save fails
            if (fs.existsSync(encryptedPath)) {
                try {
                    fs.unlinkSync(encryptedPath);
                    logInfo('Cleaned up encrypted file after database error', { encryptedPath });
                } catch (cleanupError) {
                    logError('Failed to clean up encrypted file', cleanupError, { encryptedPath });
                }
            }
            
            return response.status(500).json({
                error: 'Database error saving file record',
                code: 'DATABASE_ERROR'
            });
        }
        
        // Log the upload
        try {
            auditLog.fileUpload(
                userId, 
                request.user.username, 
                file._id, 
                originalFile.originalname, 
                originalFile.size, 
                request.ip
            );
        } catch (auditError) {
            logError('Audit log error', auditError, { userId, fileId: file._id });
            // Don't fail the upload for audit log errors
        }
        
        logInfo('File upload completed successfully', {
            fileId: file._id,
            originalName: file.originalName,
            userId: userId,
            fileSize: file.fileSize
        });
        
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
        logError('Unexpected error in file upload', error, {
            message: error.message,
            stack: error.stack,
            userId: request.user?.id,
            fileName: request.file?.originalname,
            filePath: request.file?.path,
            ip: request.ip,
            userAgent: request.get('User-Agent')
        });
        
        // Clean up any temporary files
        if (request.file?.path && fs.existsSync(request.file.path)) {
            try {
                fs.unlinkSync(request.file.path);
                logInfo('Cleaned up temporary file after error', { path: request.file.path });
            } catch (cleanupError) {
                logError('Failed to clean up temporary file', cleanupError, { path: request.file.path });
            }
        }
        
        // Provide more specific error information
        let errorMessage = 'File upload failed';
        let errorCode = 'UPLOAD_ERROR';
        
        if (error.message.includes('ENOENT')) {
            errorMessage = 'Upload directory not found';
            errorCode = 'DIRECTORY_ERROR';
        } else if (error.message.includes('EACCES')) {
            errorMessage = 'Permission denied for file upload';
            errorCode = 'PERMISSION_ERROR';
        } else if (error.message.includes('EMFILE') || error.message.includes('ENFILE')) {
            errorMessage = 'Too many files open';
            errorCode = 'FILE_LIMIT_ERROR';
        } else if (error.message.includes('ENOSPC')) {
            errorMessage = 'No space left on device';
            errorCode = 'DISK_SPACE_ERROR';
        } else if (error.message.includes('connection') || error.message.includes('database')) {
            errorMessage = 'Database connection error';
            errorCode = 'DATABASE_ERROR';
        } else if (error.message.includes('encryption')) {
            errorMessage = 'File encryption failed';
            errorCode = 'ENCRYPTION_ERROR';
        } else if (error.message.includes('ValidationError')) {
            errorMessage = 'File validation failed';
            errorCode = 'VALIDATION_ERROR';
        } else if (error.message.includes('MongoError') || error.message.includes('BulkWriteError')) {
            errorMessage = 'Database operation failed';
            errorCode = 'DATABASE_ERROR';
        }
        
        response.status(500).json({ 
            error: errorMessage,
            code: errorCode,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
                try {
                    fs.mkdirSync(tempDir, { recursive: true });
                    logInfo(`Created temp directory: ${tempDir}`);
                } catch (dirError) {
                    logError('Failed to create temp directory', dirError, {
                        dir: tempDir,
                        userId: userId
                    });
                    return response.status(500).json({
                        error: 'Failed to create temporary directory',
                        code: 'TEMP_DIRECTORY_ERROR'
                    });
                }
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