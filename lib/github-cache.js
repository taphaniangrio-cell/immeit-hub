const https = require('https');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { getCacheDir, safeWriteFile, safeReadFile } = require('./cache-dir');
const { log } = require('./logger');

const REPO_PATH = 'C:\\Users\\Moustapha\\mes-projets\\articles-immeit';
const CACHE_BRANCH = 'cache';
const CACHE_FILE = 'dash-cache.json';
const RAW_URL = 'https://raw.githubusercontent.com/taphaniangrio-cell/articles-immeit/' + CACHE_BRANCH + '/cache/' + CACHE_FILE;

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      timeout: 10000,
      headers: { 'User-Agent': 'immeit/1.0' },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch { resolve(null); }
        } else { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function fetchCache() {
  try {
    const data = await httpsGet(RAW_URL);
    if (data && data.items && data.items.length > 0) {
      log('info', 'github_cache_fetched', { items: data.items.length, syncedAt: data.syncedAt });
      return data;
    }
  } catch (e) { log('warn', 'github_cache_fetch_failed', { error: e && e.message }); }
  return null;
}

async function publishCache(data) {
  try {
    var cacheDir = path.join(REPO_PATH, 'cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, CACHE_FILE), JSON.stringify(data, null, 2), 'utf-8');

    var msg = 'cache: auto-sync ' + new Date().toISOString().slice(0, 16) + ' (' + data.items?.length + ' items)';
    execSync('git add cache/' + CACHE_FILE, { cwd: REPO_PATH, stdio: 'pipe' });
    execSync('git commit --allow-empty -m "' + msg + '"', { cwd: REPO_PATH, stdio: 'pipe' });
    execSync('git push origin HEAD:' + CACHE_BRANCH, { cwd: REPO_PATH, stdio: 'pipe' });
    log('info', 'github_cache_published', { branch: CACHE_BRANCH, items: data.items?.length || 0 });
  } catch (e) { log('warn', 'github_cache_publish_failed', { error: e && e.message }); }
}

module.exports = { fetchCache, publishCache };