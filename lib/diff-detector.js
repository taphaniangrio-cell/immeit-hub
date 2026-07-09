const { log } = require('./logger');
const { getCacheDir, safeReadFile, safeWriteFile } = require('./cache-dir');

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

    const fieldChanges = [];
    for (const field of WATCHED_FIELDS) {
      const oldVal = (oldItem[field] || '').trim();
      const newVal = (newItem[field] || '').trim();
      if (oldVal !== newVal) {
        fieldChanges.push({
          field,
          label: FIELD_LABELS[field] || field,
          colonne: getColumnLetter(field),
          oldValue: oldVal || '(vide)',
          newValue: newVal || '(vide)',
        });
      }
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

function loadPreviousState() {
  try {
    var f = diffFile();
    var raw = safeReadFile(f);
    if (raw) {
      var data = JSON.parse(raw);
      if (data && data.items && data.items.length > 0) return data;
    }
  } catch (e) {
    log('warn', 'diff_prev_load_failed', { error: e?.message });
  }
  return null;
}

function saveCurrentState(data) {
  safeWriteFile(diffFile(), { items: data.items, headers: data.headers, syncedAt: data.syncedAt });
}

function buildDiffReport(newData, lastModifiedBy) {
  const prev = loadPreviousState();

  if (!prev) {
    saveCurrentState(newData);
    return null;
  }

  const changes = findChanges(prev.items, newData.items, newData.headers || prev.headers);

  if (changes.length === 0) {
    saveCurrentState(newData);
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

  saveCurrentState(newData);

  return report;
}

module.exports = { buildDiffReport, findChanges, loadPreviousState };
