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

// File management routes (require authentication)
router.post('/upload', authenticateToken, uploadLimiter, rateLimitPerUser(), upload.single('file'), uploadFile);
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
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'SecureShare API'
    });
});

export default router;