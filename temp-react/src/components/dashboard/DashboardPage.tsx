import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../../stores/appStore';
import { dashboardApi } from '../../lib/api';
import { DashboardSkeleton } from '../ui/Skeleton';
import { GaugeChart, BarChart, DonutChart, LineChart } from './Charts';

/* ── helpers réutilisés de l'ancien app.js ── */

function norm(s: string) {
  return s.trim().toLowerCase().normalize('NFC').replace(/\uFFFD/g, '').replace(/[\s/]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function findHeader(headers: string[], hint: string) {
  const n = norm(hint);
  const match = headers.find(x => norm(x) === n || x === hint);
  const header = match || headers.find(x => norm(x).includes(n.slice(0, 6))) || '';
  return header ? norm(header) : '';
}

function excelToDate(val: string): Date | null {
  if (!val) return null;
  const candidates = String(val).split(/[,;\n\r]+/);
  for (const c of candidates) {
    const v = c.trim();
    if (!v) continue;
    if (/^\d+(\.\d+)?$/.test(v)) {
      const d = new Date(1899, 11, 30 + parseFloat(v));
      if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;
    }
    if (v.includes('/')) {
      const parts = v.split('/');
      if (parts.length === 3) {
        const d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
        if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;
      }
    }
    const d = new Date(v);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;
  }
  return null;
}

function fmtDate(val: string): string {
  if (!val) return '—';
  const d = excelToDate(val);
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function parseNum(val: any): number {
  if (val == null) return NaN;
  const n = parseFloat(String(val).replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? NaN : n;
}

function delaiStats(vals: number[]) {
  if (vals.length === 0) return { min: 0, max: 0, avg: 0, median: 0, count: 0, zeroPct: 0, gtZero: 0 };
  const sorted = [...vals].sort((a, b) => a - b);
  const sum = vals.reduce((a, b) => a + b, 0);
  const zc = vals.filter(v => v === 0).length;
  return {
    min: sorted[0], max: sorted[sorted.length - 1],
    avg: Math.round((sum / vals.length) * 10) / 10,
    median: sorted[Math.floor(sorted.length / 2)],
    count: vals.length,
    zeroPct: vals.length > 0 ? Math.round((zc / vals.length) * 100) : 0,
    gtZero: vals.length - zc,
  };
}

function toDist(obj: Record<string, number>, labelMap?: Record<string, string>) {
  return Object.entries(obj)
    .map(([k, count]) => ({ label: labelMap?.[k] || k, count }))
    .sort((a, b) => b.count - a.count);
}

function computeStats(headers: string[], items: Record<string, string>[]) {
  const f = {
    avancement: findHeader(headers, "Etat d'avance de la demande"),
    type: findHeader(headers, 'Type de demande'),
    nature: findHeader(headers, 'Nature de la demande'),
    site: findHeader(headers, 'Site'),
    demandeur: findHeader(headers, 'Demandeurs'),
    date: findHeader(headers, 'Date de dépôt du dossier sur docinfo'),
    conf1: findHeader(headers, 'Conformité à la première diffusion'),
    confDem: findHeader(headers, 'Conformité de la demande'),
    duree: findHeader(headers, 'Durée de traitement (jours) 1'),
    echeance: findHeader(headers, "Echéance contractuelle (jours) 1"),
    ecart: findHeader(headers, 'Ecart de traitement (jour) 1'),
    stockage: findHeader(headers, 'Stockage'),
    stockageAdv: findHeader(headers, 'Stockage ADVESO'),
  };

  const MAX_DAYS = 365;
  const groups: Record<string, Record<string, number>> = {
    avancement: {}, type: {}, nature: {}, site: {}, demandeur: {},
    conf1: {}, confDem: {}, stockage: {}, stockageAdv: {}, monthly: {},
  };
  const labelMap: Record<string, Record<string, string>> = {
    avancement: {}, type: {}, nature: {}, site: {},
    conf1: {}, confDem: {}, stockage: {}, stockageAdv: {},
  };
  const demandeurLabels: Record<string, string> = {};
  const delais: { duree: number[]; echeance: number[]; ecart: number[] } = { duree: [], echeance: [], ecart: [] };

  function addGroup(slugMap: Record<string, number>, lMap: Record<string, string>, raw: string | undefined) {
    const v = (raw || '').trim();
    if (!v) return;
    const gk = v.replace(/[^ -~]+/g, '').toLowerCase();
    slugMap[gk] = (slugMap[gk] || 0) + 1;
    const prev = lMap[gk];
    if (!prev || (v.indexOf('\uFFFD') < 0 && v.length >= prev.length)) lMap[gk] = v;
  }

  for (const it of items) {
    addGroup(groups.avancement, labelMap.avancement, it[f.avancement]);
    addGroup(groups.type, labelMap.type, it[f.type]);
    addGroup(groups.nature, labelMap.nature, it[f.nature]);
    addGroup(groups.site, labelMap.site, it[f.site]);

    const de = (it[f.demandeur] || '').trim();
    if (de) {
      const key = de.replace(/[^a-zA-Z]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      groups.demandeur[key] = (groups.demandeur[key] || 0) + 1;
      const prev = demandeurLabels[key];
      if (!prev || (de.indexOf('\uFFFD') < 0 && de.length >= prev.length)) demandeurLabels[key] = de;
    }

    addGroup(groups.conf1, labelMap.conf1, it[f.conf1]);
    addGroup(groups.confDem, labelMap.confDem, it[f.confDem]);
    addGroup(groups.stockage, labelMap.stockage, it[f.stockage]);
    addGroup(groups.stockageAdv, labelMap.stockageAdv, it[f.stockageAdv]);

    const du = parseNum(it[f.duree]);
    if (!isNaN(du) && du >= 0 && du <= MAX_DAYS) delais.duree.push(du);
    const ecVal = parseNum(it[f.echeance]);
    if (!isNaN(ecVal) && ecVal >= 0 && ecVal <= MAX_DAYS) delais.echeance.push(ecVal);
    const ec = parseNum(it[f.ecart]);
    if (!isNaN(ec) && Math.abs(ec) <= MAX_DAYS) delais.ecart.push(ec);

    const rd = it[f.date] || '';
    if (rd) {
      const d = excelToDate(rd);
      if (d) {
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        groups.monthly[mk] = (groups.monthly[mk] || 0) + 1;
      }
    }
  }

  const sortedMonthly = Object.entries(groups.monthly)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([month, count]) => ({ month, count }));

  const topDem = Object.entries(groups.demandeur)
    .map(([k, count]) => ({ label: demandeurLabels[k] || k, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const conf1Vals = groups.conf1;
  const conf1T = Object.values(conf1Vals).reduce((a, b) => a + b, 0);
  const conf1O = (conf1Vals['oui'] || 0) + (conf1Vals['conforme'] || 0);
  const confDemVals = groups.confDem;
  const confDemT = Object.values(confDemVals).reduce((a, b) => a + b, 0);
  const confDemO = (confDemVals['oui'] || 0) + (confDemVals['conforme'] || 0);

  return {
    total: items.length,
    avancementDist: toDist(groups.avancement, labelMap.avancement),
    typeDist: toDist(groups.type, labelMap.type),
    natureDist: toDist(groups.nature, labelMap.nature),
    siteDist: toDist(groups.site, labelMap.site),
    topDemandeurs: topDem,
    tauxConf1: conf1T > 0 ? Math.round((conf1O / conf1T) * 100) : 0,
    conf1Dist: toDist(conf1Vals, labelMap.conf1).map(d => ({ ...d, label: d.label.charAt(0).toUpperCase() + d.label.slice(1) })),
    tauxConfDem: confDemT > 0 ? Math.round((confDemO / confDemT) * 100) : 0,
    confDemDist: toDist(confDemVals, labelMap.confDem).map(d => ({ ...d, label: d.label.charAt(0).toUpperCase() + d.label.slice(1) })),
    stockageDist: toDist(groups.stockage, labelMap.stockage),
    stockageAdvesoDist: toDist(groups.stockageAdv, labelMap.stockageAdv),
    duree: delaiStats(delais.duree),
    echeance: delaiStats(delais.echeance),
    ecart: delaiStats(delais.ecart),
    monthlyTrend: sortedMonthly,
  };
}

/* ── couleurs ── */

const statusColors: Record<string, string> = {
  'Nouvelle': '#0A66C2', 'Nouveau': '#0A66C2',
  'En cours': '#B45309', 'Encours': '#B45309',
  'En attente': '#64748B', 'Enattente': '#64748B',
  'Terminée': '#15803D', 'Terminé': '#15803D', 'Termine': '#15803D',
  'Annulée': '#DC2626', 'Annulé': '#DC2626', 'Annule': '#DC2626',
  'A traiter': '#F59E0B', 'Atraiter': '#F59E0B',
  'Clôturée': '#16A34A', 'Cloturee': '#16A34A', 'Clôturé': '#16A34A',
};

const months = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
function fmtMonth(mk: string) {
  const [, m] = mk.split('-');
  return months[parseInt(m, 10) - 1] || mk;
}

const natureColors: Record<string, string> = {
  'AMDEC': '#0A66C2', 'AMDEC ': '#0A66C2',
  'MQT': '#7C3AED',
  'Sécurité': '#DC2626', 'Securite': '#DC2626',
  'Maintenance': '#D4A017',
  'Qualité': '#16A34A', 'Qualite': '#16A34A',
  'Fiabilité': '#0D9488', 'Fiabilite': '#0D9488',
  'GMAO': '#6366F1',
};

const typeColors = ['#2563EB', '#DC2626', '#16A34A', '#F59E0B', '#9333EA', '#0D9488', '#EC4899', '#D97706', '#0891B2', '#6366F1'];
const siteColors = ['#DC2626', '#0D9488', '#16A34A', '#F59E0B', '#7C3AED', '#EA580C', '#65A30D', '#EC4899', '#D97706', '#BE123C'];
const confColors: Record<string, string> = { 'Oui': '#16A34A', 'Non': '#DC2626', 'Conforme': '#16A34A', 'Non conforme': '#DC2626' };

/* ── composant principal ── */

export function DashboardPage({ showToast }: { showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void }) {
  const { dashboardData, setDashboardData } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [updateInfo, setUpdateInfo] = useState('Chargement...');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState(new Date().toISOString().slice(0, 10));
  const [defaultDateStart, setDefaultDateStart] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterNature, setFilterNature] = useState('');
  const [filterSite, setFilterSite] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDemandeur, setFilterDemandeur] = useState('');
  const [filterBanc, setFilterBanc] = useState('');

  // Load cache instantly on mount, then fetch fresh data in background
  useEffect(() => {
    const cached = localStorage.getItem('immeit_dash_cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setDashboardData(parsed);
        setLoading(false);
        setUpdateInfo('Données en cache');
      } catch {}
    }
    // Then fetch fresh data silently
    (async () => {
      try {
        const data = await dashboardApi.get();
        setDashboardData(data);
        localStorage.setItem('immeit_dash_cache', JSON.stringify({ ...data, _cachedAt: Date.now() }));
        setUpdateInfo('À l\'instant');
      } catch (e: any) {
        if (!dashboardData) setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Compute default dateStart (earliest deposit date) once data is loaded
  useEffect(() => {
    if (!dashboardData || dateStart) return;
    const h = dashboardData.synced?.headers || dashboardData.sharepoint?.headers || [];
    const it = dashboardData.synced?.items || dashboardData.sharepoint?.items || [];
    if (h.length === 0 || it.length === 0) return;
    const dateField = findHeader(h, "Date de dépôt du dossier sur docinfo");
    if (!dateField) return;
    let minTs = Infinity;
    for (const item of it) {
      const d = excelToDate(item[dateField]);
      if (d && d.getTime() < minTs) minTs = d.getTime();
    }
    if (minTs < Infinity) {
      const dd = new Date(minTs);
      const ds = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
      setDateStart(ds);
      setDefaultDateStart(ds);
    }
  }, [dashboardData, dateStart]);

  const refreshData = useCallback(async (silent = false) => {
    setRefreshLoading(true);
    // Instant feedback: show cached data immediately
    const cached = localStorage.getItem('immeit_dash_cache');
    if (cached) {
      try { setDashboardData(JSON.parse(cached)); } catch {}
    }
    try {
      const data = await dashboardApi.get();
      setDashboardData(data);
      localStorage.setItem('immeit_dash_cache', JSON.stringify({ ...data, _cachedAt: Date.now() }));
      setUpdateInfo('À l\'instant');
      if (!silent) showToast('Données actualisées', 'success');
    } catch (e: any) {
      if (!silent) showToast(e.message || 'Erreur lors de l\'actualisation', 'error');
    } finally {
      setRefreshLoading(false);
    }
  }, [setDashboardData, showToast]);

  const handleSync = async () => {
    setSyncLoading(true);
    showToast('Synchronisation lancée…', 'info');
    try {
      const result = await dashboardApi.sync();
      showToast(result.message || 'Synchronisation terminée', 'success');
      // Refresh after a short delay to let background sync finish
      setTimeout(async () => {
        try {
          const data = await dashboardApi.get();
          setDashboardData(data);
          localStorage.setItem('immeit_dash_cache', JSON.stringify({ ...data, _cachedAt: Date.now() }));
          setUpdateInfo('À l\'instant');
          showToast('Données mises à jour', 'success');
        } catch {}
      }, 5000);
    } catch (e: any) {
      showToast(e.message || 'Erreur de synchronisation', 'error');
    } finally {
      setSyncLoading(false);
    }
  };

  const synced = dashboardData?.synced;
  const headers = synced?.headers || dashboardData?.sharepoint?.headers || [];
  const items: Record<string, string>[] = synced?.items || dashboardData?.sharepoint?.items || [];

  const allStats = useMemo(() => items.length > 0 && headers.length > 0 ? computeStats(headers, items) : null, [headers, items]);

  const dateField = useMemo(() => headers.length > 0 ? findHeader(headers, "Date de dépôt du dossier sur docinfo") : '', [headers]);
  const statusField = useMemo(() => headers.length > 0 ? findHeader(headers, "Etat d'avance de la demande") : '', [headers]);
  const natureField = useMemo(() => headers.length > 0 ? findHeader(headers, 'Nature de la demande') : '', [headers]);
  const typeField = useMemo(() => headers.length > 0 ? findHeader(headers, 'Type de demande') : '', [headers]);
  const siteField = useMemo(() => headers.length > 0 ? findHeader(headers, 'Site') : '', [headers]);
  const demandeurField = useMemo(() => headers.length > 0 ? findHeader(headers, 'Demandeurs') : '', [headers]);
  const bancField = useMemo(() => headers.length > 0 ? findHeader(headers, 'N°(BE / GERICO / APEX)') : '', [headers]);
  const searchableFields = useMemo(() => headers.map(h => norm(h)).filter(h => h), [headers]);

  const tableHeaders = useMemo(() => ({
    date: headers.length > 0 ? findHeader(headers, 'Date de dépôt du dossier sur docinfo') : '',
    site: headers.length > 0 ? findHeader(headers, 'Site') : '',
    demandeur: headers.length > 0 ? findHeader(headers, 'Demandeurs') : '',
    avancement: headers.length > 0 ? findHeader(headers, "Etat d'avance de la demande") : '',
    nature: headers.length > 0 ? findHeader(headers, 'Nature de la demande') : '',
    banc: headers.length > 0 ? findHeader(headers, 'N°(BE / GERICO / APEX)') : '',
  }), [headers]);

  const dateStartMs = useMemo(() => dateStart ? new Date(dateStart).getTime() : 0, [dateStart]);
  const dateEndMs = useMemo(() => dateEnd ? new Date(dateEnd).getTime() + 86400000 : Infinity, [dateEnd]);
  const normFilterStatus = useMemo(() => filterStatus ? norm(filterStatus) : '', [filterStatus]);
  const normSearch = useMemo(() => filterSearch ? norm(filterSearch) : '', [filterSearch]);
  const normNature = useMemo(() => filterNature ? norm(filterNature) : '', [filterNature]);
  const normType = useMemo(() => filterType ? norm(filterType) : '', [filterType]);
  const normSite = useMemo(() => filterSite ? norm(filterSite) : '', [filterSite]);
  const normDemandeur = useMemo(() => filterDemandeur ? norm(filterDemandeur) : '', [filterDemandeur]);
  const normBanc = useMemo(() => filterBanc ? norm(filterBanc) : '', [filterBanc]);

  // Items filtrés par date + recherche + dimensions (sauf statut) — pour comptes dynamiques du dropdown
  const dateFilteredItems = useMemo(() => {
    let result = items;
    if (dateField) {
      result = result.filter(item => {
        const d = excelToDate(item[dateField]);
        if (!d) return true;
        const t = d.getTime();
        return t >= dateStartMs && t <= dateEndMs;
      });
    }
    if (normSearch) {
      result = result.filter(item =>
        searchableFields.some(f => norm(item[f] || '').includes(normSearch))
      );
    }
    if (normNature && natureField) {
      result = result.filter(item => norm(item[natureField] || '') === normNature);
    }
    if (normType && typeField) {
      result = result.filter(item => norm(item[typeField] || '') === normType);
    }
    if (normSite && siteField) {
      result = result.filter(item => norm(item[siteField] || '') === normSite);
    }
    if (normDemandeur && demandeurField) {
      result = result.filter(item => norm(item[demandeurField] || '') === normDemandeur);
    }
    if (normBanc && bancField) {
      result = result.filter(item => norm(item[bancField] || '') === normBanc);
    }
    return result;
  }, [items, dateField, dateStartMs, dateEndMs, normSearch, searchableFields, natureField, typeField, siteField, demandeurField, bancField, normNature, normType, normSite, normDemandeur, normBanc]);

  const dateFilteredStats = useMemo(() =>
    dateFilteredItems.length > 0 && headers.length > 0 ? computeStats(headers, dateFilteredItems) : null,
  [headers, dateFilteredItems]);

  const filteredItems = useMemo(() => items.filter(item => {
    if (normFilterStatus) {
      const val = (item[statusField] || '').trim();
      if (norm(val) !== normFilterStatus) return false;
    }
    if (normNature && natureField) {
      if (norm(item[natureField] || '') !== normNature) return false;
    }
    if (normType && typeField) {
      if (norm(item[typeField] || '') !== normType) return false;
    }
    if (normSite && siteField) {
      if (norm(item[siteField] || '') !== normSite) return false;
    }
    if (normDemandeur && demandeurField) {
      if (norm(item[demandeurField] || '') !== normDemandeur) return false;
    }
    if (normBanc && bancField) {
      if (norm(item[bancField] || '') !== normBanc) return false;
    }
    if (normSearch) {
      const match = searchableFields.some(f => norm(item[f] || '').includes(normSearch));
      if (!match) return false;
    }
    if (dateField) {
      const d = excelToDate(item[dateField]);
      if (d) {
        const t = d.getTime();
        if (t < dateStartMs || t > dateEndMs) return false;
      }
    }
    return true;
  }), [items, statusField, natureField, typeField, siteField, demandeurField, bancField, searchableFields, dateField, normFilterStatus, normNature, normType, normSite, normDemandeur, normBanc, normSearch, dateStartMs, dateEndMs]);

  const isFiltered = filterStatus !== '' || filterSearch !== '' || filterNature !== '' || filterType !== '' || filterSite !== '' || filterDemandeur !== '' || filterBanc !== '' || (dateStart !== '' && dateStart !== defaultDateStart);
  const stats = useMemo(() => filteredItems.length > 0 && headers.length > 0 ? computeStats(headers, filteredItems) : null, [headers, filteredItems]);
  const total = stats?.total || 0;

  const resetFilters = () => {
    setFilterStatus('');
    setFilterSearch('');
    setFilterNature('');
    setFilterType('');
    setFilterSite('');
    setFilterDemandeur('');
    setFilterBanc('');
    setDateStart(defaultDateStart);
    setDateEnd(new Date().toISOString().slice(0, 10));
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Tableau de bord IMMEIT</h1>
          <p className="text-xs text-gray-400 mt-0.5">{updateInfo}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => refreshData()}
            disabled={refreshLoading || syncLoading}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-all shadow-sm active:scale-95 ${refreshLoading ? 'bg-blue-50 border-blue-200 text-blue-600 cursor-wait' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'}`}
          >
            <svg className={refreshLoading ? 'animate-spin' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            {refreshLoading ? 'Actualisation…' : 'Actualiser'}
          </button>
          <button
            onClick={handleSync}
            disabled={syncLoading}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all shadow-sm active:scale-95 ${syncLoading ? 'bg-blue-400 cursor-wait animate-pulse' : 'bg-[#0A66C2] hover:bg-[#084a8f] hover:shadow-md'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            {syncLoading ? 'Sync…' : 'Sync'}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
        <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded text-xs" title="Date début" />
        <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value || new Date().toISOString().slice(0, 10))} className="px-2 py-1.5 border border-gray-200 rounded text-xs" title="Date fin" />
        {dateFilteredStats ? (
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded text-xs">
          <option value="">Tous les statuts</option>
          {dateFilteredStats.avancementDist.map(d => (
            <option key={d.label} value={d.label}>{d.label} ({d.count})</option>
          ))}
        </select>
        ) : null}
        <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Mot-clé…" className="px-2 py-1.5 border border-gray-200 rounded text-xs min-w-[180px]" />
        <button onClick={resetFilters} className={`ml-auto px-3 py-1.5 rounded-lg text-xs transition-colors ${isFiltered ? 'bg-[#DC2626] text-white hover:bg-[#B91C1C]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Filtres</button>
      </div>

      {/* Filtres chips */}
      {isFiltered ? (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {filterStatus ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
              {filterStatus}
              <button onClick={() => setFilterStatus('')} className="ml-0.5 hover:text-blue-900 font-bold">×</button>
            </span>
          ) : null}
          {filterNature ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-medium">
              {filterNature}
              <button onClick={() => setFilterNature('')} className="ml-0.5 hover:text-purple-900 font-bold">×</button>
            </span>
          ) : null}
          {filterType ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
              {filterType}
              <button onClick={() => setFilterType('')} className="ml-0.5 hover:text-amber-900 font-bold">×</button>
            </span>
          ) : null}
          {filterSite ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
              {filterSite}
              <button onClick={() => setFilterSite('')} className="ml-0.5 hover:text-green-900 font-bold">×</button>
            </span>
          ) : null}
          {filterDemandeur ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 rounded-full text-xs font-medium">
              {filterDemandeur}
              <button onClick={() => setFilterDemandeur('')} className="ml-0.5 hover:text-rose-900 font-bold">×</button>
            </span>
          ) : null}
          {filterBanc ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-cyan-50 text-cyan-700 rounded-full text-xs font-medium">
              {filterBanc}
              <button onClick={() => setFilterBanc('')} className="ml-0.5 hover:text-cyan-900 font-bold">×</button>
            </span>
          ) : null}
          {(dateStart && dateStart !== defaultDateStart) ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
              {dateStart.split('-').reverse().join('-')} → {dateEnd.split('-').reverse().join('-')}
              <button onClick={() => { setDateStart(defaultDateStart); setDateEnd(new Date().toISOString().slice(0, 10)); }} className="ml-0.5 hover:text-blue-900 font-bold">×</button>
            </span>
          ) : null}
        </div>
      ) : null}

      {loading ? <DashboardSkeleton /> : error && !dashboardData ? (
        <div className="text-center py-12">
          <p className="text-red-500 text-sm mb-3">{error}</p>
          <button onClick={() => refreshData()} className="px-4 py-2 bg-[#0A66C2] text-white rounded-lg text-sm">Réessayer</button>
        </div>
      ) : !allStats ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-5xl mb-3">🕐</div>
          <p className="text-sm">En attente de synchronisation</p>
        </div>
      ) : !stats ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">Aucun résultat pour les filtres sélectionnés</p>
          <button onClick={resetFilters} className="mt-3 px-4 py-2 bg-[#0A66C2] text-white rounded-lg text-sm">Réinitialiser les filtres</button>
        </div>
      ) : (
        <>
          {/* Health Score — intégré dans Insights ci-dessus */}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Total demandes', value: total, color: '#0A66C2' },
              { label: 'Conf. 1ère diffusion', value: `${stats.tauxConf1}%`, color: stats.tauxConf1 >= 80 ? '#10B981' : stats.tauxConf1 >= 60 ? '#F59E0B' : '#EF4444' },
              { label: 'Conf. vérification', value: `${stats.tauxConfDem}%`, color: stats.tauxConfDem >= 80 ? '#10B981' : stats.tauxConfDem >= 60 ? '#F59E0B' : '#EF4444' },
              { label: 'J+0', value: `${stats.duree.zeroPct}%`, color: stats.duree.zeroPct >= 90 ? '#10B981' : stats.duree.zeroPct >= 70 ? '#F59E0B' : '#EF4444' },
              { label: 'Écart moyen', value: `${Math.abs(stats.ecart.avg)}j`, color: stats.ecart.avg <= 0 ? '#10B981' : stats.ecart.avg <= 3 ? '#F59E0B' : '#EF4444' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
                <p className="text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Insights */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex gap-6">
              <div className="shrink-0">
                <HealthScoreGauge stats={stats} />
              </div>
              <div className="flex-1 space-y-1.5 self-center">
              {(() => {
                const mt = stats.monthlyTrend;
                if (mt.length === 0) return null;
                const last = mt[mt.length - 1];
                const now = new Date();
                const curMk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                const items: React.ReactElement[] = [];
                if (last.month === curMk && mt.length >= 2) {
                  const prev = mt[mt.length - 2];
                  const pct = prev.count > 0 ? Math.round(((last.count - prev.count) / prev.count) * 100) : 0;
                  const arrow = last.count > prev.count ? '\u2197' : last.count < prev.count ? '\u2198' : '\u2192';
                  items.push(<div key="cur" className="text-xs text-gray-600"><strong>{last.count}</strong> demandes sur les {now.getDate()} premiers jours de {fmtMonth(curMk)} — {arrow} {pct > 0 ? '+' : ''}{pct}% par rapport à {prev.count} sur la même période en {fmtMonth(prev.month)}</div>);
                } else if (mt.length >= 2) {
                  const pct = mt[mt.length - 2].count > 0 ? Math.round(((last.count - mt[mt.length - 2].count) / mt[mt.length - 2].count) * 100) : 0;
                  const arrow = last.count > mt[mt.length - 2].count ? '\u2197' : last.count < mt[mt.length - 2].count ? '\u2198' : '\u2192';
                  items.push(<div key="cur" className="text-xs text-gray-600"><strong>{last.count}</strong> demandes en {fmtMonth(last.month)} — {arrow} {pct > 0 ? '+' : ''}{pct}% par rapport à {mt[mt.length - 2].count} en {fmtMonth(mt[mt.length - 2].month)}</div>);
                }
                if (mt.length >= 3) {
                  const totalM = mt.reduce((s, m) => s + m.count, 0);
                  items.push(<div key="total" className="text-xs text-gray-600"><strong>{totalM}</strong> demandes sur {fmtMonth(mt[0].month)}–{fmtMonth(last.month)} — tendance {last.count > mt[0].count ? 'haussière' : last.count < mt[0].count ? 'baissière' : 'stable'} ({mt[0].count} → {last.count})</div>);
                }
                return items;
              })()}
          </div>
          </div>
        </div>

          {/* Avancement & Type */}
          {stats.avancementDist.length > 0 && stats.typeDist.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <CollapsibleSection title="État d'avancement">
                <BarChart data={stats.avancementDist} colorMap={statusColors} onFilterClick={label => setFilterStatus(label === filterStatus ? '' : label)} />
              </CollapsibleSection>
              <CollapsibleSection title="Type de demande">
                <DonutChart data={stats.typeDist.slice(0, 8)} colorMap={typeColors} onFilterClick={label => setFilterType(label === filterType ? '' : label)} />
              </CollapsibleSection>
            </div>
          ) : null}

          {/* Nature & Site */}
          {stats.natureDist.length > 0 || stats.siteDist.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {stats.natureDist.length > 0 && (
                <CollapsibleSection title="Nature">
                  <BarChart data={stats.natureDist.slice(0, 8)} colorMap={natureColors} onFilterClick={label => setFilterNature(label === filterNature ? '' : label)} />
                </CollapsibleSection>
              )}
              {stats.siteDist.length > 0 && (
                <CollapsibleSection title="Par site">
                  <DonutChart data={stats.siteDist.slice(0, 8)} colorMap={siteColors} onFilterClick={label => setFilterSite(label === filterSite ? '' : label)} />
                </CollapsibleSection>
              )}
            </div>
          ) : null}

          {/* Stockage */}
          {stats.stockageDist.length > 0 && stats.stockageAdvesoDist.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <CollapsibleSection title="Stockage DOCINFO">
                <BarChart data={stats.stockageDist.filter(d => d.count > 0 && d.label.trim())} colorMap={confColors} />
              </CollapsibleSection>
              <CollapsibleSection title="Stockage ADVESO">
                <BarChart data={stats.stockageAdvesoDist.filter(d => d.count > 0 && d.label.trim())} colorMap={confColors} />
              </CollapsibleSection>
            </div>
          ) : null}

          {/* Top demandeurs */}
          {stats.topDemandeurs.length > 0 ? (
            <CollapsibleSection title="Top 10 demandeurs" className="mb-6">
              <BarChart data={stats.topDemandeurs} onFilterClick={label => setFilterDemandeur(label === filterDemandeur ? '' : label)} />
            </CollapsibleSection>
          ) : null}

          {/* Évolution mensuelle */}
          {stats.monthlyTrend.length > 0 ? (
            <CollapsibleSection title="Évolution mensuelle" className="mb-6">
              <LineChart data={stats.monthlyTrend.map(m => ({ month: fmtMonth(m.month), count: m.count }))} />
            </CollapsibleSection>
          ) : null}

          {/* Data Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
              <h3 className="text-sm font-semibold text-gray-700">Données détaillées</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase tracking-wider text-[10px]">
                    <th className="text-left p-3 font-semibold">#</th>
                    <th className="text-left p-3 font-semibold">Dépôt</th>
                    <th className="text-left p-3 font-semibold max-md:hidden">Site</th>
                    <th className="text-left p-3 font-semibold max-md:hidden">Demandeur</th>
                    <th className="text-left p-3 font-semibold">N°</th>
                    <th className="text-left p-3 font-semibold">Nature</th>
                    <th className="text-left p-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.slice(0, 50).map((item: any, i: number) => {
                    const avancement = item[tableHeaders.avancement] || 'N/A';
                    const nature = item[tableHeaders.nature] || '';
                    const site = item[tableHeaders.site] || '';
                    const demandeur = item[tableHeaders.demandeur] || '';

                    function getColor(map: Record<string, string>, label: string): string {
                      const n = label.trim().toLowerCase();
                      for (const [k, v] of Object.entries(map)) {
                        if (k.trim().toLowerCase() === n) return v;
                      }
                      return '#6B7280';
                    }

                    return (
                      <tr key={i} className={`border-t border-gray-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-blue-50/40`}>
                        <td className="p-3 text-gray-400 font-mono text-[11px]">{item._row || i + 1}</td>
                        <td className="p-3 font-medium text-gray-700 text-[11px]">{fmtDate(item[tableHeaders.date])}</td>
                        <td className={`max-md:hidden`}>
                          {site ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer transition-all hover:ring-2 hover:ring-offset-1 ${
                              ['carrières','carriere'].some(s => site.toLowerCase().includes(s)) ? 'bg-orange-50 text-orange-700 hover:ring-orange-200' :
                              ['issy'].some(s => site.toLowerCase().includes(s)) ? 'bg-cyan-50 text-cyan-700 hover:ring-cyan-200' :
                              ['paris'].some(s => site.toLowerCase().includes(s)) ? 'bg-blue-50 text-blue-700 hover:ring-blue-200' :
                              ['lyon'].some(s => site.toLowerCase().includes(s)) ? 'bg-rose-50 text-rose-700 hover:ring-rose-200' :
                              'bg-gray-100 text-gray-600 hover:ring-gray-200'
                            }`}
                              onClick={() => setFilterSite(site === filterSite ? '' : site)}>{site}</span>
                          ) : <span className="p-3 text-gray-300">—</span>}
                        </td>
                        <td className={`max-md:hidden`}>
                          {demandeur ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-gray-600 bg-gray-100/80 cursor-pointer hover:bg-rose-100 hover:text-rose-700 transition-all"
                              onClick={() => setFilterDemandeur(demandeur === filterDemandeur ? '' : demandeur)}>{demandeur}</span>
                          ) : <span className="p-3 text-gray-300">—</span>}
                        </td>
                        <td className={`p-3`}>
                          {item[tableHeaders.banc] ? (
                            <span className="font-mono text-gray-500 text-[11px] cursor-pointer hover:text-cyan-700 transition-colors"
                              onClick={() => setFilterBanc(item[tableHeaders.banc] === filterBanc ? '' : item[tableHeaders.banc])}>{item[tableHeaders.banc]}</span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className={`p-3`}>
                          {nature ? (
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium cursor-pointer transition-all hover:ring-2 hover:ring-offset-1`}
                              style={{ backgroundColor: getColor(natureColors, nature) + '18', color: getColor(natureColors, nature) }}
                              onClick={() => setFilterNature(nature === filterNature ? '' : nature)}>
                              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: getColor(natureColors, nature) }}></span>
                              {nature}
                            </span>
                          ) : <span className="p-3 text-gray-300">—</span>}
                        </td>
                        <td className={`p-3 cursor-pointer`} onClick={() => setFilterStatus(avancement === filterStatus ? '' : avancement)}>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-all hover:ring-2 hover:ring-offset-1 ${
                            /termine|sold|clotur/i.test(avancement) ? 'bg-emerald-50 text-emerald-700 hover:ring-emerald-200' :
                            /en.cours|instruction/i.test(avancement) ? 'bg-amber-50 text-amber-700 hover:ring-amber-200' :
                            /nouvelle?|a.traiter|reouverte/i.test(avancement) ? 'bg-blue-50 text-blue-700 hover:ring-blue-200' :
                            /attente|suspend/i.test(avancement) ? 'bg-slate-100 text-slate-600 hover:ring-slate-200' :
                            /annul/i.test(avancement) ? 'bg-red-50 text-red-600 hover:ring-red-200' :
                            /valide/i.test(avancement) ? 'bg-teal-50 text-teal-700 hover:ring-teal-200' :
                            'bg-gray-100 text-gray-600 hover:ring-gray-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                              /termine|sold|clotur/i.test(avancement) ? 'bg-emerald-500' :
                              /en.cours|instruction/i.test(avancement) ? 'bg-amber-500' :
                              /nouvelle?|a.traiter|reouverte/i.test(avancement) ? 'bg-blue-500' :
                              /attente|suspend/i.test(avancement) ? 'bg-slate-400' :
                              /annul/i.test(avancement) ? 'bg-red-500' :
                              /valide/i.test(avancement) ? 'bg-teal-500' :
                              'bg-gray-400'
                            }`}></span>
                            {avancement}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredItems.length > 50 && (
                <div className="p-3 text-center text-xs text-gray-400 border-t border-gray-100">
                  Affichage de 50 lignes sur {filteredItems.length}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── sous-composants ── */

function CollapsibleSection({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`bg-white rounded-xl border border-gray-200 ${className}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-700">
        {title}
        <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && <div className="p-4 pt-0">{children}</div>}
    </div>
  );
}

function HealthScoreGauge({ stats }: { stats: any }) {
  const ecart = stats.ecart || { avg: 0 };
  const avgConf = Math.round((stats.tauxConf1 + stats.tauxConfDem) / 2);
  const score = Math.round((avgConf + stats.duree.zeroPct + (ecart.avg <= 0 ? 100 : Math.max(0, 100 - ecart.avg * 10))) / 3);
  const label = score >= 80 ? 'Bon' : score >= 55 ? 'Moyen' : 'À améliorer';
  return (
    <div className="flex items-center gap-4">
      <GaugeChart value={score} label={`Score: ${label}`} color={score >= 80 ? '#10B981' : score >= 55 ? '#F59E0B' : '#EF4444'} />
    </div>
  );
}

function GaugeChartLabeled({ title, data, colorMap }: { title: string; data: { label: string; count: number }[]; colorMap: Record<string, string> }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const yesEntry = data.find(d => /oui|conforme/i.test(d.label));
  const pct = yesEntry ? Math.round((yesEntry.count / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center">
      <h4 className="text-xs font-medium text-gray-600 mb-2">{title}</h4>
      <GaugeChart value={pct} label={`${pct}%`} color={pct >= 80 ? '#10B981' : pct >= 60 ? '#F59E0B' : '#EF4444'} />
    </div>
  );
}
