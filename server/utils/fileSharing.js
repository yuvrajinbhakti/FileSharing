import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { redisUtils } from '../database/redis.js';
import { logInfo, logError, auditLog } from './logger.js';
import { emailService } from './email.js';
import File from '../models/file.js';
import User from '../models/user.js';

// Generate secure share link
export const generateShareLink = async (fileId, userId, options = {}) => {
    try {
        const {
            expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours default
            maxDownloads = 10,
            password = null,
            allowedEmails = [],
            description = ''
        } = options;

        // Generate unique link ID
        const linkId = uuidv4();
        const accessToken = crypto.randomBytes(32).toString('hex');

        // Get file details
        const file = await File.findById(fileId);
        if (!file) {
            throw new Error('File not found');
        }

        // Get user details
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Create share link data
        const shareData = {
            linkId,
            accessToken,
            fileId,
            fileName: file.fileName,
            originalName: file.originalName,
            fileSize: file.fileSize,
            mimeType: file.mimeType,
            sharedBy: userId,
            sharedByUsername: user.username,
            sharedByEmail: user.email,
            createdAt: new Date(),
            expiresAt,
            maxDownloads,
            downloadCount: 0,
            password: password ? crypto.createHash('sha256').update(password).digest('hex') : null,
            allowedEmails: allowedEmails || [],
            description,
            isActive: true
        };

        // Calculate expiration time for Redis
        const expirationSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

        // Store in Redis
        await redisUtils.setShareLink(linkId, shareData, expirationSeconds);

        // Create public share URL
        const shareUrl = `${process.env.FRONTEND_URL}/share/${linkId}/${accessToken}`;

        // Log activity
        auditLog.fileShare(userId, user.username, fileId, file.originalName, shareUrl, expiresAt);

        logInfo(`Share link generated for file ${file.originalName} by user ${user.username}`);

        return {
            linkId,
            shareUrl,
            accessToken,
            expiresAt,
            maxDownloads,
            allowedEmails,
            description
        };
    } catch (error) {
        logError('Error generating share link', error);
        throw error;
    }
};

// Validate share link access
export const validateShareLink = async (linkId, accessToken, userEmail = null, password = null) => {
    try {
        // Get share data from Redis
        const shareData = await redisUtils.getShareLink(linkId);
        
        if (!shareData) {
            logError('Share link not found or expired');
            return { valid: false, reason: 'Link not found or expired' };
        }

        // Check if link is active
        if (!shareData.isActive) {
            logError('Share link is inactive');
            return { valid: false, reason: 'Link is inactive' };
        }

        // Check access token
        if (shareData.accessToken !== accessToken) {
            logError('Invalid access token for share link');
            return { valid: false, reason: 'Invalid access token' };
        }

        // Check expiration
        if (new Date() > new Date(shareData.expiresAt)) {
            logError('Share link has expired');
            return { valid: false, reason: 'Link has expired' };
        }

        // Check download limit
        if (shareData.downloadCount >= shareData.maxDownloads) {
            logError('Share link download limit reached');
            return { valid: false, reason: 'Download limit reached' };
        }

        // Check password if required
        if (shareData.password && password) {
            const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
            if (hashedPassword !== shareData.password) {
                logError('Invalid password for share link');
                return { valid: false, reason: 'Invalid password' };
            }
        } else if (shareData.password && !password) {
            return { valid: false, reason: 'Password required' };
        }

        // Check allowed emails
        if (shareData.allowedEmails.length > 0 && userEmail) {
            if (!shareData.allowedEmails.includes(userEmail)) {
                logError('Email not allowed for share link');
                return { valid: false, reason: 'Email not authorized' };
            }
        }

        logInfo(`Share link validated successfully: ${linkId}`);
        return { valid: true, shareData };
    } catch (error) {
        logError('Error validating share link', error);
        return { valid: false, reason: 'Validation error' };
    }
};

// Update share link download count
export const updateDownloadCount = async (linkId) => {
    try {
        const shareData = await redisUtils.getShareLink(linkId);
        if (shareData) {
            shareData.downloadCount += 1;
            shareData.lastDownloaded = new Date();
            
            // Calculate remaining expiration time
            const expirationSeconds = Math.floor((new Date(shareData.expiresAt).getTime() - Date.now()) / 1000);
            
            // Update in Redis
            await redisUtils.setShareLink(linkId, shareData, expirationSeconds);
            
            logInfo(`Download count updated for share link: ${linkId}`);
            return true;
        }
        return false;
    } catch (error) {
        logError('Error updating download count', error);
        return false;
    }
};

// Revoke share link
export const revokeShareLink = async (linkId, userId) => {
    try {
        const shareData = await redisUtils.getShareLink(linkId);
        if (shareData) {
            // Check if user has permission to revoke
            if (shareData.sharedBy !== userId) {
                const user = await User.findById(userId);
                if (!user || user.role !== 'admin') {
                    throw new Error('Unauthorized to revoke this link');
                }
            }

            // Mark as inactive
            shareData.isActive = false;
            shareData.revokedAt = new Date();
            shareData.revokedBy = userId;
            
            // Update in Redis with short expiration
            await redisUtils.setShareLink(linkId, shareData, 60); // 1 minute
            
            // Log activity
            const user = await User.findById(userId);
            auditLog.linkRevoked(userId, user?.username, linkId, shareData.fileName);
            
            logInfo(`Share link revoked: ${linkId}`);
            return true;
        }
        return false;
    } catch (error) {
        logError('Error revoking share link', error);
        throw error;
    }
};

// Get share link statistics
export const getShareLinkStats = async (linkId, userId) => {
    try {
        const shareData = await redisUtils.getShareLink(linkId);
        if (!shareData) {
            return null;
        }

        // Check if user has permission to view stats
        if (shareData.sharedBy !== userId) {
            const user = await User.findById(userId);
            if (!user || user.role !== 'admin') {
                throw new Error('Unauthorized to view link statistics');
            }
        }

        return {
            linkId: shareData.linkId,
            fileName: shareData.originalName,
            createdAt: shareData.createdAt,
            expiresAt: shareData.expiresAt,
            downloadCount: shareData.downloadCount,
            maxDownloads: shareData.maxDownloads,
            lastDownloaded: shareData.lastDownloaded,
            isActive: shareData.isActive,
            allowedEmails: shareData.allowedEmails,
            description: shareData.description
        };
    } catch (error) {
        logError('Error getting share link stats', error);
        throw error;
    }
};

// Send share link notification
export const sendShareNotification = async (linkId, shareUrl, recipientEmails) => {
    try {
        const shareData = await redisUtils.getShareLink(linkId);
        if (!shareData) {
            throw new Error('Share link not found');
        }

        const results = [];
        for (const email of recipientEmails) {
            try {
                const sent = await emailService.sendFileShareNotification(
                    email,
                    shareData.sharedByUsername,
                    shareData.originalName,
                    shareUrl,
                    shareData.expiresAt
                );
                results.push({ email, sent });
            } catch (error) {
                logError(`Error sending notification to ${email}`, error);
                results.push({ email, sent: false, error: error.message });
            }
        }

        logInfo(`Share notifications sent for link: ${linkId}`);
        return results;
    } catch (error) {
        logError('Error sending share notifications', error);
        throw error;
    }
};

// Get user's share links
export const getUserShareLinks = async (userId) => {
    try {
        // This would typically be stored in the database for persistence
        // For now, we'll return active links from Redis (limited functionality)
        logInfo(`Getting share links for user: ${userId}`);
        return []; // Placeholder - implement database storage for better persistence
    } catch (error) {
        logError('Error getting user share links', error);
        throw error;
    }
};

// Clean up expired share links (scheduled job)
export const cleanupExpiredLinks = async () => {
    try {
        // This would scan Redis for expired links and clean them up
        logInfo('Cleaning up expired share links');
        return true;
    } catch (error) {
        logError('Error cleaning up expired links', error);
        return false;
    }
};

export const fileSharingUtils = {
    generateShareLink,
    validateShareLink,
    updateDownloadCount,
    revokeShareLink,
    getShareLinkStats,
    sendShareNotification,
    getUserShareLinks,
    cleanupExpiredLinks
};

export default fileSharingUtils; 