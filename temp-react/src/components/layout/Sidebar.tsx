import { useStore } from '../../stores/appStore';
import { LayoutDashboard, FileText, LogOut, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { key: 'dashboard' as const, label: 'Tableau de bord', icon: LayoutDashboard },
  { key: 'articles' as const, label: 'Articles & IA', icon: FileText },
];

export function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const view = useStore(s => s.view);
  const setView = useStore(s => s.setView);
  const logout = useStore(s => s.logout);

  return (
    <aside className={cn(
      'flex flex-col shrink-0 h-full border-r border-slate-800/80 bg-[#090D16] text-slate-300 transition-all duration-300 ease-in-out relative z-20 shadow-2xl',
      open ? 'w-60' : 'w-16'
    )}>
      {/* Brand Header */}
      <div className={cn(
        'h-16 flex items-center border-b border-slate-800/80 shrink-0',
        open ? 'px-5 justify-between' : 'px-3 justify-center'
      )}>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 via-blue-600 to-indigo-700 p-0.5 shadow-md shadow-indigo-500/30">
            <img src="/logo-immeit.webp" alt="IMMEIT" className="w-full h-full rounded-[10px] object-cover" />
          </div>
          {open && (
            <div className="flex flex-col">
              <span className="font-extrabold text-sm text-white tracking-tight leading-none flex items-center gap-1.5">
                IMMEIT <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">Hub</span>
              </span>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5">Plateforme Interne</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer group relative',
                open ? 'px-3.5 py-2.5' : 'px-0 py-2.5 justify-center',
                active
                  ? 'bg-gradient-to-r from-indigo-600/90 to-blue-600/90 text-white shadow-lg shadow-indigo-500/25 border border-indigo-400/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              )}
              title={!open ? item.label : undefined}
            >
              <Icon size={19} className={cn(
                'transition-transform duration-200 group-hover:scale-110',
                active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400'
              )} />
              {open && <span className="tracking-tight">{item.label}</span>}
              {active && open && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-glow" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer controls */}
      <div className="p-3 border-t border-slate-800/80 space-y-1.5 bg-[#070A11]">
        <button
          onClick={onToggle}
          className={cn(
            'w-full flex items-center gap-3 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer',
            open ? 'px-3.5 py-2' : 'px-0 py-2 justify-center'
          )}
        >
          {open ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
          {open && <span>Réduire le menu</span>}
        </button>
        <button
          onClick={logout}
          className={cn(
            'w-full flex items-center gap-3 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer',
            open ? 'px-3.5 py-2' : 'px-0 py-2 justify-center'
          )}
          title={!open ? 'Déconnexion' : undefined}
        >
          <LogOut size={17} />
          {open && <span>Déconnexion</span>}
        </button>
      </div>
    </aside>
  );
}
