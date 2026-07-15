const redis = require('../config/redis');
const keys = require('../utils/keys');
const { bucketFor } = require('../utils/period');

const HISTORY_LIMIT = 200; // keep last N submissions per user

/**
 * Score submission semantics:
 *  - Per-game leaderboards (all-time + daily/weekly/monthly) keep the user's
 *    BEST score for that game, via ZADD ... GT (only updates if the new
 *    score is greater than the existing one).
 *  - The global leaderboard(s) accumulate a running TOTAL across every game
 *    the user has played, via ZINCRBY.
 *  - Every submission is also appended to the user's score history list.
 */
async function submitScore(req, res) {
  try {
    const { gameId, score } = req.body || {};
    const username = req.user.username;

    if (!gameId || typeof gameId !== 'string') {
      return res.status(400).json({ error: 'gameId (string) is required' });
    }
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore < 0) {
      return res.status(400).json({ error: 'score must be a non-negative number' });
    }

    const now = new Date();
    const daily = bucketFor('daily', now);
    const weekly = bucketFor('weekly', now);
    const monthly = bucketFor('monthly', now);

    const pipeline = redis.pipeline();

    // Per-game "best score" leaderboards (all-time + periodic)
    pipeline.zadd(keys.leaderboardGame(gameId), 'GT', 'CH', numericScore, username);
    pipeline.zadd(keys.leaderboardGamePeriod(gameId, 'daily', daily), 'GT', 'CH', numericScore, username);
    pipeline.zadd(keys.leaderboardGamePeriod(gameId, 'weekly', weekly), 'GT', 'CH', numericScore, username);
    pipeline.zadd(keys.leaderboardGamePeriod(gameId, 'monthly', monthly), 'GT', 'CH', numericScore, username);

    // Global "cumulative total" leaderboards (all-time + periodic)
    pipeline.zincrby(keys.leaderboardGlobal(), numericScore, username);
    pipeline.zincrby(keys.leaderboardGlobalPeriod('daily', daily), numericScore, username);
    pipeline.zincrby(keys.leaderboardGlobalPeriod('weekly', weekly), numericScore, username);
    pipeline.zincrby(keys.leaderboardGlobalPeriod('monthly', monthly), numericScore, username);

    // Score history (most recent first)
    const historyEntry = JSON.stringify({
      gameId,
      score: numericScore,
      timestamp: now.toISOString(),
    });
    pipeline.lpush(keys.history(username), historyEntry);
    pipeline.ltrim(keys.history(username), 0, HISTORY_LIMIT - 1);

    const results = await pipeline.exec();
    for (const [err] of results) {
      if (err) throw err;
    }

    const globalTotal = Number(results[4][1]); // zincrby global result

    // Fetch fresh ranks (0-indexed -> convert to 1-indexed for humans)
    const [gameRank, globalRank] = await Promise.all([
      redis.zrevrank(keys.leaderboardGame(gameId), username),
      redis.zrevrank(keys.leaderboardGlobal(), username),
    ]);

    const payload = {
      username,
      gameId,
      submittedScore: numericScore,
      globalTotal,
      gameRank: gameRank === null ? null : gameRank + 1,
      globalRank: globalRank === null ? null : globalRank + 1,
      timestamp: now.toISOString(),
    };

    // Real-time push to any connected clients
    const io = req.app.get('io');
    if (io) {
      io.emit('scoreUpdate', payload);
      io.to(`game:${gameId}`).emit('gameScoreUpdate', payload);
    }

    return res.status(201).json({ message: 'score submitted', ...payload });
  } catch (err) {
    console.error('submitScore error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
}

/**
 * Returns the last N score submissions for the authenticated user.
 */
async function getMyHistory(req, res) {
  try {
    const username = req.user.username;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, HISTORY_LIMIT);

    const raw = await redis.lrange(keys.history(username), 0, limit - 1);
    const history = raw.map((entry) => JSON.parse(entry));

    return res.json({ username, count: history.length, history });
  } catch (err) {
    console.error('getMyHistory error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
}

module.exports = { submitScore, getMyHistory };
