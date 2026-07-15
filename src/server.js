require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const redis = require('./config/redis');
const authRoutes = require('./routes/authRoutes');
const scoreRoutes = require('./routes/scoreRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

// --- Socket.io: real-time leaderboard channel ---
io.on('connection', (socket) => {
  // Clients can join a specific game's room to get game-scoped updates
  socket.on('subscribeGame', (gameId) => {
    if (typeof gameId === 'string') socket.join(`game:${gameId}`);
  });
  socket.on('unsubscribeGame', (gameId) => {
    if (typeof gameId === 'string') socket.leave(`game:${gameId}`);
  });
});

// --- REST API ---
app.get('/health', async (req, res) => {
  try {
    const pong = await redis.ping();
    res.json({ status: 'ok', redis: pong });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// Central error handler (catches anything thrown synchronously in routes)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Leaderboard API listening on http://localhost:${PORT}`);
});

module.exports = { app, server, io };
