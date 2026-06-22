import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
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

// Charge les variables d'environnement depuis .env si présent
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch {}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  // Route API
  if (pathname.startsWith('/api/')) {
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

    // Parse body pour POST/PUT
    let body = '';
    if (req.method === 'POST' || req.method === 'PUT') {
      await new Promise(resolve => {
        req.on('data', chunk => body += chunk);
        req.on('end', resolve);
      });
      try { req.body = JSON.parse(body); } catch { req.body = {}; }
    }

    delete _require.cache[_require.resolve(handlerFile)];
    const handler = _require(handlerFile);
    const mockRes = {
      status(code) { this.statusCode = code; return this; },
      json(data) {
        res.writeHead(this.statusCode || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      },
      setHeader: (k, v) => res.setHeader(k, v),
    };

    try {
      await handler(req, {
        ...mockRes,
        status(code) { this.statusCode = code; return this; },
      });
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Fichiers statiques depuis /public
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback sur index.html (SPA-like)
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
}).listen(PORT, () => {
  console.log(`> Serveur de développement: http://localhost:${PORT}`);
  console.log(`> API: http://localhost:${PORT}/api/`);
});
