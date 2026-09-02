/**
 * Share links, tested against a real Redis.
 *
 * These exist because the sharing layer shipped with every function written and
 * nothing calling them, so none of it had ever run. Writing the controller was
 * the easy half; the half that matters is checking that the checks check what
 * they say. Three of the tests below fail against the code as it was found:
 *
 *   - anyone signed in could mint a public link to *any* file, by id
 *   - an email restriction was skipped entirely if the caller omitted an email
 *   - the download cap lost races, so a link capped at N served more than N
 *
 * Redis is real rather than stubbed. A stub would agree with whatever I believed
 * about `INCR` and expiry semantics, which is exactly the assumption under test.
 * Mongo is mocked, because these tests are about the sharing rules, not about
 * whether Mongoose can find a document.
 *
 * Run: node --test --experimental-test-module-mocks test/sharing.test.js
 * (a Redis is started and torn down automatically; nothing outside is touched)
 */

import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mock } from 'node:test';
import net from 'node:net';

const REDIS_PORT = 6399;
process.env.REDIS_URL = `redis://127.0.0.1:${REDIS_PORT}`;
process.env.FRONTEND_URL = 'https://example.test';
process.env.JWT_SECRET = 'a'.repeat(48);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(48);

let redisProcess;

/** Fixtures the mocked models hand back. */
const OWNER_ID = '507f1f77bcf86cd799439011';
const STRANGER_ID = '507f1f77bcf86cd799439012';
const ADMIN_ID = '507f1f77bcf86cd799439013';
const FILE_ID = '507f191e810c19729de860ea';

const FILES = {
    [FILE_ID]: {
        _id: FILE_ID,
        uploadedBy: OWNER_ID,
        isActive: true,
        fileName: 'stored-name.pdf',
        originalName: 'quarterly.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf'
    }
};

const USERS = {
    [OWNER_ID]: { _id: OWNER_ID, username: 'owner', email: 'owner@example.test', role: 'user' },
    [STRANGER_ID]: { _id: STRANGER_ID, username: 'stranger', email: 'stranger@example.test', role: 'user' },
    [ADMIN_ID]: { _id: ADMIN_ID, username: 'root', email: 'root@example.test', role: 'admin' }
};

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
    throw new Error(`Redis did not open port ${port} in time`);
};

let sharing;
let redisUtils;
let redisClient;

before(async () => {
    // `--save ''` so the test never writes an RDB file into the repo.
    redisProcess = startRedis(REDIS_PORT);
    await waitForPort(REDIS_PORT);

    // Mongo models, replaced with lookups over the fixtures above.
    mock.module('../models/file.js', {
        defaultExport: { findById: async (id) => FILES[String(id)] || null }
    });
    mock.module('../models/user.js', {
        defaultExport: { findById: async (id) => USERS[String(id)] || null }
    });
    // The real logger pulls in winston-mongodb and would try to reach a database.
    const noop = () => {};
    mock.module('../utils/logger.js', {
        namedExports: {
            logInfo: noop,
            logError: noop,
            auditLog: new Proxy({}, { get: () => noop })
        }
    });
    mock.module('../utils/email.js', {
        namedExports: { emailService: { sendFileShareNotification: async () => true } }
    });

    const redisModule = await import('../database/redis.js');
    redisUtils = redisModule.redisUtils;
    redisClient = redisModule.redisClient;
    await redisModule.connectRedis();

    sharing = await import('../utils/fileSharing.js');
});

after(async () => {
    try { await redisClient?.quit(); } catch { /* already closed */ }
    redisProcess?.kill('SIGKILL');
});

beforeEach(async () => {
    await redisClient.flushAll();
});

/** A link owned by OWNER_ID, with whatever options the test cares about. */
const makeLink = (options = {}) => sharing.generateShareLink(FILE_ID, OWNER_ID, options);

describe('who may create a link', () => {
    test('the owner can', async () => {
        const link = await makeLink();
        assert.ok(link.linkId);
        assert.match(link.shareUrl, /^https:\/\/example\.test\/share\/[0-9a-f-]{36}\/[0-9a-f]{64}$/);
    });

    test('a stranger cannot share a file they do not own', async () => {
        // The bug this replaces: File.findById returns any document to anyone,
        // so any signed-in account could mint a public link to any file by id.
        await assert.rejects(
            () => sharing.generateShareLink(FILE_ID, STRANGER_ID, {}),
            /Unauthorized to share this file/
        );
    });

    test('an admin can share someone else\'s file', async () => {
        const link = await sharing.generateShareLink(FILE_ID, ADMIN_ID, {});
        assert.ok(link.linkId);
    });

    test('a link to a file that does not exist is refused', async () => {
        await assert.rejects(
            () => sharing.generateShareLink('507f191e810c19729de860eb', OWNER_ID, {}),
            /File not found/
        );
    });

    test('an expiry in the past is refused rather than stored', async () => {
        await assert.rejects(
            () => makeLink({ expiresAt: new Date(Date.now() - 1000) }),
            /Expiry must be a valid date in the future/
        );
    });

    test('a nonsense download cap is refused', async () => {
        await assert.rejects(() => makeLink({ maxDownloads: 0 }), /maxDownloads/);
        await assert.rejects(() => makeLink({ maxDownloads: 2.5 }), /maxDownloads/);
    });
});

describe('opening a link', () => {
    test('the right token opens it', async () => {
        const link = await makeLink();
        const result = await sharing.validateShareLink(link.linkId, link.accessToken);
        assert.equal(result.valid, true);
        assert.equal(result.shareData.originalName, 'quarterly.pdf');
    });

    test('a wrong token does not', async () => {
        const link = await makeLink();
        const result = await sharing.validateShareLink(link.linkId, 'f'.repeat(64));
        assert.equal(result.valid, false);
    });

    test('a token of the wrong length does not crash the comparison', async () => {
        // timingSafeEqual throws on differing lengths; the guard must catch that
        // rather than turn a bad request into a 500.
        const link = await makeLink();
        for (const bad of ['', 'short', 'f'.repeat(200), null, undefined, 12345]) {
            const result = await sharing.validateShareLink(link.linkId, bad);
            assert.equal(result.valid, false, `token ${JSON.stringify(bad)} should be rejected`);
        }
    });

    test('an unknown link id does not', async () => {
        const result = await sharing.validateShareLink('no-such-link', 'f'.repeat(64));
        assert.equal(result.valid, false);
    });
});

describe('password protection', () => {
    test('the right password opens it', async () => {
        const link = await makeLink({ password: 'hunter2' });
        const result = await sharing.validateShareLink(link.linkId, link.accessToken, null, 'hunter2');
        assert.equal(result.valid, true);
    });

    test('the wrong password does not', async () => {
        const link = await makeLink({ password: 'hunter2' });
        const result = await sharing.validateShareLink(link.linkId, link.accessToken, null, 'hunter3');
        assert.equal(result.valid, false);
        assert.equal(result.passwordRequired, true);
    });

    test('omitting the password does not skip the check', async () => {
        const link = await makeLink({ password: 'hunter2' });
        const result = await sharing.validateShareLink(link.linkId, link.accessToken, null, null);
        assert.equal(result.valid, false);
        assert.equal(result.passwordRequired, true);
    });

    test('the same password on two links stores two different digests', async () => {
        // Salted per link, so one cracked digest does not unlock every link that
        // happened to use the same password.
        const a = await makeLink({ password: 'same' });
        const b = await makeLink({ password: 'same' });
        const rawA = await redisUtils.getShareLink(a.linkId);
        const rawB = await redisUtils.getShareLink(b.linkId);
        assert.notEqual(rawA.password, rawB.password);
    });
});

describe('email restriction', () => {
    test('an allowed address opens it', async () => {
        const link = await makeLink({ allowedEmails: ['alice@example.test'] });
        const result = await sharing.validateShareLink(link.linkId, link.accessToken, 'alice@example.test');
        assert.equal(result.valid, true);
    });

    test('a different address does not', async () => {
        const link = await makeLink({ allowedEmails: ['alice@example.test'] });
        const result = await sharing.validateShareLink(link.linkId, link.accessToken, 'mallory@example.test');
        assert.equal(result.valid, false);
    });

    test('omitting the address does NOT bypass the restriction', async () => {
        // The bug this replaces. The old condition was
        //   if (allowedEmails.length > 0 && userEmail)
        // so passing no email skipped the check entirely and the link opened for
        // anyone. The check ran, and permitted exactly what it forbade.
        const link = await makeLink({ allowedEmails: ['alice@example.test'] });
        const result = await sharing.validateShareLink(link.linkId, link.accessToken, null);
        assert.equal(result.valid, false, 'a link restricted by email must not open without one');
        assert.equal(result.emailRequired, true);
    });

    test('address matching ignores case and surrounding space', async () => {
        const link = await makeLink({ allowedEmails: ['  Alice@Example.test '] });
        const result = await sharing.validateShareLink(link.linkId, link.accessToken, 'ALICE@example.TEST');
        assert.equal(result.valid, true);
    });
});

describe('download limit', () => {
    test('is enforced', async () => {
        const link = await makeLink({ maxDownloads: 2 });
        assert.equal(await sharing.claimDownload(link.linkId), 1);
        assert.equal(await sharing.claimDownload(link.linkId), 2);
        assert.equal(await sharing.claimDownload(link.linkId), null);
    });

    test('holds under concurrent claims', async () => {
        // The bug this replaces: read-count, add-one, write-back loses races, so
        // ten simultaneous opens of a link with three downloads left all read the
        // same number and all decide there is room. A share link is a URL, so
        // concurrent opens are the normal case, not an exotic one.
        const link = await makeLink({ maxDownloads: 3 });
        const results = await Promise.all(
            Array.from({ length: 25 }, () => sharing.claimDownload(link.linkId))
        );
        const granted = results.filter(r => r !== null);
        assert.equal(granted.length, 3, `expected exactly 3 grants, got ${granted.length}`);
        // Every grant is a distinct position — no two callers got the same slot.
        assert.equal(new Set(granted).size, 3);
    });

    test('a released claim can be used by someone else', async () => {
        const link = await makeLink({ maxDownloads: 1 });
        assert.equal(await sharing.claimDownload(link.linkId), 1);
        assert.equal(await sharing.claimDownload(link.linkId), null);
        await sharing.releaseDownload(link.linkId);
        assert.equal(await sharing.claimDownload(link.linkId), 1);
    });

    test('a spent link reports as invalid', async () => {
        const link = await makeLink({ maxDownloads: 1 });
        await sharing.claimDownload(link.linkId);
        const result = await sharing.validateShareLink(link.linkId, link.accessToken);
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'Download limit reached');
    });
});

describe('expiry', () => {
    test('Redis is given the link\'s own lifetime', async () => {
        const link = await makeLink({ expiresAt: new Date(Date.now() + 60_000) });
        const ttl = await redisClient.ttl(`share:${link.linkId}`);
        assert.ok(ttl > 0 && ttl <= 60, `ttl was ${ttl}`);
    });

    test('a link gone from Redis does not open', async () => {
        const link = await makeLink();
        await redisClient.del(`share:${link.linkId}`);
        const result = await sharing.validateShareLink(link.linkId, link.accessToken);
        assert.equal(result.valid, false);
    });

    test('the download counter cannot outlive the link', async () => {
        const link = await makeLink({ expiresAt: new Date(Date.now() + 60_000) });
        await sharing.claimDownload(link.linkId);
        const ttl = await redisClient.ttl(`share:count:${link.linkId}`);
        assert.ok(ttl > 0 && ttl <= 60, `counter ttl was ${ttl}`);
    });
});

describe('revoking', () => {
    test('the owner can, and the link stops working', async () => {
        const link = await makeLink();
        assert.equal(await sharing.revokeShareLink(link.linkId, OWNER_ID), true);
        const result = await sharing.validateShareLink(link.linkId, link.accessToken);
        assert.equal(result.valid, false);
    });

    test('a stranger cannot', async () => {
        const link = await makeLink();
        await assert.rejects(
            () => sharing.revokeShareLink(link.linkId, STRANGER_ID),
            /Unauthorized to revoke this link/
        );
        // And the link still works, so the failed revoke did not half-apply.
        const result = await sharing.validateShareLink(link.linkId, link.accessToken);
        assert.equal(result.valid, true);
    });

    test('an admin can', async () => {
        const link = await makeLink();
        assert.equal(await sharing.revokeShareLink(link.linkId, ADMIN_ID), true);
    });

    test('revoking clears the counter too', async () => {
        const link = await makeLink({ maxDownloads: 5 });
        await sharing.claimDownload(link.linkId);
        await sharing.revokeShareLink(link.linkId, OWNER_ID);
        assert.equal(await redisClient.exists(`share:count:${link.linkId}`), 0);
    });
});

describe('listing a user\'s links', () => {
    test('returns the links they made', async () => {
        // The bug this replaces: the function returned [] unconditionally, so a
        // "my shared links" page would have looked identical to having none.
        const a = await makeLink({ description: 'first' });
        const b = await makeLink({ description: 'second' });
        const links = await sharing.getUserShareLinks(OWNER_ID);
        assert.equal(links.length, 2);
        assert.deepEqual(
            links.map(l => l.linkId).sort(),
            [a.linkId, b.linkId].sort()
        );
    });

    test('does not leak the access token or the password digest', async () => {
        await makeLink({ password: 'hunter2' });
        const [link] = await sharing.getUserShareLinks(OWNER_ID);
        assert.equal(link.accessToken, undefined);
        assert.equal(link.password, undefined);
        assert.equal(link.hasPassword, true);
    });

    test('does not show another user\'s links', async () => {
        await makeLink();
        assert.equal((await sharing.getUserShareLinks(STRANGER_ID)).length, 0);
    });

    test('a revoked link disappears from the list', async () => {
        const link = await makeLink();
        await sharing.revokeShareLink(link.linkId, OWNER_ID);
        assert.equal((await sharing.getUserShareLinks(OWNER_ID)).length, 0);
    });

    test('an expired link is pruned from the index rather than accumulating', async () => {
        const link = await makeLink();
        await redisClient.del(`share:${link.linkId}`);
        assert.equal((await sharing.getUserShareLinks(OWNER_ID)).length, 0);
        // And the dead id is gone from the set, not merely filtered on read.
        assert.equal(await redisClient.sCard(`user:shares:${OWNER_ID}`), 0);
    });
});

describe('statistics', () => {
    test('the owner sees a live count', async () => {
        const link = await makeLink({ maxDownloads: 5 });
        await sharing.claimDownload(link.linkId);
        await sharing.claimDownload(link.linkId);
        const stats = await sharing.getShareLinkStats(link.linkId, OWNER_ID);
        assert.equal(stats.downloadCount, 2);
        assert.equal(stats.maxDownloads, 5);
    });

    test('a stranger does not', async () => {
        const link = await makeLink();
        await assert.rejects(
            () => sharing.getShareLinkStats(link.linkId, STRANGER_ID),
            /Unauthorized to view link statistics/
        );
    });
});
