import { createClient } from 'redis';
import { logInfo, logError, auditLog } from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

// Redis client configuration
const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || 'redispassword123',
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true
};

// Create Redis client
const redisClient = createClient({
    socket: {
        host: redisConfig.host,
        port: redisConfig.port,
    },
    password: redisConfig.password,
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
    async setShareLink(linkId, fileData, expirationSeconds = 86400) { // 24 hours
        try {
            await redisClient.setEx(`share:${linkId}`, expirationSeconds, JSON.stringify(fileData));
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
            await redisClient.hSet('system:metrics', metrics);
            await redisClient.expire('system:metrics', 300); // 5 minutes
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