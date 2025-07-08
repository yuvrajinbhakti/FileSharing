import express from 'express';
import rateLimit from 'express-rate-limit';
import upload from '../utils/upload.js';
import { 
    uploadFile, 
    downloadFile, 
    deleteFile, 
    getUserFiles,
    uploadImage, 
    getImage 
} from '../controller/image-controller.js';
import { 
    register, 
    login, 
    refreshToken, 
    logout, 
    getProfile,
    registerValidation,
    loginValidation 
} from '../controller/auth-controller.js';
import { 
    authenticateToken, 
    authorizeRoles, 
    verifyFileOwnership, 
    optionalAuth,
    rateLimitPerUser 
} from '../middleware/auth.js';

const router = express.Router();

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
        error: 'Too many authentication attempts',
        code: 'AUTH_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 uploads per hour
    message: {
        error: 'Too many upload attempts',
        code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
    }
});

// Authentication routes
router.post('/auth/register', authLimiter, registerValidation, register);
router.post('/auth/login', authLimiter, loginValidation, login);
router.post('/auth/refresh', refreshToken);
router.post('/auth/logout', authenticateToken, logout);
router.get('/auth/profile', authenticateToken, getProfile);

// Multer error handling wrapper
const handleMulterError = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            console.error('Multer error:', err);
            
            let errorMessage = 'File upload failed';
            let errorCode = 'UPLOAD_ERROR';
            
            if (err.code === 'LIMIT_FILE_SIZE') {
                errorMessage = 'File too large. Maximum size is 100MB';
                errorCode = 'FILE_TOO_LARGE';
            } else if (err.code === 'LIMIT_FILE_COUNT') {
                errorMessage = 'Too many files. Only 1 file allowed per upload';
                errorCode = 'TOO_MANY_FILES';
            } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                errorMessage = 'Unexpected file field name';
                errorCode = 'UNEXPECTED_FILE';
            } else if (err.code === 'ENOENT') {
                errorMessage = 'Upload directory not found';
                errorCode = 'DIRECTORY_ERROR';
            }
            
            return res.status(400).json({
                error: errorMessage,
                code: errorCode
            });
        }
        next();
    });
};

// File management routes (require authentication)
router.post('/upload', authenticateToken, uploadLimiter, rateLimitPerUser(), handleMulterError, uploadFile);
router.get('/files', authenticateToken, getUserFiles);
router.delete('/file/:fileId', authenticateToken, verifyFileOwnership, deleteFile);

// File download routes (optional authentication for public files)
router.get('/file/:fileId', optionalAuth, downloadFile);

// Admin routes
router.get('/admin/files', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const { default: File } = await import('../models/file.js');
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        const files = await File.find({ isActive: true })
            .populate('uploadedBy', 'username email')
            .select('-encryptionKey -encryptionIV -encryptionTag')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        const total = await File.countDocuments({ isActive: true });
        
        res.json({
            files: files.map(file => ({
                id: file._id,
                originalName: file.originalName,
                size: file.fileSize,
                mimeType: file.mimeType,
                downloadCount: file.downloadCount,
                accessLevel: file.accessLevel,
                uploadDate: file.createdAt,
                uploadedBy: file.uploadedBy,
                fileHash: file.fileHash
            })),
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve files' });
    }
});

router.get('/admin/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const { default: User } = await import('../models/user.js');
        const users = await User.find()
            .select('-password -refreshTokens')
            .sort({ createdAt: -1 });
        
        res.json({ users });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve users' });
    }
});

// Legacy routes for backward compatibility
router.post('/upload-legacy', authenticateToken, upload.single('file'), uploadImage);
router.get('/image/:fileId', optionalAuth, getImage);

// Health check
router.get('/health', (req, res) => {
    // Check directory structure
    const requiredDirs = ['uploads', 'uploads/encrypted', 'uploads/temp', 'logs'];
    const directoryStatus = {};
    
    requiredDirs.forEach(dir => {
        try {
            const exists = require('fs').existsSync(dir);
            directoryStatus[dir] = exists ? 'exists' : 'missing';
        } catch (error) {
            directoryStatus[dir] = `error: ${error.message}`;
        }
    });
    
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'SecureShare API',
        version: '1.0.0',
        directories: directoryStatus,
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

export default router;