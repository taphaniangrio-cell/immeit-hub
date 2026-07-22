import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useStore } from '../../stores/appStore';
import { dashboardApi } from '../../lib/api';
import { Skeleton } from '../ui/Skeleton';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { GaugeChart, BarChart, DonutChart, LineChart } from './Charts';
import { RefreshCw, RotateCw, Bell, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

/* ── helpers réutilisés de l'ancien app.js ── */

export function norm(s: string) {
  return s.trim().toLowerCase().normalize('NFC').replace(/\uFFFD/g, '').replace(/[\s/]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export function findHeader(headers: string[], hint: string) {
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
    let d: Date | null = null;
    if (v.includes('/')) {
      const parts = v.split('/');
      if (parts.length === 3) {
        const datePart = parts[2].split(/[\sT]+/)[0];
        const nums = [+parts[0], +parts[1], +Number(datePart)];
        if (nums[0] > 31) { d = new Date(nums[0], nums[1] - 1, nums[2]); }
        else { d = new Date(nums[2], nums[1] - 1, nums[0]); }
        if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;
        d = null;
      }
    }
    if (v.includes('-') || v.includes('.')) {
      const sep = v.includes('-') ? '-' : '.';
      const parts = v.split(sep);
      if (parts.length === 3) {
        const datePart = parts[2].split(/[\sT]+/)[0];
        const nums = [+parts[0], +parts[1], +Number(datePart)];
        if (nums.some(isNaN)) { d = null; }
        else if (nums[0] > 31) d = new Date(nums[0], nums[1] - 1, nums[2]);
        else d = new Date(nums[2], nums[1] - 1, nums[0]);
        if (d && (isNaN(d.getTime()) || d.getFullYear() < 2020)) d = null;
      }
    }
    if (!d) {
      const parsed = new Date(v);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) return parsed;
    }
  }
  return null;
}

export function excelAllDates(val: string): Date[] {
  if (!val) return [];
  const raw = String(val).replace(/\\[rn]+/g, '\n');
  const dates: Date[] = [];
  const candidates = raw.split(/[,;\n\r]+/);
  for (const c of candidates) {
    const v = c.trim().replace(/^["']+|["']+$/g, '');
    if (!v) continue;
    let d: Date | null = null;
    if (/^\d+(\.\d+)?$/.test(v)) {
      const serial = parseFloat(v);
      if (serial > 30000 && serial < 60000) {
        d = new Date(1899, 11, 30 + serial);
      }
      if (!d || isNaN(d.getTime()) || d.getFullYear() < 2020) d = null;
    } else {
      let parts: string[] = [];
      if (v.includes('/')) parts = v.split('/');
      else if (v.includes('-')) parts = v.split('-');
      else if (v.includes('.')) parts = v.split('.');
      if (parts.length === 3) {
        const nums = parts.map((p, i) => i === 2 ? Number(p.split(/[\sT]+/)[0]) : Number(p));
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
    if (d && !dates.some(x => x.getTime() === d!.getTime())) {
      dates.push(d);
    }
  }
  return dates;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function excelAllDatesInRange(val: string, startDk: string, endDk: string): Date[] {
  if (!startDk && !endDk) return excelAllDates(val);
  return excelAllDates(val).filter(d => {
    const dk = toDateKey(d);
    return dk >= startDk && dk <= endDk;
  });
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
    median: sorted.length % 2 === 0
      ? Math.round(((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) * 10) / 10
      : sorted[Math.floor(sorted.length / 2)],
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

function computeStats(headers: string[], items: Record<string, string>[], dateStartMs?: number, dateEndMs?: number) {
  const filterStartDk = dateStartMs !== undefined ? (() => { const d = new Date(dateStartMs); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })() : undefined;
  const filterEndDk = dateEndMs !== undefined ? (() => { const d = new Date(dateEndMs - 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })() : undefined;
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

  // Aliases SharePoint : variantes corrompues → forme canonique (normalisées)
  const TYPE_ALIASES: Record<string, string> = {
    'contrle des documents de maintenance': 'controle des documents de maintenance',
  };

  function normalizeKey(s: string) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\uFFFD/g, '').replace(/[\s\u00a0]+/g, ' ').trim();
  }

  function addGroup(slugMap: Record<string, number>, lMap: Record<string, string>, raw: string | undefined, aliases?: Record<string, string>) {
    const v = (raw || '').trim();
    if (!v) return;
    let gk = normalizeKey(v);
    gk = aliases?.[gk] || gk;
    slugMap[gk] = (slugMap[gk] || 0) + 1;
    const prev = lMap[gk];
    if (!prev || (v.indexOf('\uFFFD') < 0 && v.length >= prev.length)) lMap[gk] = v;
  }

  for (const it of items) {
    addGroup(groups.avancement, labelMap.avancement, it[f.avancement]);
    addGroup(groups.type, labelMap.type, it[f.type], TYPE_ALIASES);
    addGroup(groups.nature, labelMap.nature, it[f.nature]);
    addGroup(groups.site, labelMap.site, it[f.site]);

    const de = (it[f.demandeur] || '').trim();
    if (de) {
      const key = norm(de);
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
      const dates = excelAllDates(rd);
      const seenMonths = new Set<string>();
      for (const d of dates) {
        const dk = toDateKey(d);
        if (filterStartDk !== undefined && filterEndDk !== undefined) {
          if (dk < filterStartDk || dk > filterEndDk) continue;
        }
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!seenMonths.has(mk)) {
          seenMonths.add(mk);
          groups.monthly[mk] = (groups.monthly[mk] || 0) + 1;
        }
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

export function fmtDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function MultiSelect({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const filtered = search ? options.filter(o => o.toLowerCase().includes(search.toLowerCase())) : options;
  const allFilteredSelected = filtered.length > 0 && filtered.every(o => selected.includes(o));

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => { setOpen(!open); setSearch(''); }}
        className={cn(
          "text-[10px] font-normal border rounded-md px-1.5 py-0.5 w-full text-left cursor-pointer transition-colors truncate",
          selected.length > 0
            ? 'text-primary bg-primary-50 border-primary-200 font-medium'
            : 'text-text-muted bg-white border-border hover:border-gray-300 focus:border-primary focus:outline-none'
        )}>
        {selected.length === 0 ? `Toutes` : `${selected.length} sel.`}
      </button>
      {open && (
        <div className="fixed sm:absolute z-50 mt-1 bg-surface-elevated border border-border rounded-xl shadow-lg w-[calc(100vw-2rem)] sm:w-auto sm:min-w-[200px] max-h-[260px] flex flex-col left-2 sm:left-auto animate-slide-down" onClick={e => e.stopPropagation()}>
          {options.length > 8 && (
            <div className="p-2 border-b border-border-light">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
                className="w-full text-[10px] px-2 py-1 border border-border rounded-md focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" autoFocus />
            </div>
          )}
          <div className="flex items-center justify-between px-2 py-1 border-b border-border-light text-[10px]">
            <button type="button" onClick={() => onChange(allFilteredSelected ? selected.filter(s => !filtered.includes(s)) : [...new Set([...selected, ...filtered])])}
              className="text-primary hover:text-primary-dark font-medium">{allFilteredSelected ? 'Effacer' : 'Tout'}</button>
            <span className="text-text-muted">{selected.length}/{options.length}</span>
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.map(opt => (
              <label key={opt} className="flex items-center gap-1.5 px-2 py-[3px] hover:bg-surface-hover cursor-pointer text-[10px]">
                <input type="checkbox" checked={selected.includes(opt)}
                  onChange={() => onChange(selected.includes(opt) ? selected.filter(v => v !== opt) : [...selected, opt])}
                  className="rounded border-gray-300 text-primary focus:ring-primary/20" />
                <span className="truncate">{opt}</span>
              </label>
            ))}
            {filtered.length === 0 && <div className="px-2 py-2 text-[10px] text-text-muted text-center">Aucun résultat</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── composant principal ── */

export function DashboardPage({ showToast, setView }: { showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void; setView: (v: 'articles' | 'dashboard' | 'insights') => void }) {
  const { dashboardData, setDashboardData } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [updateInfo, setUpdateInfo] = useState('Chargement...');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState(new Date().toISOString().slice(0, 10));
  const [defaultDateStart, setDefaultDateStart] = useState('');
  const [defaultDateEnd, setDefaultDateEnd] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterNature, setFilterNature] = useState('');
  const [filterSite, setFilterSite] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDemandeur, setFilterDemandeur] = useState('');
  const [filterBanc, setFilterBanc] = useState<string[]>([]);
  const [filterDateDepot, setFilterDateDepot] = useState<string[]>([]);
  const [filterMonth, setFilterMonth] = useState('');
  const [tablePage, setTablePage] = useState(0);
  const userAdjustedDates = useRef(false);
  const PAGE_SIZE = 50;

  useEffect(() => { setTablePage(0); }, [filterStatus, filterSearch, filterNature, filterSite, filterType, filterDemandeur, filterBanc, filterDateDepot, filterMonth, dateStart, dateEnd]);

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

  // Compute default dateStart (earliest deposit date) whenever data changes
  useEffect(() => {
    if (!dashboardData || userAdjustedDates.current) return;
    const h = dashboardData.synced?.headers || dashboardData.sharepoint?.headers || [];
    const it = dashboardData.synced?.items || dashboardData.sharepoint?.items || [];
    if (h.length === 0 || it.length === 0) return;
    const df = findHeader(h, "Date de dépôt du dossier sur docinfo");
    if (!df) return;
    let minTs = Infinity;
    for (const item of it) {
      const dates = excelAllDates(item[df]);
      for (const d of dates) {
        if (d.getTime() < minTs) minTs = d.getTime();
      }
    }
    if (minTs < Infinity) {
      const dd = new Date(minTs);
      const ds = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
      setDateStart(ds);
      setDefaultDateStart(ds);
    }
    const today = new Date().toISOString().slice(0, 10);
    setDateEnd(today);
    setDefaultDateEnd(today);
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

  const now = new Date();
  const curMk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

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
  const filterStartDk = useMemo(() => dateStart ? (() => { const d = new Date(dateStart); return toDateKey(d); })() : '', [dateStart]);
  const filterEndDk = useMemo(() => dateEnd ? (() => { const d = new Date(dateEnd); return toDateKey(d); })() : '', [dateEnd]);
  const normFilterStatus = useMemo(() => filterStatus ? norm(filterStatus) : '', [filterStatus]);
  const normSearch = useMemo(() => filterSearch ? norm(filterSearch) : '', [filterSearch]);
  const normNature = useMemo(() => filterNature ? norm(filterNature) : '', [filterNature]);
  const normType = useMemo(() => filterType ? norm(filterType) : '', [filterType]);
  const normSite = useMemo(() => filterSite ? norm(filterSite) : '', [filterSite]);
  const normDemandeur = useMemo(() => filterDemandeur ? norm(filterDemandeur) : '', [filterDemandeur]);
  const normBanc = useMemo(() => filterBanc.map(v => norm(v)), [filterBanc]);

  // Items filtrés par date + recherche + dimensions (sauf statut) — pour comptes dynamiques du dropdown
  const dateFilteredItems = useMemo(() => {
    let result = items;
    if (dateField) {
      result = result.filter(item => {
        const raw = item[dateField];
        if (!raw || !raw.trim()) return false;
        const dates = excelAllDates(raw);
        if (dates.length === 0) return true;
        return dates.some(d => {
          const dk = toDateKey(d);
          return dk >= filterStartDk && dk <= filterEndDk;
        });
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
    if (normBanc.length > 0 && bancField) {
      result = result.filter(item => normBanc.includes(norm(item[bancField] || '')));
    }
    if (filterDateDepot.length > 0 && dateField) {
      result = result.filter(item => {
        const raw = item[dateField];
        if (!raw) return false;
        const dates = excelAllDates(raw);
        return dates.some(d => filterDateDepot.includes(fmtDDMMYYYY(d)));
      });
    }
    return result;
  }, [items, dateField, filterStartDk, filterEndDk, normSearch, searchableFields, natureField, typeField, siteField, demandeurField, bancField, normNature, normType, normSite, normDemandeur, normBanc, filterDateDepot]);

  // Items filtrés uniquement par la plage de dates + dates dépôt (sans filtres dimensions) — pour le "sur X" du texte
  const dateOnlyItems = useMemo(() => {
    if (!dateField) return items;
    return items.filter(item => {
      const raw = item[dateField];
      if (!raw || !raw.trim()) return false;
      const dates = excelAllDates(raw);
      if (dates.length === 0) return true;
      return dates.some(d => {
        const dk = toDateKey(d);
        if (dk < filterStartDk || dk > filterEndDk) return false;
        if (filterDateDepot.length > 0 && !filterDateDepot.includes(fmtDDMMYYYY(d))) return false;
        return true;
      });
    });
  }, [items, dateField, filterStartDk, filterEndDk, filterDateDepot]);

  const dateFilteredStats = useMemo(() =>
    dateFilteredItems.length > 0 && headers.length > 0 ? computeStats(headers, dateFilteredItems, dateStartMs, dateEndMs) : null,
  [headers, dateFilteredItems, dateStartMs, dateEndMs]);

  const columnOptions = useMemo(() => {
    const base = dateFilteredItems;
    const unique = (field: string): string[] => {
      if (!field) return [];
      const map = new Map<string, string>();
      base.forEach(item => {
        const val = (item[field] || '').trim();
        if (val) {
          const key = norm(val);
          const prev = map.get(key);
          if (!prev || val.length >= prev.length) map.set(key, val);
        }
      });
      return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'fr'));
    };
    const dateSet = new Set<string>();
    if (dateField) {
      base.forEach(item => {
        const raw = item[dateField];
        if (!raw) return;
        excelAllDates(raw).forEach(d => dateSet.add(fmtDDMMYYYY(d)));
      });
    }
    const dates = Array.from(dateSet).sort((a, b) => {
      const [da, ma, ya] = a.split('/').map(Number);
      const [db, mb, yb] = b.split('/').map(Number);
      return ya * 10000 + ma * 100 + da - (yb * 10000 + mb * 100 + db);
    });
    return {
      dates,
      site: unique(siteField),
      demandeur: unique(demandeurField),
      nature: unique(natureField),
      status: unique(statusField),
      banc: unique(bancField),
    };
  }, [dateFilteredItems, dateField]);

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
    if (normBanc.length > 0 && bancField) {
      if (!normBanc.includes(norm(item[bancField] || ''))) return false;
    }
    if (filterDateDepot.length > 0 && dateField) {
      const raw = item[dateField];
      if (!raw) return false;
      const dates = excelAllDates(raw);
      if (!dates.some(d => filterDateDepot.includes(fmtDDMMYYYY(d)))) return false;
    }
    if (normSearch) {
      const match = searchableFields.some(f => norm(item[f] || '').includes(normSearch));
      if (!match) return false;
    }
    if (filterMonth && dateField) {
      const raw = item[dateField];
      if (!raw) return false;
      const dates = excelAllDates(raw);
      if (!dates.some(d => {
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return mk === filterMonth;
      })) return false;
    }
    if (dateField) {
      const raw = item[dateField];
      if (!raw || !raw.trim()) return false;
      const dates = excelAllDates(raw);
      if (dates.length > 0 && !dates.some(d => {
        const dk = toDateKey(d);
        return dk >= filterStartDk && dk <= filterEndDk;
      })) return false;
    }
    return true;
  }), [items, statusField, natureField, typeField, siteField, demandeurField, bancField, searchableFields, dateField, normFilterStatus, normNature, normType, normSite, normDemandeur, normBanc, normSearch, filterStartDk, filterEndDk, filterDateDepot]);

  const isFiltered = filterStatus !== '' || filterSearch !== '' || filterNature !== '' || filterType !== '' || filterSite !== '' || filterDemandeur !== '' || filterBanc.length > 0 || filterDateDepot.length > 0 || filterMonth !== '' || (dateStart !== '' && dateStart !== defaultDateStart) || (dateEnd !== '' && dateEnd !== defaultDateEnd);
  const stats = useMemo(() => filteredItems.length > 0 && headers.length > 0 ? computeStats(headers, filteredItems, dateStartMs, dateEndMs) : null, [headers, filteredItems, dateStartMs, dateEndMs]);
  const total = stats?.total || 0;
  const totalTraitements = useMemo(() => {
    if (!dateField) return filteredItems.length;
    let c = 0;
    for (const item of filteredItems) {
      const raw = item[dateField];
      if (raw) c += excelAllDatesInRange(raw, filterStartDk, filterEndDk).length;
    }
    return c;
  }, [filteredItems, dateField, filterStartDk, filterEndDk]);

  const resetFilters = () => {
    setFilterStatus('');
    setFilterSearch('');
    setFilterNature('');
    setFilterType('');
    setFilterSite('');
    setFilterDemandeur('');
    setFilterBanc([]);
    setFilterDateDepot([]);
    setFilterMonth('');
    userAdjustedDates.current = false;
    setDateStart(defaultDateStart);
    setDateEnd(defaultDateEnd);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Tableau de bord IMMEIT</h1>
          <p className="text-xs text-text-muted mt-0.5">{updateInfo}</p>
        </div>
        <div className="flex items-center gap-2">
          {(() => {
            const dist = dateFilteredStats?.avancementDist || [];
            const solderCount = dist.filter((a: any) => /valid.e.*p2m.*solder|a solder/i.test(a.label)).reduce((s: number, a: any) => s + a.count, 0);
            return (
              <span
                className={cn(
                  "relative inline-flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-colors",
                  solderCount > 0 ? 'bg-danger-light text-danger animate-pulse' : 'bg-success-light text-success'
                )}
                title={solderCount > 0 ? `${solderCount} demande${solderCount > 1 ? 's' : ''} à solder` : 'Aucune demande à solder'}
              >
                <Bell size={16} />
                {solderCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                    {solderCount}
                  </span>
                )}
              </span>
            );
          })()}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refreshData()}
            disabled={refreshLoading || syncLoading}
            loading={refreshLoading}
          >
            <RefreshCw size={14} className={refreshLoading ? 'animate-spin' : ''} />
            {refreshLoading ? 'Actualisation…' : 'Actualiser'}
          </Button>
          <Button
            size="sm"
            onClick={handleSync}
            disabled={syncLoading}
            loading={syncLoading}
          >
            <RotateCw size={14} />
            {syncLoading ? 'Sync…' : 'Sync'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input type="date" value={dateStart} onChange={e => { userAdjustedDates.current = true; setDateStart(e.target.value); }}
            className="h-8 px-2.5 border border-border rounded-lg text-xs bg-white hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-colors" title="Date début" />
          <input type="date" value={dateEnd} onChange={e => { userAdjustedDates.current = true; setDateEnd(e.target.value || new Date().toISOString().slice(0, 10)); }}
            className="h-8 px-2.5 border border-border rounded-lg text-xs bg-white hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-colors" title="Date fin" />
          {dateFilteredStats ? (
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="h-8 px-2.5 border border-border rounded-lg text-xs bg-white hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-colors cursor-pointer">
              <option value="">Tous les statuts</option>
              {dateFilteredStats.avancementDist.map(d => (
                <option key={d.label} value={d.label}>{d.label} ({d.count})</option>
              ))}
            </select>
          ) : null}
          <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Mot-clé…"
            className="h-8 px-2.5 border border-border rounded-lg text-xs w-full sm:w-auto sm:min-w-[180px] bg-white placeholder:text-text-muted hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-colors" />
          <Button
            variant={isFiltered ? 'danger' : 'ghost'}
            size="sm"
            onClick={resetFilters}
            className="ml-auto"
          >
            {isFiltered ? <><X size={14} /> Effacer</> : 'Filtres'}
          </Button>
        </div>

        {/* Active filter chips */}
        {isFiltered && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-border-light">
            {filterStatus && (
              <FilterChip label={filterStatus} color="primary" onRemove={() => setFilterStatus('')} />
            )}
            {filterNature && (
              <FilterChip label={filterNature} color="primary" onRemove={() => setFilterNature('')} />
            )}
            {filterType && (
              <FilterChip label={filterType} color="primary" onRemove={() => setFilterType('')} />
            )}
            {filterSite && (
              <FilterChip label={filterSite} color="primary" onRemove={() => setFilterSite('')} />
            )}
            {filterDemandeur && (
              <FilterChip label={filterDemandeur} color="primary" onRemove={() => setFilterDemandeur('')} />
            )}
            {filterBanc.map(b => (
              <FilterChip key={b} label={b} color="primary" onRemove={() => setFilterBanc(filterBanc.filter(v => v !== b))} />
            ))}
            {filterDateDepot.map(d => (
              <FilterChip key={d} label={d} color="primary" onRemove={() => setFilterDateDepot(filterDateDepot.filter(v => v !== d))} />
            ))}
            {filterMonth && (
              <FilterChip label={`Mois: ${fmtMonth(filterMonth)}`} color="primary" onRemove={() => setFilterMonth('')} />
            )}
            {((dateStart && dateStart !== defaultDateStart) || (dateEnd && dateEnd !== defaultDateEnd)) && (
              <FilterChip
                label={`${dateStart.split('-').reverse().join('/')} → ${dateEnd.split('-').reverse().join('/')}`}
                color="primary"
                onRemove={() => { setDateStart(defaultDateStart); setDateEnd(defaultDateEnd); }}
              />
            )}
          </div>
        )}
      </Card>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-surface-elevated rounded-xl border border-border p-4">
              <Skeleton className="h-3 w-20 mb-3" />
              <Skeleton className="h-8 w-24 mb-2" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      ) : error && !dashboardData ? (
        <Card className="text-center py-12">
          <p className="text-danger text-sm mb-3">{error}</p>
          <Button onClick={() => refreshData()}>Réessayer</Button>
        </Card>
      ) : !allStats ? (
        <Card className="text-center py-12">
          <div className="text-text-muted mb-3"><Clock size={40} /></div>
          <p className="text-sm text-text-secondary">En attente de synchronisation</p>
        </Card>
      ) : !stats ? (
        <Card className="text-center py-12">
          <p className="text-sm text-text-secondary">Aucun résultat pour les filtres sélectionnés</p>
          <Button onClick={resetFilters} className="mt-3">Réinitialiser les filtres</Button>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
            {[
              { label: 'Total rapports', value: total, color: 'text-primary' },
              { label: 'Total traitements', value: totalTraitements, color: 'text-purple-600' },
              { label: 'Conf. 1ère diffusion', value: `${stats.tauxConf1}%`, color: stats.tauxConf1 >= 80 ? 'text-success' : stats.tauxConf1 >= 60 ? 'text-warning' : 'text-danger' },
              { label: 'Conf. vérification', value: `${stats.tauxConfDem}%`, color: stats.tauxConfDem >= 80 ? 'text-success' : stats.tauxConfDem >= 60 ? 'text-warning' : 'text-danger' },
              { label: 'J+0', value: `${stats.duree.zeroPct}%`, color: stats.duree.zeroPct >= 90 ? 'text-success' : stats.duree.zeroPct >= 70 ? 'text-warning' : 'text-danger' },
              { label: 'Écart moyen', value: `${stats.ecart.avg > 0 ? '+' : ''}${stats.ecart.avg}j`, color: stats.ecart.avg <= 0 ? 'text-success' : stats.ecart.avg <= 3 ? 'text-warning' : 'text-danger' },
            ].map(kpi => (
              <Card key={kpi.label} className="p-4 text-center">
                <p className="text-xs text-text-muted mb-1">{kpi.label}</p>
                <p className={cn("text-2xl font-bold", kpi.color)}>{kpi.value}</p>
              </Card>
            ))}
          </div>

          {/* Insights */}
          <Card className="p-5 mb-6">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="w-full md:w-[55%] shrink-0">
                {isFiltered && (
                  <div className="text-[10px] text-text-muted mb-1 pl-1">
                    {total.toLocaleString()} rapport{total > 1 ? 's' : ''} filtré{total > 1 ? 's' : ''} sur {dateOnlyItems.length.toLocaleString()}
                    {((dateStart && dateStart !== defaultDateStart) || (dateEnd && dateEnd !== defaultDateEnd)) && (
                      <span> — {dateStart.split('-').reverse().join('/')} → {dateEnd.split('-').reverse().join('/')}</span>
                    )}
                    {filterStatus && <span> — {filterStatus}</span>}
                    {filterSite && <span> — {filterSite}</span>}
                    {filterDemandeur && <span> — {filterDemandeur}</span>}
                    {filterType && <span> — {filterType}</span>}
                    {filterNature && <span> — {filterNature}</span>}
                  </div>
                )}
                {stats.monthlyTrend.length > 0 && (() => {
                  const completedOnly = stats.monthlyTrend.filter(m => m.month !== curMk);
                  const best = completedOnly.length > 0 ? completedOnly.reduce((a, b) => a.count > b.count ? a : b) : null;
                  const worst = completedOnly.length > 0 ? completedOnly.reduce((a, b) => a.count < b.count ? a : b) : null;
                  const maxLabel = best ? fmtMonth(best.month) : undefined;
                  const minLabel = worst && best && worst.month !== best.month ? fmtMonth(worst.month) : undefined;
                  const avgCompleted = completedOnly.length > 0 ? Math.round(completedOnly.reduce((s, m) => s + m.count, 0) / completedOnly.length) : undefined;
                  return <LineChart data={stats.monthlyTrend.map(m => ({ month: fmtMonth(m.month), count: m.count, key: m.month }))} maxMonth={maxLabel} minMonth={minLabel} average={avgCompleted} selectedMonth={filterMonth || undefined} onMonthClick={(mk) => setFilterMonth(prev => prev === mk ? '' : mk)} />;
                })()}
              </div>
              <div className="flex-1 space-y-3 pt-1">
              {(() => {
                const mt = stats.monthlyTrend;
                if (mt.length === 0) return null;
                const last = mt[mt.length - 1];
                const totalAll = dateOnlyItems.length;
                const items: React.ReactElement[] = [];

                if (isFiltered) {
                  const pct = totalAll > 0 ? Math.round((total / totalAll) * 100) : 0;
                  const filterLabel = filterStatus || filterSite || filterDemandeur || filterType || filterNature || '';
                  const isDateFiltered = (dateStart && dateStart !== defaultDateStart) || (dateEnd && dateEnd !== defaultDateEnd);
                  items.push(
                    <div key="filtered" className="flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-[5px]"></span>
                      <span className="text-xs text-text-secondary leading-relaxed">
                        <strong>{filterLabel}</strong> : {total.toLocaleString()} rapport{total > 1 ? 's' : ''}
                        <span className="text-text-muted"> ({pct}% des {totalAll.toLocaleString()} rapports{isDateFiltered ? ' en date' : ''})</span>
                      </span>
                    </div>
                  );
                  const crossItems: React.ReactElement[] = [];
                  if (!filterStatus && stats.avancementDist.length > 0) {
                    const top = stats.avancementDist[0];
                    const topPct = total > 0 ? Math.round((top.count / total) * 100) : 0;
                    crossItems.push(
                      <div key="cs" className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0 mt-[5px] bg-amber-500"></span>
                        <span className="text-xs text-gray-700 leading-relaxed">
                          Statut : <strong>{top.label}</strong> ({top.count}, {topPct}%)
                          {stats.avancementDist.length > 1 && <span className="text-gray-400"> — {stats.avancementDist.length} statuts au total</span>}
                        </span>
                      </div>
                    );
                  }
                  if (!filterSite && stats.siteDist.length > 0) {
                    const top = stats.siteDist[0];
                    const topPct = total > 0 ? Math.round((top.count / total) * 100) : 0;
                    crossItems.push(
                      <div key="ss" className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0 mt-[5px] bg-green-500"></span>
                        <span className="text-xs text-gray-700 leading-relaxed">
                          Site : <strong>{top.label}</strong> ({top.count}, {topPct}%)
                          {stats.siteDist.length > 1 && <span className="text-gray-400"> — {stats.siteDist.length} sites</span>}
                        </span>
                      </div>
                    );
                  }
                  if (!filterDemandeur && stats.topDemandeurs.length > 0) {
                    const top = stats.topDemandeurs[0];
                    const topPct = total > 0 ? Math.round((top.count / total) * 100) : 0;
                    crossItems.push(
                      <div key="sd" className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0 mt-[5px] bg-rose-500"></span>
                        <span className="text-xs text-gray-700 leading-relaxed">
                          Demandeur : <strong>{top.label}</strong> ({top.count}, {topPct}%)
                        </span>
                      </div>
                    );
                  }
                  if (!filterType && stats.typeDist.length > 0) {
                    const top = stats.typeDist[0];
                    const topPct = total > 0 ? Math.round((top.count / total) * 100) : 0;
                    crossItems.push(
                      <div key="st" className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0 mt-[5px] bg-purple-500"></span>
                        <span className="text-xs text-gray-700 leading-relaxed">
                          Type : <strong>{top.label}</strong> ({top.count}, {topPct}%)
                        </span>
                      </div>
                    );
                  }
                  if (!filterNature && stats.natureDist.length > 0) {
                    const top = stats.natureDist[0];
                    const topPct = total > 0 ? Math.round((top.count / total) * 100) : 0;
                    crossItems.push(
                      <div key="sn" className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0 mt-[5px] bg-teal-500"></span>
                        <span className="text-xs text-gray-700 leading-relaxed">
                          Nature : <strong>{top.label}</strong> ({top.count}, {topPct}%)
                        </span>
                      </div>
                    );
                  }
                   items.push(...crossItems.slice(0, 3));
                } else {
                  if (last.month === curMk && mt.length >= 2) {
                    const prev = mt[mt.length - 2];
                    const pct = prev.count > 0 ? Math.round(((last.count - prev.count) / prev.count) * 100) : 0;
                    const color = pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-red-500' : 'text-gray-500';
                    const dotColor = pct > 0 ? 'bg-emerald-500' : pct < 0 ? 'bg-red-500' : 'bg-gray-400';
                    const dayOfMonth = now.getDate();
                    const dailyRate = dayOfMonth > 0 ? Math.round(last.count / dayOfMonth * 10) / 10 : 0;
                    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                    const projected = Math.round(dailyRate * daysInMonth);
                    const shortMonth = fmtMonth(curMk).replace('20', "'");
                    items.push(
                      <div key="cur" className="flex items-start gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 mt-[5px] ${dotColor}`}></span>
                        <span className="text-xs text-gray-700 leading-relaxed">
                          <strong>{shortMonth} en cours : {last.count} rapports</strong> sur {dayOfMonth} jours
                          <span className={`ml-1 font-semibold ${color}`}>{pct > 0 ? '+' : ''}{pct}% vs {fmtMonth(prev.month).replace('20', "'")}</span>
                        </span>
                      </div>
                    );
                    items.push(
                      <div key="proj" className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0 mt-[5px] bg-violet-500"></span>
                        <span className="text-xs text-gray-700 leading-relaxed">
                          Projection fin {shortMonth} : <strong>{projected} rapports</strong>
                          <span className="text-gray-400"> (rythme actuel : {dailyRate}/jour)</span>
                        </span>
                      </div>
                    );
                  } else if (mt.length >= 2) {
                    const prev = mt[mt.length - 2];
                    const pct = prev.count > 0 ? Math.round(((last.count - prev.count) / prev.count) * 100) : 0;
                    const color = pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-red-500' : 'text-gray-500';
                    const dotColor = pct > 0 ? 'bg-emerald-500' : pct < 0 ? 'bg-red-500' : 'bg-gray-400';
                    items.push(
                      <div key="cur" className="flex items-start gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 mt-[5px] ${dotColor}`}></span>
                        <span className="text-xs text-gray-700 leading-relaxed">
                          <strong>{fmtMonth(last.month).replace('20', "'")} : {last.count} rapports</strong>
                          <span className={`ml-1 font-semibold ${color}`}>{pct > 0 ? '+' : ''}{pct}% vs {fmtMonth(prev.month).replace('20', "'")}</span>
                        </span>
                      </div>
                    );
                  }
                   const completedMonths = mt.filter(m => m.month !== curMk);
                   const crossItemsAll: React.ReactElement[] = [];
                   if (stats.avancementDist.length > 0) {
                     const top = stats.avancementDist[0];
                     const topPct = total > 0 ? Math.round((top.count / total) * 100) : 0;
                     crossItemsAll.push(
                       <div key="cs2" className="flex items-start gap-2">
                         <span className="w-2 h-2 rounded-full shrink-0 mt-[5px] bg-amber-500"></span>
                         <span className="text-xs text-gray-700 leading-relaxed">
                           Statut : <strong>{top.label}</strong> ({top.count}, {topPct}%)
                           {stats.avancementDist.length > 1 && <span className="text-gray-400"> — {stats.avancementDist.length} statuts au total</span>}
                         </span>
                       </div>
                     );
                   }
                   if (stats.siteDist.length > 0) {
                     const top = stats.siteDist[0];
                     const topPct = total > 0 ? Math.round((top.count / total) * 100) : 0;
                     crossItemsAll.push(
                       <div key="ss2" className="flex items-start gap-2">
                         <span className="w-2 h-2 rounded-full shrink-0 mt-[5px] bg-green-500"></span>
                         <span className="text-xs text-gray-700 leading-relaxed">
                           Site : <strong>{top.label}</strong> ({top.count}, {topPct}%)
                           {stats.siteDist.length > 1 && <span className="text-gray-400"> — {stats.siteDist.length} sites</span>}
                         </span>
                       </div>
                     );
                   }
                   if (stats.topDemandeurs.length > 0) {
                     const top = stats.topDemandeurs[0];
                     const topPct = total > 0 ? Math.round((top.count / total) * 100) : 0;
                     crossItemsAll.push(
                       <div key="sd2" className="flex items-start gap-2">
                         <span className="w-2 h-2 rounded-full shrink-0 mt-[5px] bg-rose-500"></span>
                         <span className="text-xs text-gray-700 leading-relaxed">
                           Demandeur : <strong>{top.label}</strong> ({top.count}, {topPct}%)
                         </span>
                       </div>
                     );
                   }
                    items.push(...crossItemsAll.slice(0, 3));
                }
                if (dateField) {
                  const multiDates = filteredItems.filter(it => {
                    const dates = excelAllDatesInRange(it[dateField] || '', filterStartDk, filterEndDk);
                    return dates.length > 1;
                  });
                  if (multiDates.length > 0) {
                    const totalExtra = multiDates.reduce((s, it) => s + excelAllDatesInRange(it[dateField] || '', filterStartDk, filterEndDk).length - 1, 0);
                    items.push(
                      <div key="resub" className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0 mt-[5px] bg-indigo-500"></span>
                        <div className="text-xs text-gray-700 leading-relaxed">
                          <strong>{multiDates.length}</strong> rapport{multiDates.length > 1 ? 's' : ''} reçu{multiDates.length > 1 ? 's' : ''} plusieurs fois
                          <span className="text-gray-400"> ({total + totalExtra} traitements au total, soit {totalExtra} de plus que de rapports uniques)</span>
                          {' — '}<button onClick={() => {
                            const p = new URLSearchParams();
                            if (filterStatus) p.set('status', filterStatus);
                            if (filterSite) p.set('site', filterSite);
                            if (filterDemandeur) p.set('demandeur', filterDemandeur);
                            if (filterType) p.set('type', filterType);
                            if (filterNature) p.set('nature', filterNature);
                            if (filterSearch) p.set('search', filterSearch);
                            if (dateStart && dateStart !== defaultDateStart) p.set('dateStart', dateStart);
                            if (dateEnd) p.set('dateEnd', dateEnd);
                            window.open('/multi-dates-details' + (p.toString() ? '?' + p.toString() : ''), '_blank');
                          }} className="text-indigo-600 hover:text-indigo-800 underline cursor-pointer">Détails</button>
                        </div>
                      </div>
                    );
                  }
                }
                return items;
              })()}
          </div>
          </div>
        </Card>

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

          {/* Data Table */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border-light">
              <h3 className="text-sm font-semibold text-text-primary">Données détaillées</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface text-text-muted text-[10px]">
                    <th className="text-left p-2.5 font-semibold w-8 align-top">#</th>
                    <th className="text-left p-2.5 font-semibold align-top">
                      <div className="flex items-center gap-1 mb-1">
                        <span>Dépôt</span>
                        <MultiSelect label="Dates" options={columnOptions.dates} selected={filterDateDepot} onChange={setFilterDateDepot} />
                      </div>
                    </th>
                    <th className="text-left p-2.5 font-semibold max-md:hidden align-top">
                      <div className="flex items-center gap-1 mb-1">
                        <span>Site</span>
                        <select value={filterSite} onChange={e => setFilterSite(e.target.value)}
                          className="text-[10px] font-normal text-text-secondary bg-white border border-border rounded-md px-1 py-0.5 cursor-pointer hover:border-gray-300 focus:border-primary focus:outline-none max-w-[100px]">
                          <option value="">Tous</option>
                          {columnOptions.site.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </th>
                    <th className="text-left p-2.5 font-semibold max-md:hidden align-top">
                      <div className="flex items-center gap-1 mb-1">
                        <span>Demand.</span>
                        <select value={filterDemandeur} onChange={e => setFilterDemandeur(e.target.value)}
                          className="text-[10px] font-normal text-text-secondary bg-white border border-border rounded-md px-1 py-0.5 cursor-pointer hover:border-gray-300 focus:border-primary focus:outline-none max-w-[100px]">
                          <option value="">Tous</option>
                          {columnOptions.demandeur.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </th>
                    <th className="text-left p-2.5 font-semibold align-top">
                      <div className="flex items-center gap-1 mb-1">
                        <span>N°</span>
                        <MultiSelect label="N°" options={columnOptions.banc} selected={filterBanc} onChange={setFilterBanc} />
                      </div>
                    </th>
                    <th className="text-left p-2.5 font-semibold align-top">
                      <div className="flex items-center gap-1 mb-1">
                        <span>Nature</span>
                        <select value={filterNature} onChange={e => setFilterNature(e.target.value)}
                          className="text-[10px] font-normal text-text-secondary bg-white border border-border rounded-md px-1 py-0.5 cursor-pointer hover:border-gray-300 focus:border-primary focus:outline-none max-w-[110px]">
                          <option value="">Toutes</option>
                          {columnOptions.nature.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </th>
                    <th className="text-left p-2.5 font-semibold align-top">
                      <div className="flex items-center gap-1 mb-1">
                        <span>Status</span>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                          className="text-[10px] font-normal text-text-secondary bg-white border border-border rounded-md px-1 py-0.5 cursor-pointer hover:border-gray-300 focus:border-primary focus:outline-none max-w-[110px]">
                          <option value="">Tous</option>
                          {columnOptions.status.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE).map((item: any, i: number) => {
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
                      <tr key={i} className={cn(
                        "border-t border-border-light transition-colors",
                        i % 2 === 0 ? 'bg-white' : 'bg-surface/50',
                        'hover:bg-primary-50/40'
                      )}>
                        <td className="p-3 text-text-muted font-mono text-[11px]">{item._row || i + 1}</td>
                        <td className="p-3 font-medium text-text-primary text-[11px]">
                          {(() => {
                            const raw = item[tableHeaders.date];
                            if (!raw) return <span className="text-text-muted">—</span>;
                            const dates = excelAllDates(raw);
                            return dates.map((d, di) => {
                              const dd = String(d.getDate()).padStart(2, '0');
                              const mm = String(d.getMonth() + 1).padStart(2, '0');
                              const yyyy = d.getFullYear();
                              const key = `${dd}/${mm}/${yyyy}`;
                              const active = filterDateDepot.includes(key);
                              return (
                                <button key={di} onClick={() => setFilterDateDepot(active ? filterDateDepot.filter(v => v !== key) : [...filterDateDepot, key])}
                                  className={cn(
                                    "inline-block mr-1 mb-0.5 px-1.5 py-[1px] rounded text-[10px] font-medium border transition-all cursor-pointer",
                                    active
                                      ? 'bg-primary-50 text-primary border-primary-200 ring-1 ring-primary-200'
                                      : 'bg-white text-text-secondary border-border hover:border-primary/30 hover:text-primary'
                                  )}>{key}</button>
                              );
                            });
                          })()}
                        </td>
                        <td className="max-md:hidden">
                          {site ? (
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer transition-all hover:ring-2 hover:ring-offset-1",
                              ['carrières','carriere'].some(s => site.toLowerCase().includes(s)) ? 'bg-orange-50 text-orange-700 hover:ring-orange-200' :
                              ['issy'].some(s => site.toLowerCase().includes(s)) ? 'bg-cyan-50 text-cyan-700 hover:ring-cyan-200' :
                              ['paris'].some(s => site.toLowerCase().includes(s)) ? 'bg-blue-50 text-blue-700 hover:ring-blue-200' :
                              ['lyon'].some(s => site.toLowerCase().includes(s)) ? 'bg-rose-50 text-rose-700 hover:ring-rose-200' :
                              'bg-surface-hover text-text-secondary hover:ring-gray-200'
                            )}
                              onClick={() => setFilterSite(site === filterSite ? '' : site)}>{site}</span>
                          ) : <span className="text-text-muted">—</span>}
                        </td>
                        <td className="max-md:hidden">
                          {demandeur ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-text-secondary bg-surface-hover cursor-pointer hover:bg-rose-100 hover:text-rose-700 transition-all"
                              onClick={() => setFilterDemandeur(demandeur === filterDemandeur ? '' : demandeur)}>{demandeur}</span>
                          ) : <span className="text-text-muted">—</span>}
                        </td>
                        <td className="p-3">
                          {item[tableHeaders.banc] ? (
                            <span className="font-mono text-text-secondary text-[11px] cursor-pointer hover:text-primary transition-colors"
                              onClick={() => setFilterBanc(filterBanc.includes(item[tableHeaders.banc]) ? filterBanc.filter(v => v !== item[tableHeaders.banc]) : [...filterBanc, item[tableHeaders.banc]])}>{item[tableHeaders.banc]}</span>
                          ) : <span className="text-text-muted">—</span>}
                        </td>
                        <td className="p-3">
                          {nature ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium cursor-pointer transition-all hover:ring-2 hover:ring-offset-1"
                              style={{ backgroundColor: getColor(natureColors, nature) + '18', color: getColor(natureColors, nature) }}
                              onClick={() => setFilterNature(nature === filterNature ? '' : nature)}>
                              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: getColor(natureColors, nature) }}></span>
                              {nature}
                            </span>
                          ) : <span className="text-text-muted">—</span>}
                        </td>
                        <td className="p-3 cursor-pointer" onClick={() => setFilterStatus(avancement === filterStatus ? '' : avancement)}>
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-all hover:ring-2 hover:ring-offset-1",
                            /termine|sold|clotur/i.test(avancement) ? 'bg-success-light text-emerald-700 hover:ring-emerald-200' :
                            /en.cours|instruction/i.test(avancement) ? 'bg-warning-light text-amber-700 hover:ring-amber-200' :
                            /nouvelle?|a.traiter|reouverte/i.test(avancement) ? 'bg-primary-50 text-primary hover:ring-primary-200' :
                            /attente|suspend/i.test(avancement) ? 'bg-surface-hover text-text-secondary hover:ring-gray-200' :
                            /annul/i.test(avancement) ? 'bg-danger-light text-red-600 hover:ring-red-200' :
                            /valide/i.test(avancement) ? 'bg-teal-50 text-teal-700 hover:ring-teal-200' :
                            'bg-surface-hover text-text-secondary hover:ring-gray-200'
                          )}>
                            <span className={cn(
                              "w-1.5 h-1.5 rounded-full inline-block",
                              /termine|sold|clotur/i.test(avancement) ? 'bg-success' :
                              /en.cours|instruction/i.test(avancement) ? 'bg-warning' :
                              /nouvelle?|a.traiter|reouverte/i.test(avancement) ? 'bg-primary' :
                              /attente|suspend/i.test(avancement) ? 'bg-text-muted' :
                              /annul/i.test(avancement) ? 'bg-danger' :
                              /valide/i.test(avancement) ? 'bg-teal-500' :
                              'bg-text-muted'
                            )}></span>
                            {avancement}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredItems.length > PAGE_SIZE && (
                <div className="px-5 py-3 flex items-center justify-between text-xs text-text-muted border-t border-border-light">
                  <span>
                    {tablePage * PAGE_SIZE + 1}–{Math.min((tablePage + 1) * PAGE_SIZE, filteredItems.length)} sur {filteredItems.length.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={tablePage === 0}
                      onClick={() => setTablePage(0)}
                      className="p-1.5 rounded-md border border-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-hover transition-colors cursor-pointer"
                    ><ChevronsLeft size={14} /></button>
                    <button
                      disabled={tablePage === 0}
                      onClick={() => setTablePage(p => p - 1)}
                      className="p-1.5 rounded-md border border-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-hover transition-colors cursor-pointer"
                    ><ChevronLeft size={14} /></button>
                    <span className="px-2 py-1 text-text-primary font-medium">
                      {tablePage + 1} / {Math.ceil(filteredItems.length / PAGE_SIZE)}
                    </span>
                    <button
                      disabled={(tablePage + 1) * PAGE_SIZE >= filteredItems.length}
                      onClick={() => setTablePage(p => p + 1)}
                      className="p-1.5 rounded-md border border-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-hover transition-colors cursor-pointer"
                    ><ChevronRight size={14} /></button>
                    <button
                      disabled={(tablePage + 1) * PAGE_SIZE >= filteredItems.length}
                      onClick={() => setTablePage(Math.ceil(filteredItems.length / PAGE_SIZE) - 1)}
                      className="p-1.5 rounded-md border border-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-hover transition-colors cursor-pointer"
                    ><ChevronsRight size={14} /></button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ── sous-composants ── */

function CollapsibleSection({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <Card className={className}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 text-sm font-semibold text-text-primary cursor-pointer hover:bg-surface-hover rounded-xl transition-colors">
        {title}
        <ChevronDown size={16} className={cn("text-text-muted transition-transform", open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </Card>
  );
}

function FilterChip({ label, color, onRemove }: { label: string; color: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary rounded-full text-xs font-medium">
      {label}
      <button onClick={onRemove} className="ml-0.5 hover:text-primary-dark cursor-pointer"><X size={12} /></button>
    </span>
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
