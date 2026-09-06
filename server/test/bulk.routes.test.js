/**
 * Bulk operations, over real HTTP.
 *
 * controller/bulk-controller.js was 248 lines that `routes/routes.js` never
 * imported, with a working UI in the client posting to /bulk/download and
 * /bulk/delete — paths that returned 404 every time somebody pressed the button.
 * Same shape as share links: both halves written, nothing joining them.
 *
 * Wiring it up meant reading the layer underneath, and three things were wrong
 * in ways nothing could have noticed while it was unreachable:
 *
 *   - the controller called `createBulkDownload(userId, fileIds)` against a
 *     util whose signature is `(fileIds, userId)`, so the query deciding which
 *     files you may download had both arguments backwards
 *   - utils/bulkOperations.js called `require('crypto')` twice inside a file the
 *     package declares as ESM, which throws ReferenceError — after the archive
 *     has already been built
 *   - the response returned `zipPath`, an absolute path on the server, and no
 *     URL the browser could actually fetch
 *
 * These tests mount the real router and drive it over a socket. Mongo and the
 * archiver are mocked; the question here is routing, authorisation and argument
 * wiring, not whether `archiver` can write a zip.
 *
 * Run: node --test --experimental-test-module-mocks test/bulk.routes.test.js
 */

import { test, before, after, beforeEach, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';

const REDIS_PORT = 6397;
process.env.REDIS_URL = `redis://127.0.0.1:${REDIS_PORT}`;
process.env.FRONTEND_URL = 'https://example.test';
process.env.JWT_SECRET = 'a'.repeat(48);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(48);
process.env.NODE_ENV = 'test';

const OWNER_ID = '507f1f77bcf86cd799439011';
const STRANGER_ID = '507f1f77bcf86cd799439012';
const FILE_A = '507f191e810c19729de860ea';
const FILE_B = '507f191e810c19729de860eb';

const USERS = {
  [OWNER_ID]: { _id: OWNER_ID, username: 'owner', email: 'owner@example.test', role: 'user', isActive: true, isLocked: () => false },
  [STRANGER_ID]: { _id: STRANGER_ID, username: 'stranger', email: 'stranger@example.test', role: 'user', isActive: true, isLocked: () => false },
};

/**
 * Records what the util was actually called with.
 *
 * The bug this file exists for is an argument swap, which is invisible to any
 * assertion about the response body — a wrong-but-well-formed query returns a
 * perfectly good 200 with an empty archive. So the double captures its own
 * arguments and the test asserts on those.
 */
let calls = [];

let redisProcess;
let server;
let baseUrl;
let redisClient;
let jwt;

const startRedis = (port) => {
  const proc = spawn('redis-server', ['--port', String(port), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  proc.on('error', (err) => {
    throw new Error(
      err.code === 'ENOENT'
        ? 'redis-server not found on PATH. `brew install redis` (macOS) or `apt-get install redis-server`.'
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
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Redis did not open port ${port}`);
};

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
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
};

before(async () => {
  redisProcess = startRedis(REDIS_PORT);
  await waitForPort(REDIS_PORT);

  const strictLogError = (message, error, meta) => {
    if (typeof message !== 'string') throw new TypeError(`logError expects a string, got ${typeof message}`);
    if (error !== undefined && error !== null && typeof error !== 'object') {
      throw new TypeError(`logError expects an Error or object, got ${typeof error}`);
    }
    if (meta !== undefined && typeof meta !== 'object') throw new TypeError('logError meta must be an object');
  };
  const strictLogInfo = (message, meta) => {
    if (typeof message !== 'string') throw new TypeError(`logInfo expects a string, got ${typeof message}`);
    if (meta !== undefined && typeof meta !== 'object') throw new TypeError('logInfo meta must be an object');
  };

  mock.module('../utils/logger.js', {
    namedExports: {
      logInfo: strictLogInfo,
      logError: strictLogError,
      auditLog: new Proxy({}, { get: () => () => {} }),
    },
  });

  mock.module('../models/file.js', { defaultExport: { findById: async () => null, find: async () => [] } });
  mock.module('../models/user.js', { defaultExport: { findById: async (id) => USERS[String(id)] || null } });
  mock.module('../utils/email.js', { namedExports: { emailService: { sendFileShareNotification: async () => true } } });
  mock.module('../utils/upload.js', { defaultExport: { single: () => (req, res, next) => next() } });

  // The util, replaced with something that records its arguments. Archiving a
  // real zip is not what these tests are about, and mocking it keeps the
  // argument order — the thing that was broken — in plain view.
  mock.module('../utils/bulkOperations.js', {
    namedExports: {
      bulkOperations: {
        createBulkDownload: async (fileIds, userId, options) => {
          calls.push({ fn: 'createBulkDownload', fileIds, userId, options });
          return {
            downloadId: 'abc123',
            zipPath: '/srv/uploads/tmp/abc123.zip',
            fileName: options?.zipName || 'bulk.zip',
            fileCount: Array.isArray(fileIds) ? fileIds.length : 0,
            size: 2048,
          };
        },
        bulkDeleteFiles: async (fileIds, userId, options) => {
          calls.push({ fn: 'bulkDeleteFiles', fileIds, userId, options });
          return { successCount: Array.isArray(fileIds) ? fileIds.length : 0, failCount: 0, results: [] };
        },
        bulkUpdateMetadata: async (fileIds, userId, updates) => {
          calls.push({ fn: 'bulkUpdateMetadata', fileIds, userId, updates });
          return { successCount: 1, failCount: 0 };
        },
        getFileStatistics: async (userId) => {
          calls.push({ fn: 'getFileStatistics', userId });
          return { totalFiles: 0, totalSize: 0 };
        },
      },
    },
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
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server?.close(resolve));
  try { await redisClient?.quit(); } catch { /* already closed */ }
  redisProcess?.kill('SIGKILL');
});

beforeEach(async () => {
  await redisClient.flushAll();
  calls = [];
});

describe('the routes exist', () => {
  test('POST /api/bulk/download is mounted', async () => {
    // Before this change every one of these returned 404, including for a
    // signed-in owner, while the client had a button wired to it.
    const res = await call('POST', '/api/bulk/download', {
      token: tokenFor(OWNER_ID),
      body: { fileIds: [FILE_A, FILE_B] },
    });
    assert.equal(res.status, 200, res.text);
  });

  test('POST /api/bulk/delete is mounted', async () => {
    const res = await call('POST', '/api/bulk/delete', {
      token: tokenFor(OWNER_ID),
      body: { fileIds: [FILE_A] },
    });
    assert.equal(res.status, 200, res.text);
  });

  test('GET /api/bulk/statistics is mounted', async () => {
    const res = await call('GET', '/api/bulk/statistics', { token: tokenFor(OWNER_ID) });
    assert.equal(res.status, 200, res.text);
  });
});

describe('arguments reach the util in the right order', () => {
  test('createBulkDownload gets (fileIds, userId), not the reverse', async () => {
    // The bug: the controller passed (userId, fileIds) to a util declared as
    // (fileIds, userId). Mongo would then be asked for `_id: { $in: "<user
    // id>" }` and handed an array where an owner belongs — so the query that
    // decides which files you are allowed to download had both arguments
    // backwards. It still returns 200, which is why this asserts on the call
    // rather than on the response.
    await call('POST', '/api/bulk/download', {
      token: tokenFor(OWNER_ID),
      body: { fileIds: [FILE_A, FILE_B], zipName: 'mine.zip' },
    });

    const c = calls.find((x) => x.fn === 'createBulkDownload');
    assert.ok(c, 'util was not called');
    assert.deepEqual(c.fileIds, [FILE_A, FILE_B], 'first argument must be the file ids');
    assert.equal(c.userId, OWNER_ID, 'second argument must be the user id');
    assert.equal(c.options.zipName, 'mine.zip');
  });

  test('bulkDeleteFiles gets (fileIds, userId)', async () => {
    await call('POST', '/api/bulk/delete', { token: tokenFor(OWNER_ID), body: { fileIds: [FILE_A] } });
    const c = calls.find((x) => x.fn === 'bulkDeleteFiles');
    assert.deepEqual(c.fileIds, [FILE_A]);
    assert.equal(c.userId, OWNER_ID);
  });

  test('the caller cannot pass someone else\'s id as the owner', async () => {
    // The user id comes from the verified token, never from the body. A body
    // field claiming to be somebody else must be ignored entirely.
    await call('POST', '/api/bulk/download', {
      token: tokenFor(STRANGER_ID),
      body: { fileIds: [FILE_A], userId: OWNER_ID },
    });
    const c = calls.find((x) => x.fn === 'createBulkDownload');
    assert.equal(c.userId, STRANGER_ID, 'ownership must come from the token, not the body');
  });
});

describe('the response is usable by a browser', () => {
  test('returns a URL rather than a server filesystem path', async () => {
    const res = await call('POST', '/api/bulk/download', {
      token: tokenFor(OWNER_ID),
      body: { fileIds: [FILE_A] },
    });
    const data = res.json.data;
    assert.equal(data.downloadUrl, '/api/bulk/download/abc123');
    assert.equal(data.downloadId, 'abc123');
    assert.equal(data.fileCount, 1);
  });

  test('does not leak zipPath', async () => {
    // The util returns an absolute path on the server. It is no use to a
    // browser and not something to hand out.
    const res = await call('POST', '/api/bulk/download', {
      token: tokenFor(OWNER_ID),
      body: { fileIds: [FILE_A] },
    });
    assert.equal(res.json.data.zipPath, undefined);
    assert.equal(res.text.includes('/srv/uploads'), false, 'a server path appeared in the response');
  });
});

describe('authentication', () => {
  test('no token is rejected on every bulk route', async () => {
    for (const [method, path] of [
      ['POST', '/api/bulk/download'],
      ['POST', '/api/bulk/delete'],
      ['GET', '/api/bulk/statistics'],
      ['GET', '/api/bulk/download/abc123'],
      ['PATCH', '/api/bulk/metadata'],
    ]) {
      const res = await call(method, path, { body: method === 'GET' ? undefined : { fileIds: [FILE_A] } });
      assert.equal(res.status, 401, `${method} ${path} should require a token`);
    }
  });
});

describe('input validation', () => {
  test('an empty or missing fileIds list is a 400, not a 500', async () => {
    for (const body of [{}, { fileIds: [] }, { fileIds: 'not-an-array' }]) {
      const res = await call('POST', '/api/bulk/download', { token: tokenFor(OWNER_ID), body });
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}, got ${res.status}`);
      assert.equal(res.json.code, 'MISSING_FILE_IDS');
    }
  });

  test('force delete requires admin', async () => {
    const res = await call('POST', '/api/bulk/delete', {
      token: tokenFor(OWNER_ID),
      body: { fileIds: [FILE_A], force: true },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'INSUFFICIENT_PERMISSIONS');
  });
});

describe('fetching a prepared archive', () => {
  test('a download id belonging to somebody else is refused', async () => {
    const { redisUtils } = await import('../database/redis.js');
    await redisUtils.setTempData('someone-elses', { zipPath: '/tmp/x.zip', userId: OWNER_ID }, 60);

    const res = await call('GET', '/api/bulk/download/someone-elses', { token: tokenFor(STRANGER_ID) });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'UNAUTHORIZED_DOWNLOAD');
  });

  test('an unknown download id is a 404', async () => {
    const res = await call('GET', '/api/bulk/download/no-such-id', { token: tokenFor(OWNER_ID) });
    assert.equal(res.status, 404);
    assert.equal(res.json.code, 'DOWNLOAD_NOT_FOUND');
  });
});
