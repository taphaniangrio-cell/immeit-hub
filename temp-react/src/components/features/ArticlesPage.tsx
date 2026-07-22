import { useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '../../stores/appStore';
import { generateApi, newsApi } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ArticlesList } from './ArticlesList';
import { Editor } from './Editor';
import { Sparkles, Dice5, Newspaper, ArrowRight } from 'lucide-react';
import type { Article, NewsItem } from '../../types';

export function ArticlesPage() {
  const { articles, isDirty, setEditingId, loadArticles } = useStore();
  const { showToast } = useToast();
  const [selected, setSelected] = useState<Article | null>(null);
  const autoSelectedRef = useRef(false);

  useEffect(() => {
    if (!autoSelectedRef.current && !selected && articles.length > 0) {
      autoSelectedRef.current = true;
      setSelected(articles[0]);
    }
  }, [articles, selected]);

  const [newsModal, setNewsModal] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [customPrompt, setCustomPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleSelect = (article: Article | null) => {
    if (article && article.id) {
      setSelected(article);
    } else {
      setNewsModal(true);
      newsApi.list().then(res => setNews(res.news || [])).catch(() => {});
    }
  };

  const handleGenerate = useCallback(async (payload: any) => {
    setGenerating(true);
    try {
      const res = await generateApi.create(payload);
      if (res.article) {
        setSelected(res.article);
        await loadArticles();
        showToast('Article généré avec succès avec l\'IA !', 'success');
        setNewsModal(false);
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setGenerating(false);
    }
  }, [loadArticles, showToast]);

  const handleCustomGenerate = () => {
    if (!customPrompt.trim()) return;
    handleGenerate({
      customPrompt: customPrompt.trim(),
      provider: localStorage.getItem('immeit_ai_provider') || undefined,
      model: localStorage.getItem(`immeit_ai_model_${localStorage.getItem('immeit_ai_provider')}`) || undefined,
    });
  };

  const handleNewsGenerate = (newsItem: NewsItem) => {
    handleGenerate({
      news: newsItem,
      provider: localStorage.getItem('immeit_ai_provider') || undefined,
      model: localStorage.getItem(`immeit_ai_model_${localStorage.getItem('immeit_ai_provider')}`) || undefined,
    });
  };

  const handleAiPick = () => {
    if (news.length === 0) return;
    const random = news[Math.floor(Math.random() * news.length)];
    handleNewsGenerate(random);
  };

  const handleBack = () => {
    if (isDirty && !window.confirm('Vous avez des modifications non sauvegardées. Quitter quand même ?')) return;
    setSelected(null);
    setEditingId(null);
    autoSelectedRef.current = false;
  };

  return (
    <>
      <div className="flex h-[calc(100vh-6rem)] max-md:h-auto max-md:flex-col bg-white rounded-3xl border border-slate-200/80 shadow-lg overflow-hidden">
        <ArticlesList onSelect={handleSelect} />
        <Editor article={selected} onBack={handleBack} />
      </div>

      <Modal open={newsModal} onClose={() => setNewsModal(false)} title="Studio Générateur IA" size="lg">
        <div className="space-y-6 p-1">
          {/* Custom Subject Generator Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50 via-blue-50/40 to-slate-50 border border-indigo-100 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700">
              <Sparkles size={16} className="text-indigo-600 animate-pulse" />
              <span>Générer à partir d'un sujet sur mesure</span>
            </div>
            <div className="flex gap-2.5">
              <input
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                placeholder="Ex: L'impact de la maintenance prédictive sur la GMAO..."
                className="flex-1 h-11 px-4 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none transition-all"
                onKeyDown={e => e.key === 'Enter' && handleCustomGenerate()}
              />
              <Button variant="gradient" size="lg" onClick={handleCustomGenerate} disabled={generating || !customPrompt.trim()} loading={generating}>
                Générer
              </Button>
            </div>
          </div>

          {/* Separator */}
          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            <span className="flex-1 border-t border-slate-200" />
            <span>ou choisissez une actualité industrielle</span>
            <span className="flex-1 border-t border-slate-200" />
          </div>

          {/* News List */}
          <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
            {news.map((n, i) => (
              <button
                key={i}
                onClick={() => handleNewsGenerate(n)}
                className="group w-full text-left p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-indigo-400 hover:shadow-md transition-all duration-200 cursor-pointer relative"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
                    <Newspaper size={13} />
                    <span>{n.source}</span>
                  </div>
                  <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 mt-2 group-hover:text-indigo-600 transition-colors leading-snug">{n.titre}</h4>
                {n.resume && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">{n.resume}</p>}
              </button>
            ))}
          </div>

          {/* Random AI pick button */}
          <Button variant="secondary" onClick={handleAiPick} disabled={generating || news.length === 0} className="w-full h-11 rounded-xl">
            <Dice5 size={16} className="text-indigo-600" />
            Laisser l'IA sélectionner la meilleure opportunité
          </Button>
        </div>
      </Modal>
    </>
  );
}
