import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, exec } from 'node:child_process';

const _require = createRequire(import.meta.url);
const { CONSTANTS } = _require('./lib/constants');
const eventBus = _require('./lib/events');
const { getServerDir, ensureDir, safeWriteFile } = _require('./lib/cache-dir');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const START_PORT = parseInt(process.env.PORT, 10) || 3000;
const ALLOWED_ORIGINS = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'https://immeit-hub.vercel.app', 'https://hub.immeit.com'];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const SSE_CLIENTS = new Set();

loadEnv();

const SERVER_START = Date.now();
const health = { pid: process.pid, port: null };

function openBrowser(url) {
  const platform = process.platform;
  if (platform === 'win32') {
    exec(`start "" "${url}"`, (err) => {
      if (err) {
        spawn('powershell', ['-NoProfile', '-Command', `Start-Process '${url}'`], { detached: true, stdio: 'ignore' }).unref();
      }
    });
  } else if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

function writeHealthFile(_status) {
  const dir = getServerDir();
  ensureDir(dir);
  safeWriteFile(path.join(dir, 'server.port'), String(health.port || START_PORT));
  safeWriteFile(path.join(dir, 'server.pid'), String(process.pid));
}

writeHealthFile('starting');

function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
      console.warn('[ENV] .env introuvable — copie .env.example en .env et configure tes clés');
      return;
    }
    const raw = fs.readFileSync(envPath, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
    console.log('[ENV] .env chargé');
  } catch (err) {
    console.error('[ENV] Erreur chargement .env:', err.message);
  }
}

function getFrontDir() {
  return path.join(__dirname, 'temp-react', 'dist');
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  if (ext === '.html' || ext === '.css' || ext === '.js') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      const frontDir = getFrontDir();
      fs.readFile(path.join(frontDir, 'index.html'), (err2, data2) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

async function handleApi(req, res, pathname, url) {
  // Health check endpoint
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      pid: process.pid,
      port: health.port,
      uptime: Math.floor((Date.now() - SERVER_START) / 1000),
      memory: process.memoryUsage(),
    }));
    return;
  }

  const apiPath = pathname.replace('/api/', '');
  const segments = apiPath.split('/');
  const handlerFile = path.join(__dirname, 'api', segments[0] + '.js');

  if (!fs.existsSync(handlerFile)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API route introuvable' }));
    return;
  }

  const query = Object.fromEntries(url.searchParams);
  req.query = query;

  let body = '';
  if (req.method === 'POST' || req.method === 'PUT') {
    let rejected = false;
    await new Promise((resolve, reject) => {
      let size = 0;
      const onData = chunk => {
        size += chunk.length;
        if (size > CONSTANTS.MAX_PAYLOAD_SIZE) {
          rejected = true;
          reject(new Error('Payload too large'));
          req.destroy();
          return;
        }
        body += chunk;
      };
      const onEnd = () => { if (!rejected) { rejected = true; resolve(); } };
      const onError = err => { rejected = true; reject(err); };
      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onError);
      req.on('close', () => { if (!rejected) { rejected = true; resolve(); } });
    });
    try { req.body = JSON.parse(body); } catch { req.body = {}; }
  }

  const handler = _require(handlerFile);

  // Handle CORS preflight (OPTIONS) before auth — no cookies needed
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin || '';
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    await handler(req, {
      status(code) { this.statusCode = code; return this; },
      json(data) {
        res.writeHead(this.statusCode || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      },
      setHeader: (k, v) => res.setHeader(k, v),
      writeHead: (code, headers) => res.writeHead(code, headers),
      end: (data) => res.end(data),
    });
  } catch (err) {
    console.error(`[API ERROR] ${req.method} ${pathname}:`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleSSE(req, res) {
  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ id })}\n\n`);

  SSE_CLIENTS.add(res);
  console.log(`[SSE] Client connecté (${SSE_CLIENTS.size})`);

  const keepalive = setInterval(() => {
    try { res.write(`:keepalive\n\n`) } catch { clearInterval(keepalive) }
  }, 30000);

  const onUpdate = (data) => {
    try {
      res.write(`event: dashboard-updated\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };
  eventBus.on('dashboard-updated', onUpdate);

  req.on('close', () => {
    clearInterval(keepalive);
    eventBus.off('dashboard-updated', onUpdate);
    SSE_CLIENTS.delete(res);
    console.log(`[SSE] Client déconnecté (${SSE_CLIENTS.size})`);
  });
}

function broadcastSSE(event, data) {
  for (const client of SSE_CLIENTS) {
    try { client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) } catch {}
  }
}

const server = http.createServer();

server.setTimeout(CONSTANTS.SERVER_REQUEST_TIMEOUT);

eventBus.on('dashboard-updated', (data) => {
  broadcastSSE('dashboard-updated', data);
});

server.on('request', async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid URL' }));
    return;
  }
  const { pathname } = url;

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (pathname === '/api/events') {
    return handleSSE(req, res);
  }

  if (pathname.startsWith('/api/')) {
    await handleApi(req, res, pathname, url);
    return;
  }

  const frontDir = getFrontDir();
  const safePath = pathname.replace(/\.\./g, '').replace(/[<>"|?*]/g, '');
  const filePath = path.join(frontDir, safePath === '/' || !safePath ? 'index.html' : safePath);
  if (!filePath.startsWith(frontDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  serveStatic(res, filePath);
});

function tryListen(port, maxAttempts = 10) {
  server.listen(port, () => {
    health.port = port;
    writeHealthFile('running');
    const url = `http://localhost:${port}`;
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║     IMMEIT Hub — Plateforme interne  ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  App   : ${url.padEnd(33)}║`);
    console.log(`  ║  API   : ${(url + '/api/').padEnd(33)}║`);
    console.log(`  ║  Port  : ${String(port).padEnd(38)}║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
    if (port !== START_PORT) {
      console.log(`  ⚠ Le port ${START_PORT} était déjà utilisé — fallback sur ${port}`);
      console.log('');
    }

    // Open browser automatically after a short delay (only on first start, not on watchdog restart)
    if (!browserOpened) {
      browserOpened = true;
      setTimeout(() => openBrowser(url), 800);
    }

    // Auto-sync SharePoint data after server start
    setTimeout(async () => {
      const autoSync = _require('./lib/auto-sync');
      const result = await autoSync.initialSync().catch(() => null);
      if (result) {
        const isLive = result.source === 'client_credentials' || result.source === 'device_code';
        console.log(`  ✓ ${result.count} demandes (${isLive ? 'SharePoint' : 'cache'})`);
      } else {
        console.log('  ℹ Aucune donnée disponible');
      }
      autoSync.startContinuousSync();
    }, 1000);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && maxAttempts > 0) {
      console.log(`  ⚠ Port ${port} occupé, essai du port ${port + 1}...`);
      server.close();
      tryListen(port + 1, maxAttempts - 1);
    } else {
      console.error('');
      console.error('  ✗ Impossible de démarrer le serveur:', err.message);
      console.error('');
      process.exit(1);
    }
  });
}

// ── Watchdog : auto-restart en cas de crash ──
let crashCount = 0;
const MAX_CRASHES = 10;
const RESTART_DELAY = 2000;
let browserOpened = false;

function restartServer() {
  crashCount++;
  if (crashCount > MAX_CRASHES) {
    console.error(`[WATCHDOG] Trop de crashs (${crashCount}) — abandon`);
    return;
  }
  console.log(`[WATCHDOG] Redémarrage dans ${RESTART_DELAY}ms (tentative ${crashCount}/${MAX_CRASHES})...`);
  setTimeout(() => {
    try {
      server.closeAllConnections?.();
      server.close();
    } catch {}
    tryListen(START_PORT);
  }, RESTART_DELAY);
}

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Erreur non rattrapée:', err.message, err.stack?.split('\n')[1] || '');
  restartServer();
});

process.on('unhandledRejection', (err) => {
  console.error('[FATAL] Rejet non géré:', err?.message || err);
  restartServer();
});

tryListen(START_PORT);
