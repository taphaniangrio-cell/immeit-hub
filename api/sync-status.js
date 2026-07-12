const cors = require('../lib/cors');
const { requireAuth } = require('../lib/auth');
const { log, getSyncStatus } = require('../lib/logger');
const syncLock = require('../lib/sync-lock');
const syncEngine = require('../lib/sync-engine');

module.exports = requireAuth(async (req, res) => {
  if (cors(res, req)) return;

  if (req.method === 'POST') {
    return handleForceSync(req, res);
  }

  const syncStatus = getSyncStatus();
  const lockInfo = syncLock.getLockInfo();

  let dbCache = null;
  try {
    dbCache = await syncEngine.loadDbCache();
  } catch {}

  let fileCache = null;
  try {
    fileCache = syncEngine.loadCache();
  } catch {}

  let dbState = { isOpen: false, consecutiveFails: 0 };
  try {
    const db = require('../lib/db');
    await db.query('SELECT 1');
    dbState = { isOpen: false, consecutiveFails: 0 };
  } catch (err) {
    dbState = { isOpen: true, consecutiveFails: 1, lastError: err.message };
  }

  const spConfigured = !!(process.env.SHAREPOINT_TENANT_ID && process.env.SHAREPOINT_CLIENT_ID && process.env.SHAREPOINT_CLIENT_SECRET);

  return res.status(200).json({
    lock: {
      held: syncLock.isLocked(),
      pid: lockInfo?.pid || null,
      lockedAt: lockInfo?.lockedAt || null,
    },
    status: {
      lastSuccess: syncStatus.lastSuccess || null,
      lastError: syncStatus.lastError || null,
      lastErrorReason: syncStatus.lastErrorReason || null,
      lastSource: syncStatus.lastSource || null,
      lastDuration: syncStatus.lastDuration || null,
      lastItemCount: syncStatus.lastItemCount || null,
      lastDataFreshness: syncStatus.lastDataFreshness || 'unknown',
      consecutiveErrors: syncStatus.consecutiveErrors || 0,
      totalSyncs: syncStatus.totalSyncs || 0,
    },
    caches: {
      db: dbCache ? { items: dbCache.items?.length || 0, syncedAt: dbCache.syncedAt, source: dbCache.source } : null,
      file: fileCache ? { items: fileCache.items?.length || 0, syncedAt: fileCache.syncedAt, source: fileCache.source } : null,
    },
    db: {
      circuitBreakerOpen: dbState.isOpen,
      consecutiveFails: dbState.consecutiveFails || 0,
    },
    config: {
      sharePointClientCredentials: spConfigured,
      databaseUrl: !!process.env.DATABASE_URL,
    },
  });
});

async function handleForceSync(req, res) {
  if (syncLock.isLocked()) {
    return res.status(429).json({ error: 'Synchronisation d\u00e9j\u00e0 en cours' });
  }

  try {
    const result = await syncEngine.executeSync({ source: 'manual' });
    return res.status(200).json(result);
  } catch (err) {
    log('error', 'sync_status_force_error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}
