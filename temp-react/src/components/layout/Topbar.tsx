import { useEffect, useState } from 'react';
import { useStore } from '../../stores/appStore';
import { modelsApi } from '../../lib/api';
import { PanelLeftOpen, Cpu, Sparkles } from 'lucide-react';

export function Topbar({ title, onToggleSidebar }: { title: string; onToggleSidebar: () => void }) {
  const { models, setModels } = useStore();
  const [provider, setProvider] = useState(() => localStorage.getItem('immeit_ai_provider') || '');
  const [modelId, setModelId] = useState(() => localStorage.getItem(`immeit_ai_model_${localStorage.getItem('immeit_ai_provider')}`) || '');

  useEffect(() => {
    if (models) return;
    modelsApi.list().then(setModels).catch(() => {});
  }, [models, setModels]);

  const current = provider ? models?.models?.[provider] : null;

  return (
    <header className="h-16 glass-panel border-b border-slate-200/80 flex items-center justify-between px-6 shrink-0 sticky top-0 z-10 shadow-xs">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer md:hidden"
        >
          <PanelLeftOpen size={19} />
        </button>
        <div className="flex items-center gap-2">
          <h1 className="text-base font-extrabold text-slate-900 tracking-tight">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {models && (
          <div className="flex items-center gap-2 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/60 shadow-xs">
            <div className="flex items-center gap-1.5 px-2.5 text-xs font-bold text-indigo-600 uppercase tracking-wider">
              <Sparkles size={14} className="text-indigo-500 animate-pulse" />
              <span>IA</span>
            </div>
            <select
              value={provider}
              onChange={e => {
                const v = e.target.value;
                setProvider(v);
                localStorage.setItem('immeit_ai_provider', v);
                const defaultModel = models?.models?.[v]?.models?.[0]?.id || '';
                setModelId(defaultModel);
                localStorage.setItem(`immeit_ai_model_${v}`, defaultModel);
              }}
              className="h-8 px-3 text-xs font-semibold border-0 rounded-xl bg-white text-slate-800 shadow-xs hover:bg-slate-50 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all cursor-pointer"
            >
              <option value="">Provider IA</option>
              {Object.entries(models.models || {}).filter(([, v]) => v.enabled).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {current && (
              <select
                value={modelId}
                onChange={e => {
                  setModelId(e.target.value);
                  localStorage.setItem(`immeit_ai_model_${provider}`, e.target.value);
                }}
                className="h-8 px-3 text-xs font-semibold border-0 rounded-xl bg-white text-slate-800 shadow-xs hover:bg-slate-50 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all cursor-pointer"
              >
                <option value="">Modèle</option>
                {current.models.map(m => (
                  <option key={m.id} value={m.id}>{m.label}{m.free ? ' (gratuit)' : ''}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
