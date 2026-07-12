const fs = require('fs');
const path = require('path');
const { getCacheDir } = require('./cache-dir');
const { log } = require('./logger');

const LOCK_FILE = path.join(getCacheDir(), 'sync.lock');
const LOCK_TIMEOUT = 120_000;
const LOCK_STALE_THRESHOLD = 90_000;

let inMemoryLock = false;

function getLockInfo() {
  try {
    if (!fs.existsSync(LOCK_FILE)) return null;
    const raw = fs.readFileSync(LOCK_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch { return null; }
}

function isLockStale(lockInfo) {
  if (!lockInfo || !lockInfo.lockedAt) return true;
  return Date.now() - lockInfo.lockedAt > LOCK_STALE_THRESHOLD;
}

function acquire() {
  if (inMemoryLock) {
    const info = getLockInfo();
    if (info && isLockStale(info)) {
      log('warn', 'sync_lock_stale_detected', { pid: info.pid, age: Date.now() - info.lockedAt });
      release();
    } else {
      return false;
    }
  }

  const info = getLockInfo();
  if (info && !isLockStale(info)) {
    log('info', 'sync_lock_blocked', { pid: info.pid, lockedAt: info.lockedAt });
    return false;
  }

  try {
    const lockData = JSON.stringify({
      pid: process.pid,
      lockedAt: Date.now(),
      hostname: require('os').hostname(),
    });
    fs.writeFileSync(LOCK_FILE, lockData, { flag: 'wx' });
    inMemoryLock = true;
    log('info', 'sync_lock_acquired');
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      const existing = getLockInfo();
      if (existing && isLockStale(existing)) {
        try {
          fs.unlinkSync(LOCK_FILE);
          fs.writeFileSync(LOCK_FILE, JSON.stringify({
            pid: process.pid,
            lockedAt: Date.now(),
            hostname: require('os').hostname(),
          }), { flag: 'wx' });
          inMemoryLock = true;
          log('info', 'sync_lock_acquired_after_stale', { stalePid: existing.pid });
          return true;
        } catch { return false; }
      }
    }
    log('warn', 'sync_lock_acquire_failed', { error: err.message });
    return false;
  }
}

function release() {
  inMemoryLock = false;
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
    log('info', 'sync_lock_released');
  } catch (err) {
    log('warn', 'sync_lock_release_failed', { error: err.message });
  }
}

function isLocked() {
  if (inMemoryLock) return true;
  const info = getLockInfo();
  return info && !isLockStale(info);
}

function withLock(fn) {
  if (!acquire()) {
    return Promise.resolve({ acquired: false, reason: 'lock_held' });
  }
  return fn().finally(() => release());
}

module.exports = { acquire, release, isLocked, withLock, getLockInfo };
