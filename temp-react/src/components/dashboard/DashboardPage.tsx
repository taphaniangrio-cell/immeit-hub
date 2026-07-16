import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../stores/appStore';
import { dashboardApi } from '../../lib/api';
import { useToast } from '../../hooks/useToast';
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

export function DashboardPage() {
  const { dashboardData, setDashboardData } = useStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [updateInfo, setUpdateInfo] = useState('Chargement...');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState(new Date().toISOString().slice(0, 10));
  const [defaultDateStart, setDefaultDateStart] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await dashboardApi.get();
      setDashboardData(data);
      localStorage.setItem('immeit_dash_cache', JSON.stringify({ ...data, _cachedAt: Date.now() }));
      setUpdateInfo('À l\'instant');
    } catch (e: any) {
      if (!silent) {
        const cached = localStorage.getItem('immeit_dash_cache');
        if (cached) {
          try {
            setDashboardData(JSON.parse(cached));
            setUpdateInfo('Données en cache');
          } catch {}
        }
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [setDashboardData]);

  useEffect(() => { loadData(); }, []);

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

  const handleSync = async () => {
    setSyncLoading(true);
    try {
      await dashboardApi.sync();
      showToast('Synchronisation réussie', 'success');
      setTimeout(() => loadData(), 1000);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSyncLoading(false);
    }
  };

  const synced = dashboardData?.synced;
  const headers = synced?.headers || dashboardData?.sharepoint?.headers || [];
  const items: Record<string, string>[] = synced?.items || dashboardData?.sharepoint?.items || [];
  const allStats = items.length > 0 && headers.length > 0 ? computeStats(headers, items) : null;

  const dateField = headers.length > 0 ? findHeader(headers, "Date de dépôt du dossier sur docinfo") : '';
  const statusField = headers.length > 0 ? findHeader(headers, "Etat d'avance de la demande") : '';
  const searchableFields = headers.map(h => norm(h)).filter(h => h);

  const filteredItems = items.filter(item => {
    if (filterStatus) {
      const val = (item[statusField] || '').trim();
      if (norm(val) !== norm(filterStatus)) return false;
    }
    if (filterSearch) {
      const q = norm(filterSearch);
      const match = searchableFields.some(f => norm(item[f] || '').includes(q));
      if (!match) return false;
    }
    if (dateStart) {
      const d = excelToDate(item[dateField]);
      if (d && d.getTime() < new Date(dateStart).getTime()) return false;
    }
    if (dateEnd) {
      const d = excelToDate(item[dateField]);
      if (d && d.getTime() > new Date(dateEnd).getTime() + 86400000) return false;
    }
    return true;
  });

  const isFiltered = filterStatus !== '' || filterSearch !== '' || (dateStart !== '' && dateStart !== defaultDateStart);
  const stats = filteredItems.length > 0 && headers.length > 0 ? computeStats(headers, filteredItems) : null;
  const total = stats?.total || 0;

  const resetFilters = () => {
    setFilterStatus('');
    setFilterSearch('');
    setDateStart(defaultDateStart);
    setDateEnd(new Date().toISOString().slice(0, 10));
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Rapports reçus pour vérification</h1>
          <p className="text-xs text-gray-400 mt-1">{updateInfo}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="px-2 py-1 border border-gray-200 rounded text-xs" title="Date début" />
          <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value || new Date().toISOString().slice(0, 10))} className="px-2 py-1 border border-gray-200 rounded text-xs" title="Date fin" />
          <button onClick={() => loadData()} className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs hover:bg-gray-200" title="Rafraîchir">↻</button>
          <button onClick={handleSync} disabled={syncLoading} className={`px-3 py-1.5 bg-[#0A66C2] text-white rounded-lg text-xs hover:bg-[#084a8f] ${syncLoading ? 'opacity-50 animate-pulse' : ''}`} title="Synchroniser">⇄</button>
          <button onClick={resetFilters} className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${isFiltered ? 'bg-[#DC2626] text-white hover:bg-[#B91C1C]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Filtres</button>
        </div>
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
          <button onClick={() => loadData()} className="px-4 py-2 bg-[#0A66C2] text-white rounded-lg text-sm">Réessayer</button>
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
          {/* Barre de filtres */}
          <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
            <span className="text-gray-500 font-medium">Statut</span>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded text-xs">
              <option value="">Tous les statuts</option>
              {allStats.avancementDist.map(d => (
                <option key={d.label} value={d.label}>{d.label} ({d.count})</option>
              ))}
            </select>
            <span className="text-gray-500 font-medium ml-1">Recherche</span>
            <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Mot-clé…" className="px-2 py-1.5 border border-gray-200 rounded text-xs min-w-[180px]" />
          </div>

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

        {/* Sections : Conformité */}
          {stats.conf1Dist.length > 0 || stats.confDemDist.length > 0 ? (
            <CollapsibleSection title="Conformité">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {stats.conf1Dist.length > 0 && (
                  <GaugeChartLabeled title="Conformité 1ère diffusion" data={stats.conf1Dist} colorMap={confColors} />
                )}
                {stats.confDemDist.length > 0 && (
                  <GaugeChartLabeled title="Conformité demande" data={stats.confDemDist} colorMap={confColors} />
                )}
              </div>
            </CollapsibleSection>
          ) : null}

          {/* Avancement & Type */}
          {stats.avancementDist.length > 0 && stats.typeDist.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <CollapsibleSection title="État d'avancement">
                <BarChart data={stats.avancementDist} colorMap={statusColors} />
              </CollapsibleSection>
              <CollapsibleSection title="Type de demande">
                <DonutChart data={stats.typeDist.slice(0, 8)} colorMap={typeColors} />
              </CollapsibleSection>
            </div>
          ) : null}

          {/* Nature & Site */}
          {stats.natureDist.length > 0 || stats.siteDist.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {stats.natureDist.length > 0 && (
                <CollapsibleSection title="Nature">
                  <BarChart data={stats.natureDist.slice(0, 8)} colorMap={natureColors} />
                </CollapsibleSection>
              )}
              {stats.siteDist.length > 0 && (
                <CollapsibleSection title="Par site">
                  <DonutChart data={stats.siteDist.slice(0, 8)} colorMap={siteColors} />
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
              <BarChart data={stats.topDemandeurs} />
            </CollapsibleSection>
          ) : null}

          {/* Évolution mensuelle */}
          {stats.monthlyTrend.length > 0 ? (
            <CollapsibleSection title="Évolution mensuelle" className="mb-6">
              <LineChart data={stats.monthlyTrend.map(m => ({ month: fmtMonth(m.month), count: m.count }))} />
            </CollapsibleSection>
          ) : null}

          {/* Data Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Données détaillées</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase">
                    <th className="text-left p-3 font-medium">#</th>
                    <th className="text-left p-3 font-medium">Dépôt</th>
                    <th className="text-left p-3 font-medium max-md:hidden">Site</th>
                    <th className="text-left p-3 font-medium max-md:hidden">Demandeur</th>
                    <th className="text-left p-3 font-medium">Avancement</th>
                    <th className="text-left p-3 font-medium max-md:hidden">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 50).map((item: any, i: number) => {
                    const avancement = item[findHeader(headers, "Etat d'avance de la demande")] || 'N/A';
                    return (
                      <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="p-3 text-gray-400">{i + 1}</td>
                        <td className="p-3 font-medium text-gray-700">{item[findHeader(headers, 'Date de dépôt du dossier sur docinfo')] || '—'}</td>
                        <td className="p-3 text-gray-500 max-md:hidden">{item[findHeader(headers, 'Site')] || '—'}</td>
                        <td className="p-3 text-gray-500 max-md:hidden">{item[findHeader(headers, 'Demandeurs')] || '—'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            /termine/i.test(avancement) ? 'bg-green-100 text-green-700' :
                            /en.cours/i.test(avancement) ? 'bg-yellow-100 text-yellow-700' :
                            /nouvelle?/i.test(avancement) ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {avancement}
                          </span>
                        </td>
                        <td className="p-3 text-gray-500 max-md:hidden">{item[findHeader(headers, 'Type de demande')] || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {items.length > 50 && (
                <div className="p-3 text-center text-xs text-gray-400 border-t border-gray-100">
                  Affichage de 50 lignes sur {items.length}
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
