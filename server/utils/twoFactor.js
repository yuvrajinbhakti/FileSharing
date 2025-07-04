import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { logInfo, logError } from './logger.js';
import dotenv from 'dotenv';

dotenv.config();

const APP_NAME = 'SecureShare';
const ISSUER = 'SecureShare Enterprise';

// Generate secret for two-factor authentication
export const generateTwoFactorSecret = (username) => {
    try {
        const secret = speakeasy.generateSecret({
            name: `${APP_NAME} (${username})`,
            issuer: ISSUER,
            length: 32
        });
        
        logInfo(`Two-factor secret generated for user: ${username}`);
        
        return {
            secret: secret.base32,
            otpauth_url: secret.otpauth_url,
            qr_code_ascii: secret.ascii_art
        };
    } catch (error) {
        logError('Error generating two-factor secret', error);
        throw error;
    }
};

// Generate QR code for two-factor setup
export const generateQRCode = async (otpauth_url) => {
    try {
        const qrCodeDataURL = await QRCode.toDataURL(otpauth_url, {
            width: 200,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        
        logInfo('QR code generated for two-factor setup');
        return qrCodeDataURL;
    } catch (error) {
        logError('Error generating QR code', error);
        throw error;
    }
};

// Verify two-factor authentication token
export const verifyTwoFactorToken = (token, secret) => {
    try {
        const verified = speakeasy.totp.verify({
            secret: secret,
            encoding: 'base32',
            token: token,
            window: 2 // Allow 2 time steps (30 seconds each) for clock skew
        });
        
        if (verified) {
            logInfo('Two-factor token verified successfully');
        } else {
            logInfo('Two-factor token verification failed');
        }
        
        return verified;
    } catch (error) {
        logError('Error verifying two-factor token', error);
        return false;
    }
};

// Generate backup codes for two-factor authentication
export const generateBackupCodes = (count = 10) => {
    try {
        const codes = [];
        for (let i = 0; i < count; i++) {
            // Generate 8-digit backup code
            const code = Math.random().toString(36).substring(2, 10).toUpperCase();
            codes.push(code);
        }
        
        logInfo(`Generated ${count} backup codes`);
        return codes;
    } catch (error) {
        logError('Error generating backup codes', error);
        throw error;
    }
};

// Verify backup code
export const verifyBackupCode = (code, backupCodes) => {
    try {
        const index = backupCodes.indexOf(code.toUpperCase());
        if (index !== -1) {
            logInfo('Backup code verified successfully');
            return index;
        } else {
            logInfo('Invalid backup code provided');
            return -1;
        }
    } catch (error) {
        logError('Error verifying backup code', error);
        return -1;
    }
};

// Generate time-based token (for testing purposes)
export const generateToken = (secret) => {
    try {
        const token = speakeasy.totp({
            secret: secret,
            encoding: 'base32'
        });
        
        return token;
    } catch (error) {
        logError('Error generating token', error);
        throw error;
    }
};

// Check if two-factor authentication is enabled for user
export const isTwoFactorEnabled = (user) => {
    return user && user.twoFactorAuth && user.twoFactorAuth.enabled;
};

// Two-factor authentication utilities
export const twoFactorUtils = {
    generateSecret: generateTwoFactorSecret,
    generateQRCode: generateQRCode,
    verifyToken: verifyTwoFactorToken,
    generateBackupCodes: generateBackupCodes,
    verifyBackupCode: verifyBackupCode,
    generateToken: generateToken,
    isEnabled: isTwoFactorEnabled
};

export default twoFactorUtils; 