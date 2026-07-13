// lib/github-cache.js
//
// Cache distant de secours (dernier filet, après Postgres) : lit/écrit le fichier de cache
// sur la branche `cache` du dépôt GitHub via l'API REST officielle, avec GITHUB_TOKEN.
//
// AVANT : publishCache() faisait un `git add/commit/push` LOCAL sur un chemin Windows codé
// en dur (C:\Users\...\articles-immeit). Ça ne fonctionnait que depuis ce poste précis, et
// silencieusement nulle part ailleurs (Vercel, autre PC...) — un des points de fragilité de
// la synchronisation. Cette version utilise uniquement des appels HTTPS, donc fonctionne à
// l'identique depuis n'importe quel environnement (Vercel compris).

const https = require('https');
const { log } = require('./logger');

const OWNER = process.env.GITHUB_CACHE_OWNER || 'taphaniangrio-cell';
const REPO = process.env.GITHUB_CACHE_REPO || 'immeit-hub';
const CACHE_BRANCH = process.env.GITHUB_CACHE_BRANCH || 'cache';
const CACHE_PATH = 'cache/dash-cache.json';
const RAW_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${CACHE_BRANCH}/${CACHE_PATH}`;

function httpsGet(url) {
  return new Promise((resolve) => {
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

function githubApi(method, apiPath, token, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.github.com',
      path: apiPath,
      method,
      timeout: 15000,
      headers: {
        'User-Agent': 'immeit/1.0',
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          if (res.statusCode >= 400) {
            const err = new Error((parsed && parsed.message) || `HTTP ${res.statusCode}`);
            err.status = res.statusCode;
            reject(err);
          } else {
            resolve(parsed);
          }
        } catch (e) { reject(new Error('Parse failed: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function fetchCache() {
  try {
    const data = await httpsGet(RAW_URL + '?_=' + Date.now());
    if (data && data.items && data.items.length > 0) {
      log('info', 'github_cache_fetched', { items: data.items.length, syncedAt: data.syncedAt });
      return data;
    }
  } catch (e) { log('warn', 'github_cache_fetch_failed', { error: e && e.message }); }
  return null;
}

async function publishCache(data) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    log('warn', 'github_cache_publish_no_token');
    return;
  }
  try {
    const apiPath = `/repos/${OWNER}/${REPO}/contents/${CACHE_PATH}`;
    let sha;
    try {
      const info = await githubApi('GET', apiPath + '?ref=' + CACHE_BRANCH, token);
      sha = info && info.sha;
    } catch (e) {
      if (e.status !== 404) log('warn', 'github_cache_lookup_failed', { error: e.message });
    }

    const content = Buffer.from(JSON.stringify(data, null, 2), 'utf-8').toString('base64');
    const body = {
      message: 'cache: auto-sync ' + new Date().toISOString().slice(0, 16) + ' (' + (data.items?.length || 0) + ' items)',
      content,
      branch: CACHE_BRANCH,
    };
    if (sha) body.sha = sha;

    await githubApi('PUT', apiPath, token, body);
    log('info', 'github_cache_published', { branch: CACHE_BRANCH, items: data.items?.length || 0 });
  } catch (e) {
    log('warn', 'github_cache_publish_failed', { error: e && e.message });
  }
}

module.exports = { fetchCache, publishCache, githubApi };
