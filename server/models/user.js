import mongoose from "mongoose";
import bcrypt from "bcrypt";

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        minlength: 8
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'moderator'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date
    },
    refreshTokens: [{
        token: String,
        createdAt: {
            type: Date,
            default: Date.now,
            expires: 604800 // 7 days
        },
        deviceInfo: String
    }],
    
    // Profile information
    firstName: String,
    lastName: String,
    profileImage: String,
    
    // Two-factor authentication
    twoFactorAuth: {
        enabled: {
            type: Boolean,
            default: false
        },
        secret: String,
        backupCodes: [String],
        setupCompleted: {
            type: Boolean,
            default: false
        }
    },
    
    // Password reset
    passwordReset: {
        token: String,
        expiresAt: Date,
        attempts: {
            type: Number,
            default: 0
        }
    },
    
    // Email verification
    emailVerification: {
        verified: {
            type: Boolean,
            default: false
        },
        token: String,
        expiresAt: Date
    },
    
    // User activity
    lastActivity: Date,
    loginHistory: [{
        timestamp: {
            type: Date,
            default: Date.now
        },
        ip: String,
        userAgent: String,
        success: Boolean
    }],
    
    // Preferences
    preferences: {
        emailNotifications: {
            type: Boolean,
            default: true
        },
        securityAlerts: {
            type: Boolean,
            default: true
        },
        fileShareNotifications: {
            type: Boolean,
            default: true
        },
        theme: {
            type: String,
            enum: ['light', 'dark', 'system'],
            default: 'system'
        },
        language: {
            type: String,
            default: 'en'
        }
    },
    
    // API access
    apiKeys: [{
        keyId: String,
        keyHash: String,
        name: String,
        permissions: [String],
        createdAt: {
            type: Date,
            default: Date.now
        },
        lastUsed: Date,
        expiresAt: Date,
        isActive: {
            type: Boolean,
            default: true
        }
    }]
}, {
    timestamps: true
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        return next(error);
    }
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked
UserSchema.methods.isLocked = function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Increment login attempts
UserSchema.methods.incLoginAttempts = function() {
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $unset: { lockUntil: 1 },
            $set: { loginAttempts: 1 }
        });
    }
    
    const updates = { $inc: { loginAttempts: 1 } };
    
    if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
        updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
    }
    
    return this.updateOne(updates);
};

// Reset login attempts
UserSchema.methods.resetLoginAttempts = function() {
    return this.updateOne({
        $unset: { loginAttempts: 1, lockUntil: 1 }
    });
};

// Two-factor authentication methods
UserSchema.methods.enableTwoFactor = function(secret, backupCodes) {
    this.twoFactorAuth.enabled = true;
    this.twoFactorAuth.secret = secret;
    this.twoFactorAuth.backupCodes = backupCodes;
    this.twoFactorAuth.setupCompleted = true;
    return this.save();
};

UserSchema.methods.disableTwoFactor = function() {
    this.twoFactorAuth.enabled = false;
    this.twoFactorAuth.secret = undefined;
    this.twoFactorAuth.backupCodes = [];
    this.twoFactorAuth.setupCompleted = false;
    return this.save();
};

UserSchema.methods.useBackupCode = function(code) {
    const index = this.twoFactorAuth.backupCodes.indexOf(code);
    if (index !== -1) {
        this.twoFactorAuth.backupCodes.splice(index, 1);
        return this.save();
    }
    return false;
};

// Session management
UserSchema.methods.addRefreshToken = function(token, deviceInfo) {
    this.refreshTokens.push({
        token,
        deviceInfo
    });
    
    // Keep only last 10 refresh tokens
    if (this.refreshTokens.length > 10) {
        this.refreshTokens = this.refreshTokens.slice(-10);
    }
    
    return this.save();
};

UserSchema.methods.removeRefreshToken = function(token) {
    this.refreshTokens = this.refreshTokens.filter(t => t.token !== token);
    return this.save();
};

UserSchema.methods.clearRefreshTokens = function() {
    this.refreshTokens = [];
    return this.save();
};

// Login history
UserSchema.methods.addLoginHistory = function(ip, userAgent, success) {
    this.loginHistory.push({
        ip,
        userAgent,
        success
    });
    
    // Keep only last 50 login attempts
    if (this.loginHistory.length > 50) {
        this.loginHistory = this.loginHistory.slice(-50);
    }
    
    if (success) {
        this.lastLogin = new Date();
    }
    
    return this.save();
};

// Password reset methods
UserSchema.methods.setPasswordResetToken = function(token) {
    this.passwordReset.token = token;
    this.passwordReset.expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    this.passwordReset.attempts = 0;
    return this.save();
};

UserSchema.methods.clearPasswordReset = function() {
    this.passwordReset.token = undefined;
    this.passwordReset.expiresAt = undefined;
    this.passwordReset.attempts = 0;
    return this.save();
};

UserSchema.methods.incrementPasswordResetAttempts = function() {
    this.passwordReset.attempts = (this.passwordReset.attempts || 0) + 1;
    return this.save();
};

// Email verification methods
UserSchema.methods.setEmailVerificationToken = function(token) {
    this.emailVerification.token = token;
    this.emailVerification.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    return this.save();
};

UserSchema.methods.verifyEmail = function() {
    this.emailVerification.verified = true;
    this.emailVerification.token = undefined;
    this.emailVerification.expiresAt = undefined;
    return this.save();
};

// API key management
UserSchema.methods.generateApiKey = function(name, permissions = []) {
    const crypto = require('crypto');
    const keyId = crypto.randomBytes(16).toString('hex');
    const key = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    
    this.apiKeys.push({
        keyId,
        keyHash,
        name,
        permissions,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    });
    
    return this.save().then(() => `${keyId}.${key}`);
};

UserSchema.methods.revokeApiKey = function(keyId) {
    const key = this.apiKeys.find(k => k.keyId === keyId);
    if (key) {
        key.isActive = false;
        return this.save();
    }
    return false;
};

UserSchema.methods.updateLastActivity = function() {
    this.lastActivity = new Date();
    return this.save();
};

// Indexes
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ lastLogin: -1 });
UserSchema.index({ lastActivity: -1 });
UserSchema.index({ 'twoFactorAuth.enabled': 1 });
UserSchema.index({ 'emailVerification.verified': 1 });
UserSchema.index({ 'apiKeys.keyId': 1 });

const User = mongoose.model('User', UserSchema);
export default User; 