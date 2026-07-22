const { CONSTANTS } = require('./constants');

const CLEANUP_INTERVAL = CONSTANTS.RATE_LIMIT_CLEANUP_INTERVAL;
let lastCleanup = Date.now();

let store;
try {
  store = new Map();
} catch {
  store = new Map();
}

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [k, v] of store) {
    if (now - v.start > v.windowMs) store.delete(k);
  }
}

async function checkDbRateLimit(key, route, { max, windowMs }) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = require('./db');
    const k = `${route}:${key}`;
    const result = await db.query(
      `INSERT INTO rate_limits (rate_key, request_count, window_start)
       VALUES ($1, 1, NOW())
       ON CONFLICT (rate_key) DO UPDATE SET
         request_count = CASE
           WHEN EXTRACT(EPOCH FROM (NOW() - rate_limits.window_start)) * 1000 > $2 THEN 1
           ELSE rate_limits.request_count + 1
         END,
         window_start = CASE
           WHEN EXTRACT(EPOCH FROM (NOW() - rate_limits.window_start)) * 1000 > $2 THEN NOW()
           ELSE rate_limits.window_start
         END
       RETURNING request_count`,
      [k, windowMs]
    );
    const count = result.rows?.[0]?.request_count || 0;
    return count <= max;
  } catch {
    return null;
  }
}

module.exports = async function rateLimit(key, route, { max, windowMs }) {
  cleanup();
  const k = `${route}:${key}`;
  const now = Date.now();
  const entry = store.get(k);
  if (!entry || now - entry.start > windowMs) {
    store.set(k, { count: 1, start: now, windowMs });
    if (1 > max) return false;
  } else {
    entry.count++;
    if (entry.count > max) return false;
  }

  const dbResult = await checkDbRateLimit(key, route, { max, windowMs });
  if (dbResult !== null) return dbResult;

  return true;
};
