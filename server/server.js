import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import router from './routes/routes.js';
import DBConnection from './database/db.js';
import { connectRedis, disconnectRedis } from './database/redis.js';
import { auditLog, logInfo, logError } from './utils/logger.js';
import { initEmailService } from './utils/email.js';
import { initializeScheduler } from './utils/scheduler.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://file-sharing-eight-wheat.vercel.app',
        'https://file-sharing-eight-wheat.vercel.app/',
        // /\.vercel\.app$/,  // Allow all Vercel subdomains
        // /\.netlify\.app$/, // Allow Netlify deployments
        // 'https://secureshare.vercel.app', // Alternative deployment URL
        // 'https://secureshare.netlify.app' // Alternative deployment URL
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Requested-With',
        'Accept',
        'Origin',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers'
    ],
    optionsSuccessStatus: 200 // For legacy browser support
}));

// Global rate limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per window
    message: {
        error: 'Too many requests from this IP',
        code: 'GLOBAL_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        auditLog.rateLimitExceeded(req.ip, req.get('User-Agent'), req.originalUrl);
        res.status(429).json({
            error: 'Too many requests from this IP',
            code: 'GLOBAL_RATE_LIMIT_EXCEEDED'
        });
    }
});

app.use(globalLimiter);

// Body parsing middleware
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        logInfo('HTTP Request', {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userId: req.user?.id || null
        });
    });
    
    next();
});

// Create necessary directories
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
            console.log(`✅ Created directory: ${dir}`);
            logInfo(`Created directory: ${dir}`);
        } else {
            console.log(`✅ Directory exists: ${dir}`);
        }
    } catch (error) {
        console.warn(`⚠️  Could not create directory ${dir}:`, error.message);
        logError(`Failed to create directory ${dir}`, error);
        // Don't exit on directory creation failure - directories will be created on demand
    }
});

// Root route - API info
app.get('/', (req, res) => {
    res.json({
        name: 'SecureShare API',
        version: '1.0.0',
        status: 'Running',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth',
            files: '/api/files',
            sharing: '/api/sharing',
            users: '/api/users'
        },
        documentation: 'https://github.com/yuvrajinbhakti/FileSharing',
        timestamp: new Date().toISOString()
    });
});

// Health check route (doesn't require database)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'SecureShare API',
        version: '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API routes
app.use('/api', router);

// Error handling middleware
app.use((error, req, res, next) => {
    logError('Unhandled error', error, {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id
    });
    
    res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR'
    });
});

// 404 handler
app.use((req, res) => {
    // Only log suspicious 404s as security events
    const suspiciousPatterns = ['/admin', '/wp-admin', '/.env', '/config', '/api/admin'];
    const isSuspicious = suspiciousPatterns.some(pattern => req.originalUrl.includes(pattern));
    
    if (isSuspicious) {
        auditLog.unauthorizedAccess(req.ip, req.get('User-Agent'), req.originalUrl, '404 Not Found - Suspicious');
    }
    
    res.status(404).json({
        error: 'Endpoint not found',
        code: 'ENDPOINT_NOT_FOUND',
        available_endpoints: {
            root: '/',
            health: '/api/health',
            auth: '/api/auth',
            files: '/api/files'
        }
    });
});

const PORT = process.env.PORT || 8000;

// Database connection
try {
    await DBConnection();
    auditLog.databaseConnection('established');
    
    // Connect to Redis
    await connectRedis();
    
    // Initialize email service
    await initEmailService();
    
    // Initialize scheduler
    initializeScheduler();
} catch (error) {
    logError('Service initialization failed', error);
    auditLog.databaseConnection('failed');
    console.error('❌ Failed to initialize services:', error.message);
    console.error('🔧 Please check your environment variables:');
    console.error('   - MONGO_URL: MongoDB connection string');
    console.error('   - REDIS_URL: Redis connection string');
    process.exit(1);
}

// Graceful shutdown
const gracefulShutdown = async (signal) => {
    logInfo(`Received ${signal}. Starting graceful shutdown...`);
    
    try {
        // Stop accepting new connections
        server.close(() => {
            logInfo('HTTP server closed');
        });
        
        // Close database connections
        await mongoose.connection.close();
        logInfo('Database connection closed');
        
        // Close Redis connection
        await disconnectRedis();
        
        auditLog.serverShutdown();
        logInfo('Graceful shutdown completed');
        
        process.exit(0);
    } catch (error) {
        logError('Error during graceful shutdown', error);
        process.exit(1);
    }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logError('Uncaught Exception', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    logError('Unhandled Rejection', { reason, promise });
    gracefulShutdown('unhandledRejection');
});

// Start server
const server = app.listen(PORT, () => {
    logInfo(`SecureShare server is running on PORT ${PORT}`);
    auditLog.serverStart();
    
    console.log('🚀 SecureShare Server Started');
    console.log(`📡 Server running on: http://localhost:${PORT}`);
    console.log(`🔐 Security features enabled: JWT Auth, AES-256 Encryption, Audit Logging`);
    console.log(`🚀 New features: Redis Cache, Email Service, 2FA, File Sharing, Bulk Operations`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;