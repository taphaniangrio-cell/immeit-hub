const https = require('https');
const { log } = require('./logger');
const { CONSTANTS } = require('./constants');

const FILLER_CHARS = new Set(['-', '.', '_', '|', '/', '\\', '*', '~', '#', 'N/A', 'n/a', 'na', 'N/D', 'n/d']);

function isRealValue(v) {
  if (!v || typeof v !== 'string') return false;
  const t = v.trim();
  if (t.length === 0) return false;
  if (FILLER_CHARS.has(t)) return false;
  return true;
}

function filterDataRows(rows, headers) {
  const keyPatterns = [
    /statut|status|état|etat.*avancement|etat.*demande|progress|étape/i,
    /type.*demande|type|catégorie|categorie|nature.*demande/i,
    /date.*(?:creation|création|demande|soumission)/i,
    /site|service|département|departement/i,
    /demandeur|requester|demande.*par|émetteur|emetteur/i,
    /priorite|priorité|urgence|niveau|criticité|criticite/i,
  ];
  const keyCols = headers.filter(h => keyPatterns.some(p => p.test(h))).map(h =>
    h.toLowerCase().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '')
  );
  const uniqueKeyCols = [...new Set(keyCols)];

  return rows.filter(row => {
    if (uniqueKeyCols.length > 0) {
      return uniqueKeyCols.some(k => isRealValue(row[k]));
    }
    let filled = 0;
    for (const k of Object.keys(row)) {
      if (k === '_row') continue;
      if (isRealValue(row[k])) filled++;
    }
    return filled >= 3;
  });
}

const CACHE_TTL = CONSTANTS.SHAREPOINT_TOKEN_CACHE_TTL;
let tokenCache = { token: null, expiresAt: 0 };

function isConfigured() {
  return !!(process.env.SHAREPOINT_TENANT_ID && process.env.SHAREPOINT_CLIENT_ID && process.env.SHAREPOINT_CLIENT_SECRET);
}

function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: CONSTANTS.SHAREPOINT_REQUEST_TIMEOUT,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            if (res.statusCode === 401) tokenCache = { token: null, expiresAt: 0 };
            const err = new Error(parsed.error?.message || parsed.error_description || `HTTP ${res.statusCode}`);
            err.status = res.statusCode;
            err.details = parsed;
            reject(err);
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Parse failed: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 60000) return tokenCache.token;

  const tenantId = process.env.SHAREPOINT_TENANT_ID;
  const clientId = process.env.SHAREPOINT_CLIENT_ID;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  }).toString();

  let data;
  try {
    data = await httpsRequest(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
      body
    );
  } catch (err) {
    tokenCache = { token: null, expiresAt: 0 };
    throw err;
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in - 60) * 1000,
  };

  log('info', 'sharepoint_token_acquired');
  return data.access_token;
}

async function getSiteId(token) {
  const hostname = process.env.SHAREPOINT_SITE_HOSTNAME || 'shiftup.sharepoint.com';
  const sitePath = process.env.SHAREPOINT_SITE_PATH || 'sites/P2M2022';
  const data = await httpsRequest(
    `https://graph.microsoft.com/v1.0/sites/${hostname}:/${sitePath}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data.id;
}

async function findDriveItem(token, siteId) {
  const fileId = process.env.SHAREPOINT_FILE_ID || '55686017-3ff9-43f7-ab28-5b910871a4b0';
  const driveId = process.env.SHAREPOINT_DRIVE_ID || null;
  const itemId = process.env.SHAREPOINT_ITEM_ID || null;

  if (driveId && itemId) return { driveId, itemId };

  try {
    const data = await httpsRequest(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${fileId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return { driveId: data.parentReference.driveId, itemId: data.id };
  } catch {
    try {
      const data = await httpsRequest(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/search(q='Suivi Demandes 2026')`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const items = data.value || [];
      if (items.length > 0) {
        const item = items[0];
        return { driveId: item.parentReference.driveId, itemId: item.id };
      }
      throw new Error('Fichier "Suivi Demandes 2026" introuvable dans SharePoint');
    } catch (err) {
      throw err;
    }
  }
}

async function getWorkbookData(token, siteId, driveId, itemId, sheetName) {
  const sheet = sheetName || process.env.SHAREPOINT_SHEET_NAME || 'Suivi Demandes 2026';
  try {
    const data = await httpsRequest(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheet)}')/usedRange`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const rows = data.values || [];
    if (rows.length < 2) throw new Error('Pas assez de données');

    const headers = rows[0];
    const allItems = rows.slice(1).map((row, idx) => {
      const obj = { _row: idx + 2 };
      headers.forEach((h, i) => {
        const key = String(h).toLowerCase().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '');
        obj[key] = row[i] !== undefined ? String(row[i]).trim() : '';
      });
      return obj;
    });
    const items = filterDataRows(allItems, headers);

    return { headers, items, _rawCount: allItems.length };
  } catch (err) {
    if (err.details?.error?.code === 'itemNotFound' || err.status === 404) {
      throw new Error(`Onglet "${sheet}" introuvable dans le fichier`);
    }
    throw err;
  }
}

function computeStats(items, headers) {
  const statusField = headers.find(h => /statut|status|état/i.test(h)) || 'statut';
  const typeField = headers.find(h => /type|categorie|catégorie/i.test(h)) || 'type';
  const priorityField = headers.find(h => /priorite|priorité|urgence/i.test(h)) || 'priorité';
  const dateField = headers.find(h => /date.*(?:creation|création|demande|soumission)/i.test(h)) || 'date_de_la_demande';
  const deadlineField = headers.find(h => /echeance|échéance|deadline|date.*limite/i.test(h));

  const normalize = v => v.toLowerCase().trim();

  const statusGroups = {};
  const typeGroups = {};
  const priorityGroups = {};
  const monthlyTrend = {};
  let urgentCount = 0;
  let completedCount = 0;
  const now = new Date();

  const statusMap = {
    'nouvelle': 'Nouvelle',
    'en cours': 'En cours',
    'en attente': 'En attente',
    'en attente info': 'En attente',
    'terminée': 'Terminée',
    'termine': 'Terminée',
    'annulée': 'Annulée',
    'annule': 'Annulée',
  };

  const priorityOrder = ['Haute', 'Moyenne', 'Basse'];
  const statusOrder = ['Nouvelle', 'En cours', 'En attente', 'Terminée', 'Annulée'];

  items.forEach(item => {
    const rawStatus = item[statusField] || '';
    const rawType = item[typeField] || '';
    const rawPriority = item[priorityField] || '';
    const rawDate = item[dateField] || '';
    const rawDeadline = item[deadlineField];

    const status = statusMap[normalize(rawStatus)] || rawStatus || 'Non défini';
    const type = rawType || 'Non défini';
    const priority = rawPriority || 'Non défini';

    statusGroups[status] = (statusGroups[status] || 0) + 1;
    typeGroups[type] = (typeGroups[type] || 0) + 1;
    priorityGroups[priority] = (priorityGroups[priority] || 0) + 1;

    if (normalize(rawStatus) === 'terminée' || normalize(rawStatus) === 'termine') {
      completedCount++;
    }

    if (rawDeadline) {
      try {
        const deadline = new Date(rawDeadline);
        const diffDays = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 7 && status !== 'Terminée') urgentCount++;
      } catch {}
    }

    if (rawDate) {
      try {
        const d = new Date(rawDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyTrend[key] = (monthlyTrend[key] || 0) + 1;
      } catch {}
    }
  });

  const total = items.length;
  const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return {
    total,
    completedCount,
    completionRate,
    urgentCount,
    statusDistribution: statusOrder.map(s => ({ label: s, count: statusGroups[s] || 0 })).concat(
      Object.entries(statusGroups)
        .filter(([k]) => !statusOrder.includes(k))
        .map(([label, count]) => ({ label, count }))
    ).filter(s => s.count > 0),
    typeDistribution: Object.entries(typeGroups)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    priorityDistribution: priorityOrder.map(p => ({ label: p, count: priorityGroups[p] || 0 })).filter(p => p.count > 0),
    monthlyTrend: Object.entries(monthlyTrend)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count })),
  };
}

async function fetchDashboardData() {
  if (!isConfigured()) {
    return {
      connected: false,
      message: 'SharePoint non configuré. Configurez SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID et SHAREPOINT_CLIENT_SECRET.',
      stats: null,
      items: [],
      headers: [],
    };
  }

  try {
    const token = await getAccessToken();
    const siteId = await getSiteId(token);
    const { driveId, itemId } = await findDriveItem(token, siteId);
    const sheetData = await getWorkbookData(token, siteId, driveId, itemId);
    const stats = computeStats(sheetData.items, sheetData.headers);

    return {
      connected: true,
      lastSync: new Date().toISOString(),
      stats,
      items: sheetData.items,
      headers: sheetData.headers,
      _rawCount: sheetData._rawCount,
    };
  } catch (err) {
    log('error', 'sharepoint_fetch_failed', { error: err.message });
    return {
      connected: false,
      message: `Erreur SharePoint: ${err.message}`,
      stats: null,
      items: [],
      headers: [],
    };
  }
}

module.exports = { fetchDashboardData, computeStats, isConfigured, filterDataRows };
