const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  getGlobalLeaderboard,
  getGameLeaderboard,
  getUserRank,
  getTopPlayersReport,
} = require('../controllers/leaderboardController');

const router = express.Router();

// Reading leaderboards requires a valid login too, since this is a
// competitive system tied to registered accounts.
router.get('/global', requireAuth, getGlobalLeaderboard);
router.get('/game/:gameId', requireAuth, getGameLeaderboard);
router.get('/rank/:username', requireAuth, getUserRank);
router.get('/report', requireAuth, getTopPlayersReport);

module.exports = router;
