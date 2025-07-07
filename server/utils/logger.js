import winston from 'winston';
import 'winston-mongodb';
import dotenv from 'dotenv';

dotenv.config();

// Custom log levels for security audit
const auditLevels = {
    error: 0,
    warn: 1,
    security: 2,
    audit: 3,
    info: 4,
    debug: 5
};

// Custom colors for log levels
winston.addColors({
    error: 'red',
    warn: 'yellow',
    security: 'magenta',
    audit: 'cyan',
    info: 'green',
    debug: 'blue'
});

// Create logger transports
const transports = [
    // Console logging
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize({ all: true }),
            winston.format.simple()
        )
    }),
    
    // File logging for errors
    new winston.transports.File({ 
        filename: 'logs/error.log', 
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }),
    
    // File logging for all logs
    new winston.transports.File({ 
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5
    })
];

// Add MongoDB transport only if MONGO_URL is available
if (process.env.MONGO_URL) {
    transports.push(
        new winston.transports.MongoDB({
            db: process.env.MONGO_URL,
            collection: 'audit_logs',
            level: 'audit',
            options: {
                useUnifiedTopology: true
            },
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        })
    );
}

// Create logger instance
const logger = winston.createLogger({
    levels: auditLevels,
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(info => {
            return `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message} ${info.stack || ''}`;
        })
    ),
    defaultMeta: { service: 'secure-file-share' },
    transports: transports
});

// Security audit logging functions
export const auditLog = {
    // Authentication events
    loginSuccess: (userId, username, ip, userAgent) => {
        logger.log('audit', 'User login successful', {
            event: 'LOGIN_SUCCESS',
            userId,
            username,
            ip,
            userAgent,
            timestamp: new Date().toISOString()
        });
    },
    
    loginFailure: (username, ip, userAgent, reason) => {
        logger.log('security', 'User login failed', {
            event: 'LOGIN_FAILURE',
            username,
            ip,
            userAgent,
            reason,
            timestamp: new Date().toISOString()
        });
    },
    
    accountLocked: (userId, username, ip) => {
        logger.log('security', 'User account locked due to failed attempts', {
            event: 'ACCOUNT_LOCKED',
            userId,
            username,
            ip,
            timestamp: new Date().toISOString()
        });
    },
    
    // File operations
    fileUpload: (userId, username, fileId, fileName, fileSize, ip) => {
        logger.log('audit', 'File uploaded', {
            event: 'FILE_UPLOAD',
            userId,
            username,
            fileId,
            fileName,
            fileSize,
            ip,
            timestamp: new Date().toISOString()
        });
    },
    
    fileDownload: (userId, username, fileId, fileName, ip, userAgent) => {
        logger.log('audit', 'File downloaded', {
            event: 'FILE_DOWNLOAD',
            userId,
            username,
            fileId,
            fileName,
            ip,
            userAgent,
            timestamp: new Date().toISOString()
        });
    },
    
    fileDelete: (userId, username, fileId, fileName, ip) => {
        logger.log('audit', 'File deleted', {
            event: 'FILE_DELETE',
            userId,
            username,
            fileId,
            fileName,
            ip,
            timestamp: new Date().toISOString()
        });
    },
    
    // Security events
    unauthorizedAccess: (ip, userAgent, endpoint, reason) => {
        logger.log('security', 'Unauthorized access attempt', {
            event: 'UNAUTHORIZED_ACCESS',
            ip,
            userAgent,
            endpoint,
            reason,
            timestamp: new Date().toISOString()
        });
    },
    
    rateLimitExceeded: (ip, userAgent, endpoint) => {
        logger.log('security', 'Rate limit exceeded', {
            event: 'RATE_LIMIT_EXCEEDED',
            ip,
            userAgent,
            endpoint,
            timestamp: new Date().toISOString()
        });
    },
    
    suspiciousActivity: (userId, username, activity, details, ip) => {
        logger.log('security', 'Suspicious activity detected', {
            event: 'SUSPICIOUS_ACTIVITY',
            userId,
            username,
            activity,
            details,
            ip,
            timestamp: new Date().toISOString()
        });
    },
    
    // System events
    serverStart: () => {
        logger.log('audit', 'Server started', {
            event: 'SERVER_START',
            timestamp: new Date().toISOString()
        });
    },
    
    serverShutdown: () => {
        logger.log('audit', 'Server shutdown', {
            event: 'SERVER_SHUTDOWN',
            timestamp: new Date().toISOString()
        });
    },
    
    databaseConnection: (status) => {
        logger.log('audit', `Database connection ${status}`, {
            event: 'DATABASE_CONNECTION',
            status,
            timestamp: new Date().toISOString()
        });
    },
    
    // File sharing events
    fileShare: (userId, username, fileId, fileName, shareUrl, expiresAt) => {
        logger.log('audit', 'File share link created', {
            event: 'FILE_SHARE',
            userId,
            username,
            fileId,
            fileName,
            shareUrl,
            expiresAt,
            timestamp: new Date().toISOString()
        });
    },
    
    linkRevoked: (userId, username, linkId, fileName) => {
        logger.log('audit', 'Share link revoked', {
            event: 'LINK_REVOKED',
            userId,
            username,
            linkId,
            fileName,
            timestamp: new Date().toISOString()
        });
    },
    
    // Bulk operations
    bulkDownload: (userId, username, fileCount, zipName) => {
        logger.log('audit', 'Bulk download created', {
            event: 'BULK_DOWNLOAD',
            userId,
            username,
            fileCount,
            zipName,
            timestamp: new Date().toISOString()
        });
    },
    
    bulkUpdate: (userId, username, fileCount, updates) => {
        logger.log('audit', 'Bulk metadata update', {
            event: 'BULK_UPDATE',
            userId,
            username,
            fileCount,
            updates,
            timestamp: new Date().toISOString()
        });
    },
    
    // System events
    fileExpired: (userId, fileName, fileId) => {
        logger.log('audit', 'File expired and removed', {
            event: 'FILE_EXPIRED',
            userId,
            fileName,
            fileId,
            timestamp: new Date().toISOString()
        });
    },
    
    rateLimitReset: () => {
        logger.log('audit', 'Daily rate limits reset', {
            event: 'RATE_LIMIT_RESET',
            timestamp: new Date().toISOString()
        });
    },
    
    schedulerInitialized: () => {
        logger.log('audit', 'Scheduler initialized', {
            event: 'SCHEDULER_INITIALIZED',
            timestamp: new Date().toISOString()
        });
    },
    
    dailyReport: (metrics) => {
        logger.log('audit', 'Daily report generated', {
            event: 'DAILY_REPORT',
            metrics,
            timestamp: new Date().toISOString()
        });
    },
    
    // Two-factor authentication
    twoFactorEnabled: (userId, username) => {
        logger.log('audit', 'Two-factor authentication enabled', {
            event: 'TWO_FACTOR_ENABLED',
            userId,
            username,
            timestamp: new Date().toISOString()
        });
    },
    
    twoFactorDisabled: (userId, username) => {
        logger.log('audit', 'Two-factor authentication disabled', {
            event: 'TWO_FACTOR_DISABLED',
            userId,
            username,
            timestamp: new Date().toISOString()
        });
    },
    
    // Password reset
    passwordResetRequest: (userId, username, email) => {
        logger.log('audit', 'Password reset requested', {
            event: 'PASSWORD_RESET_REQUEST',
            userId,
            username,
            email,
            timestamp: new Date().toISOString()
        });
    },
    
    passwordResetComplete: (userId, username) => {
        logger.log('audit', 'Password reset completed', {
            event: 'PASSWORD_RESET_COMPLETE',
            userId,
            username,
            timestamp: new Date().toISOString()
        });
    },
    
    // Shared file download
    sharedFileDownload: (userId, username, fileId, fileName, ip, linkId) => {
        logger.log('audit', 'Shared file downloaded', {
            event: 'SHARED_FILE_DOWNLOAD',
            userId,
            username,
            fileId,
            fileName,
            ip,
            linkId,
            timestamp: new Date().toISOString()
        });
    }
};

// General logging functions
export const logInfo = (message, meta = {}) => {
    logger.info(message, meta);
};

export const logError = (message, error, meta = {}) => {
    logger.error(message, { error: error.message, stack: error.stack, ...meta });
};

export const logWarn = (message, meta = {}) => {
    logger.warn(message, meta);
};

export const logDebug = (message, meta = {}) => {
    logger.debug(message, meta);
};

export default logger; 