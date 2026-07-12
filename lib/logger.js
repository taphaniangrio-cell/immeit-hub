const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] ?? 1;

function log(level, event, data = {}) {
  if (LOG_LEVELS[level] < CURRENT_LEVEL) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(JSON.stringify(entry));
}

let _syncStatus = {};

function updateSyncStatus(partial) {
  Object.assign(_syncStatus, partial);
}

function getSyncStatus() {
  return { ..._syncStatus };
}

module.exports = { log, updateSyncStatus, getSyncStatus };
