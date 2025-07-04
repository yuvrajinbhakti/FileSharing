import bcrypt from 'bcrypt';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth.js';
import { logInfo, logError, auditLog } from '../utils/logger.js';
import { emailService } from '../utils/email.js';
import { twoFactorUtils } from '../utils/twoFactor.js';
import { redisUtils } from '../database/redis.js';
import User from '../models/user.js';
import crypto from 'crypto';

// Setup two-factor authentication
export const setupTwoFactor = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        if (user.twoFactorAuth.enabled) {
            return res.status(400).json({
                error: 'Two-factor authentication is already enabled',
                code: 'TWO_FACTOR_ALREADY_ENABLED'
            });
        }

        // Generate secret and QR code
        const secretData = twoFactorUtils.generateSecret(user.username);
        const qrCode = await twoFactorUtils.generateQRCode(secretData.otpauth_url);

        // Store temporary secret in Redis
        await redisUtils.setTempData(`2fa-setup-${userId}`, {
            secret: secretData.secret,
            qrCode: qrCode
        }, 900); // 15 minutes

        res.status(200).json({
            success: true,
            message: 'Two-factor authentication setup initiated',
            data: {
                secret: secretData.secret,
                qrCode: qrCode,
                manualEntryKey: secretData.secret
            }
        });
    } catch (error) {
        logError('Error setting up two-factor authentication', error);
        res.status(500).json({
            error: 'Failed to setup two-factor authentication',
            code: 'TWO_FACTOR_SETUP_ERROR'
        });
    }
};

// Enable two-factor authentication
export const enableTwoFactor = async (req, res) => {
    try {
        const userId = req.user.id;
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 'Two-factor token is required',
                code: 'TOKEN_REQUIRED'
            });
        }

        // Get temporary setup data
        const setupData = await redisUtils.getTempData(`2fa-setup-${userId}`);
        if (!setupData) {
            return res.status(400).json({
                error: 'Two-factor setup not found or expired',
                code: 'SETUP_EXPIRED'
            });
        }

        // Verify token
        const isValid = twoFactorUtils.verifyToken(token, setupData.secret);
        if (!isValid) {
            return res.status(400).json({
                error: 'Invalid two-factor token',
                code: 'INVALID_TOKEN'
            });
        }

        // Generate backup codes
        const backupCodes = twoFactorUtils.generateBackupCodes();

        // Enable two-factor auth for user
        const user = await User.findById(userId);
        await user.enableTwoFactor(setupData.secret, backupCodes);

        // Clean up temporary data
        await redisUtils.deleteTempData(`2fa-setup-${userId}`);

        // Send confirmation email
        if (user.preferences.emailNotifications) {
            await emailService.sendTwoFactorSetupEmail(user.email, user.username, setupData.qrCode);
        }

        // Track activity
        await redisUtils.trackUserActivity(userId, 'Two-factor authentication enabled');
        auditLog.twoFactorEnabled(userId, user.username);

        res.status(200).json({
            success: true,
            message: 'Two-factor authentication enabled successfully',
            data: {
                backupCodes: backupCodes
            }
        });
    } catch (error) {
        logError('Error enabling two-factor authentication', error);
        res.status(500).json({
            error: 'Failed to enable two-factor authentication',
            code: 'TWO_FACTOR_ENABLE_ERROR'
        });
    }
};

// Disable two-factor authentication
export const disableTwoFactor = async (req, res) => {
    try {
        const userId = req.user.id;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({
                error: 'Password is required to disable two-factor authentication',
                code: 'PASSWORD_REQUIRED'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(400).json({
                error: 'Invalid password',
                code: 'INVALID_PASSWORD'
            });
        }

        if (!user.twoFactorAuth.enabled) {
            return res.status(400).json({
                error: 'Two-factor authentication is not enabled',
                code: 'TWO_FACTOR_NOT_ENABLED'
            });
        }

        // Disable two-factor auth
        await user.disableTwoFactor();

        // Track activity
        await redisUtils.trackUserActivity(userId, 'Two-factor authentication disabled');
        auditLog.twoFactorDisabled(userId, user.username);

        res.status(200).json({
            success: true,
            message: 'Two-factor authentication disabled successfully'
        });
    } catch (error) {
        logError('Error disabling two-factor authentication', error);
        res.status(500).json({
            error: 'Failed to disable two-factor authentication',
            code: 'TWO_FACTOR_DISABLE_ERROR'
        });
    }
};

// Request password reset
export const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                error: 'Email is required',
                code: 'EMAIL_REQUIRED'
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            // Don't reveal if email exists for security
            return res.status(200).json({
                success: true,
                message: 'If the email exists, a password reset link has been sent'
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        await user.setPasswordResetToken(resetToken);

        // Send reset email
        if (process.env.SMTP_USER) {
            await emailService.sendPasswordResetEmail(user.email, user.username, resetToken);
        }

        // Track activity
        auditLog.passwordResetRequest(user._id, user.username, user.email);

        res.status(200).json({
            success: true,
            message: 'If the email exists, a password reset link has been sent'
        });
    } catch (error) {
        logError('Error requesting password reset', error);
        res.status(500).json({
            error: 'Failed to process password reset request',
            code: 'PASSWORD_RESET_ERROR'
        });
    }
};

// Reset password
export const resetPassword = async (req, res) => {
    try {
        const { token, newPassword, confirmPassword } = req.body;

        if (!token || !newPassword || !confirmPassword) {
            return res.status(400).json({
                error: 'All fields are required',
                code: 'MISSING_FIELDS'
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                error: 'Passwords do not match',
                code: 'PASSWORDS_MISMATCH'
            });
        }

        // Find user with valid reset token
        const user = await User.findOne({
            'passwordReset.token': token,
            'passwordReset.expiresAt': { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({
                error: 'Invalid or expired reset token',
                code: 'INVALID_RESET_TOKEN'
            });
        }

        // Check reset attempts
        if (user.passwordReset.attempts >= 3) {
            return res.status(429).json({
                error: 'Too many reset attempts',
                code: 'TOO_MANY_ATTEMPTS'
            });
        }

        // Validate password strength
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            await user.incrementPasswordResetAttempts();
            return res.status(400).json({
                error: 'Password must be at least 8 characters with uppercase, lowercase, number and special character',
                code: 'WEAK_PASSWORD'
            });
        }

        // Update password
        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(newPassword, salt);
        
        // Clear reset token and attempts
        await user.clearPasswordReset();
        
        // Clear all refresh tokens (force re-login)
        await user.clearRefreshTokens();

        await user.save();

        // Track activity
        auditLog.passwordResetComplete(user._id, user.username);
        await redisUtils.trackUserActivity(user._id, 'Password reset completed');

        res.status(200).json({
            success: true,
            message: 'Password reset successfully'
        });
    } catch (error) {
        logError('Error resetting password', error);
        res.status(500).json({
            error: 'Failed to reset password',
            code: 'PASSWORD_RESET_ERROR'
        });
    }
};

// Send email verification
export const sendEmailVerification = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        if (user.emailVerification.verified) {
            return res.status(400).json({
                error: 'Email is already verified',
                code: 'EMAIL_ALREADY_VERIFIED'
            });
        }

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        await user.setEmailVerificationToken(verificationToken);

        // Send verification email (implement as needed)
        logInfo(`Email verification token generated for ${user.email}: ${verificationToken}`);

        res.status(200).json({
            success: true,
            message: 'Verification email sent'
        });
    } catch (error) {
        logError('Error sending email verification', error);
        res.status(500).json({
            error: 'Failed to send verification email',
            code: 'EMAIL_VERIFICATION_ERROR'
        });
    }
};

// Verify email
export const verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;

        const user = await User.findOne({
            'emailVerification.token': token,
            'emailVerification.expiresAt': { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({
                error: 'Invalid or expired verification token',
                code: 'INVALID_VERIFICATION_TOKEN'
            });
        }

        await user.verifyEmail();

        res.status(200).json({
            success: true,
            message: 'Email verified successfully'
        });
    } catch (error) {
        logError('Error verifying email', error);
        res.status(500).json({
            error: 'Failed to verify email',
            code: 'EMAIL_VERIFICATION_ERROR'
        });
    }
};

// Get user activity
export const getUserActivity = async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 20 } = req.query;

        const activities = await redisUtils.getUserActivity(userId);
        const limitedActivities = activities.slice(0, parseInt(limit));

        res.status(200).json({
            success: true,
            data: {
                activities: limitedActivities,
                total: activities.length
            }
        });
    } catch (error) {
        logError('Error getting user activity', error);
        res.status(500).json({
            error: 'Failed to get user activity',
            code: 'ACTIVITY_ERROR'
        });
    }
}; 