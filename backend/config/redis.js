const redis = require('redis');

let redisClient;

const connectRedis = async () => {
  try {
    redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          console.error('Redis server connection refused');
          return new Error('Redis server connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          console.error('Redis retry time exhausted');
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          console.error('Redis connection attempts exceeded');
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis client ready');
    });

    redisClient.on('end', () => {
      console.log('Redis connection ended');
    });

    await redisClient.connect();
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    // Don't throw error - app should work without Redis
    console.log('⚠️  Continuing without Redis cache');
  }
};

// Cache helper functions
const cache = {
  // Set cache with expiration (default 1 hour)
  set: async (key, value, expireInSeconds = 3600) => {
    try {
      if (!redisClient || !redisClient.isOpen) return false;
      await redisClient.setEx(key, expireInSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  },

  // Get cache
  get: async (key) => {
    try {
      if (!redisClient || !redisClient.isOpen) return null;
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  },

  // Delete cache
  del: async (key) => {
    try {
      if (!redisClient || !redisClient.isOpen) return false;
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  },

  // Check if key exists
  exists: async (key) => {
    try {
      if (!redisClient || !redisClient.isOpen) return false;
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis EXISTS error:', error);
      return false;
    }
  },

  // Increment counter
  incr: async (key) => {
    try {
      if (!redisClient || !redisClient.isOpen) return 0;
      return await redisClient.incr(key);
    } catch (error) {
      console.error('Redis INCR error:', error);
      return 0;
    }
  },

  // Set with no expiration
  setPersistent: async (key, value) => {
    try {
      if (!redisClient || !redisClient.isOpen) return false;
      await redisClient.set(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Redis SET PERSISTENT error:', error);
      return false;
    }
  },

  // Publish to channel (for real-time updates)
  publish: async (channel, message) => {
    try {
      if (!redisClient || !redisClient.isOpen) return false;
      await redisClient.publish(channel, JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Redis PUBLISH error:', error);
      return false;
    }
  },

  // Subscribe to channel
  subscribe: async (channel, callback) => {
    try {
      if (!redisClient || !redisClient.isOpen) return false;
      const subscriber = redisClient.duplicate();
      await subscriber.connect();
      await subscriber.subscribe(channel, (message) => {
        try {
          callback(JSON.parse(message));
        } catch (error) {
          callback(message);
        }
      });
      return subscriber;
    } catch (error) {
      console.error('Redis SUBSCRIBE error:', error);
      return false;
    }
  }
};

// Cache keys constants
const CACHE_KEYS = {
  USER_PROFILE: (userId) => `user:profile:${userId}`,
  AUCTION_DETAILS: (auctionId) => `auction:details:${auctionId}`,
  AUCTION_FEED: (page) => `auction:feed:${page}`,
  USER_WATCHLIST: (userId) => `user:watchlist:${userId}`,
  AUCTION_BIDS: (auctionId) => `auction:bids:${auctionId}`,
  CATEGORIES: 'categories:all',
  TRENDING_AUCTIONS: 'auctions:trending',
  USER_NOTIFICATIONS: (userId) => `user:notifications:${userId}`
};

// Real-time channels
const CHANNELS = {
  AUCTION_UPDATES: 'auction:updates',
  BID_UPDATES: 'bid:updates',
  NOTIFICATIONS: 'notifications',
  AUCTION_ENDING: 'auction:ending'
};

module.exports = {
  connectRedis,
  redisClient,
  cache,
  CACHE_KEYS,
  CHANNELS
};