const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('../lib/rateLimit');
const { createSession, destroySession } = require('../lib/auth');
const { log } = require('../lib/logger');
const { CONSTANTS } = require('../lib/constants');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!await rateLimit(ip, 'auth', CONSTANTS.RATE_LIMIT_AUTH)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans 1 minute.' });
  }

  const { password, action } = req.body;

  if (action === 'logout') {
    const cookie = req.headers?.cookie || '';
    const token = cookie.split(';').map(c => c.trim()).find(c => c.startsWith('session='))?.split('=')[1]?.trim();
    if (token) destroySession(token);
    log('info', 'logout', { ip });
    res.setHeader('Set-Cookie', ['session=; HttpOnly; Path=/; Max-Age=0', 'csrf=; Path=/; Max-Age=0']);
    return res.status(200).json({ success: true });
  }

  const passwordHash = process.env.PASSWORD_HASH;

  if (!passwordHash) {
    return res.status(500).json({ error: 'Authentification non configurée. Définissez PASSWORD_HASH.' });
  }

  let ok = false;
  try {
    ok = await bcrypt.compare(String(password || ''), passwordHash);
  } catch {
    ok = false;
  }

  if (!ok) {
    log('warn', 'login_failed', { ip });
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  const token = createSession();
  log('info', 'login_ok', { ip });

  const isDev = process.env.VERCEL_ENV !== 'production';
  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.setHeader('Set-Cookie', [
    `session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${isDev ? '' : '; Secure'}`,
    `csrf=${csrfToken}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${isDev ? '' : '; Secure'}`,
  ]);

  return res.status(200).json({ success: true, csrfToken });
};
