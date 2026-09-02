/**
 * Share links: the HTTP layer.
 *
 * This file was zero bytes. Everything under it existed — `utils/fileSharing.js`
 * had generate, validate, revoke and stats written in full, and `database/redis.js`
 * had the storage — but nothing imported any of it and no route reached it, so
 * `validateShareLink` had never been called by anything. The feature was
 * complete apart from the part that makes it a feature.
 *
 * The interesting half is the public download. Every other route in this app
 * runs behind `authenticateToken`; this one, by construction, does not. A share
 * link is a URL handed to somebody who has no account here, and the only things
 * standing between that URL and the file are the checks in this file. So they
 * are written to fail closed, and the shape of a failure is kept uniform:
 * a recipient who supplies a wrong password and one who guesses a link id that
 * does not exist should not be able to tell which mistake they made.
 */

import {
    generateShareLink,
    validateShareLink,
    claimDownload,
    releaseDownload,
    revokeShareLink,
    getShareLinkStats,
    getUserShareLinks,
    sendShareNotification
} from '../utils/fileSharing.js';
import { decryptFile } from '../utils/encryption.js';
import File from '../models/file.js';
import { logInfo, logError, auditLog } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * How long a link may live.
 *
 * A share link is an unauthenticated grant, so "forever" is not one of the
 * options — the cap is what stops a link created once from outliving any reason
 * to trust it. Thirty days is generous for the stated use and still finite.
 */
const MAX_EXPIRY_DAYS = 30;
const DEFAULT_EXPIRY_HOURS = 24;
const MAX_DOWNLOADS_CEILING = 1000;

/**
 * One reply for every way a link can fail to open.
 *
 * Distinguishing "no such link" from "wrong token" tells someone probing ids
 * when they have found a real one, which is the expensive half of guessing.
 * The two cases the recipient can actually act on — a password or an email is
 * needed — are the exceptions, because withholding those makes the link unusable
 * by the person it was meant for.
 */
const denyAccess = (response, result) => {
    if (result?.passwordRequired) {
        return response.status(401).json({
            error: result.reason,
            code: 'SHARE_PASSWORD_REQUIRED',
            passwordRequired: true
        });
    }
    if (result?.emailRequired) {
        return response.status(401).json({
            error: result.reason,
            code: 'SHARE_EMAIL_REQUIRED',
            emailRequired: true
        });
    }
    return response.status(404).json({
        error: 'This link is not available',
        code: 'SHARE_LINK_UNAVAILABLE'
    });
};

/**
 * POST /api/share/:fileId — mint a link.
 *
 * Ownership is enforced in `generateShareLink` rather than here, because that is
 * the function anything else would call too; a check that lives only in a route
 * handler protects only that route.
 */
export const createShareLink = async (request, response) => {
    try {
        const { fileId } = request.params;
        const {
            expiresInHours = DEFAULT_EXPIRY_HOURS,
            maxDownloads = 10,
            password = null,
            allowedEmails = [],
            description = '',
            notify = false
        } = request.body || {};

        const hours = Number(expiresInHours);
        if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_EXPIRY_DAYS * 24) {
            return response.status(400).json({
                error: `expiresInHours must be between 1 and ${MAX_EXPIRY_DAYS * 24}`,
                code: 'INVALID_EXPIRY'
            });
        }

        const downloads = Number(maxDownloads);
        if (!Number.isInteger(downloads) || downloads < 1 || downloads > MAX_DOWNLOADS_CEILING) {
            return response.status(400).json({
                error: `maxDownloads must be between 1 and ${MAX_DOWNLOADS_CEILING}`,
                code: 'INVALID_MAX_DOWNLOADS'
            });
        }

        if (!Array.isArray(allowedEmails)) {
            return response.status(400).json({
                error: 'allowedEmails must be an array',
                code: 'INVALID_ALLOWED_EMAILS'
            });
        }

        const link = await generateShareLink(fileId, request.user.id, {
            expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
            maxDownloads: downloads,
            password,
            allowedEmails,
            description
        });

        // Notification failure is reported, never fatal: the link exists and
        // works whether or not the mail server was reachable, and throwing here
        // would tell the caller their link was not created when it was.
        let notifications = null;
        if (notify && allowedEmails.length > 0) {
            try {
                notifications = await sendShareNotification(link.linkId, link.shareUrl, allowedEmails);
            } catch (error) {
                logError('Share link created but notification failed', error, { linkId: link.linkId });
                notifications = { error: 'Notifications could not be sent' };
            }
        }

        return response.status(201).json({
            message: 'Share link created',
            share: {
                linkId: link.linkId,
                shareUrl: link.shareUrl,
                expiresAt: link.expiresAt,
                maxDownloads: link.maxDownloads,
                allowedEmails: link.allowedEmails,
                description: link.description,
                hasPassword: Boolean(password)
            },
            notifications
        });
    } catch (error) {
        // The util throws for both "not yours" and "no such file". Both become
        // 403/404 here rather than a 500, because neither is a server fault.
        const message = error.message || '';
        if (message.includes('Unauthorized')) {
            auditLog.unauthorizedAccess(
                request.ip,
                request.get('User-Agent'),
                request.originalUrl,
                `Attempt to share a file the user does not own - FileID: ${request.params.fileId}`
            );
            return response.status(403).json({ error: 'You cannot share this file', code: 'NOT_FILE_OWNER' });
        }
        if (message.includes('not found')) {
            return response.status(404).json({ error: 'File not found', code: 'FILE_NOT_FOUND' });
        }
        if (message.includes('Expiry') || message.includes('maxDownloads')) {
            return response.status(400).json({ error: message, code: 'INVALID_SHARE_OPTIONS' });
        }

        logError('Share link creation failed', error, { fileId: request.params.fileId, userId: request.user?.id });
        return response.status(500).json({ error: 'Could not create share link', code: 'SHARE_CREATE_ERROR' });
    }
};

/**
 * GET /api/share/:linkId/:accessToken — what is behind this link, without
 * spending a download.
 *
 * Exists so a recipient sees the file name and size, and learns that a password
 * is wanted, before committing. Password and email arrive as query parameters
 * here because this is a GET; the download route takes them in a body instead.
 */
export const getSharedFileInfo = async (request, response) => {
    try {
        const { linkId, accessToken } = request.params;
        const { password = null, email = null } = request.query || {};

        const result = await validateShareLink(linkId, accessToken, email, password);
        if (!result.valid) return denyAccess(response, result);

        const { shareData } = result;
        return response.json({
            file: {
                name: shareData.originalName,
                size: shareData.fileSize,
                mimeType: shareData.mimeType
            },
            sharedBy: shareData.sharedByUsername,
            description: shareData.description,
            expiresAt: shareData.expiresAt,
            downloadsRemaining: Math.max(0, shareData.maxDownloads - shareData.downloadCount)
        });
    } catch (error) {
        logError('Share link info failed', error, { linkId: request.params.linkId });
        return response.status(500).json({ error: 'Could not read share link', code: 'SHARE_INFO_ERROR' });
    }
};

/**
 * POST /api/share/:linkId/:accessToken/download — the actual file.
 *
 * The order here is the whole point. Validate, then *claim* a download slot
 * atomically, then decrypt, then send. Claiming before serving means two people
 * opening the last download at the same instant cannot both get it; releasing on
 * failure means a decrypt error does not silently consume a stranger's only
 * chance to fetch the file.
 */
export const downloadSharedFile = async (request, response) => {
    const { linkId, accessToken } = request.params;
    const { password = null, email = null } = request.body || {};
    let claimed = false;

    try {
        const result = await validateShareLink(linkId, accessToken, email, password);
        if (!result.valid) return denyAccess(response, result);

        const { shareData } = result;

        const file = await File.findById(shareData.fileId);
        if (!file || !file.isActive) {
            // The link outlived the file it points at — deleted since sharing.
            return response.status(404).json({ error: 'This link is not available', code: 'SHARE_LINK_UNAVAILABLE' });
        }
        if (!fs.existsSync(file.path)) {
            logError('Shared file missing from disk', new Error('File missing'), { fileId: file._id, path: file.path });
            return response.status(404).json({ error: 'This link is not available', code: 'SHARE_LINK_UNAVAILABLE' });
        }

        // Take the slot before doing any work that can fail.
        const position = await claimDownload(linkId);
        if (position === null) {
            return response.status(410).json({ error: 'This link is not available', code: 'SHARE_LINK_UNAVAILABLE' });
        }
        claimed = true;

        // Decrypt to a temp file, exactly as the authenticated download does.
        let downloadPath = file.path;
        let tempPath = null;
        const hasRealEncryption = file.isEncrypted
            && file.encryptionKey
            && file.encryptionIV && file.encryptionIV !== 'unencrypted'
            && file.encryptionTag && file.encryptionTag !== 'unencrypted';

        if (hasRealEncryption) {
            const tempDir = path.join('uploads', 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            tempPath = path.join(tempDir, `share_${Date.now()}_${path.basename(file.originalName)}`);

            try {
                await decryptFile(file.path, tempPath, Buffer.from(file.encryptionKey, 'hex'));
                downloadPath = tempPath;
            } catch (decryptError) {
                logError('Shared file decryption failed', decryptError, { fileId: file._id, linkId });
                await releaseDownload(linkId);
                claimed = false;
                return response.status(500).json({ error: 'File could not be prepared', code: 'DECRYPTION_ERROR' });
            }
        }

        if (tempPath) {
            // Remove the plaintext copy once the response is done with it,
            // whether it finished or the client walked away mid-transfer.
            const cleanup = () => {
                fs.promises.unlink(tempPath).catch(() => {});
            };
            response.on('finish', cleanup);
            response.on('close', cleanup);
        }

        file.downloadCount++;
        file.lastDownloaded = new Date();
        await file.save();

        auditLog.sharedFileDownload(
            shareData.sharedBy,
            shareData.sharedByUsername,
            file._id,
            file.originalName,
            request.ip,
            linkId
        );
        logInfo(`Shared file served: ${file.originalName} (${position}/${shareData.maxDownloads})`);

        response.setHeader('Content-Type', file.mimeType);
        return response.download(downloadPath, file.originalName, (err) => {
            if (err) logError('Shared file download error', err, { fileId: file._id, linkId });
        });
    } catch (error) {
        if (claimed) await releaseDownload(linkId);
        logError('Shared file download failed', error, { linkId });
        return response.status(500).json({ error: 'Download failed', code: 'SHARE_DOWNLOAD_ERROR' });
    }
};

/** GET /api/share/my-links — every live link this user created. */
export const listMyShareLinks = async (request, response) => {
    try {
        const links = await getUserShareLinks(request.user.id);
        return response.json({ links, count: links.length });
    } catch (error) {
        logError('Listing share links failed', error, { userId: request.user?.id });
        return response.status(500).json({ error: 'Could not list share links', code: 'SHARE_LIST_ERROR' });
    }
};

/** GET /api/share/:linkId/stats — counts for a link you own. */
export const getShareStats = async (request, response) => {
    try {
        const stats = await getShareLinkStats(request.params.linkId, request.user.id);
        if (!stats) {
            return response.status(404).json({ error: 'Share link not found', code: 'SHARE_LINK_NOT_FOUND' });
        }
        return response.json({ stats });
    } catch (error) {
        if ((error.message || '').includes('Unauthorized')) {
            return response.status(403).json({ error: 'Not your link', code: 'NOT_LINK_OWNER' });
        }
        logError('Share link stats failed', error, { linkId: request.params.linkId });
        return response.status(500).json({ error: 'Could not read statistics', code: 'SHARE_STATS_ERROR' });
    }
};

/** DELETE /api/share/:linkId — kill a link now. */
export const revokeShare = async (request, response) => {
    try {
        const revoked = await revokeShareLink(request.params.linkId, request.user.id);
        if (!revoked) {
            return response.status(404).json({ error: 'Share link not found', code: 'SHARE_LINK_NOT_FOUND' });
        }
        return response.json({ message: 'Share link revoked' });
    } catch (error) {
        if ((error.message || '').includes('Unauthorized')) {
            return response.status(403).json({ error: 'Not your link', code: 'NOT_LINK_OWNER' });
        }
        logError('Share link revocation failed', error, { linkId: request.params.linkId });
        return response.status(500).json({ error: 'Could not revoke link', code: 'SHARE_REVOKE_ERROR' });
    }
};

export default {
    createShareLink,
    getSharedFileInfo,
    downloadSharedFile,
    listMyShareLinks,
    getShareStats,
    revokeShare
};
