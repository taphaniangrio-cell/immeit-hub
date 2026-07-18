const db = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const cors = require('../lib/cors');
const sharepoint = require('../lib/sharepoint');

function excelAllDates(val) {
  if (!val) return [];
  const raw = String(val).replace(/\\[rn]+/g, '\n');
  const dates = [];
  const candidates = raw.split(/[,;\n\r]+/);
  for (const c of candidates) {
    const v = c.trim().replace(/^["']+|["']+$/g, '');
    if (!v) continue;
    let d = null;
    if (/^\d+(\.\d+)?$/.test(v)) {
      const serial = parseFloat(v);
      if (serial > 30000 && serial < 60000) d = new Date(1899, 11, 30 + serial);
      if (!d || isNaN(d.getTime()) || d.getFullYear() < 2020) d = null;
    } else {
      let parts = [];
      if (v.includes('/')) parts = v.split('/');
      else if (v.includes('-')) parts = v.split('-');
      else if (v.includes('.')) parts = v.split('.');
      if (parts.length === 3) {
        const nums = parts.map(Number);
        if (nums.some(isNaN)) { d = null; }
        else if (nums[0] > 31) d = new Date(nums[0], nums[1] - 1, nums[2]);
        else d = new Date(nums[2], nums[1] - 1, nums[0]);
        if (d && (isNaN(d.getTime()) || d.getFullYear() < 2020)) d = null;
      }
      if (!d) {
        const parsed = new Date(v);
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020) d = parsed;
      }
    }
    if (d && !dates.some(x => x.getTime() === d.getTime())) dates.push(d);
  }
  return dates;
}

function normMatch(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\u00a0]+/g, ' ').trim().toLowerCase();
}

function findHeader(headers, name) {
  const target = normMatch(name);
  const found = headers.find(h => normMatch(h).includes(target)) || '';
  if (!found) return '';
  return String(found).trim().toLowerCase().replace(/[\s\u00a0\/]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function norm(v) {
  return (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\u00a0]+/g, ' ').trim().toLowerCase();
}

module.exports = requireAuth(async (req, res) => {
  if (cors(res, req)) return;

  try {
    const cachedData = await loadCachedData();
    if (!cachedData || !cachedData.items || cachedData.items.length === 0) {
      return res.status(200).json({ items: [], total: 0, totalFiltered: 0, totalDates: 0, totalExtra: 0 });
    }

    let headers = cachedData.headers || [];
    const items = cachedData.items;

    const q = req.query || {};
    const dateField = findHeader(headers, 'Date de dépôt du dossier sur docinfo');
    const statusField = findHeader(headers, "Etat d'avance de la demande");
    const siteField = findHeader(headers, 'Site');
    const demandeurField = findHeader(headers, 'Demandeurs');
    const typeField = findHeader(headers, 'Type de demande');
    const natureField = findHeader(headers, 'Nature de la demande');
    const bancField = findHeader(headers, 'N°(BE / GERICO / APEX)');
    const otField = findHeader(headers, 'N°OT');

    let filtered = items;

    if (q.status) {
      filtered = filtered.filter(it => norm(it[statusField]) === norm(q.status));
    }
    if (q.site) {
      filtered = filtered.filter(it => norm(it[siteField]) === norm(q.site));
    }
    if (q.demandeur) {
      filtered = filtered.filter(it => norm(it[demandeurField]) === norm(q.demandeur));
    }
    if (q.type) {
      filtered = filtered.filter(it => norm(it[typeField]) === norm(q.type));
    }
    if (q.nature) {
      filtered = filtered.filter(it => norm(it[natureField]) === norm(q.nature));
    }
    if (q.search) {
      const s = norm(q.search);
      filtered = filtered.filter(it => {
        return Object.values(it).some(v => norm(v).includes(s));
      });
    }
    if (q.dateStart || q.dateEnd) {
      const startMk = q.dateStart ? q.dateStart.slice(0, 7) : '0000-00';
      const endMk = q.dateEnd ? q.dateEnd.slice(0, 7) : '9999-99';
      filtered = filtered.filter(it => {
        const raw = it[dateField];
        if (!raw) return false;
        const dates = excelAllDates(raw);
        return dates.some(d => {
          const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          return mk >= startMk && mk <= endMk;
        });
      });
    }

    const totalFiltered = filtered.length;
    const totalAll = items.length;

    const multiDates = [];
    let totalDates = 0;
    let totalExtra = 0;

    const hasDateFilter = !!(q.dateStart || q.dateEnd);
    const startMkForDates = q.dateStart ? q.dateStart.slice(0, 7) : '0000-00';
    const endMkForDates = q.dateEnd ? q.dateEnd.slice(0, 7) : '9999-99';

    for (const it of filtered) {
      const raw = dateField ? (it[dateField] || '') : '';
      if (!raw) continue;
      let dates = excelAllDates(raw);
      if (hasDateFilter) {
        dates = dates.filter(d => {
          const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          return mk >= startMkForDates && mk <= endMkForDates;
        });
      }
      if (dates.length > 1) {
        dates.sort((a, b) => a.getTime() - b.getTime());
        const num = bancField ? (it[bancField] || '—') : '—';
        const nature = natureField ? (it[natureField] || '').replace(/\n/g, ' ').trim() : '';
        const ot = otField ? (it[otField] || '').trim() : '';
        const site = siteField ? (it[siteField] || '') : '';
        const status = statusField ? (it[statusField] || '') : '';
        const demandeur = demandeurField ? (it[demandeurField] || '') : '';
        const type = typeField ? (it[typeField] || '') : '';
        multiDates.push({ num, dates: dates.map(d => d.toISOString()), nature, ot, site, status, demandeur, type, dateCount: dates.length });
        totalExtra += dates.length - 1;
      }
      totalDates += Math.max(dates.length, 1);
    }

    multiDates.sort((a, b) => b.dateCount - a.dateCount || a.num.localeCompare(b.num, 'fr'));

    return res.status(200).json({
      items: multiDates,
      total: totalAll,
      totalFiltered,
      totalDates,
      totalExtra,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

async function loadCachedData() {
  const DB_TIMEOUT = 10000;
  try {
    const r = await Promise.race([
      db.query(`SELECT cache_data FROM dashboard_cache WHERE cache_key = 'sharepoint_suivi_2026'`),
      new Promise((_, rej) => setTimeout(() => rej(new Error('db_timeout')), DB_TIMEOUT)),
    ]);
    if (r.rows.length > 0) {
      let data = r.rows[0].cache_data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
      if (data && data.items && data.items.length > 0) return data;
    }
  } catch {}
  try {
    const { fetchCache } = require('../lib/github-cache');
    const gh = await fetchCache();
    if (gh && gh.items && gh.items.length > 0 && gh.headers) return gh;
  } catch {}
  return null;
}
