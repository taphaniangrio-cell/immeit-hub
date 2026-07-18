import { useMemo } from 'react';
import { useStore } from '../../stores/appStore';
import { excelAllDates, findHeader, fmtDDMMYYYY, norm } from './DashboardPage';

export function InsightsPage({ setView }: { setView: (v: 'articles' | 'dashboard' | 'insights') => void }) {
  const { dashboardData } = useStore();

  const synced = dashboardData?.synced;
  const headers = synced?.headers || dashboardData?.sharepoint?.headers || [];
  const items: Record<string, string>[] = synced?.items || dashboardData?.sharepoint?.items || [];

  const dateField = useMemo(() => headers.length > 0 ? findHeader(headers, "Date de dépôt du dossier sur docinfo") : '', [headers]);
  const bancField = useMemo(() => headers.length > 0 ? findHeader(headers, 'N°(BE / GERICO / APEX)') : '', [headers]);
  const natureField = useMemo(() => headers.length > 0 ? findHeader(headers, 'Nature de la demande') : '', [headers]);
  const otField = useMemo(() => headers.length > 0 ? findHeader(headers, 'N°OT') : '', [headers]);
  const siteField = useMemo(() => headers.length > 0 ? findHeader(headers, 'Site') : '', [headers]);
  const statusField = useMemo(() => headers.length > 0 ? findHeader(headers, "Etat d'avance de la demande") : '', [headers]);

  const multiEntries = useMemo(() => {
    if (!dateField) return [];
    return items
      .map((it, ri) => {
        const raw = it[dateField] || '';
        const dates = excelAllDates(raw);
        if (dates.length <= 1) return null;
        const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
        const num = bancField ? (it[bancField] || '—') : '—';
        const nature = natureField ? (it[natureField] || '').replace(/\n/g, ' ').trim() : '';
        const ot = otField ? (it[otField] || '').trim() : '';
        const site = siteField ? (it[siteField] || '') : '';
        const status = statusField ? (it[statusField] || '') : '';
        return { row: ri, num, dates: sorted, nature, ot, site, status };
      })
      .filter(Boolean) as { row: number; num: string; dates: Date[]; nature: string; ot: string; site: string; status: string }[];
  }, [items, dateField, bancField, natureField, otField, siteField, statusField]);

  const totalRapports = items.length;
  const totalTraitements = useMemo(() => {
    if (!dateField) return 0;
    let c = 0;
    for (const item of items) { if (item[dateField]) c += excelAllDates(item[dateField]).length; }
    return c;
  }, [items, dateField]);

  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-gray-800">Détail des rapports reçus plusieurs fois</h1>
        <button onClick={() => setView('dashboard')}
          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors">
          ← Retour au tableau de bord
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <p className="text-sm text-gray-700 leading-relaxed">
          <strong>{totalRapports.toLocaleString()}</strong> rapports uniques au total.
          Parmi eux, <strong>{multiEntries.length}</strong> rapport{multiEntries.length > 1 ? 's' : ''} ont été
          déposés <strong>plusieurs fois</strong> (2 dates ou plus dans la cellule "Date de dépôt").
        </p>
        <p className="text-sm text-gray-700 leading-relaxed mt-1">
          Cela représente <strong>{totalTraitements.toLocaleString()}</strong> traitements individuels au total,
          soit <strong>{totalTraitements - totalRapports}</strong> dépôts supplémentaires par rapport au nombre de rapports uniques.
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Chaque ligne ci-dessous est un rapport qui a été soumis à plusieurs dates différentes.
          Le nombre de dates est indiqué entre parenthèses.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">{multiEntries.length} rapport{multiEntries.length > 1 ? 's' : ''} concerné{multiEntries.length > 1 ? 's' : ''}</h2>
          <span className="text-xs text-gray-400">Trié par nombre de dates décroissant</span>
        </div>
        <div className="divide-y divide-gray-50">
          {multiEntries.sort((a, b) => b.dates.length - a.dates.length || a.num.localeCompare(b.num, 'fr')).map((e, i) => (
            <div key={i} className="p-3 hover:bg-gray-50/50 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-sm font-semibold text-gray-800">{e.num}</span>
                  <span className="text-xs text-gray-400 ml-2">({e.dates.length} date{e.dates.length > 1 ? 's' : ''})</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {e.dates.map((d, di) => {
                      const key = fmtDDMMYYYY(d);
                      return (
                        <span key={di} className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-medium border border-indigo-100">
                          {fmt(d)}
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-gray-500">
                    {e.nature && <span>{e.nature}</span>}
                    {e.site && <span>• {e.site}</span>}
                    {e.status && <span>• {e.status}</span>}
                  </div>
                  {e.ot && e.ot !== '-' && (
                    <div className="mt-0.5 text-[10px] text-gray-400">OT: {e.ot}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {multiEntries.length === 0 && (
          <div className="p-8 text-center text-gray-400 text-sm">Aucun rapport reçu plusieurs fois.</div>
        )}
      </div>
    </div>
  );
}