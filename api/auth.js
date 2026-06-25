const bcrypt = require('bcryptjs');
const rateLimit = require('../lib/rateLimit');
const { createSession, destroySession } = require('../lib/auth');
const { log } = require('../lib/logger');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!rateLimit(ip, 'auth', { max: 10, windowMs: 60_000 })) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans 1 minute.' });
  }

  const { password, action } = req.body;

  if (action === 'logout') {
    const cookie = req.headers?.cookie || '';
    const token = cookie.split(';').map(c => c.trim()).find(c => c.startsWith('session='))?.split('=')[1]?.trim();
    if (token) destroySession(token);
    log('info', 'logout', { ip });
    res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
    return res.status(200).json({ success: true });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const passwordHash = process.env.PASSWORD_HASH;

  if (!adminPassword && !passwordHash) {
    return res.status(500).json({ error: 'Authentification non configurée' });
  }

  let ok = false;
  if (passwordHash) {
    ok = bcrypt.compareSync(String(password || ''), passwordHash);
  } else {
    ok = password === adminPassword;
  }

  if (!ok) {
    log('warn', 'login_failed', { ip });
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  const token = createSession();
  log('info', 'login_ok', { ip });

  const isDev = process.env.VERCEL_ENV !== 'production';
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${isDev ? '' : '; Secure'}`);

  return res.status(200).json({ success: true });
};
