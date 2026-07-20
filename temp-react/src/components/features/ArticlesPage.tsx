import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../stores/appStore';
import { generateApi, newsApi, imagesApi } from '../../lib/api';
import { useToast } from '../../hooks/useToast';
import { Modal } from '../ui/Modal';
import { ArticlesList } from './ArticlesList';
import { Editor } from './Editor';
import type { Article, NewsItem } from '../../types';

export function ArticlesPage() {
  const { editingId, setEditingId, loadArticles } = useStore();
  const { showToast } = useToast();
  const [selected, setSelected] = useState<Article | null>(null);
  const [newsModal, setNewsModal] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [customPrompt, setCustomPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadArticles();
  }, []);

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
        loadArticles();
        showToast('Article généré', 'success');
        setNewsModal(false);
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setGenerating(false);
    }
  }, []);

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
    setSelected(null);
    setEditingId(null);
  };

  return (
    <>
      <div className="flex h-full max-md:flex-col">
        <ArticlesList onSelect={handleSelect} />
        <Editor article={selected} onBack={handleBack} />
      </div>

      <Modal open={newsModal} onClose={() => setNewsModal(false)} title="Nouvel article ✦ IA">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} placeholder="Sujet libre..." className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" onKeyDown={e => e.key === 'Enter' && handleCustomGenerate()} />
            <button onClick={handleCustomGenerate} disabled={generating || !customPrompt.trim()} className="px-4 py-2 bg-[#0A66C2] text-white rounded-lg text-sm whitespace-nowrap disabled:opacity-30">Générer</button>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-400"><span className="flex-1 border-t border-gray-200" /> ou choisis une actualité <span className="flex-1 border-t border-gray-200" /></div>

          <div className="max-h-60 overflow-y-auto space-y-2">
            {news.map((n, i) => (
              <button key={i} onClick={() => handleNewsGenerate(n)} className="w-full text-left p-3 rounded-lg border border-gray-100 hover:border-[#0A66C2] hover:shadow-sm transition-all">
                <div className="text-sm font-medium text-gray-800">{n.titre}</div>
                <div className="text-xs text-gray-400 mt-1">{n.source}</div>
                {n.resume && <div className="text-xs text-gray-500 mt-1 line-clamp-2">{n.resume}</div>}
              </button>
            ))}
          </div>

          <button onClick={handleAiPick} disabled={generating || news.length === 0} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-30">
            🎲 Laisser l'IA choisir
          </button>

          {generating && (
            <div className="text-center py-4">
              <div className="animate-spin w-8 h-8 border-4 border-[#0A66C2] border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-sm text-gray-500">Génération en cours...</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
