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

function fmt(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtShort(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtMonth(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  const months = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
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
    const start = ds ? fmtMonth(ds) : 'Début';
    const end = de ? fmtMonth(de) : 'Maintenant';
    parts.push(`${start} → ${end}`);
  }
  return parts.join(' · ') || 'Tous les rapports';
}

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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold text-gray-800">Rapports reçus plusieurs fois</h1>
            <p className="text-xs text-gray-400 mt-0.5">Filtre : {filterLabel}</p>
          </div>
          <button
            onClick={() => { window.opener ? window.close() : window.location.href = '/'; }}
            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors"
          >
            ← Retour
          </button>
        </div>

        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="animate-spin w-6 h-6 border-2 border-[#0A66C2] border-t-transparent rounded-full mx-auto mb-3"></div>
            <p className="text-sm text-gray-500">Chargement...</p>
          </div>
        )}

        {error && (
          <div className="bg-white rounded-xl border border-red-200 p-6 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {data && !loading && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
              <p className="text-sm text-gray-700 leading-relaxed">
                <strong>{data.totalFiltered.toLocaleString()}</strong> rapport{data.totalFiltered > 1 ? 's' : ''} filtré{data.totalFiltered > 1 ? 's' : ''} sur <strong>{data.total.toLocaleString()}</strong> au total.
                Parmi eux, <strong>{data.items.length}</strong> rapport{data.items.length > 1 ? 's' : ''} ont été
                déposés <strong>plusieurs fois</strong>.
              </p>
              <p className="text-sm text-gray-700 leading-relaxed mt-1">
                Cela représente <strong>{data.totalDates.toLocaleString()}</strong> traitements individuels,
                soit <strong>{data.totalExtra}</strong> dépôts supplémentaires par rapport aux rapports uniques.
              </p>
            </div>

            {(() => {
              const byCount: Record<number, { count: number; dates: number; extra: number }> = {};
              for (const it of data.items) {
                const n = it.dateCount;
                if (!byCount[n]) byCount[n] = { count: 0, dates: 0, extra: 0 };
                byCount[n].count++;
                byCount[n].dates += n;
                byCount[n].extra += n - 1;
              }
              const rows = Object.entries(byCount)
                .map(([k, v]) => ({ nDates: Number(k), ...v }))
                .sort((a, b) => a.nDates - b.nDates);
              if (rows.length === 0) return null;
              return (
                <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3">Décomposition par nombre de dates</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500">
                          <th className="text-left py-2 pr-4 font-medium">Reçu X fois</th>
                          <th className="text-right py-2 px-4 font-medium">Rapports</th>
                          <th className="text-right py-2 px-4 font-medium">Traitements</th>
                          <th className="text-right py-2 px-4 font-medium">Dépôts en +</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.nDates} className="border-b border-gray-50">
                            <td className="py-2 pr-4 font-medium text-gray-800">{r.nDates}x</td>
                            <td className="py-2 px-4 text-right text-gray-700">{r.count}</td>
                            <td className="py-2 px-4 text-right text-gray-700">{r.count} × {r.nDates} = <strong>{r.dates.toLocaleString()}</strong></td>
                            <td className="py-2 px-4 text-right text-gray-700">+{r.extra.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 font-semibold text-gray-800">
                          <td className="py-2 pr-4">Total</td>
                          <td className="py-2 px-4 text-right">{data.items.length}</td>
                          <td className="py-2 px-4 text-right">{data.totalFiltered.toLocaleString()} + {data.totalExtra.toLocaleString()} = <strong>{data.totalDates.toLocaleString()}</strong></td>
                          <td className="py-2 px-4 text-right">+{data.totalExtra.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                    Les <strong>{data.totalFiltered.toLocaleString()}</strong> rapports du filtre
                    génèrent <strong>{data.totalDates.toLocaleString()}</strong> traitements car <strong>{data.items.length}</strong> d'entre eux ont été déposés plusieurs fois.
                    Chaque dépôt est un traitement distinct sur Docinfo, d'où les <strong>+{data.totalExtra.toLocaleString()}</strong> dépôts supplémentaires.
                  </p>
                </div>
              );
            })()}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">
                  {data.items.length} rapport{data.items.length > 1 ? 's' : ''} concerné{data.items.length > 1 ? 's' : ''}
                </h2>
                <span className="text-xs text-gray-400">Trié par nombre de dates décroissant</span>
              </div>
              <div className="divide-y divide-gray-50">
                {data.items.map((e, i) => (
                  <div key={i} className="p-3 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono text-sm font-semibold text-gray-800">{e.num}</span>
                        <span className="text-xs text-gray-400 ml-2">({e.dateCount} date{e.dateCount > 1 ? 's' : ''})</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {e.dates.map((d, di) => (
                            <span key={di} className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-medium border border-indigo-100">
                              {fmt(d)}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-gray-500">
                          {e.nature && <span>{e.nature}</span>}
                          {e.site && <span>&bull; {e.site}</span>}
                          {e.status && <span>&bull; {e.status}</span>}
                          {e.demandeur && <span>&bull; {e.demandeur}</span>}
                        </div>
                        {e.ot && e.ot !== '-' && (
                          <div className="mt-0.5 text-[10px] text-gray-400">OT: {e.ot}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {data.items.length === 0 && (
                <div className="p-8 text-center text-gray-400 text-sm">
                  Aucun rapport reçu plusieurs fois pour ce filtre.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
