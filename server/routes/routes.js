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
import fs from 'fs';

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
            
            // Log the error with more context
            const errorContext = {
                userId: req.user?.id,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                contentType: req.get('Content-Type'),
                contentLength: req.get('Content-Length'),
                hasFile: !!req.file,
                multerError: err.code || err.message
            };
            
            console.error('Multer error context:', errorContext);
            
            let errorMessage = 'File upload failed';
            let errorCode = 'UPLOAD_ERROR';
            let statusCode = 400;
            
            if (err.code === 'LIMIT_FILE_SIZE') {
                errorMessage = 'File too large. Maximum size is 100MB';
                errorCode = 'FILE_TOO_LARGE';
                statusCode = 413;
            } else if (err.code === 'LIMIT_FILE_COUNT') {
                errorMessage = 'Too many files. Only 1 file allowed per upload';
                errorCode = 'TOO_MANY_FILES';
                statusCode = 400;
            } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                errorMessage = 'Unexpected file field name. Use "file" as the field name';
                errorCode = 'UNEXPECTED_FILE';
                statusCode = 400;
            } else if (err.code === 'ENOENT') {
                errorMessage = 'Upload directory not found or cannot be created';
                errorCode = 'DIRECTORY_ERROR';
                statusCode = 500;
            } else if (err.code === 'EACCES') {
                errorMessage = 'Permission denied for file upload';
                errorCode = 'PERMISSION_ERROR';
                statusCode = 500;
            } else if (err.code === 'EMFILE' || err.code === 'ENFILE') {
                errorMessage = 'Too many files open on server';
                errorCode = 'FILE_LIMIT_ERROR';
                statusCode = 500;
            } else if (err.code === 'ENOSPC') {
                errorMessage = 'No space left on server';
                errorCode = 'DISK_SPACE_ERROR';
                statusCode = 500;
            } else if (err.message && err.message.includes('Multipart')) {
                errorMessage = 'Invalid multipart/form-data format';
                errorCode = 'INVALID_MULTIPART';
                statusCode = 400;
            } else if (err.message && err.message.includes('Unexpected field')) {
                errorMessage = 'Unexpected field in form data. Use "file" as the field name';
                errorCode = 'UNEXPECTED_FIELD';
                statusCode = 400;
            } else {
                errorMessage = 'File upload failed: ' + (err.message || 'Unknown error');
                errorCode = 'UPLOAD_ERROR';
                statusCode = 500;
            }
            
            return res.status(statusCode).json({
                error: errorMessage,
                code: errorCode,
                details: process.env.NODE_ENV === 'development' ? {
                    originalError: err.message,
                    multerCode: err.code,
                    stack: err.stack
                } : undefined
            });
        }
        
        // Log successful multer processing
        if (req.file) {
            console.log('Multer processed file successfully:', {
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                path: req.file.path,
                fieldname: req.file.fieldname,
                filename: req.file.filename
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
router.get('/health', async (req, res) => {
    const healthData = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'SecureShare API',
        version: '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    };

    // Check directory structure
    const requiredDirs = ['uploads', 'uploads/encrypted', 'uploads/temp', 'logs'];
    const directoryStatus = {};
    
    requiredDirs.forEach(dir => {
        try {
            const exists = fs.existsSync(dir);
            if (exists) {
                // Check permissions
                try {
                    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
                    directoryStatus[dir] = 'accessible';
                } catch (permError) {
                    directoryStatus[dir] = 'exists_but_no_permissions';
                }
            } else {
                directoryStatus[dir] = 'missing';
            }
        } catch (error) {
            directoryStatus[dir] = `error: ${error.message}`;
        }
    });

    // Check database connection
    let databaseStatus = 'disconnected';
    try {
        const mongoose = await import('mongoose');
        if (mongoose.default.connection.readyState === 1) {
            databaseStatus = 'connected';
        } else if (mongoose.default.connection.readyState === 2) {
            databaseStatus = 'connecting';
        } else if (mongoose.default.connection.readyState === 3) {
            databaseStatus = 'disconnecting';
        }
    } catch (dbError) {
        databaseStatus = `error: ${dbError.message}`;
    }

    // Check Redis connection
    let redisStatus = 'unknown';
    try {
        const redisModule = await import('../database/redis.js');
        if (redisModule.redisClient && redisModule.redisClient.isOpen) {
            redisStatus = 'connected';
        } else {
            redisStatus = 'disconnected';
        }
    } catch (redisError) {
        redisStatus = `error: ${redisError.message}`;
    }

    // Check environment variables
    const envVars = {
        MONGO_URL: !!process.env.MONGO_URL,
        REDIS_URL: !!process.env.REDIS_URL,
        JWT_SECRET: !!process.env.JWT_SECRET,
        EMAIL_SERVICE: !!process.env.EMAIL_SERVICE,
        EMAIL_USER: !!process.env.EMAIL_USER,
        EMAIL_PASS: !!process.env.EMAIL_PASS,
        FRONTEND_URL: !!process.env.FRONTEND_URL
    };

    // Check disk space (basic check)
    let diskSpace = 'unknown';
    try {
        const stats = fs.statSync('.');
        diskSpace = 'accessible';
    } catch (diskError) {
        diskSpace = `error: ${diskError.message}`;
    }

    // Test file operations
    let fileOperations = 'unknown';
    try {
        const testFile = 'test_write_permissions.txt';
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        fileOperations = 'working';
    } catch (fileError) {
        fileOperations = `error: ${fileError.message}`;
    }

    const healthStatus = {
        ...healthData,
        checks: {
            directories: directoryStatus,
            database: databaseStatus,
            redis: redisStatus,
            environment: envVars,
            diskSpace: diskSpace,
            fileOperations: fileOperations
        }
    };

    // Determine overall status
    const hasErrors = Object.values(directoryStatus).some(status => 
        status.includes('error') || status === 'missing' || status === 'exists_but_no_permissions'
    ) || databaseStatus !== 'connected' || fileOperations.includes('error');

    if (hasErrors) {
        healthStatus.status = 'DEGRADED';
        return res.status(503).json(healthStatus);
    }

    res.json(healthStatus);
});

// Debug endpoint for testing upload functionality
router.get('/debug/upload-test', authenticateToken, async (req, res) => {
    const testResults = {
        timestamp: new Date().toISOString(),
        userId: req.user.id,
        tests: {}
    };

    // Test 1: Directory creation
    try {
        const testDir = 'uploads/debug-test';
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        testResults.tests.directoryCreation = 'success';
        
        // Clean up test directory
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
    } catch (error) {
        testResults.tests.directoryCreation = `failed: ${error.message}`;
    }

    // Test 2: File operations
    try {
        const testFile = 'test-upload-file.txt';
        const testContent = 'This is a test file for upload functionality';
        
        // Write test file
        fs.writeFileSync(testFile, testContent);
        
        // Read test file
        const readContent = fs.readFileSync(testFile, 'utf8');
        
        // Delete test file
        fs.unlinkSync(testFile);
        
        testResults.tests.fileOperations = readContent === testContent ? 'success' : 'content_mismatch';
    } catch (error) {
        testResults.tests.fileOperations = `failed: ${error.message}`;
    }

    // Test 3: Database connection
    try {
        const mongoose = await import('mongoose');
        if (mongoose.default.connection.readyState === 1) {
            testResults.tests.databaseConnection = 'connected';
        } else {
            testResults.tests.databaseConnection = 'disconnected';
        }
    } catch (error) {
        testResults.tests.databaseConnection = `failed: ${error.message}`;
    }

    // Test 4: Encryption utilities
    try {
        const { testEncryption } = await import('../utils/encryption.js');
        
        // Create a test file for encryption testing
        const testFilePath = 'test-encryption-file.txt';
        fs.writeFileSync(testFilePath, 'This is a test file for encryption testing.');
        
        const encryptionResults = await testEncryption(testFilePath);
        testResults.tests.encryption = encryptionResults.overallStatus === 'all_tests_passed' ? 'success' : 'some_tests_failed';
        testResults.tests.encryptionDetails = encryptionResults.tests;
        
        // Clean up test file
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    } catch (error) {
        testResults.tests.encryption = `failed: ${error.message}`;
    }

    // Test 5: User model access
    try {
        const User = await import('../models/user.js');
        const user = await User.default.findById(req.user.id);
        testResults.tests.userModelAccess = user ? 'success' : 'user_not_found';
    } catch (error) {
        testResults.tests.userModelAccess = `failed: ${error.message}`;
    }

    // Test 6: File model access
    try {
        const File = await import('../models/file.js');
        const fileCount = await File.default.countDocuments({ uploadedBy: req.user.id });
        testResults.tests.fileModelAccess = `success (${fileCount} files)`;
    } catch (error) {
        testResults.tests.fileModelAccess = `failed: ${error.message}`;
    }

    // Determine overall status
    const failedTests = Object.values(testResults.tests).filter(result => 
        result.toString().includes('failed') || result === 'disconnected'
    );

    testResults.overallStatus = failedTests.length === 0 ? 'all_tests_passed' : 'some_tests_failed';
    testResults.failedTests = failedTests.length;

    res.json(testResults);
});

export default router;