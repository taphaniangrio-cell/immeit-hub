const fs = require('fs');
const path = require('path');

function initEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 1) return;
    const key = trimmed.slice(0, eqIndex).trim();
    const val = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  });
}

initEnv();

const { getGraphToken } = require('../lib/graph-auth');

const SITE_HOST = process.env.SHAREPOINT_SITE_HOST || 'shiftup.sharepoint.com';
const SITE_PATH = process.env.SHAREPOINT_SITE_PATH || 'sites/P2M2022';
const FILE_ID = process.env.SHAREPOINT_FILE_ID || '55686017-3ff9-43f7-ab28-5b910871a4b0';
const SHEET_NAME = process.env.SHAREPOINT_SHEET_NAME || 'Suivi Demandes 2026';

const FILLER_CHARS = new Set(['-', '.', '_', '|', '/', '\\', '*', '~', '#', 'N/A', 'n/a', 'na', 'N/D', 'n/d']);

function isRealValue(v) {
  if (!v || typeof v !== 'string') return false;
  const t = v.trim();
  if (t.length === 0) return false;
  if (FILLER_CHARS.has(t)) return false;
  return true;
}

async function fetchGraph(url, token) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Graph API [${response.status}]: ${errorBody}`);
  }
  return response.json();
}

async function main() {
  const token = await getGraphToken({});
  if (!token) {
    console.error('  ❌ Erreur : Impossible d\'obtenir un jeton d\'accès MSAL valide.');
    process.exit(1);
  }

  console.log('  Étape 1 : Résolution de l\'ID de site SharePoint...');
  const siteData = await fetchGraph(`https://graph.microsoft.com/v1.0/sites/${SITE_HOST}:/${SITE_PATH}`, token);
  const siteId = siteData.id;
  console.log(`    ID Site : ${siteId}`);

  console.log('  Étape 2 : Récupération des informations du lecteur...');
  const fileData = await fetchGraph(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${FILE_ID}?$select=id,parentReference`, token);
  const driveId = fileData.parentReference.driveId;
  const itemId = fileData.id;
  console.log(`    Drive ID : ${driveId}`);

  console.log(`  Étape 3 : Lecture de la feuille "${SHEET_NAME}"...`);
  const encodedSheet = encodeURIComponent(SHEET_NAME);
  const sheetData = await fetchGraph(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/workbook/worksheets('${encodedSheet}')/usedRange`,
    token
  );

  const rows = sheetData.values || [];
  const headers = rows[0];
  console.log(`\n  Statistiques globales :`);
  console.log(`    Total lignes brutes (avec en-tête) : ${rows.length}`);
  console.log(`    Lignes de données réelles : ${rows.length - 1}`);
  console.log(`    Nombre de colonnes : ${headers.length}`);

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
  console.log(`  Colonnes clés : ${JSON.stringify(uniqueKeyCols)}`);

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

  console.log(`\n  Résultats :`);
  console.log(`    Lignes conservées : ${kept.length}`);
  console.log(`    Lignes ignorées : ${removed.length}`);

  if (removed.length > 0) {
    console.log('\n  Échantillon lignes ignorées :');
    removed.slice(0, 5).forEach(r => {
      const filled = Object.keys(r).filter(k => k !== '_row' && isRealValue(r[k]));
      console.log(`    Ligne ${r._row}: champs remplis = [${filled.join(', ')}]`);
    });
    if (removed.length > 5) console.log(`    ... et ${removed.length - 5} autre(s).`);
  }

  const edgeRows = kept.filter(row => {
    let count = 0;
    for (const k of uniqueKeyCols) { if (isRealValue(row[k])) count++; }
    return count === 1;
  });
  console.log(`\n  Lignes à la limite du filtre : ${edgeRows.length}`);
  edgeRows.slice(0, 5).forEach(r => {
    const filled = uniqueKeyCols.filter(k => isRealValue(r[k]));
    console.log(`    Ligne ${r._row}: [${filled.join(', ')}] = "${filled.map(k => r[k]).join(', ')}"`);
  });

  process.exit(0);
}

main().catch(e => { console.error('  ❌', e.message); process.exit(1); });
