import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../../stores/appStore';
import { articleApi, generateApi, imagesApi } from '../../lib/api';
import { StatusBadge } from '../ui/Badge';
import { formatHashtags, SUGGESTED_HASHTAGS, LINKEDIN_TARGET, formatForLinkedIn } from '../../lib/utils';
import { useToast } from '../../contexts/ToastContext';
import { Modal } from '../ui/Modal';
import type { Article, NewsItem } from '../../types';

export function Editor({ article, onBack }: { article: Article | null; onBack: () => void }) {
  const { editingId, setEditingId, isDirty, setDirty, loadArticles } = useStore();
  const { showToast } = useToast();

  const [titre, setTitre] = useState('');
  const [accrocheA, setAccrocheA] = useState('');
  const [accrocheB, setAccrocheB] = useState('');
  const [accrocheActive, setAccrocheActive] = useState<'a' | 'b'>('a');
  const [corps, setCorps] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [source, setSource] = useState('');
  const [iaInfo, setIaInfo] = useState('');
  const [dates, setDates] = useState('');
  const [statut, setStatut] = useState<Article['statut']>('brouillon');
  const [images, setImages] = useState<any[]>([]);
  const [selectedImage, setSelectedImage] = useState<number>(-1);
  const [imageSearchOpen, setImageSearchOpen] = useState(false);
  const [imageQuery, setImageQuery] = useState('');
  const [imageResults, setImageResults] = useState<any[]>([]);
  const [saveStatus, setSaveStatus] = useState('');
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenFeedback, setRegenFeedback] = useState('');
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const saveFn = useCallback(async () => {
    if (!editingId) return;
    setSaveStatus('⏳ Sauvegarde...');
    try {
      await articleApi.update(editingId, {
        titre_interne: titre, accroche_a: accrocheA, accroche_b: accrocheB,
        accroche_active: accrocheActive, corps, hashtags: formatHashtags(hashtags),
        source_news_source: source,
      });
      setDirty(false);
      setSaveStatus('✓ Sauvegardé');
      loadArticles();
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (e: any) {
      console.error('[Editor saveFn]', e.message, { editingId, titre, corps: corps?.substring(0, 50) });
      setSaveStatus('✗ Erreur');
      showToast(e.message || 'Erreur de sauvegarde', 'error');
    }
  }, [editingId, titre, accrocheA, accrocheB, accrocheActive, corps, hashtags, source]);

  const loadedRef = useRef(false);

  useEffect(() => {
    if (!article) return;
    if (loadedRef.current && article.id === editingId) return;
    loadedRef.current = false;
    setEditingId(article.id);
    setTitre(article.titre_interne || '');
    setAccrocheA(article.accroche_a || '');
    setAccrocheB(article.accroche_b || '');
    setAccrocheActive(article.accroche_active || 'a');
    setCorps(article.corps || '');
    setHashtags(article.hashtags?.join(' ') || '');
    setSource(article.source_news_source || '');
    setIaInfo(article.ia_provider ? `${article.ia_provider} / ${article.ia_model}` : '');
    setStatut(article.statut || 'brouillon');
    setImages(article.image_options || []);
    setSelectedImage(article.image_url ? 0 : -1);
    setDirty(false);
    setSaveStatus('');
    loadedRef.current = true;
    const datesStr = [];
    if (article.date_creation) datesStr.push(`Créé: ${article.date_creation.slice(0, 10)}`);
    if (article.date_validation) datesStr.push(`Validé: ${article.date_validation.slice(0, 10)}`);
    if (article.date_publication) datesStr.push(`Publié: ${article.date_publication.slice(0, 10)}`);
    setDates(datesStr.join(' | '));
  }, [article?.id]);

  const markDirty = useCallback(() => {
    if (loadedRef.current && !isDirty) setDirty(true);
  }, [isDirty, setDirty]);

  const charCount = corps.length;
  const wordCount = corps.split(/\s+/).filter(Boolean).length;

  const handleSave = async () => {
    if (editingId) {
      await saveFn();
    }
  };

  const handleValidate = async () => {
    if (!editingId) return;
    try {
      await articleApi.update(editingId, { statut: 'valide' });
      setStatut('valide');
      showToast('Article valide', 'success');
      loadArticles();
    } catch (e: any) {
      showToast(e.message || 'Erreur lors de la validation', 'error');
    }
  };

  const handlePublish = async () => {
    if (!editingId) return;
    try {
      const text = formatForLinkedIn(corps);
      const clipOk = await navigator.clipboard.writeText(text).then(() => true).catch(() => false);
      await articleApi.update(editingId, { statut: 'publie' });
      setStatut('publie');
      showToast(clipOk ? 'Copié et publié' : 'Publié (copie presse-papiers échouée)', clipOk ? 'success' : 'warning');
      loadArticles();
    } catch (e: any) {
      showToast(e.message || 'Erreur lors de la publication', 'error');
    }
  };

  const handleArchive = async () => {
    if (!editingId) return;
    try {
      await articleApi.update(editingId, { statut: 'archive' });
      setStatut('archive');
      showToast('Archive', 'info');
      loadArticles();
    } catch (e: any) {
      showToast(e.message || "Erreur lors de l'archivage", 'error');
    }
  };

  const handleRestore = async () => {
    if (!editingId) return;
    try {
      await articleApi.update(editingId, { statut: 'brouillon' });
      setStatut('brouillon');
      showToast('Restaure', 'success');
      loadArticles();
    } catch (e: any) {
      showToast(e.message || 'Erreur lors de la restauration', 'error');
    }
  };

  const handleDelete = async () => {
    if (!editingId || !confirm('Supprimer cet article ?')) return;
    try {
      await articleApi.delete(editingId);
      setEditingId(null);
      showToast('Supprime', 'info');
      loadArticles();
    } catch (e: any) {
      showToast(e.message || 'Erreur lors de la suppression', 'error');
    }
  };

  const handleImageSearch = async () => {
    if (!imageQuery) return;
    try {
      const res = await imagesApi.search(imageQuery);
      setImageResults(res.photos || []);
    } catch (e: any) {
      showToast(e.message || 'Erreur lors de la recherche d\'images', 'error');
    }
  };

  const handleRegen = async () => {
    setGenerating(true);
    try {
      const res = await generateApi.create({
        customPrompt: regenFeedback || titre,
        feedback: regenFeedback,
        provider: localStorage.getItem('immeit_ai_provider') || undefined,
        model: localStorage.getItem(`immeit_ai_model_${localStorage.getItem('immeit_ai_provider')}`) || undefined,
      });
      const a = res.article || res;
      if (a.accroche_a) setAccrocheA(a.accroche_a);
      if (a.accroche_b) setAccrocheB(a.accroche_b);
      if (a.corps) setCorps(a.corps);
      if (a.hashtags) setHashtags(Array.isArray(a.hashtags) ? a.hashtags.join(' ') : a.hashtags);
      // Sauvegarder automatiquement après régénération
      if (editingId) {
        try {
          await articleApi.update(editingId, {
            accroche_a: a.accroche_a || accrocheA,
            accroche_b: a.accroche_b || accrocheB,
            corps: a.corps || corps,
            hashtags: a.hashtags || hashtags,
          });
          showToast('Article régénéré et sauvegardé', 'success');
        } catch {
          showToast('Article régénéré (non sauvegardé)', 'warning');
        }
      } else {
        showToast('Article régénéré', 'success');
      }
      setRegenOpen(false);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const regenSuggestions = [
    { label: '⚡ Accroche', text: 'Rends l\'accroche plus percutante' },
    { label: '🌍 Exemple local', text: 'Ajoute un exemple concret africain' },
    { label: '✂️ Raccourcir', text: 'Raccourcis de 20%' },
    { label: '🎓 Plus expert', text: 'Rends le ton plus expert' },
    { label: '📣 CTA fort', text: 'Améliore l\'appel à l\'action final' },
  ];

  if (!article && !editingId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="text-5xl mb-4">📄</div>
          <p>Sélectionnez un article</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200 bg-white">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">← Retour</button>
        <input value={titre} onChange={e => { setTitre(e.target.value); markDirty(); }} placeholder="Titre interne…" className="flex-1 text-lg font-semibold border-none outline-none bg-transparent" />
        <StatusBadge status={statut} />
      </div>

      {/* Status bar */}
      {statut !== 'archive' && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs">
          {['brouillon', 'en_revision', 'valide', 'publie'].map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <span className="text-gray-300">→</span>}
              <span className={`flex items-center gap-1 ${statut === s ? 'text-[#0A66C2] font-medium' : statut === 'publie' ? 'text-green-600' : 'text-gray-400'}`}>
                {s === statut && '●'} {s === 'publie' ? '✓' : ''} {s.replace('_', ' ')}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Images */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase">Illustrations</span>
            <div className="flex gap-1">
              <button onClick={() => setImageSearchOpen(true)} className="text-xs px-2 py-1 bg-gray-100 rounded-md hover:bg-gray-200">+ Ajouter</button>
              {selectedImage >= 0 && (
                <>
                  <button onClick={() => setImages(prev => prev.filter((_, i) => i !== selectedImage))} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded-md hover:bg-red-100">🗑</button>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {images.length === 0 ? (
              <p className="text-xs text-gray-400">Aucune illustration</p>
            ) : (
              images.map((img, i) => (
                <img key={i} src={img.thumbnail || img.url} alt="" className={`h-20 rounded-lg cursor-pointer border-2 transition-all ${selectedImage === i ? 'border-[#0A66C2]' : 'border-transparent hover:border-gray-300'}`} onClick={() => setSelectedImage(i)} />
              ))
            )}
          </div>
        </div>

        {/* Accroches */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            {(['a', 'b'] as const).map(letter => (
              <label key={letter} className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${accrocheActive === letter ? 'border-[#0A66C2] bg-blue-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <input type="radio" name="accroche" checked={accrocheActive === letter} onChange={() => setAccrocheActive(letter)} className="accent-[#0A66C2]" />
                  <span className="text-xs font-medium">{letter === 'a' ? 'Directe / Choc' : 'Question / Réflexion'}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${letter === 'a' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{letter === 'a' ? 'A' : 'B'}</span>
                </div>
                <textarea value={letter === 'a' ? accrocheA : accrocheB} onChange={e => { letter === 'a' ? setAccrocheA(e.target.value) : setAccrocheB(e.target.value); markDirty(); }} className="w-full text-sm border-0 outline-none resize-none bg-transparent" rows={2} placeholder="Accroche…" />
              </label>
            ))}
          </div>
        </div>

        {/* Corps */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">Corps de l'article</label>
          <textarea value={corps} onChange={e => { setCorps(e.target.value); markDirty(); }} className="w-full min-h-[320px] text-sm border-0 outline-none resize-none" placeholder="Rédigez l'article ici…" />
          <div className="flex justify-end gap-4 text-xs text-gray-400 mt-2">
            <span className={charCount > 3000 ? 'text-red-600' : charCount > 2900 ? 'text-yellow-600' : ''}>{charCount} / 3000 car.</span>
            <span>{wordCount} mots ({Math.round(wordCount / LINKEDIN_TARGET * 100)}% cible LinkedIn)</span>
          </div>
        </div>

        {/* Hashtags */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">Hashtags</label>
          <input value={hashtags} onChange={e => { setHashtags(e.target.value); markDirty(); }} placeholder="#maintenance #GMAO" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0A66C2]" />
          <div className="flex flex-wrap gap-1 mt-2">
            {SUGGESTED_HASHTAGS.map(h => (
              <button key={h} onClick={() => { if (!hashtags.includes(h)) setHashtags(prev => `${prev} ${h}`.trim()); }} className="text-xs px-2 py-1 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-600">{h}</button>
            ))}
          </div>
        </div>

        {/* Meta panel */}
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="text-xs font-medium text-gray-500 uppercase block mb-1">Source</label>
            <input value={source} onChange={e => { setSource(e.target.value); markDirty(); }} className="w-full text-sm border-0 outline-none bg-transparent" />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="text-xs font-medium text-gray-500 uppercase block mb-1">IA / Modèle</label>
            <div className="text-sm text-gray-600">{iaInfo || '—'}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-full">
            <label className="text-xs font-medium text-gray-500 uppercase block mb-1">Dates</label>
            <div className="text-sm text-gray-600">{dates || '—'}</div>
          </div>
          <div className="col-span-full text-xs text-gray-400">{saveStatus}</div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between p-3 border-t border-gray-200 bg-white shrink-0">
        <div className="flex flex-wrap gap-2">
          <button onClick={handleSave} className="px-4 py-2 bg-[#0A66C2] text-white rounded-lg text-sm font-medium hover:bg-[#084a8f]">↓ Enregistrer</button>
          <button onClick={handleValidate} disabled={statut !== 'brouillon' && statut !== 'en_revision'} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-30">✓ Valider</button>
          <button onClick={handlePublish} className="px-4 py-2 bg-[#0A66C2]/10 text-[#0A66C2] rounded-lg text-sm font-medium hover:bg-[#0A66C2]/20">⌘ Copier LinkedIn</button>
          <button onClick={() => setPreviewOpen(true)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">👁 Aperçu</button>
          <button onClick={() => setRegenOpen(true)} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">✦ Régénérer</button>
        </div>
        <div className="flex gap-2">
          {statut === 'archive' ? (
            <button onClick={handleRestore} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800">Restaurer</button>
          ) : (
            <button onClick={handleArchive} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800">Archiver</button>
          )}
          <button onClick={handleDelete} className="px-3 py-2 text-sm text-red-600 hover:text-red-800">Supprimer</button>
        </div>
      </div>

      {/* Preview modal */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="👁 Aperçu LinkedIn">
        <div className="prose prose-sm max-w-none">
          {images[0] && <img src={images[0].url} alt="" className="w-full rounded-lg mb-4 max-h-64 object-cover" />}
          <div className="whitespace-pre-wrap text-sm">{formatForLinkedIn(corps)}</div>
          {hashtags && <p className="mt-4 text-[#0A66C2]">{hashtags}</p>}
        </div>
      </Modal>

      {/* Regen modal */}
      <Modal open={regenOpen} onClose={() => setRegenOpen(false)} title="✦ Régénérer l'article">
        <div className="space-y-3">
          <textarea value={regenFeedback} onChange={e => setRegenFeedback(e.target.value)} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-[#0A66C2]" rows={3} placeholder="Indiquez vos consignes de modification..." />
          <div className="flex flex-wrap gap-2">
            {regenSuggestions.map(s => (
              <button key={s.label} onClick={() => setRegenFeedback(s.text)} className="text-xs px-3 py-1.5 bg-gray-100 rounded-full hover:bg-gray-200">{s.label}</button>
            ))}
          </div>
          <button onClick={handleRegen} disabled={generating || !regenFeedback} className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-30">
            {generating ? 'Génération...' : 'Confirmer la régénération'}
          </button>
        </div>
      </Modal>

      {/* Image search modal */}
      <Modal open={imageSearchOpen} onClose={() => setImageSearchOpen(false)} title="Rechercher une image">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={imageQuery} onChange={e => setImageQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleImageSearch()} placeholder="Rechercher..." className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" />
            <button onClick={handleImageSearch} className="px-4 py-2 bg-[#0A66C2] text-white rounded-lg text-sm">Chercher</button>
          </div>
          <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
            {imageResults.map((img, i) => (
              <button key={i} onClick={() => { setImages(prev => [...prev, { url: img.url, thumbnail: img.thumbnail, photographer: img.photographer, photographer_url: img.photographer_url, alt: img.alt }]); setImageSearchOpen(false); }} className="group relative">
                <img src={img.thumbnail} alt="" className="w-full h-24 object-cover rounded-lg" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg" />
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
