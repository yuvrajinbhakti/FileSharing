import User from '../models/user.js';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth.js';
import { auditLog, logError } from '../utils/logger.js';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key-change-this-in-production';

// Validation rules
export const registerValidation = [
    body('username')
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be between 3 and 30 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Password confirmation does not match password');
            }
            return true;
        })
];

export const loginValidation = [
    body('username')
        .notEmpty()
        .withMessage('Username is required'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

// Register new user
export const register = async (req, res) => {
    try {
        // Check validation results
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { username, email, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [
                { username: username },
                { email: email }
            ]
        });

        if (existingUser) {
            auditLog.loginFailure(username, req.ip, req.get('User-Agent'), 'User already exists');
            return res.status(409).json({
                error: 'User with this username or email already exists',
                code: 'USER_EXISTS'
            });
        }

        // Create new user
        const user = new User({
            username,
            email,
            password, // Will be hashed by pre-save middleware
            role: 'user' // Default role
        });

        await user.save();

        // Generate tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Store refresh token
        user.refreshTokens.push({ token: refreshToken });
        await user.save();

        auditLog.loginSuccess(user._id, user.username, req.ip, req.get('User-Agent'));

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            },
            tokens: {
                accessToken,
                refreshToken
            }
        });

    } catch (error) {
        logError('Registration error', error, { ip: req.ip, userAgent: req.get('User-Agent') });
        res.status(500).json({
            error: 'Internal server error during registration',
            code: 'REGISTRATION_ERROR'
        });
    }
};

// Login user
export const login = async (req, res) => {
    try {
        // Check validation results
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { username, password } = req.body;

        // Find user by username or email
        const user = await User.findOne({
            $or: [
                { username: username },
                { email: username }
            ]
        });

        if (!user) {
            auditLog.loginFailure(username, req.ip, req.get('User-Agent'), 'User not found');
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Check if account is locked
        if (user.isLocked()) {
            auditLog.accountLocked(user._id, user.username, req.ip);
            return res.status(423).json({
                error: 'Account is temporarily locked due to too many failed login attempts',
                code: 'ACCOUNT_LOCKED'
            });
        }

        // Check if account is active
        if (!user.isActive) {
            auditLog.loginFailure(username, req.ip, req.get('User-Agent'), 'Account inactive');
            return res.status(401).json({
                error: 'Account is deactivated',
                code: 'ACCOUNT_INACTIVE'
            });
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            await user.incLoginAttempts();
            auditLog.loginFailure(username, req.ip, req.get('User-Agent'), 'Invalid password');
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Reset login attempts on successful login
        if (user.loginAttempts > 0) {
            await user.resetLoginAttempts();
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Store refresh token
        user.refreshTokens.push({ token: refreshToken });
        await user.save();

        auditLog.loginSuccess(user._id, user.username, req.ip, req.get('User-Agent'));

        res.json({
            message: 'Login successful',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                lastLogin: user.lastLogin
            },
            tokens: {
                accessToken,
                refreshToken
            }
        });

    } catch (error) {
        logError('Login error', error, { ip: req.ip, userAgent: req.get('User-Agent') });
        res.status(500).json({
            error: 'Internal server error during login',
            code: 'LOGIN_ERROR'
        });
    }
};

// Refresh access token
export const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                error: 'Refresh token is required',
                code: 'NO_REFRESH_TOKEN'
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        
        // Find user and check if refresh token exists
        const user = await User.findById(decoded.userId);
        if (!user || !user.isActive) {
            return res.status(401).json({
                error: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }

        // Check if refresh token exists in user's token list
        const tokenExists = user.refreshTokens.some(token => token.token === refreshToken);
        if (!tokenExists) {
            auditLog.unauthorizedAccess(req.ip, req.get('User-Agent'), req.originalUrl, 'Invalid refresh token');
            return res.status(401).json({
                error: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }

        // Generate new access token
        const newAccessToken = generateAccessToken(user);

        res.json({
            message: 'Token refreshed successfully',
            accessToken: newAccessToken
        });

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Refresh token has expired',
                code: 'REFRESH_TOKEN_EXPIRED'
            });
        }
        
        logError('Token refresh error', error, { ip: req.ip, userAgent: req.get('User-Agent') });
        res.status(401).json({
            error: 'Invalid refresh token',
            code: 'INVALID_REFRESH_TOKEN'
        });
    }
};

// Logout user
export const logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const userId = req.user.id;

        // Remove refresh token from user's token list
        if (refreshToken) {
            await User.findByIdAndUpdate(userId, {
                $pull: { refreshTokens: { token: refreshToken } }
            });
        }

        auditLog.loginSuccess(userId, req.user.username, req.ip, req.get('User-Agent'));

        res.json({
            message: 'Logout successful'
        });

    } catch (error) {
        logError('Logout error', error, { userId: req.user.id, ip: req.ip });
        res.status(500).json({
            error: 'Internal server error during logout',
            code: 'LOGOUT_ERROR'
        });
    }
};

// Get current user profile
export const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password -refreshTokens');
        
        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        res.json({
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
                lastLogin: user.lastLogin,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });

    } catch (error) {
        logError('Get profile error', error, { userId: req.user.id });
        res.status(500).json({
            error: 'Internal server error',
            code: 'PROFILE_ERROR'
        });
    }
};

export default {
    register,
    login,
    refreshToken,
    logout,
    getProfile,
    registerValidation,
    loginValidation
}; 