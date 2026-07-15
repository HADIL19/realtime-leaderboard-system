/**
 * Centralized Redis key naming so every part of the app agrees on the schema.
 *
 * Users:
 *   user:{username}            -> HASH  { id, username, passwordHash, createdAt }
 *   usernames                  -> SET   of all usernames (existence checks)
 *   userId:seq                 -> STRING counter for numeric ids
 *
 * Leaderboards (Redis Sorted Sets: member = username, score = points):
 *   leaderboard:global                     -> all-time global leaderboard
 *   leaderboard:game:{gameId}               -> all-time leaderboard for one game
 *   leaderboard:global:{period}:{bucket}    -> periodic global leaderboard (daily/weekly/monthly)
 *   leaderboard:game:{gameId}:{period}:{bucket} -> periodic per-game leaderboard
 *
 * Score history (Redis List, most recent first, JSON-encoded entries):
 *   history:{username}          -> LIST of { gameId, score, total, timestamp }
 */

const keys = {
  userHash: (username) => `user:${username.toLowerCase()}`,
  usernamesSet: 'usernames',
  userIdSeq: 'userId:seq',

  leaderboardGlobal: () => 'leaderboard:global',
  leaderboardGame: (gameId) => `leaderboard:game:${gameId}`,

  leaderboardGlobalPeriod: (period, bucket) => `leaderboard:global:${period}:${bucket}`,
  leaderboardGamePeriod: (gameId, period, bucket) => `leaderboard:game:${gameId}:${period}:${bucket}`,

  history: (username) => `history:${username.toLowerCase()}`,
};

module.exports = keys;
