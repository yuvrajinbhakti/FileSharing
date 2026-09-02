import { createClient } from 'redis';
import { logInfo, logError, auditLog } from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

// Redis client configuration
const getRedisConfig = () => {
    // If REDIS_URL is provided (cloud deployment), use it
    if (process.env.REDIS_URL) {
        const config = {
            url: process.env.REDIS_URL
        };
        
        // If URL contains upstash.io, enable TLS
        if (process.env.REDIS_URL.includes('upstash.io')) {
            config.socket = {
                tls: true,
                rejectUnauthorized: false
            };
        }
        
        return config;
    }
    
    // Otherwise use individual config (local development)
    return {
        socket: {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
        },
        password: process.env.REDIS_PASSWORD || 'redispassword123',
    };
};

// Create Redis client
const redisClient = createClient({
    ...getRedisConfig(),
    retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
            logError('Redis connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
            logError('Redis retry time exhausted');
            return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
            logError('Redis max attempts reached');
            return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
    }
});

// Redis event handlers
redisClient.on('connect', () => {
    logInfo('Redis client connected');
    auditLog.databaseConnection('Redis connected');
});

redisClient.on('ready', () => {
    logInfo('Redis client ready');
});

redisClient.on('error', (err) => {
    logError('Redis client error', err);
});

redisClient.on('end', () => {
    logInfo('Redis client disconnected');
});

// Connect to Redis
const connectRedis = async () => {
    try {
        await redisClient.connect();
        logInfo('Connected to Redis successfully');
        return true;
    } catch (error) {
        logError('Failed to connect to Redis', error);
        return false;
    }
};

// Redis utility functions
export const redisUtils = {
    // Session management
    async setSession(sessionId, data, expirationSeconds = 604800) { // 7 days
        try {
            await redisClient.setEx(`session:${sessionId}`, expirationSeconds, JSON.stringify(data));
            return true;
        } catch (error) {
            logError('Error setting session', error);
            return false;
        }
    },

    async getSession(sessionId) {
        try {
            const data = await redisClient.get(`session:${sessionId}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logError('Error getting session', error);
            return null;
        }
    },

    async deleteSession(sessionId) {
        try {
            await redisClient.del(`session:${sessionId}`);
            return true;
        } catch (error) {
            logError('Error deleting session', error);
            return false;
        }
    },

    // Caching
    async setCache(key, data, expirationSeconds = 3600) { // 1 hour default
        try {
            await redisClient.setEx(`cache:${key}`, expirationSeconds, JSON.stringify(data));
            return true;
        } catch (error) {
            logError('Error setting cache', error);
            return false;
        }
    },

    async getCache(key) {
        try {
            const data = await redisClient.get(`cache:${key}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logError('Error getting cache', error);
            return null;
        }
    },

    async deleteCache(key) {
        try {
            await redisClient.del(`cache:${key}`);
            return true;
        } catch (error) {
            logError('Error deleting cache', error);
            return false;
        }
    },

    // Rate limiting
    async incrementRateLimit(key, windowSeconds = 900) { // 15 minutes
        try {
            const multi = redisClient.multi();
            multi.incr(`rate:${key}`);
            multi.expire(`rate:${key}`, windowSeconds);
            const results = await multi.exec();
            return results[0];
        } catch (error) {
            logError('Error incrementing rate limit', error);
            return 0;
        }
    },

    async getRateLimit(key) {
        try {
            const count = await redisClient.get(`rate:${key}`);
            return count ? parseInt(count) : 0;
        } catch (error) {
            logError('Error getting rate limit', error);
            return 0;
        }
    },

    // Temporary data storage
    async setTempData(key, data, expirationSeconds = 3600) {
        try {
            await redisClient.setEx(`temp:${key}`, expirationSeconds, JSON.stringify(data));
            return true;
        } catch (error) {
            logError('Error setting temporary data', error);
            return false;
        }
    },

    async getTempData(key) {
        try {
            const data = await redisClient.get(`temp:${key}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logError('Error getting temporary data', error);
            return null;
        }
    },

    async deleteTempData(key) {
        try {
            await redisClient.del(`temp:${key}`);
            return true;
        } catch (error) {
            logError('Error deleting temporary data', error);
            return false;
        }
    },

    // File sharing links
    //
    // `setEx` throws on a TTL of zero or less, which is reachable whenever a link
    // is written at or past its own expiry — a rewrite during the last second of
    // its life, or a caller passing an `expiresAt` already in the past. Clamping
    // to at least one second turns that crash into a link that expires
    // immediately, which is the outcome the caller was asking for anyway.
    async setShareLink(linkId, fileData, expirationSeconds = 86400) { // 24 hours
        try {
            const ttl = Math.max(1, Math.floor(expirationSeconds));
            await redisClient.setEx(`share:${linkId}`, ttl, JSON.stringify(fileData));
            return true;
        } catch (error) {
            logError('Error setting share link', error);
            return false;
        }
    },

    async getShareLink(linkId) {
        try {
            const data = await redisClient.get(`share:${linkId}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logError('Error getting share link', error);
            return null;
        }
    },

    async deleteShareLink(linkId) {
        try {
            // An array, not two arguments. node-redis v4's `del` takes a single
            // parameter that may be a key or a list of keys; called variadically
            // it deletes the first and silently ignores the rest, so the counter
            // outlived the link it belonged to and a reissued id would start
            // life already partly spent. It threw nothing and logged nothing —
            // a test noticed, reading the code did not.
            await redisClient.del([`share:${linkId}`, `share:count:${linkId}`]);
            return true;
        } catch (error) {
            logError('Error deleting share link', error);
            return false;
        }
    },

    /**
     * Claim one download against a link's limit, atomically.
     *
     * The obvious version — read the count, add one, write it back — loses races.
     * Two people clicking a link with one download left both read the same number,
     * both decide there is room, and both write the same increment, so a link
     * capped at N serves N+1. The window is small and entirely real: a share link
     * is a URL, and the whole point of a URL is that it can be opened twice at
     * once.
     *
     * `INCR` is atomic, so exactly one caller can receive any given number. The
     * count lives in its own key rather than inside the JSON blob because a blob
     * has to be read and rewritten to change, which is the race all over again.
     *
     * Returns the claimed position, or null when the limit is already spent. A
     * caller that claims a slot and then fails should call `releaseDownload`.
     */
    async claimDownload(linkId, maxDownloads, expirationSeconds) {
        try {
            const key = `share:count:${linkId}`;
            const count = await redisClient.incr(key);
            // First claim creates the key; give it the link's own lifetime so the
            // counter cannot outlive the link and cap a future one.
            if (count === 1) {
                await redisClient.expire(key, Math.max(1, Math.floor(expirationSeconds)));
            }
            if (count > maxDownloads) {
                await redisClient.decr(key);
                return null;
            }
            return count;
        } catch (error) {
            logError('Error claiming share link download', error);
            return null;
        }
    },

    async releaseDownload(linkId) {
        try {
            await redisClient.decr(`share:count:${linkId}`);
            return true;
        } catch (error) {
            logError('Error releasing share link download', error);
            return false;
        }
    },

    async getDownloadCount(linkId) {
        try {
            const raw = await redisClient.get(`share:count:${linkId}`);
            return raw ? parseInt(raw, 10) : 0;
        } catch (error) {
            logError('Error reading share link download count', error);
            return 0;
        }
    },

    /**
     * Index of the links a user has created.
     *
     * Without this there is no way to answer "what have I shared" — Redis can
     * fetch a link by id, but nothing maps a user to their ids, and scanning the
     * keyspace to find out is not something a request handler should do. The set
     * accumulates ids that may already have expired; `getUserShareLinkIds` is
     * where they get pruned, so the set cannot grow without bound.
     */
    async addUserShareLink(userId, linkId, expirationSeconds) {
        try {
            const key = `user:shares:${userId}`;
            await redisClient.sAdd(key, linkId);
            // Outlive the longest link in the set, so the index is never the
            // reason a live link becomes unlistable.
            const current = await redisClient.ttl(key);
            const wanted = Math.max(1, Math.floor(expirationSeconds));
            if (current < wanted) await redisClient.expire(key, wanted);
            return true;
        } catch (error) {
            logError('Error indexing user share link', error);
            return false;
        }
    },

    async getUserShareLinkIds(userId) {
        try {
            const key = `user:shares:${userId}`;
            const ids = await redisClient.sMembers(key);
            if (ids.length === 0) return [];

            // Drop ids whose link has expired out from under the index.
            const alive = [];
            const dead = [];
            for (const id of ids) {
                const exists = await redisClient.exists(`share:${id}`);
                (exists ? alive : dead).push(id);
            }
            if (dead.length > 0) await redisClient.sRem(key, dead);
            return alive;
        } catch (error) {
            logError('Error listing user share links', error);
            return [];
        }
    },

    async removeUserShareLink(userId, linkId) {
        try {
            await redisClient.sRem(`user:shares:${userId}`, linkId);
            return true;
        } catch (error) {
            logError('Error removing user share link from index', error);
            return false;
        }
    },

    // User activity tracking
    async trackUserActivity(userId, activity) {
        try {
            const key = `activity:${userId}`;
            await redisClient.lPush(key, JSON.stringify({
                activity,
                timestamp: new Date().toISOString()
            }));
            await redisClient.lTrim(key, 0, 99); // Keep last 100 activities
            await redisClient.expire(key, 86400); // 24 hours
            return true;
        } catch (error) {
            logError('Error tracking user activity', error);
            return false;
        }
    },

    async getUserActivity(userId) {
        try {
            const activities = await redisClient.lRange(`activity:${userId}`, 0, -1);
            return activities.map(activity => JSON.parse(activity));
        } catch (error) {
            logError('Error getting user activity', error);
            return [];
        }
    },

    // System health and metrics
    async updateSystemMetrics(metrics) {
        try {
            // Convert metrics object to individual field-value pairs
            const fields = [];
            for (const [key, value] of Object.entries(metrics)) {
                fields.push(key, String(value));
            }
            
            if (fields.length > 0) {
                await redisClient.hSet('system:metrics', fields);
                await redisClient.expire('system:metrics', 300); // 5 minutes
            }
            return true;
        } catch (error) {
            logError('Error updating system metrics', error);
            return false;
        }
    },

    async getSystemMetrics() {
        try {
            const metrics = await redisClient.hGetAll('system:metrics');
            return metrics;
        } catch (error) {
            logError('Error getting system metrics', error);
            return {};
        }
    }
};

// Graceful shutdown
export const disconnectRedis = async () => {
    try {
        await redisClient.quit();
        logInfo('Redis client disconnected gracefully');
    } catch (error) {
        logError('Error disconnecting Redis client', error);
    }
};

export { redisClient, connectRedis };
export default redisClient; 