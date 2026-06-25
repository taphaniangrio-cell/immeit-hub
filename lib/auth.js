const crypto = require('crypto');
const { log } = require('./logger');

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const revokedTokens = new Set();

function getSecret() {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || process.env.PASSWORD_HASH;
  if (!secret) {
    throw new Error('SESSION_SECRET ou ADMIN_PASSWORD non configuré');
  }
  return secret;
}

function createSession() {
  const random = crypto.randomBytes(32).toString('hex');
  const timestamp = Date.now().toString(36);
  const payload = `${timestamp}.${random}`;
  const hmac = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

function destroySession(token) {
  if (token) {
    revokedTokens.add(token);
    setTimeout(() => revokedTokens.delete(token), SESSION_TTL);
  }
}

function isValidSession(token) {
  if (!token || typeof token !== 'string') return false;
  if (revokedTokens.has(token)) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [timestampB36, random, signature] = parts;
  const payload = `${timestampB36}.${random}`;
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  if (signature !== expected) return false;
  const createdAt = parseInt(timestampB36, 36);
  if (isNaN(createdAt)) return false;
  return Date.now() - createdAt < SESSION_TTL;
}

function requireAuth(handler) {
  return async (req, res) => {
    const cookie = req.headers?.cookie || '';
    const token = cookie
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('session='))
      ?.split('=')[1]
      ?.trim();

    if (!token || !isValidSession(token)) {
      log('warn', 'auth_failed', { path: req.url, method: req.method });
      return res.status(401).json({ error: 'Non authentifié. Veuillez vous connecter.' });
    }

    return handler(req, res);
  };
}

module.exports = { requireAuth, createSession, destroySession };
