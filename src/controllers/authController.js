const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userStore = require('../models/userStore');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function signToken(user) {
  return jwt.sign({ sub: user.username, id: user.id }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

async function register(req, res) {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    if (!USERNAME_RE.test(username)) {
      return res
        .status(400)
        .json({ error: 'username must be 3-20 chars, letters/numbers/underscore only' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }

    if (await userStore.usernameExists(username)) {
      return res.status(409).json({ error: 'username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userStore.createUser({ username, passwordHash });

    const token = signToken(user);
    return res.status(201).json({
      message: 'user registered',
      user: { id: user.id, username: user.username, createdAt: user.createdAt },
      token,
    });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
}

async function login(req, res) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const user = await userStore.getUser(username);
    if (!user) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const token = signToken(user);
    return res.json({
      message: 'login successful',
      user: { id: user.id, username: user.username },
      token,
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
}

module.exports = { register, login, JWT_SECRET };
