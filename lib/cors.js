const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://localhost:3001', 'https://immeit-hub.vercel.app', 'https://hub.immeit.com'];

// NOTE: Parameter order is (res, req) — unconventional but matches all callers.
module.exports = function cors(res, req) {
  const origin = req?.headers?.origin || '';
  const hasWildcard = ALLOWED_ORIGINS.includes('*');

  if (hasWildcard) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');

  if (req?.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
};
