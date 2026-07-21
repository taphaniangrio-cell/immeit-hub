const fs = require('fs');
const envContent = fs.readFileSync('.env', 'utf-8');
envContent.split(/\r?\n/).forEach(line => {
  const t = line.trim();
  if (!t || t.startsWith('#')) return;
  const i = t.indexOf('=');
  if (i < 0) return;
  const k = t.substring(0, i).trim();
  const v = t.substring(i + 1).trim();
  if (!process.env[k]) process.env[k] = v;
});

const handler = require('./api/articles');

function makeRes() {
  const r = {
    statusCode: 200,
    _body: '',
    _headers: {},
    status(code) { r.statusCode = code; return r; },
    json(data) { r._body = JSON.stringify(data); return r; },
    setHeader(k, v) { r._headers[k] = v; return r; },
    writeHead(code) { r.statusCode = code; return r; },
    end() { return r; },
  };
  return r;
}

async function main() {
  // First, login to get a real session
  const authHandler = require('./api/auth');
  
  // Login
  const loginRes = makeRes();
  await authHandler({
    method: 'POST',
    body: { password: '1234' },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    url: '/api/auth',
  }, loginRes);
  
  console.log('Login:', loginRes.statusCode);
  const cookies = loginRes._headers['Set-Cookie'] || [];
  if (Array.isArray(cookies)) {
    console.log('Cookies:', cookies.length);
  } else {
    console.log('Cookie header:', cookies?.substring(0, 100));
  }
  
  // Parse session and csrf tokens from Set-Cookie
  const cookieArr = Array.isArray(cookies) ? cookies : [cookies];
  let sessionToken = '';
  let csrfToken = '';
  for (const c of cookieArr) {
    const m1 = c.match(/^session=([^;]+)/);
    if (m1) sessionToken = m1[1];
    const m2 = c.match(/^csrf=([^;]+)/);
    if (m2) csrfToken = m2[1];
  }
  console.log('Session:', sessionToken ? 'YES' : 'NO');
  console.log('CSRF:', csrfToken ? csrfToken.substring(0, 10) + '...' : 'NO');

  // Now test PUT
  const putRes = makeRes();
  await handler({
    method: 'PUT',
    query: { id: '25' },
    headers: {
      cookie: 'session=' + sessionToken + '; csrf=' + csrfToken,
      'x-csrf-token': csrfToken,
    },
    body: {
      titre_interne: 'Test via handler',
      accroche_a: '',
      accroche_b: '',
      accroche_active: 'a',
      corps: 'Test body via handler',
      hashtags: '',
      source_news_source: '',
    },
    socket: { remoteAddress: '127.0.0.1' },
    url: '/api/articles?id=25',
  }, putRes);
  
  console.log('\nPUT:', putRes.statusCode, putRes._body?.substring(0, 300));
  
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
