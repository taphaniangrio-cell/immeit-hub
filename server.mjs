import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const START_PORT = parseInt(process.env.PORT, 10) || 3000;
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

const LOG_DIR = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'IMMEIT')
  : path.join(__dirname, '.immeit-logs');

loadEnv();

const SERVER_START = Date.now();
const health = { uptime: 0, pid: process.pid, port: null };

function writeHealthFile(status) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOG_DIR, 'server.port'), String(health.port || START_PORT));
    fs.writeFileSync(path.join(LOG_DIR, 'server.pid'), String(process.pid));
  } catch {}
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

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  if (ext === '.html' || ext === '.css' || ext === '.js') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(__dirname, 'public', 'index.html'), (err2, data2) => {
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
    await new Promise((resolve, reject) => {
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > 1e6) {
          reject(new Error('Payload too large'));
          req.destroy();
        }
        body += chunk;
      });
      req.on('end', resolve);
      req.on('error', reject);
    });
    try { req.body = JSON.parse(body); } catch { req.body = {}; }
  }

  const handler = _require(handlerFile);

  try {
    await handler(req, {
      status(code) { this.statusCode = code; return this; },
      json(data) {
        res.writeHead(this.statusCode || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      },
      setHeader: (k, v) => res.setHeader(k, v),
    });
  } catch (err) {
    console.error(`[API ERROR] ${req.method} ${pathname}:`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

const server = http.createServer();

server.setTimeout(120_000);

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

  if (pathname.startsWith('/api/')) {
    await handleApi(req, res, pathname, url);
    return;
  }

  const filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  serveStatic(res, filePath);
});

function tryListen(port, maxAttempts = 10) {
  server.listen(port, () => {
    health.port = port;
    writeHealthFile('running');
    const url = `http://localhost:${port}`;
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║     IMMEIT — Générateur d\'articles   ║');
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

    // Auto-sync SharePoint data after server start (with timeout to prevent hanging)
    setTimeout(async () => {
      try {
        const autoSync = _require('./lib/auto-sync');
        console.log('  ⟳ Synchronisation SharePoint...');
        const result = await Promise.race([
          autoSync.sync(),
          new Promise(r => setTimeout(() => r(null), 15000)),
        ]);
        if (result) {
          console.log(`  ✓ ${result.items.length} demandes synchronisées depuis SharePoint`);
        } else {
          const cached = autoSync.loadCache();
          if (cached) {
            console.log(`  ✓ ${cached.items.length} demandes chargées du cache`);
          } else {
            console.log('  ℹ Aucune donnée SharePoint — utilise "📋 Coller Excel" dans le dashboard');
          }
        }
        autoSync.startPeriodicSync();
      } catch (err) {
        console.log(`  ℹ Sync SharePoint: ${err.message}`);
      }
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

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Erreur non rattrapée:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('[FATAL] Rejet non géré:', err.message);
});

tryListen(START_PORT);
