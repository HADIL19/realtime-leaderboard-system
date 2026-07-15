const redis = require('../config/redis');
const keys = require('../utils/keys');
const { bucketFor, VALID_PERIODS } = require('../utils/period');

const MAX_LIMIT = 100;

/**
 * Converts a flat ioredis WITHSCORES reply ([member, score, member, score, ...])
 * into a ranked array of { rank, username, score }.
 */
function toRankedList(flat, offset = 0) {
  const list = [];
  for (let i = 0; i < flat.length; i += 2) {
    list.push({
      rank: offset + i / 2 + 1,
      username: flat[i],
      score: Number(flat[i + 1]),
    });
  }
  return list;
}

function parsePaging(req) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), MAX_LIMIT);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  return { limit, offset };
}

/** GET /api/leaderboard/global - top users by cumulative total score across all games */
async function getGlobalLeaderboard(req, res) {
  try {
    const { limit, offset } = parsePaging(req);
    const flat = await redis.zrevrange(
      keys.leaderboardGlobal(),
      offset,
      offset + limit - 1,
      'WITHSCORES'
    );
    return res.json({ scope: 'global', leaderboard: toRankedList(flat, offset) });
  } catch (err) {
    console.error('getGlobalLeaderboard error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
}

/** GET /api/leaderboard/game/:gameId - top users by best score for one game */
async function getGameLeaderboard(req, res) {
  try {
    const { gameId } = req.params;
    const { limit, offset } = parsePaging(req);
    const flat = await redis.zrevrange(
      keys.leaderboardGame(gameId),
      offset,
      offset + limit - 1,
      'WITHSCORES'
    );
    return res.json({ scope: 'game', gameId, leaderboard: toRankedList(flat, offset) });
  } catch (err) {
    console.error('getGameLeaderboard error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
}

/**
 * GET /api/leaderboard/rank/:username?gameId=optional
 * Returns a user's global rank/score, and their per-game rank/score if gameId given.
 */
async function getUserRank(req, res) {
  try {
    const { username } = req.params;
    const { gameId } = req.query;

    const [globalRank, globalScore] = await Promise.all([
      redis.zrevrank(keys.leaderboardGlobal(), username),
      redis.zscore(keys.leaderboardGlobal(), username),
    ]);

    const result = {
      username,
      global: {
        rank: globalRank === null ? null : globalRank + 1,
        score: globalScore === null ? 0 : Number(globalScore),
      },
    };

    if (gameId) {
      const [gameRank, gameScore] = await Promise.all([
        redis.zrevrank(keys.leaderboardGame(gameId), username),
        redis.zscore(keys.leaderboardGame(gameId), username),
      ]);
      result.game = {
        gameId,
        rank: gameRank === null ? null : gameRank + 1,
        score: gameScore === null ? 0 : Number(gameScore),
      };
    }

    if (globalRank === null && !gameId) {
      return res.status(404).json({ error: 'user has no leaderboard entries yet', ...result });
    }

    return res.json(result);
  } catch (err) {
    console.error('getUserRank error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
}

/**
 * GET /api/leaderboard/report?period=daily|weekly|monthly&date=YYYY-MM-DD&gameId=optional&limit=10
 * Generates a "top players" report for a specific period bucket.
 * If `date` is omitted, uses the current bucket (i.e. today/this week/this month).
 */
async function getTopPlayersReport(req, res) {
  try {
    const { period = 'daily', gameId } = req.query;
    const { limit } = parsePaging(req);

    if (!VALID_PERIODS.includes(period)) {
      return res
        .status(400)
        .json({ error: `period must be one of: ${VALID_PERIODS.join(', ')}` });
    }

    const referenceDate = req.query.date ? new Date(req.query.date) : new Date();
    if (Number.isNaN(referenceDate.getTime())) {
      return res.status(400).json({ error: 'invalid date, expected YYYY-MM-DD' });
    }

    const bucket = bucketFor(period, referenceDate);
    const key = gameId
      ? keys.leaderboardGamePeriod(gameId, period, bucket)
      : keys.leaderboardGlobalPeriod(period, bucket);

    const flat = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');

    return res.json({
      report: gameId ? 'top-players-by-game' : 'top-players-global',
      period,
      bucket,
      gameId: gameId || null,
      topPlayers: toRankedList(flat),
    });
  } catch (err) {
    console.error('getTopPlayersReport error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
}

module.exports = {
  getGlobalLeaderboard,
  getGameLeaderboard,
  getUserRank,
  getTopPlayersReport,
};
