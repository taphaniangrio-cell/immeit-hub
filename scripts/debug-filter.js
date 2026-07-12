const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
  const t = l.trim();
  if (!t || t.startsWith('#')) return;
  const i = t.indexOf('=');
  if (i < 1) return;
  if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
});

const { getGraphToken } = require('../lib/graph-auth');
const sharepoint = require('../lib/sharepoint');

const FILLER_CHARS = new Set(['-', '.', '_', '|', '/', '\\', '*', '~', '#', 'N/A', 'n/a', 'na', 'N/D', 'n/d']);
function isRealValue(v) {
  if (!v || typeof v !== 'string') return false;
  const t = v.trim();
  if (t.length === 0) return false;
  if (FILLER_CHARS.has(t)) return false;
  return true;
}

async function main() {
  const token = await getGraphToken({});
  if (!token) { console.error('No token'); process.exit(1); }

  const https = require('https');
  const SITE_HOST = 'shiftup.sharepoint.com';
  const SITE_PATH = 'sites/P2M2022';
  const FILE_ID = '55686017-3ff9-43f7-ab28-5b910871a4b0';
  const SHEET = 'Suivi Demandes 2026';

  function httpsRequest(url, opts) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers: opts.headers, timeout: 30000 }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('parse')); } });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
  }

  const siteData = await httpsRequest(`https://graph.microsoft.com/v1.0/sites/${SITE_HOST}:/${SITE_PATH}`, { headers: { Authorization: `Bearer ${token}` } });
  const siteId = siteData.id;

  const fileData = await httpsRequest(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${FILE_ID}?$select=id,parentReference`, { headers: { Authorization: `Bearer ${token}` } });
  const driveId = fileData.parentReference.driveId;
  const itemId = fileData.id;

  const sheetData = await httpsRequest(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/workbook/worksheets('${encodeURIComponent(SHEET)}')/usedRange`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const rows = sheetData.values || [];
  const headers = rows[0];
  console.log('Total raw rows (including header):', rows.length);
  console.log('Data rows:', rows.length - 1);
  console.log('Headers count:', headers.length);

  const keyPatterns = [
    /statut|status|état|etat.*avancement|etat.*demande|progress|étape/i,
    /type.*demande|type|catégorie|categorie|nature.*demande/i,
    /date.*(?:creation|création|demande|soumission)/i,
    /site|service|département|departement/i,
    /demandeur|requester|demande.*par|émetteur|emetteur/i,
    /priorite|priorité|urgence|niveau|criticité|criticite/i,
  ];
  const keyCols = headers.filter(h => keyPatterns.some(p => p.test(h))).map(h =>
    String(h).trim().toLowerCase().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '')
  );
  const uniqueKeyCols = [...new Set(keyCols)];
  console.log('Key columns:', uniqueKeyCols);

  const allItems = rows.slice(1).map((row, idx) => {
    const obj = { _row: idx + 2 };
    headers.forEach((h, i) => {
      const key = String(h).trim().toLowerCase().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '');
      obj[key] = row[i] !== undefined ? String(row[i]).trim() : '';
    });
    return obj;
  });

  const kept = [];
  const removed = [];
  allItems.forEach(row => {
    if (uniqueKeyCols.some(k => isRealValue(row[k]))) {
      kept.push(row);
    } else {
      removed.push(row);
    }
  });

  console.log('\nKept:', kept.length);
  console.log('Removed:', removed.length);

  if (removed.length > 0) {
    console.log('\nRemoved rows:');
    removed.forEach(r => {
      const filled = Object.keys(r).filter(k => k !== '_row' && isRealValue(r[k]));
      console.log(`  Row ${r._row}: filled keys = [${filled.join(', ')}]`);
    });
  }

  // Find the row closest to being filtered (has only 1 real key value)
  const edgeRows = kept.filter(row => {
    let count = 0;
    for (const k of uniqueKeyCols) { if (isRealValue(row[k])) count++; }
    return count === 1;
  });
  console.log('\nEdge rows (only 1 key column filled):', edgeRows.length);
  edgeRows.forEach(r => {
    const filled = uniqueKeyCols.filter(k => isRealValue(r[k]));
    console.log(`  Row ${r._row}: key filled = [${filled.join(', ')}] values = [${filled.map(k => r[k]).join(', ')}]`);
  });

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
