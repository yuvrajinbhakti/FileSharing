import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import router from './routes/routes.js';
import DBConnection from './database/db.js';
import { auditLog, logInfo, logError } from './utils/logger.js';
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
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
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
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logInfo(`Created directory: ${dir}`);
    }
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
    auditLog.unauthorizedAccess(req.ip, req.get('User-Agent'), req.originalUrl, '404 Not Found');
    res.status(404).json({
        error: 'Endpoint not found',
        code: 'ENDPOINT_NOT_FOUND'
    });
});

const PORT = process.env.PORT || 8000;

// Database connection
try {
    await DBConnection();
    auditLog.databaseConnection('established');
} catch (error) {
    logError('Database connection failed', error);
    auditLog.databaseConnection('failed');
    process.exit(1);
}

// Graceful shutdown
const gracefulShutdown = (signal) => {
    logInfo(`Received ${signal}. Starting graceful shutdown...`);
    auditLog.serverShutdown();
    
    server.close(() => {
        logInfo('Server closed. Exiting process.');
        process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
        logError('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const server = app.listen(PORT, () => {
    logInfo(`SecureShare server is running on PORT ${PORT}`);
    auditLog.serverStart();
    
    console.log('🚀 SecureShare Server Started');
    console.log(`📡 Server running on: http://localhost:${PORT}`);
    console.log(`🔐 Security features enabled: JWT Auth, AES-256 Encryption, Audit Logging`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;