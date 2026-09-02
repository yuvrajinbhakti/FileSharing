import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { redisUtils } from '../database/redis.js';
import { logInfo, logError, auditLog } from './logger.js';
import { emailService } from './email.js';
import File from '../models/file.js';
import User from '../models/user.js';

/**
 * Hash a share-link password.
 *
 * Salted with the link id, so the same password on two links does not produce
 * the same digest and a stolen Redis dump cannot be attacked once for every
 * link at a time. This is deliberately *not* the account password path — that
 * one belongs in bcrypt with a work factor. A share-link password guards a
 * single file for a few hours behind a URL that is already a secret, and it is
 * checked on a request that must stay fast, so a salted digest is the honest
 * trade rather than an oversight.
 */
const hashLinkPassword = (password, linkId) =>
    crypto.createHash('sha256').update(`${linkId}:${password}`).digest('hex');

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * `!==` on strings returns as soon as it finds a differing byte, so how long it
 * takes says how much of the prefix was right. An access token is guessable one
 * byte at a time against that signal, given enough requests. Lengths are
 * compared first because `timingSafeEqual` throws on a mismatch.
 */
const secretsMatch = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
};

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
        if (!file || !file.isActive) {
            throw new Error('File not found');
        }

        // Get user details
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Only the owner (or an admin) may hand out a link to a file.
        //
        // This check did not exist. `File.findById` will happily return any
        // document to anybody who knows its id, so any signed-in account could
        // mint a public, unauthenticated download URL for *any* file in the
        // system by guessing or observing an id — turning the one honest access
        // control in the app into a formality. Sharing is the one operation where
        // getting this wrong hands out the file itself, not merely a page about it.
        const isOwner = file.uploadedBy.toString() === userId.toString();
        if (!isOwner && user.role !== 'admin') {
            throw new Error('Unauthorized to share this file');
        }

        // An expiry in the past is a link that cannot be used and a Redis TTL that
        // cannot be set. Reject it here, where the caller still has a message to
        // read, rather than letting it surface as a storage error.
        const expiryMs = new Date(expiresAt).getTime();
        if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
            throw new Error('Expiry must be a valid date in the future');
        }
        if (!Number.isInteger(maxDownloads) || maxDownloads < 1) {
            throw new Error('maxDownloads must be a positive whole number');
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
            // Stored as a string so it still compares equal after the round trip
            // through JSON that Redis storage implies. An ObjectId survives that
            // trip as a string, and `!==` against a live ObjectId is then always
            // true — which would silently deny the owner their own link.
            sharedBy: userId.toString(),
            sharedByUsername: user.username,
            sharedByEmail: user.email,
            createdAt: new Date(),
            expiresAt,
            maxDownloads,
            password: password ? hashLinkPassword(password, linkId) : null,
            // Normalised at the door so validation can compare without worrying
            // about the case a caller happened to type.
            allowedEmails: (allowedEmails || []).map(e => String(e).trim().toLowerCase()).filter(Boolean),
            description,
            isActive: true
        };

        // Calculate expiration time for Redis
        const expirationSeconds = Math.floor((expiryMs - Date.now()) / 1000);

        // Store in Redis
        await redisUtils.setShareLink(linkId, shareData, expirationSeconds);
        await redisUtils.addUserShareLink(shareData.sharedBy, linkId, expirationSeconds);

        // Create public share URL.
        //
        // An unset FRONTEND_URL used to interpolate the string "undefined",
        // producing `undefined/share/<id>/<token>` — a link that is malformed
        // rather than missing, so it would have been mailed to a recipient and
        // failed in their browser instead of here. Failing at creation names the
        // actual problem to the person who can fix it.
        const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
        if (!frontendUrl) {
            throw new Error('FRONTEND_URL is not set; share links would have no address');
        }
        const shareUrl = `${frontendUrl}/share/${linkId}/${accessToken}`;

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
        if (!secretsMatch(shareData.accessToken, accessToken)) {
            logError('Invalid access token for share link');
            return { valid: false, reason: 'Invalid access token' };
        }

        // Check expiration
        if (new Date() > new Date(shareData.expiresAt)) {
            logError('Share link has expired');
            return { valid: false, reason: 'Link has expired' };
        }

        // Check download limit.
        //
        // Read-only here, and deliberately: this reports whether the link *looks*
        // spent so a viewer can be told before downloading. It is not what
        // enforces the cap — `claimDownload` does that atomically at the moment a
        // download actually starts. Checking here and incrementing later is the
        // classic time-of-check/time-of-use gap, and a link is a URL, so two
        // people opening it at once is the normal case rather than the exotic one.
        const downloadCount = await redisUtils.getDownloadCount(linkId);
        if (downloadCount >= shareData.maxDownloads) {
            logError('Share link download limit reached');
            return { valid: false, reason: 'Download limit reached' };
        }

        // Check password if required
        if (shareData.password) {
            if (!password) {
                return { valid: false, reason: 'Password required', passwordRequired: true };
            }
            if (!secretsMatch(hashLinkPassword(password, linkId), shareData.password)) {
                logError('Invalid password for share link');
                return { valid: false, reason: 'Invalid password', passwordRequired: true };
            }
        }

        // Check allowed emails.
        //
        // This used to read `if (allowedEmails.length > 0 && userEmail)`, which
        // means the entire restriction was skipped whenever the caller simply did
        // not supply an email. A link restricted to one named recipient was
        // downloadable by anyone who omitted the field — the check was there, it
        // ran, and it silently permitted exactly what it was written to forbid.
        // A restriction that any caller can opt out of is not a restriction.
        if (shareData.allowedEmails && shareData.allowedEmails.length > 0) {
            const claimed = String(userEmail || '').trim().toLowerCase();
            if (!claimed) {
                return { valid: false, reason: 'Email required', emailRequired: true };
            }
            if (!shareData.allowedEmails.includes(claimed)) {
                logError('Email not allowed for share link');
                return { valid: false, reason: 'Email not authorized', emailRequired: true };
            }
        }

        logInfo(`Share link validated successfully: ${linkId}`);
        return { valid: true, shareData: { ...shareData, downloadCount } };
    } catch (error) {
        logError('Error validating share link', error);
        return { valid: false, reason: 'Validation error' };
    }
};

/**
 * Claim one download against a link's cap.
 *
 * Returns the claimed position (1-based) or null if the cap is already spent.
 * Call this *before* serving bytes, and `releaseDownload` if serving then fails —
 * a download that never happened should not consume someone's allowance.
 *
 * The previous version read the count, added one and wrote it back, which loses
 * every race it enters: two requests arriving together both read the same number
 * and both write the same increment, so a link capped at N serves N+1. It also
 * rewrote the whole blob on every download, so a burst of concurrent requests
 * could interleave and clobber unrelated fields.
 */
export const claimDownload = async (linkId) => {
    try {
        const shareData = await redisUtils.getShareLink(linkId);
        if (!shareData) return null;

        const remainingSeconds = Math.floor((new Date(shareData.expiresAt).getTime() - Date.now()) / 1000);
        const position = await redisUtils.claimDownload(linkId, shareData.maxDownloads, remainingSeconds);
        if (position === null) {
            logInfo(`Share link download limit reached: ${linkId}`);
            return null;
        }

        logInfo(`Download ${position}/${shareData.maxDownloads} claimed for share link: ${linkId}`);
        return position;
    } catch (error) {
        logError('Error claiming download', error);
        return null;
    }
};

/** Give back a claimed slot when the download did not actually happen. */
export const releaseDownload = async (linkId) => redisUtils.releaseDownload(linkId);

/**
 * Kept for callers that only want the count moved. Prefer `claimDownload`, which
 * is the one that actually enforces the limit.
 */
export const updateDownloadCount = async (linkId) => {
    const position = await claimDownload(linkId);
    return position !== null;
};

// Revoke share link
export const revokeShareLink = async (linkId, userId) => {
    try {
        const shareData = await redisUtils.getShareLink(linkId);
        if (shareData) {
            // `sharedBy` comes back from Redis as a string; comparing it to
            // whatever the caller passed without normalising both sides is how an
            // owner gets told they do not own their own link.
            const user = await User.findById(userId);
            if (shareData.sharedBy !== userId.toString()) {
                if (!user || user.role !== 'admin') {
                    throw new Error('Unauthorized to revoke this link');
                }
            }

            // Revoked means gone. Marking `isActive = false` and keeping the
            // record for a minute leaves a window in which the link still exists;
            // deleting it — along with its download counter — is what the person
            // clicking "revoke" is asking for. The index entry goes too, so the
            // link stops appearing in their list immediately.
            await redisUtils.deleteShareLink(linkId);
            await redisUtils.removeUserShareLink(shareData.sharedBy, linkId);

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
        if (shareData.sharedBy !== userId.toString()) {
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
            // From the atomic counter, not the blob — the blob's copy is no
            // longer written, so reading it here would report zero forever.
            downloadCount: await redisUtils.getDownloadCount(linkId),
            maxDownloads: shareData.maxDownloads,
            lastDownloaded: shareData.lastDownloaded,
            isActive: shareData.isActive,
            hasPassword: Boolean(shareData.password),
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

/**
 * Every live link this user has created.
 *
 * This used to return `[]` unconditionally, with a comment calling it a
 * placeholder — so a "my shared links" screen built on it would have rendered an
 * empty list forever and looked, from the outside, exactly like a user who had
 * never shared anything. It now reads the per-user index in Redis, which is
 * written by `generateShareLink` and pruned of expired ids on the way out.
 *
 * Never returns the access token or the password digest: this answers "what have
 * I shared", not "here is how to open it". A page listing your links has no need
 * to hold the credential for each one.
 */
export const getUserShareLinks = async (userId) => {
    try {
        const ids = await redisUtils.getUserShareLinkIds(userId.toString());

        const links = [];
        for (const linkId of ids) {
            const shareData = await redisUtils.getShareLink(linkId);
            if (!shareData) continue;
            links.push({
                linkId: shareData.linkId,
                fileId: shareData.fileId,
                fileName: shareData.originalName,
                fileSize: shareData.fileSize,
                createdAt: shareData.createdAt,
                expiresAt: shareData.expiresAt,
                maxDownloads: shareData.maxDownloads,
                downloadCount: await redisUtils.getDownloadCount(linkId),
                isActive: shareData.isActive,
                hasPassword: Boolean(shareData.password),
                allowedEmails: shareData.allowedEmails || [],
                description: shareData.description
            });
        }

        links.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        logInfo(`Listed ${links.length} share links for user: ${userId}`);
        return links;
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
    claimDownload,
    releaseDownload,
    updateDownloadCount,
    revokeShareLink,
    getShareLinkStats,
    sendShareNotification,
    getUserShareLinks,
    cleanupExpiredLinks
};

export default fileSharingUtils; 