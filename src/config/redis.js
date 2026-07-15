const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Single shared connection used across the app.
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 200, 2000);
  },
});

redis.on('connect', () => {
  console.log(`[redis] connected -> ${REDIS_URL}`);
});

redis.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});

module.exports = redis;
