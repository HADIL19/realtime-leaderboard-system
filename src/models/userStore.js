const redis = require('../config/redis');
const keys = require('../utils/keys');

/**
 * Users are stored as Redis hashes. This keeps the whole system running on
 * a single datastore (Redis) as requested, with no extra SQL/NoSQL dependency.
 */

async function usernameExists(username) {
  return (await redis.sismember(keys.usernamesSet, username.toLowerCase())) === 1;
}

async function createUser({ username, passwordHash }) {
  const id = await redis.incr(keys.userIdSeq);
  const key = keys.userHash(username);
  const createdAt = new Date().toISOString();

  const multi = redis.multi();
  multi.hset(key, {
    id: String(id),
    username,
    passwordHash,
    createdAt,
  });
  multi.sadd(keys.usernamesSet, username.toLowerCase());
  await multi.exec();

  return { id, username, createdAt };
}

async function getUser(username) {
  const data = await redis.hgetall(keys.userHash(username));
  if (!data || !data.username) return null;
  return data;
}

module.exports = { usernameExists, createUser, getUser };
