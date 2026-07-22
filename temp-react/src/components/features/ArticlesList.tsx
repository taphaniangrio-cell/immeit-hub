import React from 'react';
import { useStore } from '../../stores/appStore';
import { StatusBadge } from '../ui/Badge';
import { SkeletonCard } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { PAGE_SIZE, fmtDate, cn } from '../../lib/utils';
import { Plus, ChevronLeft, ChevronRight, Sparkles, FileText } from 'lucide-react';
import type { Article } from '../../types';

export function ArticlesList({ onSelect }: { onSelect: (article: Article | null) => void }) {
  const { articles, filter, currentPage, totalArticles, editingId, loadArticles } = useStore();
  const setFilter = useStore(s => s.setFilter);
  const setCurrentPage = useStore(s => s.setCurrentPage);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    loadArticles().finally(() => setLoading(false));
  }, [filter, currentPage, loadArticles]);

  const totalPages = Math.ceil(totalArticles / PAGE_SIZE);

  return (
    <div className="w-84 shrink-0 border-r border-slate-200/80 bg-white/60 backdrop-blur-md flex flex-col max-md:w-full max-md:border-r-0 h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 bg-white/90">
        <Button variant="gradient" onClick={() => onSelect(null)} className="w-full shadow-md" size="md">
          <Sparkles size={16} className="animate-pulse" />
          Nouveau post avec IA
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 p-3 overflow-x-auto border-b border-slate-100 bg-slate-50/50 scrollbar-none">
        {[
          { key: '', label: 'Tous' },
          { key: 'brouillon', label: 'Brouillon' },
          { key: 'en_revision', label: 'Révision' },
          { key: 'valide', label: 'Validé' },
          { key: 'publie', label: 'Publié' },
          { key: 'archive', label: 'Archivé' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer",
              filter === tab.key
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200/60 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Article list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 mb-3">
              <FileText size={22} />
            </div>
            <p className="text-sm font-bold text-slate-800">Aucun article trouvé</p>
            <p className="text-xs text-slate-500 mt-1">Créez votre premier article ou changez de filtre.</p>
          </div>
        ) : (
          articles.map(a => (
            <ArticleCard key={a.id} article={a} active={editingId === a.id} onClick={() => onSelect(a)} />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3.5 border-t border-slate-100 bg-white/90 text-sm">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(currentPage - 1)}
            className="p-1.5 rounded-xl border border-slate-200 disabled:opacity-30 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-slate-500 font-semibold">Page {currentPage} / {totalPages} ({totalArticles})</span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(currentPage + 1)}
            className="p-1.5 rounded-xl border border-slate-200 disabled:opacity-30 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function ArticleCard({ article, active, onClick }: { article: Article; active: boolean; onClick: () => void }) {
  const excerpt = article.corps?.replace(/<[^>]+>/g, '').replace(/\n+/g, ' ').slice(0, 80) || '';
  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left rounded-2xl transition-all duration-200 outline-none cursor-pointer relative overflow-hidden",
        active
          ? 'bg-gradient-to-r from-indigo-50 to-blue-50/50 border border-indigo-300 shadow-sm p-4'
          : 'bg-white border border-slate-200/80 hover:border-indigo-300/80 hover:shadow-md p-4'
      )}
    >
      {active && (
        <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-600 to-blue-600 rounded-r-md" />
      )}
      <div className="flex items-start justify-between gap-2">
        <h3 className={cn(
          "text-sm font-bold leading-snug truncate transition-colors",
          active ? 'text-indigo-950' : 'text-slate-900 group-hover:text-indigo-600'
        )}>
          {article.titre_interne || 'Sans titre'}
        </h3>
      </div>
      {excerpt && (
        <p className={cn(
          "text-xs mt-1.5 line-clamp-2 leading-relaxed transition-colors",
          active ? 'text-indigo-900/70' : 'text-slate-500'
        )}>
          {excerpt}…
        </p>
      )}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
        <StatusBadge status={article.statut} />
        <span className="text-[11px] font-medium text-slate-400">
          {fmtDate(article.date_creation)}
        </span>
      </div>
    </button>
  );
}
