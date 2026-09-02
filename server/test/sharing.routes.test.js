/**
 * Share links, over real HTTP.
 *
 * The unit tests next door check the sharing *rules*. This file checks the thing
 * that was actually missing: that any of it is reachable. The controller was a
 * zero-byte file and no route referenced it, so every rule in `fileSharing.js`
 * was correct and unreachable — which, from outside, is identical to not having
 * the feature.
 *
 * So these mount the real router on a real Express app, sign real JWTs with the
 * real middleware, and drive it over a real socket. What is mocked is Mongo and
 * the mailer, because the question here is about routing and authorisation, not
 * about Mongoose.
 *
 * Run: node --test --experimental-test-module-mocks test/sharing.routes.test.js
 */

import { test, before, after, beforeEach, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';

const REDIS_PORT = 6398;
process.env.REDIS_URL = `redis://127.0.0.1:${REDIS_PORT}`;
process.env.FRONTEND_URL = 'https://example.test';
process.env.JWT_SECRET = 'a'.repeat(48);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(48);
process.env.NODE_ENV = 'test';

const OWNER_ID = '507f1f77bcf86cd799439011';
const STRANGER_ID = '507f1f77bcf86cd799439012';
const FILE_ID = '507f191e810c19729de860ea';

const FILES = {
    [FILE_ID]: {
        _id: FILE_ID,
        uploadedBy: OWNER_ID,
        isActive: true,
        fileName: 'stored.pdf',
        originalName: 'quarterly.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        path: 'uploads/does-not-exist.pdf',
        isEncrypted: false,
        downloadCount: 0,
        save: async function () { return this; }
    }
};

const USERS = {
    [OWNER_ID]: { _id: OWNER_ID, username: 'owner', email: 'owner@example.test', role: 'user', isActive: true, isLocked: () => false },
    [STRANGER_ID]: { _id: STRANGER_ID, username: 'stranger', email: 'stranger@example.test', role: 'user', isActive: true, isLocked: () => false }
};

let redisProcess;
let server;
let baseUrl;
let redisClient;
let jwt;

const startRedis = (port) => {
    const proc = spawn('redis-server', ['--port', String(port), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
    // Without this the ENOENT from a missing binary surfaces as an unhandled
    // error event and the suite dies pointing at nothing in particular. These
    // tests use a real Redis on purpose — a stub would agree with whatever this
    // code believes about INCR and TTL, which is the assumption under test — so
    // the honest failure is to say the dependency is missing, not to skip.
    proc.on('error', (err) => {
        throw new Error(
            err.code === 'ENOENT'
                ? 'redis-server not found on PATH. These tests run against a real Redis: `brew install redis` (macOS) or `apt-get install redis-server`.'
                : `Could not start redis-server: ${err.message}`
        );
    });
    return proc;
};

const waitForPort = async (port, timeoutMs = 8000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const open = await new Promise((resolve) => {
            const socket = net.connect(port, '127.0.0.1');
            socket.on('connect', () => { socket.end(); resolve(true); });
            socket.on('error', () => resolve(false));
        });
        if (open) return true;
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Redis did not open port ${port}`);
};

/** A signed token for one of the fixture users, made by the app's own signer. */
const tokenFor = (userId) => jwt.sign(
    { userId, username: USERS[userId].username, email: USERS[userId].email, role: USERS[userId].role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
);

const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'manual'
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json — a file body */ }
    return { status: res.status, json, text };
};

before(async () => {
    redisProcess = startRedis(REDIS_PORT);
    await waitForPort(REDIS_PORT);

    const noop = () => {};
    mock.module('../models/file.js', {
        defaultExport: { findById: async (id) => FILES[String(id)] || null }
    });
    mock.module('../models/user.js', {
        defaultExport: { findById: async (id) => USERS[String(id)] || null }
    });
    mock.module('../utils/logger.js', {
        namedExports: { logInfo: noop, logError: noop, auditLog: new Proxy({}, { get: () => noop }) }
    });
    mock.module('../utils/email.js', {
        namedExports: { emailService: { sendFileShareNotification: async () => true } }
    });
    // `upload.js` builds multer storage and touches the filesystem at import
    // time; the router imports it, and none of these tests upload anything.
    mock.module('../utils/upload.js', {
        defaultExport: { single: () => (req, res, next) => next() }
    });

    jwt = (await import('jsonwebtoken')).default;

    const redisModule = await import('../database/redis.js');
    redisClient = redisModule.redisClient;
    await redisModule.connectRedis();

    const express = (await import('express')).default;
    const router = (await import('../routes/routes.js')).default;

    const app = express();
    app.use(express.json());
    app.use('/api', router);

    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise(resolve => server?.close(resolve));
    try { await redisClient?.quit(); } catch { /* already closed */ }
    redisProcess?.kill('SIGKILL');
});

beforeEach(async () => {
    await redisClient.flushAll();
    FILES[FILE_ID].downloadCount = 0;
});

/** Create a link through the HTTP API and return the parsed body. */
const createLink = async (body = {}) => {
    const res = await call('POST', `/api/share/${FILE_ID}`, { token: tokenFor(OWNER_ID), body });
    assert.equal(res.status, 201, `create failed: ${res.text}`);
    return res.json.share;
};

/** The token is only returned inside shareUrl, so pull it back out. */
const tokenFromUrl = (shareUrl) => shareUrl.split('/').pop();

describe('the routes exist at all', () => {
    test('POST /api/share/:fileId is mounted', async () => {
        // Before this change the path did not exist and every one of these
        // returned 404 — including for the owner, holding a valid token.
        const res = await call('POST', `/api/share/${FILE_ID}`, { token: tokenFor(OWNER_ID) });
        assert.equal(res.status, 201);
        assert.ok(res.json.share.shareUrl.startsWith('https://example.test/share/'));
    });

    test('GET /api/share/my-links is mounted and is not shadowed by /share/:linkId', async () => {
        const res = await call('GET', '/api/share/my-links', { token: tokenFor(OWNER_ID) });
        assert.equal(res.status, 200);
        assert.deepEqual(res.json, { links: [], count: 0 });
    });

    test('GET /api/share/:linkId/stats wins over /share/:linkId/:accessToken', async () => {
        // Both patterns match a two-segment path; declaration order decides.
        // If it lost, this would be read as accessToken === 'stats' and 404.
        const share = await createLink();
        const res = await call('GET', `/api/share/${share.linkId}/stats`, { token: tokenFor(OWNER_ID) });
        assert.equal(res.status, 200);
        assert.equal(res.json.stats.linkId, share.linkId);
    });
});

describe('creating a link needs to be you', () => {
    test('no token is rejected', async () => {
        const res = await call('POST', `/api/share/${FILE_ID}`);
        assert.equal(res.status, 401);
    });

    test('a stranger gets 403, not a link', async () => {
        const res = await call('POST', `/api/share/${FILE_ID}`, { token: tokenFor(STRANGER_ID) });
        assert.equal(res.status, 403);
        assert.equal(res.json.code, 'NOT_FILE_OWNER');
    });

    test('a bad expiry gets 400, not 500', async () => {
        const res = await call('POST', `/api/share/${FILE_ID}`, {
            token: tokenFor(OWNER_ID),
            body: { expiresInHours: 24 * 400 }
        });
        assert.equal(res.status, 400);
        assert.equal(res.json.code, 'INVALID_EXPIRY');
    });

    test('a bad download cap gets 400', async () => {
        const res = await call('POST', `/api/share/${FILE_ID}`, {
            token: tokenFor(OWNER_ID),
            body: { maxDownloads: 0 }
        });
        assert.equal(res.status, 400);
    });

    test('a missing file gets 404', async () => {
        const res = await call('POST', '/api/share/507f191e810c19729de860eb', { token: tokenFor(OWNER_ID) });
        assert.equal(res.status, 404);
    });
});

describe('opening a link as a stranger with no account', () => {
    test('the info route works with no Authorization header at all', async () => {
        const share = await createLink({ description: 'the numbers' });
        const res = await call('GET', `/api/share/${share.linkId}/${tokenFromUrl(share.shareUrl)}`);
        assert.equal(res.status, 200);
        assert.equal(res.json.file.name, 'quarterly.pdf');
        assert.equal(res.json.sharedBy, 'owner');
        assert.equal(res.json.downloadsRemaining, 10);
    });

    test('a wrong token gives the same answer as a link that does not exist', async () => {
        // Distinguishing them tells someone probing ids when they have found a
        // real one, which is the expensive half of guessing.
        const share = await createLink();
        const wrongToken = await call('GET', `/api/share/${share.linkId}/${'f'.repeat(64)}`);
        const noSuchLink = await call('GET', `/api/share/00000000-0000-4000-8000-000000000000/${'f'.repeat(64)}`);
        assert.equal(wrongToken.status, noSuchLink.status);
        assert.deepEqual(wrongToken.json, noSuchLink.json);
        assert.equal(wrongToken.status, 404);
    });

    test('a password-protected link says so without revealing the file', async () => {
        const share = await createLink({ password: 'hunter2' });
        const res = await call('GET', `/api/share/${share.linkId}/${tokenFromUrl(share.shareUrl)}`);
        assert.equal(res.status, 401);
        assert.equal(res.json.passwordRequired, true);
        assert.equal(res.text.includes('quarterly'), false, 'the file name leaked past the password gate');
    });

    test('an email-restricted link does not open without an email', async () => {
        const share = await createLink({ allowedEmails: ['alice@example.test'] });
        const res = await call('GET', `/api/share/${share.linkId}/${tokenFromUrl(share.shareUrl)}`);
        assert.equal(res.status, 401);
        assert.equal(res.json.emailRequired, true);
    });

    test('an email-restricted link opens for the named address', async () => {
        const share = await createLink({ allowedEmails: ['alice@example.test'] });
        const res = await call('GET', `/api/share/${share.linkId}/${tokenFromUrl(share.shareUrl)}?email=alice@example.test`);
        assert.equal(res.status, 200);
    });

    test('reading the info does not spend a download', async () => {
        const share = await createLink({ maxDownloads: 1 });
        await call('GET', `/api/share/${share.linkId}/${tokenFromUrl(share.shareUrl)}`);
        await call('GET', `/api/share/${share.linkId}/${tokenFromUrl(share.shareUrl)}`);
        const stats = await call('GET', `/api/share/${share.linkId}/stats`, { token: tokenFor(OWNER_ID) });
        assert.equal(stats.json.stats.downloadCount, 0);
    });
});

describe('downloading', () => {
    test('a download of a file missing from disk does not spend the allowance', async () => {
        // The fixture points at a path that does not exist, which is the same
        // shape as a file deleted after sharing. The caller gets an error and
        // the recipient's one download is still theirs.
        const share = await createLink({ maxDownloads: 1 });
        const res = await call('POST', `/api/share/${share.linkId}/${tokenFromUrl(share.shareUrl)}/download`);
        assert.equal(res.status, 404);

        const stats = await call('GET', `/api/share/${share.linkId}/stats`, { token: tokenFor(OWNER_ID) });
        assert.equal(stats.json.stats.downloadCount, 0, 'a failed download consumed the allowance');
    });

    test('a wrong password cannot download', async () => {
        const share = await createLink({ password: 'hunter2' });
        const res = await call('POST', `/api/share/${share.linkId}/${tokenFromUrl(share.shareUrl)}/download`, {
            body: { password: 'wrong' }
        });
        assert.equal(res.status, 401);
    });
});

describe('managing your own links', () => {
    test('my-links shows what you made and hides the token', async () => {
        const share = await createLink({ password: 'hunter2', description: 'q4' });
        const res = await call('GET', '/api/share/my-links', { token: tokenFor(OWNER_ID) });
        assert.equal(res.status, 200);
        assert.equal(res.json.count, 1);
        assert.equal(res.json.links[0].linkId, share.linkId);
        assert.equal(res.json.links[0].hasPassword, true);
        assert.equal(res.text.includes(tokenFromUrl(share.shareUrl)), false, 'the access token leaked into the listing');
    });

    test('a stranger sees none of your links', async () => {
        await createLink();
        const res = await call('GET', '/api/share/my-links', { token: tokenFor(STRANGER_ID) });
        assert.equal(res.json.count, 0);
    });

    test('a stranger cannot read your stats', async () => {
        const share = await createLink();
        const res = await call('GET', `/api/share/${share.linkId}/stats`, { token: tokenFor(STRANGER_ID) });
        assert.equal(res.status, 403);
    });

    test('revoke kills the link for everyone', async () => {
        const share = await createLink();
        const token = tokenFromUrl(share.shareUrl);
        assert.equal((await call('GET', `/api/share/${share.linkId}/${token}`)).status, 200);

        const revoked = await call('DELETE', `/api/share/${share.linkId}`, { token: tokenFor(OWNER_ID) });
        assert.equal(revoked.status, 200);

        assert.equal((await call('GET', `/api/share/${share.linkId}/${token}`)).status, 404);
    });

    test('a stranger cannot revoke your link', async () => {
        const share = await createLink();
        const res = await call('DELETE', `/api/share/${share.linkId}`, { token: tokenFor(STRANGER_ID) });
        assert.equal(res.status, 403);
        // Still alive, so the refused revoke did not half-apply.
        assert.equal((await call('GET', `/api/share/${share.linkId}/${tokenFromUrl(share.shareUrl)}`)).status, 200);
    });

    test('revoking a link that does not exist is 404, not 500', async () => {
        const res = await call('DELETE', '/api/share/00000000-0000-4000-8000-000000000000', { token: tokenFor(OWNER_ID) });
        assert.equal(res.status, 404);
    });
});
