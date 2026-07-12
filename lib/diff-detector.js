const { log } = require('./logger');
const { getCacheDir, safeReadFile, safeWriteFile } = require('./cache-dir');
const { query } = require('./db');

const DIFF_DB_KEY = 'diff_prev_state';

function diffFile() { return require('path').join(getCacheDir(), 'dash-cache-prev.json'); }

const ID_FIELD = 'nbe_gerico_apex';

function getRowId(item) {
  return item[ID_FIELD] ? String(item[ID_FIELD]).trim() : null;
}

function columnLetter(index) {
  let letter = '';
  let i = index;
  while (i >= 0) {
    letter = String.fromCharCode((i % 26) + 65) + letter;
    i = Math.floor(i / 26) - 1;
  }
  return letter;
}

function buildFieldMap(items, headers) {
  const map = new Map();
  for (const item of items) {
    const id = getRowId(item) || 'row_' + item._row;
    map.set(id, item);
  }
  return map;
}

function findChanges(oldItems, newItems, headers) {
  const oldMap = buildFieldMap(oldItems, headers);
  const newMap = buildFieldMap(newItems, headers);

  const headerLower = headers.map(h => String(h).toLowerCase().trim().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, ''));

  const WATCHED_FIELDS = [
    'etat_davance_de_la_demande',
    'conformit_de_la_demande',
    'remarque_immeit',
    'stockage_adveso',
    'stockage',
    'mise__jour_kpi',
    'date_de_validation_p2m',
    'date_dernire_maj_immeit',
    'conformit__la_premire_diffusion',
    'commentaire_p2m',
    'date_dvaluation_en_cas_de_non_conformit',
    'explication_en_cas_de_nonconformit',
    'demandeurs',
    'nom_du_banc_nom_entreprise',
    'type_de_demande',
    'nature_de_la_demande',
    'site',
  ];

  const FIELD_LABELS = {
    nbe_gerico_apex: 'N° BE/GERICO/APEX',
    site: 'Site',
    demandeurs: 'Demandeur',
    type_de_demande: 'Type de demande',
    nature_de_la_demande: 'Nature de la demande',
    nom_du_banc_nom_entreprise: 'Nom du banc / Entreprise',
    etat_davance_de_la_demande: "État d'avancement",
    conformit_de_la_demande: 'Conformité de la demande',
    remarque_immeit: 'Remarque IMMEIT',
    stockage_adveso: 'Stockage ADVESO',
    stockage: 'Stockage',
    mise__jour_kpi: 'Mise à jour KPI',
    date_de_validation_p2m: 'Date validation P2M',
    date_dernire_maj_immeit: 'Dernière MAJ IMMEIT',
    conformit__la_premire_diffusion: 'Conformité 1ère diffusion',
    commentaire_p2m: 'Commentaire P2M',
    date_dvaluation_en_cas_de_non_conformit: "Date d'évaluation NC",
    explication_en_cas_de_nonconformit: 'Explication NC',
  };

  function getHeaderIndex(fieldKey) {
    return headerLower.indexOf(fieldKey);
  }

  function getColumnLetter(fieldKey) {
    const idx = getHeaderIndex(fieldKey);
    if (idx === -1) return '?';
    return columnLetter(idx);
  }

  const changes = [];

  for (const [id, newItem] of newMap) {
    const oldItem = oldMap.get(id);
    if (!oldItem) {
      changes.push({
        row: newItem._row,
        id: getRowId(newItem) || '',
        site: newItem.site || '',
        demandeur: newItem.demandeurs || '',
        type: 'Ajout',
        fields: [],
      });
      continue;
    }

    function isSameContent(a, b) {
      if (a === b) return true;
      const noFFFD = s => s.replace(/\uFFFD/g, '');
      if (noFFFD(a) === noFFFD(b)) return true;
      const ascii = s => s.replace(/[^\x20-\x7E]/g, '');
      if (ascii(a) === ascii(b)) return true;
      return false;
    }

    const fieldChanges = [];
    for (const field of WATCHED_FIELDS) {
      const rawOld = (oldItem[field] || '').trim();
      const rawNew = (newItem[field] || '').trim();
      if (isSameContent(rawOld, rawNew)) continue;
      log('info', 'diff_field_changed', { id, field, oldLen: rawOld.length, newLen: rawNew.length, oldStart: rawOld.slice(0, 120), newStart: rawNew.slice(0, 120) });
      fieldChanges.push({
        field,
        label: FIELD_LABELS[field] || field,
        colonne: getColumnLetter(field),
        oldValue: rawOld || '(vide)',
        newValue: rawNew || '(vide)',
      });
    }

    if (fieldChanges.length > 0) {
      changes.push({
        row: newItem._row,
        id: getRowId(newItem) || '',
        site: newItem.site || '',
        demandeur: newItem.demandeurs || '',
        type: 'Modification',
        fields: fieldChanges,
      });
    }

    oldMap.delete(id);
  }

  for (const [id, item] of oldMap) {
    changes.push({
      row: item._row,
      id: getRowId(item) || '',
      site: item.site || '',
      demandeur: item.demandeurs || '',
      type: 'Suppression',
      fields: [],
    });
  }

  return changes;
}

function sanitizeItems(items) {
  for (const item of items) {
    for (const k of Object.keys(item)) {
      if (typeof item[k] === 'string') {
        item[k] = item[k].normalize('NFC').replace(/\uFFFD/g, '');
      }
    }
  }
}

async function loadPreviousState() {
  if (!process.env.DATABASE_URL) {
    const fromFile = loadPreviousStateFile();
    if (fromFile) sanitizeItems(fromFile.items);
    return fromFile;
  }
  try {
    const result = await query('SELECT cache_data FROM dashboard_cache WHERE cache_key = $1', [DIFF_DB_KEY]);
    if (result && result.rows && result.rows.length > 0) {
      let data = result.rows[0].cache_data;
      if (data && data.items && data.items.length > 0) {
        sanitizeItems(data.items);
        log('info', 'diff_prev_loaded_db', { items: data.items.length, syncedAt: data.syncedAt });
        return data;
      }
    }
  } catch (e) {
    log('warn', 'diff_prev_db_failed', { error: e?.message });
    const fromFile = loadPreviousStateFile();
    if (fromFile) sanitizeItems(fromFile.items);
    return fromFile;
  }
  return null;
}

function loadPreviousStateFile() {
  try {
    const f = diffFile();
    const raw = safeReadFile(f);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.items && data.items.length > 0) return data;
    }
  } catch (e) {
    log('warn', 'diff_prev_file_failed', { error: e?.message });
  }
  return null;
}

async function saveCurrentState(data) {
  if (process.env.DATABASE_URL) {
    try {
      await query(
        'INSERT INTO dashboard_cache (cache_key, cache_data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (cache_key) DO UPDATE SET cache_data = $2::jsonb, updated_at = now()',
        [DIFF_DB_KEY, JSON.stringify({ items: data.items, headers: data.headers, syncedAt: data.syncedAt })]
      );
      log('debug', 'diff_saved_db', { items: data.items.length });
      return;
    } catch (e) {
      log('warn', 'diff_save_db_failed', { error: e?.message });
    }
  }
  safeWriteFile(diffFile(), { items: data.items, headers: data.headers, syncedAt: data.syncedAt });
}

const DIFF_VERSION = '3.0';

async function buildDiffReport(newData, lastModifiedBy) {
  log('info', 'diff_build_report', { version: DIFF_VERSION, source: newData.source, prevDb: !!process.env.DATABASE_URL, totalNew: newData.items?.length });
  const prev = await loadPreviousState();

  if (!prev) {
    log('info', 'diff_no_prev_state', { version: DIFF_VERSION });
    await saveCurrentState(newData);
    return null;
  }

  const changes = findChanges(prev.items, newData.items, newData.headers || prev.headers);

  if (changes.length === 0) {
    log('info', 'diff_no_changes', { version: DIFF_VERSION });
    await saveCurrentState(newData);
    return null;
  }

  const report = {
    detectedAt: new Date().toISOString(),
    syncedAt: newData.syncedAt,
    lastModifiedBy: lastModifiedBy || 'Inconnu',
    totalBefore: prev.items.length,
    totalAfter: newData.items.length,
    changes,
  };

  await saveCurrentState(newData);

  return report;
}

module.exports = { buildDiffReport, findChanges, loadPreviousState };
