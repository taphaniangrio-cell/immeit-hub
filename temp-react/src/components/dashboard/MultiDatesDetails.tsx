import { useState, useEffect, useMemo } from 'react';

interface MultiDateItem {
  num: string;
  dates: string[];
  nature: string;
  ot: string;
  site: string;
  status: string;
  demandeur: string;
  type: string;
  dateCount: number;
}

interface ApiResponse {
  items: MultiDateItem[];
  total: number;
  totalFiltered: number;
  totalDates: number;
  totalExtra: number;
  error?: string;
}

const fadeStyle = `
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes countUp {
    from { opacity: 0; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1); }
  }
  .fade-up { animation: fadeSlideUp 0.45s cubic-bezier(0.22,1,0.36,1) forwards; opacity: 0; }
  .fade-up-d1 { animation-delay: 0.08s; }
  .fade-up-d2 { animation-delay: 0.16s; }
  .fade-up-d3 { animation-delay: 0.24s; }
  .fade-up-d4 { animation-delay: 0.32s; }
  .count-pop { animation: countUp 0.4s cubic-bezier(0.22,1,0.36,1) forwards; opacity: 0; }
  .count-pop-d1 { animation-delay: 0.15s; }
  .count-pop-d2 { animation-delay: 0.25s; }
  .count-pop-d3 { animation-delay: 0.35s; }
  .card-hover { transition: all 0.2s ease; }
  .card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 25px -5px rgba(0,0,0,0.08); }
`;

function fmt(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function getFilterLabel(params: URLSearchParams) {
  const parts: string[] = [];
  if (params.get('status')) parts.push(params.get('status')!);
  if (params.get('site')) parts.push(params.get('site')!);
  if (params.get('demandeur')) parts.push(params.get('demandeur')!);
  if (params.get('type')) parts.push(params.get('type')!);
  if (params.get('nature')) parts.push(params.get('nature')!);
  if (params.get('search')) parts.push(`"${params.get('search')}"`);
  const ds = params.get('dateStart');
  const de = params.get('dateEnd');
  if (ds || de) {
    const start = ds ? fmt(ds) : 'Début';
    const end = de ? fmt(de) : 'Maintenant';
    parts.push(`${start} → ${end}`);
  }
  return parts.join(' · ') || 'Tous les rapports';
}

const natureColor: Record<string, string> = {
  'Métrologique Préventive': 'bg-blue-50 text-blue-700 border-blue-200',
  'Métrologique': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Préventive Réglementaire': 'bg-amber-50 text-amber-700 border-amber-200',
  'Préventive': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Réglementaire': 'bg-orange-50 text-orange-700 border-orange-200',
};

const statusColor: Record<string, string> = {
  'Soldée par IMMEIT': 'bg-green-50 text-green-700 border-green-200',
  'En cours': 'bg-blue-50 text-blue-700 border-blue-200',
  'En attente': 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function MultiDatesDetails() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const filterLabel = useMemo(() => getFilterLabel(params), [params]);

  useEffect(() => {
    const qs = params.toString();
    fetch(`/api/multi-dates${qs ? '?' + qs : ''}`)
      .then(r => r.json())
      .then((json: ApiResponse) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [params]);

  const byCount = useMemo(() => {
    if (!data) return [];
    const map: Record<number, { count: number; dates: number; extra: number }> = {};
    for (const it of data.items) {
      const n = it.dateCount;
      if (!map[n]) map[n] = { count: 0, dates: 0, extra: 0 };
      map[n].count++;
      map[n].dates += n;
      map[n].extra += n - 1;
    }
    return Object.entries(map)
      .map(([k, v]) => ({ nDates: Number(k), ...v }))
      .sort((a, b) => a.nDates - b.nDates);
  }, [data]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <style>{fadeStyle}</style>
      <div className="max-w-5xl mx-auto p-4 md:p-6">

        <div className="flex items-center justify-between mb-6 fade-up">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Rapports reçus plusieurs fois</h1>
            <p className="text-xs text-gray-400 mt-1 font-medium">{filterLabel}</p>
          </div>
          <button
            onClick={() => { window.opener ? window.close() : window.location.href = '/'; }}
            className="group flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:border-gray-300 hover:bg-gray-50 transition-all shadow-sm"
          >
            <span className="group-hover:-translate-x-0.5 transition-transform">←</span> Retour
          </button>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
            <div className="animate-spin w-8 h-8 border-2 border-[#0A66C2] border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-sm text-gray-500 font-medium">Chargement des données...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 rounded-2xl border border-red-200 p-6 text-center">
            <p className="text-sm text-red-600 font-medium">{error}</p>
          </div>
        )}

        {data && !loading && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm card-hover count-pop">
                <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Rapports filtrés</div>
                <div className="text-2xl font-bold text-gray-900">{data.totalFiltered.toLocaleString()}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">sur {data.total.toLocaleString()} au total</div>
              </div>
              <div className="bg-white rounded-2xl border border-indigo-200 p-4 shadow-sm card-hover count-pop count-pop-d1">
                <div className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold mb-1">Rapports multi-dépôts</div>
                <div className="text-2xl font-bold text-indigo-600">{data.items.length}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">reçus {byCount.map(r => `${r.count}×${r.nDates}x`).join(' + ')}</div>
              </div>
              <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-sm card-hover count-pop count-pop-d2">
                <div className="text-[10px] uppercase tracking-wider text-amber-500 font-semibold mb-1">Traitements au total</div>
                <div className="text-2xl font-bold text-amber-600">{data.totalDates.toLocaleString()}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">+{data.totalExtra} dépôts en plus</div>
              </div>
            </div>

            {byCount.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 shadow-sm fade-up fade-up-d1">
                <h2 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-4">Décomposition par nombre de dates</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left pb-3 pr-4 font-semibold">Reçu X fois</th>
                        <th className="text-right pb-3 px-4 font-semibold">Rapports</th>
                        <th className="text-right pb-3 px-4 font-semibold">Traitements</th>
                        <th className="text-right pb-3 px-4 font-semibold">+ Dépôts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byCount.map(r => (
                        <tr key={r.nDates} className="border-t border-gray-100">
                          <td className="py-3 pr-4">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-sm">{r.nDates}×</span>
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-gray-800">{r.count}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{r.count} × {r.nDates} = <span className="font-bold text-gray-800">{r.dates.toLocaleString()}</span></td>
                          <td className="py-3 px-4 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold text-[11px]">+{r.extra}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200">
                        <td className="pt-3 pr-4 font-bold text-gray-800">Total</td>
                        <td className="pt-3 px-4 text-right font-bold text-gray-800">{data.items.length}</td>
                        <td className="pt-3 px-4 text-right text-gray-600">{data.totalFiltered.toLocaleString()} + {data.totalExtra} = <span className="font-bold text-gray-800">{data.totalDates.toLocaleString()}</span></td>
                        <td className="pt-3 px-4 text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold text-[11px]">+{data.totalExtra}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm fade-up fade-up-d2">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <span className="text-indigo-600 font-bold text-lg">{data.items.length}</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-800">
                      Rapport{data.items.length > 1 ? 's' : ''} concerné{data.items.length > 1 ? 's' : ''}
                    </h2>
                    <p className="text-[11px] text-gray-400">Triés par nombre de dates décroissant</p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {data.items.map((e, i) => (
                  <div key={i} className="p-4 hover:bg-slate-50/60 transition-all fade-up" style={{ animationDelay: `${0.3 + i * 0.04}s` }}>
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                        <span className="text-white font-bold text-sm">{e.dateCount}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-gray-900">{e.num}</span>
                          <span className="text-[10px] text-gray-400 font-medium">{e.dateCount} date{e.dateCount > 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {e.dates.map((d, di) => (
                            <span key={di} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-medium border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                              {fmt(d)}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {e.nature && (
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${natureColor[e.nature] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                              {e.nature}
                            </span>
                          )}
                          {e.site && (
                            <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
                              {e.site}
                            </span>
                          )}
                          {e.status && (
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${statusColor[e.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                              {e.status}
                            </span>
                          )}
                          {e.demandeur && (
                            <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200">
                              {e.demandeur}
                            </span>
                          )}
                        </div>
                        {e.ot && e.ot !== '-' && (
                          <div className="mt-1.5 text-[10px] text-gray-400 font-mono">OT: {e.ot}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {data.items.length === 0 && (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">📋</span>
                  </div>
                  <p className="text-sm text-gray-400 font-medium">Aucun rapport reçu plusieurs fois pour ce filtre.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
