import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../../stores/appStore';
import { articleApi, generateApi, imagesApi } from '../../lib/api';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { formatHashtags, SUGGESTED_HASHTAGS, LINKEDIN_TARGET, formatForLinkedIn, cn, scoreArticleQuality, scoreColor, scoreLabel } from '../../lib/utils';
import { useToast } from '../../contexts/ToastContext';
import { useAutoSave } from '../../hooks/useAutoSave';
import { ArrowLeft, Save, Check, Copy, Eye, Sparkles, Trash2, Archive, RotateCcw, Plus, FileText, Image as ImageIcon, ExternalLink, RefreshCw } from 'lucide-react';
import type { Article } from '../../types';

export function Editor({ article, onBack, onDelete }: { article: Article | null; onBack: () => void; onDelete?: (deletedId: number) => void }) {
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
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenFeedback, setRegenFeedback] = useState('');
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadedRef = useRef(false);
  const lastIntegratedRef = useRef('');

  const getFullPayload = useCallback(() => {
    const primaryImage = selectedImage >= 0 && images[selectedImage] ? images[selectedImage] : null;
    const payload: any = {
      titre_interne: titre, accroche_a: accrocheA, accroche_b: accrocheB,
      accroche_active: accrocheActive, corps, hashtags: formatHashtags(hashtags),
      image_options: images,
      image_url: primaryImage?.url || null,
      image_photographer: primaryImage?.photographer || null,
      image_photographer_url: primaryImage?.photographer_url || null,
    };
    if (source) payload.source_news_source = source;
    return payload;
  }, [titre, accrocheA, accrocheB, accrocheActive, corps, hashtags, source, images, selectedImage]);

  const saveFn = useCallback(async () => {
    if (!editingId) return;
    try {
      await articleApi.update(editingId, getFullPayload());
      setDirty(false);
      showToast('Modifications enregistrées', 'success');
      loadArticles();
    } catch (e: any) {
      console.error('[Editor saveFn]', e.message, { editingId, titre });
      showToast(e.message || 'Erreur de sauvegarde', 'error');
    }
  }, [editingId, getFullPayload, loadArticles, showToast, setDirty, titre]);

  useAutoSave(saveFn, isDirty, editingId, 5000);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleAccrocheSelect = useCallback((letter: 'a' | 'b') => {
    const newAccroche = letter === 'a' ? accrocheA : accrocheB;
    let newCorps = corps;
    if (lastIntegratedRef.current && newCorps.startsWith(lastIntegratedRef.current)) {
      newCorps = newCorps.substring(lastIntegratedRef.current.length).replace(/^\n+/, '');
    }
    if (newAccroche && !newCorps.startsWith(newAccroche)) {
      newCorps = newAccroche + '\n\n' + newCorps;
    }
    lastIntegratedRef.current = newAccroche;
    setCorps(newCorps);
    setAccrocheActive(letter);
    setDirty(true);
  }, [accrocheA, accrocheB, corps, setDirty]);

  useEffect(() => {
    if (!article) return;
    if (loadedRef.current && article.id === editingId) return;
    loadedRef.current = false;
    setEditingId(article.id);
    setTitre(article.titre_interne || '');
    setAccrocheA(article.accroche_a || '');
    setAccrocheB(article.accroche_b || '');
    const activeLetter = article.accroche_active || 'a';
    setAccrocheActive(activeLetter);
    const activeAccroche = (activeLetter === 'a' ? article.accroche_a : article.accroche_b) || '';
    let body = article.corps || '';
    if (activeAccroche && body.startsWith(activeAccroche)) {
      body = body.substring(activeAccroche.length).replace(/^\n+/, '');
    }
    const finalBody = activeAccroche ? activeAccroche + '\n\n' + body : body;
    lastIntegratedRef.current = activeAccroche;
    setCorps(finalBody);
    setHashtags(article.hashtags?.join(' ') || '');
    setSource(article.source_news_source || article.source_news_titre || article.custom_subject || '');
    setIaInfo(article.ia_provider ? `${article.ia_provider} / ${article.ia_model}` : '');
    setStatut(article.statut || 'brouillon');
    const opts = article.image_options || [];
    setImages(opts);
    if (article.image_url && opts.length > 0) {
      const idx = opts.findIndex((img: any) => img.url === article.image_url);
      setSelectedImage(idx >= 0 ? idx : 0);
    } else {
      setSelectedImage(-1);
    }
    setDirty(false);
    loadedRef.current = true;
    const fmtDateTime = (d: string) => {
      const dt = new Date(d);
      const date = dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
      const time = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      return `${date} à ${time}`;
    };
    const datesStr = [];
    if (article.date_creation) datesStr.push(`Création: ${fmtDateTime(article.date_creation)}`);
    if (article.date_validation) datesStr.push(`Validation: ${fmtDateTime(article.date_validation)}`);
    if (article.date_publication) datesStr.push(`Publication: ${fmtDateTime(article.date_publication)}`);
    setDates(datesStr.join(' • '));
  }, [article?.id, editingId, setEditingId, setDirty]);

  const markDirty = useCallback(() => {
    if (loadedRef.current && !isDirty) setDirty(true);
  }, [isDirty, setDirty]);

  const charCount = corps.length;
  const wordCount = corps.split(/\s+/).filter(Boolean).length;
  const targetPercent = Math.min(100, Math.round((wordCount / LINKEDIN_TARGET) * 100));
  const qualityScore = corps.length > 20 ? scoreArticleQuality(corps) : null;

  const handleSave = async () => {
    if (!editingId || saving) return;
    setSaving(true);
    try {
      await saveFn();
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!editingId) return;
    try {
      await articleApi.update(editingId, { ...getFullPayload(), statut: newStatus });
      setStatut(newStatus as Article['statut']);
      setDirty(false);
      showToast(newStatus === 'valide' ? 'Article validé' : newStatus === 'publie' ? 'Publié' : newStatus === 'archive' ? 'Archivé' : 'Restauré', 'success');
      loadArticles();
    } catch (e: any) {
      showToast(e.message || 'Erreur', 'error');
    }
  };

  const handleValidate = () => handleStatusChange('valide');

  const handlePublish = async () => {
    if (!editingId) return;
    try {
      const text = formatForLinkedIn(corps);
      const clipOk = await navigator.clipboard.writeText(text).then(() => true).catch(() => false);
      await articleApi.update(editingId, { ...getFullPayload(), statut: 'publie' });
      setStatut('publie');
      setDirty(false);
      showToast(clipOk ? 'Texte copié dans le presse-papiers et statut passé à Publié !' : 'Statut mis à jour', clipOk ? 'success' : 'warning');
      loadArticles();
    } catch (e: any) {
      showToast(e.message || 'Erreur lors de la publication', 'error');
    }
  };

  const handleArchive = () => handleStatusChange('archive');
  const handleRestore = () => handleStatusChange('brouillon');

  const handleDelete = async () => {
    if (!editingId || !confirm('Supprimer définitivement cet article ?')) return;
    try {
      await articleApi.delete(editingId);
      const deletedId = editingId;
      setEditingId(null);
      showToast('Article supprimé', 'info');
      loadArticles();
      if (onDelete) {
        onDelete(deletedId);
      } else {
        onBack();
      }
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
      const context = regenFeedback || `Titre: ${titre}\n\nContenu existant:\n${corps.slice(0, 800)}`;
      const res = await generateApi.preview({
        customPrompt: context,
        feedback: regenFeedback,
        provider: localStorage.getItem('immeit_ai_provider') || undefined,
        model: localStorage.getItem(`immeit_ai_model_${localStorage.getItem('immeit_ai_provider')}`) || undefined,
      });
      const a = res;
      if (a.titre_interne) setTitre(a.titre_interne);
      if (a.accroche_a) setAccrocheA(a.accroche_a);
      if (a.accroche_b) setAccrocheB(a.accroche_b);
      if (a.corps) setCorps(a.corps);
      if (a.hashtags) setHashtags(Array.isArray(a.hashtags) ? a.hashtags.join(' ') : a.hashtags);
      if (editingId) {
        try {
          await articleApi.update(editingId, {
            titre_interne: a.titre_interne || titre,
            accroche_a: a.accroche_a || accrocheA,
            accroche_b: a.accroche_b || accrocheB,
            corps: a.corps || corps,
            hashtags: formatHashtags(Array.isArray(a.hashtags) ? a.hashtags.join(' ') : (a.hashtags || hashtags)),
          });
          lastIntegratedRef.current = '';
          showToast('Article régénéré et sauvegardé', 'success');
          loadArticles();
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
    { label: 'Accroche Choc', text: 'Rends l\'accroche plus percutante et captivante. Utilise un chiffre ou une situation contraire aux attentes. Maximum 140 caractères.' },
    { label: 'Plus Humain', text: 'Rends le texte plus naturel : ajoute des contractions (j\'ai, c\'est, on fait), varie la longueur des phrases, et personnalise avec une observation terrain.' },
    { label: 'Story → Lesson', text: 'Reformule en structure Story → Lesson : commence par une anecdote vécue (rencontre client, panne, observation), puis déduis la leçon.' },
    { label: 'Données Chiffrées', text: 'Ajoute 2-3 chiffres concrets (%, coûts, durées) pour rendre le post plus crédible et mémorable.' },
  ];

  if (!article && !editingId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50/50 p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 mx-auto mb-4 border border-indigo-100 shadow-xs">
            <FileText size={28} />
          </div>
          <h3 className="text-base font-extrabold text-slate-900 mb-1">Aucun article sélectionné</h3>
          <p className="text-xs text-slate-500 leading-relaxed">Choisissez un article dans la liste à gauche ou créez-en un nouveau avec l'IA.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50/40 h-full">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 bg-white shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button onClick={onBack} className="p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer md:hidden">
            <ArrowLeft size={18} />
          </button>
          <input
            value={titre}
            onChange={e => { setTitre(e.target.value); markDirty(); }}
            placeholder="Titre interne de l'article..."
            className="w-full text-base font-extrabold border-0 outline-none bg-transparent text-slate-900 placeholder:text-slate-400 tracking-tight"
          />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isDirty && (
            <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full animate-pulse">
              Modifié non enregistré
            </span>
          )}
          <StatusBadge status={statut} />
        </div>
      </div>

      {/* Main Form Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Accroche A/B Testing Card */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-600" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Expérimentation A/B Accroche</span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">Sélectionnez la variante active</span>
          </div>

          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            {(['a', 'b'] as const).map(letter => (
              <label
                key={letter}
                className={cn(
                  "p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 relative",
                  accrocheActive === letter
                    ? 'border-indigo-600 bg-indigo-50/40 shadow-xs'
                    : 'border-slate-200/80 bg-white hover:border-slate-300'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="accroche"
                      checked={accrocheActive === letter}
                      onChange={() => handleAccrocheSelect(letter)}
                      className="accent-indigo-600 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-900">
                      {letter === 'a' ? 'Variante Directe / Choc' : 'Variante Question / Réflexion'}
                    </span>
                  </div>
                  <span className={cn(
                    "text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider",
                    letter === 'a' ? 'bg-indigo-600 text-white' : 'bg-purple-600 text-white'
                  )}>
                    Accroche {letter.toUpperCase()}
                  </span>
                </div>
                <textarea
                  value={letter === 'a' ? accrocheA : accrocheB}
                  onChange={e => { letter === 'a' ? setAccrocheA(e.target.value) : setAccrocheB(e.target.value); markDirty(); }}
                  className="w-full text-xs font-medium leading-relaxed border-0 outline-none resize-none bg-transparent text-slate-800 placeholder:text-slate-400"
                  rows={3}
                  placeholder="Rédigez l'accroche..."
                />
              </label>
            ))}
          </div>
        </Card>

        {/* Body Card */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Corps de l'article LinkedIn</span>
            <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
              <span className={charCount > 3000 ? 'text-rose-600 font-bold' : ''}>{charCount} / 3000 car.</span>
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              <span>{wordCount} mots</span>
            </div>
          </div>

          <textarea
            value={corps}
            onChange={e => { setCorps(e.target.value); markDirty(); }}
            className="w-full min-h-[300px] text-sm font-normal leading-relaxed border-0 outline-none resize-y text-slate-900 placeholder:text-slate-400 bg-transparent"
            placeholder="Rédigez ou éditez le contenu de votre post ici..."
          />

          {/* Progress bar to target */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-4">
            <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 to-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${targetPercent}%` }}
              />
            </div>
            <span className="text-xs font-bold text-slate-600 shrink-0">{targetPercent}% cible LinkedIn</span>
          </div>
        </Card>

        {/* Quality Score Card */}
        {qualityScore && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Score Qualité LinkedIn</span>
                <span className={`text-sm font-extrabold ${scoreColor(qualityScore.total)}`}>
                  {qualityScore.total}/10 — {scoreLabel(qualityScore.total)}
                </span>
              </div>
              {qualityScore.total < 5 && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  Risque de détection IA
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2">
              {Object.values(qualityScore.breakdown).map((item, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-slate-500 truncate">{item.label.split(':')[0]}</span>
                    <span className={`text-[10px] font-bold ${scoreColor(item.score)}`}>{item.score}/10</span>
                  </div>
                  <div className="bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        item.score >= 7 ? 'bg-emerald-500' : item.score >= 5 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${(item.score / 10) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {qualityScore.total < 5 && (
              <p className="text-[11px] text-amber-700 mt-3 leading-relaxed">
                Ce post risque d'être pénalisé par l'algorithme LinkedIn 360Brew. Ajoutez des ancrages personnels, variez la longueur des phrases, et supprimez les mots vagues.
              </p>
            )}
          </Card>
        )}

        {/* Media Illustrations Card */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ImageIcon size={16} className="text-indigo-600" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Illustrations Média (Pexels)</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setImageSearchOpen(true)}>
                <Plus size={14} /> Chercher image
              </Button>
              {selectedImage >= 0 && (
                <Button variant="danger" size="sm" onClick={() => {
                  setImages(prev => prev.filter((_, i) => i !== selectedImage));
                  setSelectedImage(-1);
                  markDirty();
                }}>
                  <Trash2 size={14} /> Supprimer
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
            {images.length === 0 ? (
              <p className="text-xs font-medium text-slate-400 col-span-full py-4 text-center">Aucune illustration sélectionnée. Cliquez sur "+ Chercher image".</p>
            ) : (
              images.map((img, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={cn(
                    "relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-200 aspect-video group",
                    selectedImage === i ? 'border-indigo-600 ring-4 ring-indigo-500/20 shadow-md' : 'border-transparent hover:border-slate-300'
                  )}
                >
                  <img src={img.thumbnail || img.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  {selectedImage === i && (
                    <div className="absolute top-2 right-2 bg-indigo-600 text-white rounded-full p-1 shadow-sm">
                      <Check size={12} />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Hashtags Card */}
        <Card className="p-5">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 block mb-2">Hashtags recommandés</span>
          <input
            value={hashtags}
            onChange={e => { setHashtags(e.target.value); markDirty(); }}
            placeholder="#maintenance #GMAO #fiabilite"
            className="w-full h-10 px-3.5 text-sm rounded-xl border border-slate-200 bg-white text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none transition-all"
          />
          <div className="flex flex-wrap gap-1.5 mt-3">
            {SUGGESTED_HASHTAGS.map(h => (
              <button
                key={h}
                onClick={() => { if (!hashtags.includes(h)) { setHashtags(prev => `${prev} ${h}`.trim()); markDirty(); } }}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer"
              >
                {h}
              </button>
            ))}
          </div>
        </Card>

        {/* Meta Info Grid */}
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Card className="p-4">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Actualité Source</span>
            <p className="text-xs font-bold text-slate-800 truncate">{source || '—'}</p>
          </Card>
          <Card className="p-4">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Fournisseur / Modèle IA</span>
            <p className="text-xs font-bold text-indigo-600 truncate">{iaInfo || '—'}</p>
          </Card>
          <Card className="p-4">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Historique des Dates</span>
            <p className="text-xs font-medium text-slate-600 truncate">{dates || '—'}</p>
          </Card>
        </div>
      </div>

      {/* Action Footer Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200/80 bg-white shrink-0 shadow-lg">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="gradient" onClick={handleSave} disabled={saving} loading={saving} size="sm">
            <Save size={15} />
            Enregistrer
          </Button>
          <Button variant="success" onClick={handleValidate} disabled={statut !== 'brouillon' && statut !== 'en_revision'} size="sm">
            <Check size={15} />
            Valider
          </Button>
          <Button variant="secondary" onClick={handlePublish} size="sm">
            <Copy size={15} />
            Copier pour LinkedIn
          </Button>
          <Button variant="outline" onClick={() => setPreviewOpen(true)} size="sm">
            <Eye size={15} />
            Aperçu Direct
          </Button>
          <Button variant="secondary" onClick={() => setRegenOpen(true)} size="sm">
            <Sparkles size={15} className="text-indigo-600" />
            Régénérer IA
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {statut === 'archive' ? (
            <Button variant="ghost" onClick={handleRestore} size="sm">
              <RotateCcw size={15} />
              Restaurer
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleArchive} size="sm">
              <Archive size={15} />
              Archiver
            </Button>
          )}
          <Button variant="ghost" onClick={handleDelete} size="sm" className="text-rose-600 hover:bg-rose-50">
            <Trash2 size={15} />
            Supprimer
          </Button>
        </div>
      </div>

      {/* LinkedIn Live Preview Modal */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Aperçu LinkedIn Post" size="lg">
        <div className="bg-[#f3f2ef] p-6 rounded-2xl">
          <div className="bg-white rounded-xl border border-slate-200 shadow-md max-w-lg mx-auto overflow-hidden">
            {/* LinkedIn Header */}
            <div className="p-4 pb-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                  IM
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-slate-900">IMMEIT Hub</div>
                  <div className="text-[11px] text-slate-500">Expertise Maintenance &amp; GMAO Industrielle • 1ère</div>
                </div>
              </div>
            </div>

            {/* Post Content */}
            <div className="px-4 py-3">
              {titre && (
                <p className="text-[13px] font-bold text-slate-900 mb-2 leading-snug">{titre}</p>
              )}
              <div className="whitespace-pre-wrap text-[13px] text-slate-800 leading-[1.6] font-sans">
                {formatForLinkedIn(corps)}
              </div>

              {hashtags && (
                <p className="text-[13px] font-semibold text-blue-600 leading-relaxed mt-2">
                  {formatHashtags(hashtags)}
                </p>
              )}
            </div>

            {/* Image */}
            {selectedImage >= 0 && images[selectedImage] && (
              <div className="border-t border-slate-100">
                <img src={images[selectedImage].url} alt="" className="w-full object-cover max-h-64" />
              </div>
            )}

            {/* LinkedIn Engagement Bar */}
            <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-1">
                <span>👍❤️💡</span>
                <span>•</span>
                <span>23 commentaires • 8 partages</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-4 py-1 border-t border-slate-100 flex items-center justify-around">
              {['👍 Réagir', '💬 Commenter', '🔄 Partager', '✏️ Enregistrer'].map(action => (
                <button key={action} className="text-[11px] font-semibold text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors">
                  {action}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* AI Regeneration Modal */}
      <Modal open={regenOpen} onClose={() => setRegenOpen(false)} title="Régénérer avec l'IA">
        <div className="space-y-4">
          <textarea
            value={regenFeedback}
            onChange={e => setRegenFeedback(e.target.value)}
            className="w-full border border-slate-200 rounded-xl p-3.5 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 bg-white text-slate-900 placeholder:text-slate-400"
            rows={3}
            placeholder="Consignes particulières (ex: Rends l'accroche plus percutante...)"
          />
          <div className="flex flex-wrap gap-1.5">
            {regenSuggestions.map(s => (
              <button
                key={s.label}
                onClick={() => setRegenFeedback(s.text)}
                className="text-xs font-semibold px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer"
              >
                {s.label}
              </button>
            ))}
          </div>
          <Button variant="gradient" onClick={handleRegen} disabled={generating || !regenFeedback} loading={generating} className="w-full">
            <Sparkles size={16} />
            Lancer la régénération
          </Button>
        </div>
      </Modal>

      {/* Pexels Image Search Modal */}
      <Modal open={imageSearchOpen} onClose={() => { setImageSearchOpen(false); setImageResults([]); setImageQuery(''); }} title="Rechercher une illustration Pexels" size="lg">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              value={imageQuery}
              onChange={e => setImageQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleImageSearch()}
              placeholder="Ex: industrial maintenance factory technician..."
              className="flex-1 h-10 px-3.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none"
            />
            <Button onClick={handleImageSearch}>Chercher</Button>
          </div>
          <div className="grid grid-cols-3 gap-3 max-h-80 overflow-y-auto">
            {imageResults.map((img, i) => (
              <button
                key={i}
                onClick={() => {
                  setImages(prev => [...prev, { url: img.url, thumbnail: img.thumbnail, photographer: img.photographer, photographer_url: img.photographer_url, alt: img.alt }]);
                  setImageSearchOpen(false); setImageResults([]); setImageQuery(''); markDirty();
                }}
                className="group relative rounded-xl overflow-hidden aspect-video border border-slate-200 cursor-pointer"
              >
                <img src={img.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-indigo-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs">
                  Sélectionner
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
