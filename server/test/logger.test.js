/**
 * The logger, tested unmocked.
 *
 * This file exists because of a bug the rest of the suite could not see.
 *
 * `logError(message, error)` read `error.message` unconditionally, so the eleven
 * call sites that pass only a message threw a TypeError from inside the logger.
 * Seven of those are the refusal paths in `validateShareLink` — wrong password,
 * wrong email, expired, download limit spent. Each sits inside a `try`, so the
 * throw was caught by the function's own handler and returned as a flat
 * "Validation error", which the controller then rendered as a generic 404.
 *
 * The effect in production: a recipient who mistyped a share password was shown
 * "This link is not available", with no way back to the form. The link was fine.
 * The password prompt was fine. The logger destroyed the answer on its way out,
 * and logged nothing about having done so.
 *
 * The sharing suites did not catch it because they mock the logger, and the mock
 * was `() => {}` — which accepts any arguments at all. A double more forgiving
 * than the thing it replaces does not test that thing. So these tests import the
 * real module and call it the way the codebase actually calls it.
 *
 * Run: node --test test/logger.test.js
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

// Before importing: winston-mongodb reads this at module load and will try to
// dial out if it is set. There is nothing to connect to here and nothing to
// gain from waiting for the timeout.
delete process.env.MONGO_URL;

let logError;
let logInfo;
let logWarn;

before(async () => {
    const logger = await import('../utils/logger.js');
    logError = logger.logError;
    logInfo = logger.logInfo;
    logWarn = logger.logWarn;
});

describe('logError never throws at its own call sites', () => {
    test('a message on its own', () => {
        // Exactly the shape used by the seven refusal paths in fileSharing.js,
        // the three retry branches in redis.js, and email.js.
        assert.doesNotThrow(() => logError('Invalid password for share link'));
    });

    test('a message and an Error', () => {
        assert.doesNotThrow(() => logError('Something failed', new Error('boom')));
    });

    test('a message, an Error, and metadata', () => {
        assert.doesNotThrow(() => logError('Failed', new Error('boom'), { linkId: 'abc' }));
    });

    test('a plain object where an Error is expected', () => {
        // Several call sites pass response bodies or destructured fields rather
        // than Error instances.
        assert.doesNotThrow(() => logError('Odd shape', { message: 'nope', code: 'E_NOPE' }));
    });

    test('null or a string in the error position', () => {
        assert.doesNotThrow(() => logError('Null error', null));
        assert.doesNotThrow(() => logError('String error', 'just a string'));
    });
});

describe('the other helpers are equally unable to break a caller', () => {
    test('logInfo with and without metadata', () => {
        assert.doesNotThrow(() => logInfo('Something happened'));
        assert.doesNotThrow(() => logInfo('Something happened', { id: 1 }));
    });

    test('logWarn with and without metadata', () => {
        assert.doesNotThrow(() => logWarn('Careful'));
        assert.doesNotThrow(() => logWarn('Careful', { id: 1 }));
    });
});

describe('every single-argument call site in the tree is safe', () => {
    test('the exact messages the codebase passes alone', () => {
        // Kept as literals rather than grepped at runtime: a test that discovers
        // its own inputs passes vacuously the day the grep stops matching.
        const callSites = [
            'Redis connection refused',
            'Redis retry time exhausted',
            'Redis max attempts reached',
            'Share link not found or expired',
            'Share link is inactive',
            'Invalid access token for share link',
            'Share link has expired',
            'Share link download limit reached',
            'Invalid password for share link',
            'Email not allowed for share link',
            'Email service initialization failed - check SMTP credentials'
        ];
        for (const message of callSites) {
            assert.doesNotThrow(() => logError(message), `logError threw for: ${message}`);
        }
    });
});
