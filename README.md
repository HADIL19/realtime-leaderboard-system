# Real-Time Leaderboard System

Project page: https://roadmap.sh/projects/realtime-leaderboard-system

A backend for a real-time leaderboard service: user auth, score submission,
global + per-game rankings, periodic "top players" reports, and live updates
over Socket.io — all backed by **Redis Sorted Sets**.

## Features

- **User Authentication** — register/login with hashed passwords (bcrypt) and JWT sessions.
- **Score Submission** — authenticated users submit scores for any game/activity by ID.
- **Real-Time Updates** — every submission is broadcast instantly over Socket.io.
- **Rankings** — global leaderboard (cumulative total across all games) and per-game
  leaderboards (best score per game), both queryable by rank.
- **Top Players Report** — daily / weekly / monthly reports, globally or per game.
- **Score History** — each user's last 200 submissions, most recent first.

## How Redis Sorted Sets Are Used

| Key | Type | Meaning |
|---|---|---|
| `leaderboard:global` | ZSET | All-time total score per user (`ZINCRBY` on each submission) |
| `leaderboard:game:{gameId}` | ZSET | All-time **best** score per user for that game (`ZADD GT`) |
| `leaderboard:global:{period}:{bucket}` | ZSET | Same as global, scoped to a day/week/month |
| `leaderboard:game:{gameId}:{period}:{bucket}` | ZSET | Same as per-game, scoped to a day/week/month |
| `history:{username}` | LIST | Recent raw submissions (JSON), for auditing/history |
| `user:{username}` | HASH | Account record (id, username, password hash) |

Ranks are read with `ZREVRANK` (0-indexed, converted to 1-indexed for the API),
and leaderboard pages with `ZREVRANGE ... WITHSCORES`.

## Setup

```bash
npm install
cp .env.example .env     # edit JWT_SECRET etc. as needed
# Make sure Redis is running, e.g.:
redis-server --daemonize yes
npm start                # starts on http://localhost:3000
```

Requires Node 18+ and a reachable Redis instance (`REDIS_URL` in `.env`,
defaults to `redis://127.0.0.1:6379`).

## API Reference

All endpoints are prefixed with the server's base URL (default `http://localhost:3000`).
Authenticated routes require `Authorization: Bearer <token>`.

### Auth

**`POST /api/auth/register`**
```json
{ "username": "alice", "password": "secret123" }
```
→ `201` `{ message, user: { id, username, createdAt }, token }`

**`POST /api/auth/login`**
```json
{ "username": "alice", "password": "secret123" }
```
→ `200` `{ message, user: { id, username }, token }`

### Scores  *(auth required)*

**`POST /api/scores`** — submit a score for a game/activity
```json
{ "gameId": "chess", "score": 500 }
```
→ `201`
```json
{
  "message": "score submitted",
  "username": "alice",
  "gameId": "chess",
  "submittedScore": 500,
  "globalTotal": 1000,
  "gameRank": 1,
  "globalRank": 1,
  "timestamp": "2026-07-15T21:53:50.026Z"
}
```
The per-game leaderboard only updates if the new score beats the user's
previous best (`ZADD GT`); the global leaderboard always accumulates
(`ZINCRBY`), reflecting total output across all games.

**`GET /api/scores/history?limit=50`** — the caller's recent submissions.

### Leaderboards  *(auth required)*

- **`GET /api/leaderboard/global?limit=10&offset=0`** — top users by total score.
- **`GET /api/leaderboard/game/:gameId?limit=10&offset=0`** — top users for one game.
- **`GET /api/leaderboard/rank/:username?gameId=optional`** — a specific user's rank/score,
  globally and (optionally) for one game.
- **`GET /api/leaderboard/report?period=daily|weekly|monthly&date=YYYY-MM-DD&gameId=optional&limit=10`**
  — "top players" report for a period. Omit `date` for the current bucket; omit
  `gameId` for the global report.

### Real-time (Socket.io)

Connect a Socket.io client to the same server and origin. Two events are emitted
on every score submission:

- `scoreUpdate` — fired to all connected clients.
- `gameScoreUpdate` — fired only to clients that joined `game:{gameId}` via
  `socket.emit('subscribeGame', gameId)`.

```js
const socket = io('http://localhost:3000');
socket.emit('subscribeGame', 'chess');
socket.on('scoreUpdate', (payload) => console.log(payload));
socket.on('gameScoreUpdate', (payload) => console.log('chess update:', payload));
```

## Example Walkthrough

```bash
# Register two players
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}'

curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"bob","password":"secret123"}'

# Log in to get a token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

# Submit a score
curl -X POST http://localhost:3000/api/scores \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"gameId":"chess","score":500}'

# View the global leaderboard
curl http://localhost:3000/api/leaderboard/global -H "Authorization: Bearer $TOKEN"

# Today's top players
curl "http://localhost:3000/api/leaderboard/report?period=daily" -H "Authorization: Bearer $TOKEN"
```

## Project Structure

```
src/
  config/redis.js            Redis client (ioredis)
  middleware/auth.js          JWT verification middleware
  models/userStore.js         User accounts, stored as Redis hashes
  controllers/
    authController.js         register/login
    scoreController.js        score submission + history
    leaderboardController.js  leaderboards, ranks, periodic reports
  routes/                     Express route definitions
  utils/
    keys.js                  Centralized Redis key naming
    period.js                Daily/weekly/monthly bucket helpers
  server.js                  Express + Socket.io bootstrap
```

## Notes / Possible Extensions

- Swap the Redis-hash user store for a real database if you need richer user
  profiles; the auth layer only depends on `userStore.js`'s small interface.
- Add rate limiting on `/api/scores` to prevent spam submissions.
- Add pagination cursors instead of offset/limit for very large leaderboards.
- Periodic leaderboard keys grow forever; a scheduled job could `EXPIRE` old
  daily/weekly buckets (e.g. keep 90 days) to bound memory use.
