const https = require('https');
const querystring = require('querystring');
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
    String(h).trim().toLowerCase().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '')
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

const { getGraphToken } = require('./graph-auth');

// Valeurs par défaut (identifiants déjà en usage pour ce site/fichier) : le système
// fonctionne ainsi sans configuration supplémentaire. Ce ne sont pas des secrets — juste
// des identifiants de localisation d'un fichier SharePoint, pas des clés d'accès.
const SHAREPOINT_HOST = process.env.SHAREPOINT_SITE_HOSTNAME || 'shiftup.sharepoint.com';
const SHAREPOINT_PATH = process.env.SHAREPOINT_SITE_PATH || 'sites/P2M2022';
const FILE_ID_DEFAULT = process.env.SHAREPOINT_FILE_ID || '55686017-3ff9-43f7-ab28-5b910871a4b0';
const SHEET_NAME_DEFAULT = process.env.SHAREPOINT_SHEET_NAME || 'Suivi Demandes 2026';

function isConfigured() {
  // Conservé pour compatibilité ascendante. La vraie décision (app-only vs compte délégué
  // persistant vs rien du tout) est désormais prise à l'intérieur de getGraphToken() ;
  // fetchDashboardData() renvoie {connected:false} proprement si aucun mode ne fonctionne.
  return true;
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

async function getSiteId(token) {
  const data = await httpsRequest(
    `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_HOST}:/${SHAREPOINT_PATH}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data.id;
}

async function findDriveItem(token, siteId) {
  const fileId = FILE_ID_DEFAULT;
  const driveId = process.env.SHAREPOINT_DRIVE_ID || null;
  const itemId = process.env.SHAREPOINT_ITEM_ID || null;

  if (driveId && itemId) return { driveId, itemId, lastModifiedBy: 'Inconnu', lastModifiedDateTime: '' };

  try {
    const data = await httpsRequest(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${fileId}?$select=id,parentReference,lastModifiedBy,lastModifiedDateTime`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return {
      driveId: data.parentReference.driveId,
      itemId: data.id,
      lastModifiedBy: (data.lastModifiedBy && data.lastModifiedBy.user && data.lastModifiedBy.user.displayName) || 'Inconnu',
      lastModifiedDateTime: data.lastModifiedDateTime || '',
    };
  } catch {
    try {
      const data = await httpsRequest(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/search(q='${querystring.escape(SHEET_NAME_DEFAULT)}')`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const items = data.value || [];
      if (items.length > 0) {
        const item = items[0];
        return {
          driveId: item.parentReference.driveId,
          itemId: item.id,
          lastModifiedBy: (item.lastModifiedBy && item.lastModifiedBy.user && item.lastModifiedBy.user.displayName) || 'Inconnu',
          lastModifiedDateTime: item.lastModifiedDateTime || '',
        };
      }
      throw new Error('Fichier "' + SHEET_NAME_DEFAULT + '" introuvable dans SharePoint');
    } catch (err) {
      throw err;
    }
  }
}

async function getWorkbookData(token, siteId, driveId, itemId, sheetName) {
  const sheet = sheetName || SHEET_NAME_DEFAULT;
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
        const key = String(h).trim().toLowerCase().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '');
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

  const normalize = v => v.toLowerCase().trim().normalize('NFC');

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

  const sanitize = v => v.normalize('NFC').replace(/\uFFFD/g, '');

  items.forEach(item => {
    const rawStatus = sanitize(item[statusField] || '');
    const rawType = sanitize(item[typeField] || '');
    const rawPriority = sanitize(item[priorityField] || '');
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

/**
 * @param {object} [opts]
 * @param {boolean} [opts.allowInteractive] - transmis à getGraphToken ; à ne JAMAIS passer
 *   à true depuis un handler API (voir lib/graph-auth.js).
 */
async function fetchDashboardData(opts) {
  const token = await getGraphToken(opts || {});
  if (!token) {
    return {
      connected: false,
      message: 'Aucun accès SharePoint disponible pour le moment (ni app-only, ni session déléguée valide). Voir scripts/connect-sharepoint.js.',
      stats: null,
      items: [],
      headers: [],
    };
  }

  try {
    const siteId = await getSiteId(token);
    const { driveId, itemId, lastModifiedBy, lastModifiedDateTime } = await findDriveItem(token, siteId);
    const sheetData = await getWorkbookData(token, siteId, driveId, itemId);
    const stats = computeStats(sheetData.items, sheetData.headers);

    const strip = v => String(v).normalize('NFC').replace(/\uFFFD/g, '');
    for (const item of sheetData.items) {
      for (const k of Object.keys(item)) {
        if (typeof item[k] === 'string') item[k] = strip(item[k]);
      }
    }

    return {
      connected: true,
      lastSync: new Date().toISOString(),
      lastModifiedBy,
      lastModifiedDateTime,
      stats,
      items: sheetData.items,
      headers: sheetData.headers,
      _rawCount: sheetData._rawCount,
      source: require('./graph-auth').getLastMode() || 'live',
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
