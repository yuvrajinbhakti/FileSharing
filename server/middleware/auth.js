import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import { auditLog } from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key-change-this-in-production';

// Generate access token (15 minutes)
export const generateAccessToken = (user) => {
    return jwt.sign(
        { 
            userId: user._id, 
            username: user.username, 
            email: user.email,
            role: user.role 
        },
        JWT_SECRET,
        { expiresIn: '15m' }
    );
};

// Generate refresh token (7 days)
export const generateRefreshToken = (user) => {
    return jwt.sign(
        { 
            userId: user._id, 
            username: user.username,
            tokenType: 'refresh'
        },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );
};

// Verify JWT token middleware
export const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
        auditLog.unauthorizedAccess(
            req.ip, 
            req.get('User-Agent'), 
            req.originalUrl, 
            'No token provided'
        );
        return res.status(401).json({ 
            error: 'Access token required',
            code: 'NO_TOKEN'
        });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if user still exists and is active
        const user = await User.findById(decoded.userId);
        if (!user || !user.isActive) {
            auditLog.unauthorizedAccess(
                req.ip, 
                req.get('User-Agent'), 
                req.originalUrl, 
                'User not found or inactive'
            );
            return res.status(401).json({ 
                error: 'Invalid token - user not found or inactive',
                code: 'INVALID_USER'
            });
        }
        
        // Check if account is locked
        if (user.isLocked()) {
            auditLog.unauthorizedAccess(
                req.ip, 
                req.get('User-Agent'), 
                req.originalUrl, 
                'Account locked'
            );
            return res.status(423).json({ 
                error: 'Account is temporarily locked',
                code: 'ACCOUNT_LOCKED'
            });
        }
        
        // Add user info to request
        req.user = {
            id: decoded.userId,
            username: decoded.username,
            email: decoded.email,
            role: decoded.role,
            fullUser: user
        };
        
        next();
    } catch (error) {
        let errorCode = 'TOKEN_ERROR';
        let errorMessage = 'Invalid token';
        
        if (error.name === 'TokenExpiredError') {
            errorCode = 'TOKEN_EXPIRED';
            errorMessage = 'Token has expired';
        } else if (error.name === 'JsonWebTokenError') {
            errorCode = 'TOKEN_INVALID';
            errorMessage = 'Invalid token format';
        }
        
        auditLog.unauthorizedAccess(
            req.ip, 
            req.get('User-Agent'), 
            req.originalUrl, 
            `${errorMessage}: ${error.message}`
        );
        
        return res.status(401).json({ 
            error: errorMessage,
            code: errorCode
        });
    }
};

// Role-based access control middleware
export const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                error: 'Authentication required',
                code: 'NO_AUTH'
            });
        }
        
        if (!roles.includes(req.user.role)) {
            auditLog.unauthorizedAccess(
                req.ip, 
                req.get('User-Agent'), 
                req.originalUrl, 
                `Insufficient permissions - required: ${roles.join(', ')}, has: ${req.user.role}`
            );
            
            return res.status(403).json({ 
                error: 'Insufficient permissions',
                code: 'INSUFFICIENT_PERMISSIONS',
                required: roles,
                current: req.user.role
            });
        }
        
        next();
    };
};

// File ownership verification middleware
export const verifyFileOwnership = async (req, res, next) => {
    try {
        const fileId = req.params.fileId;
        
        // Import File model here to avoid circular dependency
        const { default: File } = await import('../models/file.js');
        const file = await File.findById(fileId);
        
        if (!file) {
            return res.status(404).json({ 
                error: 'File not found',
                code: 'FILE_NOT_FOUND'
            });
        }
        
        // Admin can access any file
        if (req.user.role === 'admin') {
            req.file = file;
            return next();
        }
        
        // Check if user owns the file
        if (file.uploadedBy.toString() !== req.user.id.toString()) {
            auditLog.unauthorizedAccess(
                req.ip, 
                req.get('User-Agent'), 
                req.originalUrl, 
                `Attempted to access file not owned by user - FileID: ${fileId}`
            );
            
            return res.status(403).json({ 
                error: 'Access denied - you do not own this file',
                code: 'FILE_ACCESS_DENIED'
            });
        }
        
        req.file = file;
        next();
    } catch (error) {
        return res.status(500).json({ 
            error: 'Error verifying file ownership',
            code: 'OWNERSHIP_CHECK_ERROR'
        });
    }
};

// Optional authentication middleware (for public endpoints with optional auth)
export const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return next(); // Continue without auth
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (user && user.isActive && !user.isLocked()) {
            req.user = {
                id: decoded.userId,
                username: decoded.username,
                email: decoded.email,
                role: decoded.role,
                fullUser: user
            };
        }
    } catch (error) {
        // Silently fail for optional auth
    }
    
    next();
};

// Rate limiting per user middleware
export const rateLimitPerUser = (windowMs = 15 * 60 * 1000, max = 100) => {
    const userRequests = new Map();
    
    return (req, res, next) => {
        const userId = req.user?.id || req.ip;
        const now = Date.now();
        
        if (!userRequests.has(userId)) {
            userRequests.set(userId, { count: 1, resetTime: now + windowMs });
            return next();
        }
        
        const userLimit = userRequests.get(userId);
        
        if (now > userLimit.resetTime) {
            userLimit.count = 1;
            userLimit.resetTime = now + windowMs;
            return next();
        }
        
        if (userLimit.count >= max) {
            auditLog.rateLimitExceeded(req.ip, req.get('User-Agent'), req.originalUrl);
            
            return res.status(429).json({
                error: 'Too many requests',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
            });
        }
        
        userLimit.count++;
        next();
    };
};

export default {
    authenticateToken,
    authorizeRoles,
    verifyFileOwnership,
    optionalAuth,
    rateLimitPerUser,
    generateAccessToken,
    generateRefreshToken
}; 