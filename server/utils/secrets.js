import dotenv from 'dotenv';

dotenv.config();

/**
 * The signing secrets, or a refusal to start.
 *
 * These used to be written as `process.env.JWT_SECRET || 'your-super-secret-
 * jwt-key-change-this-in-production'`, in three places. A default like that is
 * not a convenience, it is a published secret: the string sits in a public
 * repository, so any deployment missing the environment variable signs its
 * tokens with a key anybody can read. Forging a token for any account,
 * including an administrator, becomes an exercise in copy and paste.
 *
 * What made it dangerous is that nothing looked wrong. The application starts,
 * logins succeed, tokens verify — because they are being verified with the same
 * known key that signed them. There is no error state to notice.
 *
 * So there is no default. A missing or obviously placeholder secret stops the
 * process at startup, where it is loud and happens to the person deploying,
 * rather than silently at runtime where it happens to the users.
 */

const PLACEHOLDERS = [
  'your-super-secret-jwt-key-change-this-in-production',
  'your-super-secret-refresh-key-change-this-in-production',
  'change-this-in-production',
  'secret',
  'changeme',
];

function require_(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is not set. Generate one with:\n` +
      `    node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"\n` +
      `and set it in the environment. There is deliberately no default: a default ` +
      `secret in a public repository is a secret everybody already has.`
    );
  }

  if (PLACEHOLDERS.includes(value) || value.includes('change-this')) {
    throw new Error(
      `${name} is still set to a placeholder value. Replace it with a real secret.`
    );
  }

  // 32 bytes is the floor for HMAC-SHA256 to be worth the name. Short secrets
  // are brute-forceable offline once an attacker holds a single valid token.
  if (value.length < 32) {
    throw new Error(
      `${name} is ${value.length} characters. Use at least 32; 48 random bytes is better.`
    );
  }

  return value;
}

export const JWT_SECRET = require_('JWT_SECRET');
export const JWT_REFRESH_SECRET = require_('JWT_REFRESH_SECRET');
