import nodemailer from 'nodemailer';
import { logInfo, logError } from './logger.js';
import dotenv from 'dotenv';

dotenv.config();

// Email configuration
const emailConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
};

// Create transporter
const transporter = nodemailer.createTransporter(emailConfig);

// Verify email configuration
const verifyEmailConfig = async () => {
    try {
        await transporter.verify();
        logInfo('Email configuration verified successfully');
        return true;
    } catch (error) {
        logError('Email configuration verification failed', error);
        return false;
    }
};

// Email templates
const emailTemplates = {
    welcome: (username) => ({
        subject: 'Welcome to SecureShare',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Welcome to SecureShare</h2>
                <p>Hello ${username},</p>
                <p>Welcome to SecureShare! Your account has been created successfully.</p>
                <p>You can now securely upload, share, and manage your files with enterprise-grade encryption.</p>
                <div style="background-color: #f0f0f0; padding: 20px; border-radius: 5px; margin: 20px 0;">
                    <h3>Key Features:</h3>
                    <ul>
                        <li>AES-256 encryption for all files</li>
                        <li>Role-based access control</li>
                        <li>Audit logging and monitoring</li>
                        <li>Secure file sharing links</li>
                    </ul>
                </div>
                <p>If you have any questions, please contact our support team.</p>
                <p>Best regards,<br>The SecureShare Team</p>
            </div>
        `
    }),

    fileShared: (username, fileName, shareLink, expiresAt) => ({
        subject: 'File Shared with You',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">File Shared with You</h2>
                <p>Hello,</p>
                <p>${username} has shared a file with you on SecureShare.</p>
                <div style="background-color: #f0f0f0; padding: 20px; border-radius: 5px; margin: 20px 0;">
                    <h3>File Details:</h3>
                    <p><strong>File Name:</strong> ${fileName}</p>
                    <p><strong>Shared By:</strong> ${username}</p>
                    <p><strong>Expires:</strong> ${expiresAt ? new Date(expiresAt).toLocaleString() : 'Never'}</p>
                </div>
                <p>
                    <a href="${shareLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        Download File
                    </a>
                </p>
                <p><strong>Security Note:</strong> This link is encrypted and will expire after use or on the specified date.</p>
                <p>Best regards,<br>The SecureShare Team</p>
            </div>
        `
    }),

    passwordReset: (username, resetToken) => ({
        subject: 'Password Reset Request',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Password Reset Request</h2>
                <p>Hello ${username},</p>
                <p>We received a request to reset your password for your SecureShare account.</p>
                <div style="background-color: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
                    <h3>Reset Code:</h3>
                    <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${resetToken}</p>
                    <p><strong>This code expires in 15 minutes.</strong></p>
                </div>
                <p>If you didn't request this password reset, please ignore this email and your password will remain unchanged.</p>
                <p>Best regards,<br>The SecureShare Team</p>
            </div>
        `
    }),

    securityAlert: (username, activity, details) => ({
        subject: 'Security Alert - SecureShare',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #dc3545;">Security Alert</h2>
                <p>Hello ${username},</p>
                <p>We detected suspicious activity on your SecureShare account.</p>
                <div style="background-color: #f8d7da; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #dc3545;">
                    <h3>Activity Details:</h3>
                    <p><strong>Activity:</strong> ${activity}</p>
                    <p><strong>Details:</strong> ${details}</p>
                    <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                </div>
                <p>If this was you, you can safely ignore this email. Otherwise, please change your password immediately.</p>
                <p>Best regards,<br>The SecureShare Team</p>
            </div>
        `
    }),

    twoFactorSetup: (username, qrCode) => ({
        subject: 'Two-Factor Authentication Setup',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Two-Factor Authentication Setup</h2>
                <p>Hello ${username},</p>
                <p>You have enabled two-factor authentication for your SecureShare account.</p>
                <div style="background-color: #f0f0f0; padding: 20px; border-radius: 5px; margin: 20px 0;">
                    <h3>Setup Instructions:</h3>
                    <ol>
                        <li>Download an authenticator app (Google Authenticator, Authy, etc.)</li>
                        <li>Scan the QR code below with your authenticator app</li>
                        <li>Enter the 6-digit code from your app to complete setup</li>
                    </ol>
                    <div style="text-align: center; margin: 20px 0;">
                        <img src="${qrCode}" alt="QR Code" style="max-width: 200px; height: auto;">
                    </div>
                </div>
                <p><strong>Important:</strong> Save your backup codes in a secure location.</p>
                <p>Best regards,<br>The SecureShare Team</p>
            </div>
        `
    })
};

// Email sending functions
export const emailService = {
    async sendWelcomeEmail(email, username) {
        try {
            const template = emailTemplates.welcome(username);
            await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: email,
                subject: template.subject,
                html: template.html
            });
            logInfo(`Welcome email sent to ${email}`);
            return true;
        } catch (error) {
            logError('Error sending welcome email', error);
            return false;
        }
    },

    async sendFileShareNotification(email, sharedBy, fileName, shareLink, expiresAt) {
        try {
            const template = emailTemplates.fileShared(sharedBy, fileName, shareLink, expiresAt);
            await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: email,
                subject: template.subject,
                html: template.html
            });
            logInfo(`File share notification sent to ${email}`);
            return true;
        } catch (error) {
            logError('Error sending file share notification', error);
            return false;
        }
    },

    async sendPasswordResetEmail(email, username, resetToken) {
        try {
            const template = emailTemplates.passwordReset(username, resetToken);
            await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: email,
                subject: template.subject,
                html: template.html
            });
            logInfo(`Password reset email sent to ${email}`);
            return true;
        } catch (error) {
            logError('Error sending password reset email', error);
            return false;
        }
    },

    async sendSecurityAlert(email, username, activity, details) {
        try {
            const template = emailTemplates.securityAlert(username, activity, details);
            await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: email,
                subject: template.subject,
                html: template.html
            });
            logInfo(`Security alert sent to ${email}`);
            return true;
        } catch (error) {
            logError('Error sending security alert', error);
            return false;
        }
    },

    async sendTwoFactorSetupEmail(email, username, qrCode) {
        try {
            const template = emailTemplates.twoFactorSetup(username, qrCode);
            await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: email,
                subject: template.subject,
                html: template.html
            });
            logInfo(`Two-factor setup email sent to ${email}`);
            return true;
        } catch (error) {
            logError('Error sending two-factor setup email', error);
            return false;
        }
    },

    async sendCustomEmail(email, subject, html) {
        try {
            await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: email,
                subject: subject,
                html: html
            });
            logInfo(`Custom email sent to ${email}`);
            return true;
        } catch (error) {
            logError('Error sending custom email', error);
            return false;
        }
    }
};

// Initialize email service
export const initEmailService = async () => {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        const isConfigured = await verifyEmailConfig();
        if (isConfigured) {
            logInfo('Email service initialized successfully');
        } else {
            logError('Email service initialization failed');
        }
        return isConfigured;
    } else {
        logInfo('Email service not configured - SMTP credentials not provided');
        return false;
    }
};

export default emailService; 