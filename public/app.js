const API_BASE = '/api'

let articles = []
let filter = ''
let editingId = null
let currentNews = null
let regenNews = null
let currentIaMeta = null
let availableModels = null
let currentPage = 1
let isDirty = false
let autoSaveTimer = null
let isGenerating = false
const PAGE_SIZE = 10

const $ = id => document.getElementById(id)

const loginScreen = $('login-screen'), mainScreen = $('main-screen'), editorScreen = $('editor-screen')
const loginForm = $('login-form'), loginPassword = $('login-password'), loginError = $('login-error')
const editTitre = $('edit-titre'), editCorps = $('edit-corps'), editHashtags = $('edit-hashtags')
const editSource = $('edit-source'), editIaInfo = $('edit-ia-info'), editDates = $('edit-dates')
const btnBack = $('btn-back'), btnSave = $('btn-save'), btnValidate = $('btn-validate')
const btnCopy = $('btn-copy'), btnDelete = $('btn-delete'), btnRegen = $('btn-regen'), btnRegenGo = $('btn-regen-go')
const btnNew = $('btn-new'), btnLogout = $('btn-logout')
const btnArchive = $('btn-archive'), btnRestore = $('btn-restore')
const btnPrev = $('btn-prev'), btnNext = $('btn-next'), pageInfo = $('page-info')
const newsModal = $('news-modal'), modalClose = $('modal-close'), btnAiPick = $('btn-ai-pick')
const customPrompt = $('custom-prompt'), btnCustomGenerate = $('btn-custom-generate')
const regenBox = $('regen-box'), regenFeedback = $('regen-feedback')
const wordCount = $('word-count'), editorStatus = $('editor-status'), editorTitle = $('editor-title')
const articleList = $('article-list'), statusBar = $('status-bar')
const charCount = $('char-count'), saveIndicator = $('save-indicator')
const hashtagSuggestions = $('hashtag-suggestions')
const editImage = $('edit-image')
const aiProvider = $('ai-provider-main'), aiModel = $('ai-model-main'), aiKeyStatus = $('ai-key-status-main')

const SUGGESTED_HASHTAGS = [
  '#MaintenanceIndustrielle', '#GMAO', '#Fiabilite', '#MaintenancePredictive',
  '#Industrie40', '#RCM', '#AMDEC', '#IoT', '#CMMS', '#MaintenancePreventive',
  '#TransitionNumerique', '#PerformanceIndustrielle', '#SecuriteDesEquipements',
  '#ImmEIT', '#ConseilMaintenance', '#Optimisation',
]

function toast(msg) {
  const t = $('toast')
  t.textContent = msg
  t.classList.remove('hidden')
  setTimeout(() => t.classList.add('hidden'), 2600)
}

function esc(s) {
  if (s === null || s === undefined) return ''
  const d = document.createElement('div')
  d.textContent = String(s)
  return d.innerHTML
}

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function statusClass(s) { return 's-' + (s || 'brouillon') }

async function api(path, options = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${API_BASE}${path}${sep}_=${Date.now()}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function hasSession() {
  return document.cookie.includes('session=') || localStorage.getItem('immeit_token')
}

// SETTINGS IA
function loadAiSettings(forceProvider) {
  const provider = forceProvider || localStorage.getItem('immeit_ai_provider') || 'groq'
  return { provider, model: localStorage.getItem(`immeit_ai_model_${provider}`) || '' }
}

function saveAiSettings(provider, model) {
  localStorage.setItem('immeit_ai_provider', provider)
  if (model) localStorage.setItem(`immeit_ai_model_${provider}`, model)
}

function showArticleImage(url, photographer, photographerUrl) {
  const el = editImage
  if (!url) { el.innerHTML = '—'; return }
  el.innerHTML = `<div class="image-preview">
    <img src="${esc(url)}" alt="Illustration" loading="lazy" onerror="this.parentElement.innerHTML='—'">
    ${photographer ? `<a href="${esc(photographerUrl || '#')}" target="_blank" rel="noopener" class="image-credit">📷 ${esc(photographer)}</a>` : ''}
  </div>`
}

async function loadAvailableModels() {
  try {
    const data = await api('/models')
    availableModels = data.models
    populateAiSelector()
  } catch {}
}

function populateAiSelector() {
  if (!availableModels) return
  const settings = loadAiSettings()
  aiProvider.innerHTML = Object.entries(availableModels)
    .map(([key, val]) => `<option value="${key}"${key === settings.provider ? ' selected' : ''}>${val.label}${!val.enabled ? ` (${val.needsKey || 'clé'} manquante)` : ''}</option>`)
    .join('')
  updateModelList()
}

function updateModelList() {
  const prov = aiProvider.value
  const provData = availableModels?.[prov]
  if (!provData) return
  const settings = loadAiSettings(prov)
  let found = false
  aiModel.innerHTML = provData.models.map(m => {
    const selected = m.id === settings.model || (!settings.model && m.id === provData.default)
    if (selected) found = true
    return `<option value="${m.id}"${selected ? ' selected' : ''}>${m.label}${m.free ? ' ★ gratuit' : ''}</option>`
  }).join('')
  if (!found && aiModel.options.length > 0) aiModel.value = aiModel.options[0].value
  if (provData.enabled) {
    aiKeyStatus.textContent = '✓ Clé configurée'
    aiKeyStatus.className = 'key-ok'
  } else {
    aiKeyStatus.textContent = `⚠ ${provData.needsKey || 'Clé'} manquante`
    aiKeyStatus.className = 'key-missing'
  }
  saveAiSettings(prov, aiModel.value)
}

aiProvider.addEventListener('change', updateModelList)
aiModel.addEventListener('change', () => saveAiSettings(aiProvider.value, aiModel.value))

function getSelectedModel() { return aiModel.value || '' }

// LOGIN
loginForm.addEventListener('submit', async e => {
  e.preventDefault()
  loginError.classList.add('hidden')
  try {
    const data = await api('/auth', { method: 'POST', body: JSON.stringify({ password: loginPassword.value.trim() }) })
    if (data.token) localStorage.setItem('immeit_token', data.token)
    showMain()
  } catch (err) {
    loginError.textContent = err.message
    loginError.classList.remove('hidden')
  }
})

btnLogout.addEventListener('click', () => {
  localStorage.removeItem('immeit_token')
  document.cookie = 'session=; Path=/; Max-Age=0'
  showLogin()
})

// NAVIGATION
function showLogin() {
  loginScreen.classList.remove('hidden')
  mainScreen.classList.add('hidden')
  editorScreen.classList.add('hidden')
  loginPassword.value = ''
  loginPassword.focus()
}

function showMain() {
  loginScreen.classList.add('hidden')
  editorScreen.classList.add('hidden')
  mainScreen.classList.remove('hidden')
  currentPage = 1
  loadAvailableModels()
  loadArticles()
}

function showEditor(article) {
  mainScreen.classList.add('hidden')
  editorScreen.classList.remove('hidden')
  editingId = article ? article.id : null
  regenNews = null

  if (article) {
    editorTitle.textContent = '#' + article.id + ' — ' + (article.titre_interne || '(sans titre)')
    editTitre.value = article.titre_interne || ''
    editCorps.value = article.corps || ''
    const h = article.hashtags || []
    editHashtags.value = Array.isArray(h) ? h.join(' ') : String(h)
    editorStatus.textContent = article.statut
    editorStatus.className = 'badge ' + statusClass(article.statut)
    editSource.textContent = article.source_news_titre ? esc(article.source_news_titre) : '—'
    showArticleImage(article.image_url, article.image_photographer, article.image_photographer_url)
    editIaInfo.textContent = article.ia_provider
      ? `${article.ia_provider} / ${article.ia_model || '—'} · ${article.generation_type === 'custom' ? 'sujet: ' + (article.custom_subject || '') : 'actualité: ' + (article.source_news_titre || '')}`
      : '—'
    editDates.textContent = [
      article.date_creation ? 'Créé: ' + fmtDate(article.date_creation) : '',
      article.date_validation ? 'Validé: ' + fmtDate(article.date_validation) : '',
      article.date_publication ? 'Publié: ' + fmtDate(article.date_publication) : '',
    ].filter(Boolean).join('\n') || '—'
    if (article.source_news_titre) {
      regenNews = { titre: article.source_news_titre, url: article.source_news_url || '', resume: (article.corps || '').slice(0, 200), source: article.source_news_source || '' }
    }
    updateEditorButtons(article.statut)
    updateStatusBar(article.statut)
  } else {
    editorTitle.textContent = 'Nouvel article'
    editTitre.value = ''
    editCorps.value = ''
    editHashtags.value = ''
    editSource.textContent = currentNews ? esc(currentNews.titre) : '—'
    editIaInfo.textContent = currentIaMeta
      ? `${currentIaMeta.provider} / ${currentIaMeta.model || '—'} · ${currentIaMeta.generation_type === 'custom' ? 'sujet: ' + (currentIaMeta.custom_subject || '') : 'actualité: ' + (currentNews?.titre || '')}`
      : '—'
    editDates.textContent = '—'
    editorStatus.textContent = 'brouillon'
    editorStatus.className = 'badge s-brouillon'
    updateEditorButtons('brouillon_nouveau')
    updateStatusBar('brouillon')
  }
  updateWords()
  updateCharCount()
  renderHashtagSuggestions()
  isDirty = false
  setSaveStatus('—')
}

function updateStatusBar(statut) {
  const steps = ['brouillon', 'en_revision', 'valide', 'publie']
  const idx = steps.indexOf(statut)
  if (idx === -1) { statusBar.classList.add('hidden'); return }
  statusBar.classList.remove('hidden')
  statusBar.innerHTML = steps.map((s, i) => {
    let cls = 'status-step'
    if (i < idx) cls += ' done'
    else if (i === idx) cls += ' active'
    const labels = { brouillon: 'Brouillon', en_revision: 'En révision', valide: 'Validé', publie: 'Publié' }
    const icon = i < idx ? '✓' : i === idx ? '●' : '○'
    const arrow = i < steps.length - 1 ? '<span class="status-arrow">→</span>' : ''
    return `<span class="${cls}">${icon} ${labels[s]}</span>${arrow}`
  }).join('')
}

function updateEditorButtons(statut) {
  const hide = el => el.classList.add('hidden')
  const show = el => el.classList.remove('hidden')
  ;[btnSave, btnValidate, btnCopy, btnRegen, btnArchive, btnRestore, btnDelete].forEach(hide)
  btnSave.disabled = false
  btnValidate.disabled = false

  if (statut === 'brouillon_nouveau') {
    show(btnSave); show(btnRegen); show(btnDelete); btnValidate.disabled = true
  } else if (statut === 'brouillon' || statut === 'en_revision') {
    show(btnSave); show(btnValidate); show(btnRegen); show(btnDelete)
  } else if (statut === 'valide' || statut === 'publie') {
    show(btnCopy); show(btnArchive); show(btnRegen)
  } else if (statut === 'archive') {
    show(btnRestore); show(btnDelete)
  }
}

btnBack.addEventListener('click', () => showMain())

// AUTO-SAVE
function markDirty() {
  if (!editingId) return
  isDirty = true
  setSaveStatus('⏳ Non enregistré')
  clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(autoSave, 3000)
}

function setSaveStatus(msg, cls) {
  saveIndicator.textContent = msg
  saveIndicator.className = 'save-indicator' + (cls ? ' ' + cls : '')
}

async function autoSave() {
  if (!isDirty || !editingId) return
  setSaveStatus('⏳ Sauvegarde...', 'saving')
  try {
    await api(`/articles?id=${editingId}`, {
      method: 'PUT',
      body: JSON.stringify({
        titre_interne: editTitre.value,
        corps: editCorps.value,
        hashtags: editHashtags.value.split(/\s+/).filter(h => h),
      }),
    })
    isDirty = false
    setSaveStatus('✓ Sauvegardé', 'saved')
  } catch (e) {
    console.error('Auto-save error:', e)
    setSaveStatus('✗ ' + (e.message || 'Erreur sauvegarde'), 'error')
  }
}

window.addEventListener('beforeunload', e => {
  if (isDirty) e.preventDefault()
})

editTitre.addEventListener('input', markDirty)
editCorps.addEventListener('input', () => { markDirty(); updateWords(); updateCharCount() })
editHashtags.addEventListener('input', () => { markDirty(); renderHashtagSuggestions() })

// LOAD ARTICLES
async function loadArticles() {
  try {
    const params = new URLSearchParams()
    if (filter) params.set('statut', filter)
    params.set('limit', '100')
    const data = await api(`/articles?${params}`)
    articles = data.articles || []
    currentPage = 1
    renderArticles()
  } catch {
    articleList.innerHTML = '<div class="empty">Erreur de chargement</div>'
  }
}

// RENDER
function renderArticles() {
  if (articles.length === 0) {
    articleList.innerHTML = '<div class="empty">Aucun article trouvé</div>'
    $('pagination').classList.add('hidden')
    return
  }
  const totalPages = Math.ceil(articles.length / PAGE_SIZE)
  if (currentPage > totalPages) currentPage = totalPages
  const start = (currentPage - 1) * PAGE_SIZE
  const page = articles.slice(start, start + PAGE_SIZE)

  articleList.innerHTML = page.map((a, i) => `
    <div class="article-card" data-id="${a.id}">
      <div class="article-card-top">
        <span class="num">${start + i + 1}</span>
        <h3>${esc(a.titre_interne || '(sans titre)')}</h3>
        <span class="status ${statusClass(a.statut)}">${a.statut}</span>
      </div>
      <div class="meta">
        <span>${fmtDate(a.date_creation)}</span>
        ${a.ia_provider ? `<span class="ia-badge">${esc(a.ia_provider)} / ${esc(a.ia_model || '—')} · ${a.generation_type === 'custom' ? 'sujet: ' + esc(a.custom_subject || '') : 'actualité: ' + esc(a.source_news_titre || '').slice(0, 40)}</span>` : ''}
      </div>
    </div>`).join('')

  articleList.querySelectorAll('.article-card').forEach(c => {
    c.addEventListener('click', () => {
      const a = articles.find(x => x.id === parseInt(c.dataset.id))
      if (a) showEditor(a)
    })
  })

  if (totalPages > 1) {
    $('pagination').classList.remove('hidden')
    pageInfo.textContent = `Page ${currentPage} / ${totalPages} (${articles.length} articles)`
    btnPrev.disabled = currentPage <= 1
    btnNext.disabled = currentPage >= totalPages
  } else $('pagination').classList.add('hidden')
}

btnPrev.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderArticles() } })
btnNext.addEventListener('click', () => { const t = Math.ceil(articles.length / PAGE_SIZE); if (currentPage < t) { currentPage++; renderArticles() } })

// FILTERS
document.querySelectorAll('.filter-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active'))
    b.classList.add('active')
    filter = b.dataset.filter
    loadArticles()
  })
})

// WORD COUNT + CHAR COUNT
function updateWords() {
  const w = editCorps.value.trim() ? editCorps.value.trim().split(/\s+/).length : 0
  wordCount.textContent = w + ' mots'
}

function updateCharCount() {
  const len = editCorps.value.length
  charCount.textContent = `${len} / 3000 car.`
  charCount.className = 'char-count'
  if (len > 2900) charCount.classList.add('warn')
  if (len > 3000) charCount.classList.add('over')
}

// HASHTAG SUGGESTIONS
function renderHashtagSuggestions() {
  const current = editHashtags.value.split(/\s+/).filter(h => h).map(h => h.toLowerCase())
  let html = ''
  for (const tag of SUGGESTED_HASHTAGS) {
    const used = current.includes(tag.toLowerCase())
    html += `<span class="tag-suggestion${used ? ' used' : ''}" data-tag="${tag}">${tag}</span>`
  }
  hashtagSuggestions.innerHTML = html
  hashtagSuggestions.querySelectorAll('.tag-suggestion').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.dataset.tag
      const tags = editHashtags.value.split(/\s+/).filter(h => h)
      if (tags.map(h => h.toLowerCase()).includes(tag.toLowerCase())) return
      tags.push(tag)
      editHashtags.value = tags.join(' ')
      renderHashtagSuggestions()
      markDirty()
    })
  })
}

// SAVE
btnSave.addEventListener('click', async () => {
  const data = {
    titre_interne: editTitre.value,
    corps: editCorps.value,
    hashtags: editHashtags.value.split(/\s+/).filter(h => h),
  }
  try {
    if (editingId) {
      await api(`/articles?id=${editingId}`, { method: 'PUT', body: JSON.stringify(data) })
      toast('Article enregistré')
      isDirty = false
      setSaveStatus('✓ Sauvegardé', 'saved')
    } else {
      const articleData = {
        ...data,
        source_news_titre: currentNews?.titre || null,
        source_news_url: currentNews?.url || null,
        source_news_source: currentNews?.source || null,
        ia_provider: currentIaMeta?.provider || null,
        ia_model: currentIaMeta?.model || null,
        generation_type: currentIaMeta?.generation_type || null,
        custom_subject: currentIaMeta?.custom_subject || null,
      }
      const result = await api('/articles', { method: 'POST', body: JSON.stringify(articleData) })
      editingId = result.article.id
      editorStatus.textContent = 'brouillon'
      editorStatus.className = 'badge s-brouillon'
      updateEditorButtons('brouillon')
      isDirty = false
      setSaveStatus('✓ Sauvegardé', 'saved')
      toast('Article créé')
    }
    await loadArticles()
  } catch (err) { toast('Erreur: ' + err.message) }
})

// VALIDATE
btnValidate.addEventListener('click', async () => {
  if (!editingId) return
  try {
    await api(`/articles?id=${editingId}`, {
      method: 'PUT',
      body: JSON.stringify({ statut: 'valide', date_validation: new Date().toISOString() }),
    })
    editorStatus.textContent = 'valide'
    editorStatus.className = 'badge s-valide'
    updateEditorButtons('valide')
    updateStatusBar('valide')
    isDirty = false
    toast('Article validé')
    await loadArticles()
  } catch (err) { toast('Erreur: ' + err.message) }
})

// COPY — formaté pour LinkedIn
function formatForLinkedIn(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

btnCopy.addEventListener('click', async () => {
  let text = formatForLinkedIn(editCorps.value)
  const h = editHashtags.value.split(/\s+/).filter(h => h)
  if (h.length) text += '\n\n' + h.join(' ')

  if (text.length > 3000) {
    toast(`⚠ Attention: ${text.length} car. (max 3000 recommandé)`)
  }

  try {
    await navigator.clipboard.writeText(text)
    if (editingId) {
      await api(`/articles?id=${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ statut: 'publie', date_publication: new Date().toISOString() }),
      })
      editorStatus.textContent = 'publie'
      editorStatus.className = 'badge s-publie'
      updateEditorButtons('publie')
      updateStatusBar('publie')
      await loadArticles()
    }
    toast('Copié pour LinkedIn !')
  } catch { toast('Erreur de copie') }
})

// ARCHIVE
btnArchive.addEventListener('click', async () => {
  if (!editingId) return
  try {
    await api(`/articles?id=${editingId}`, { method: 'PUT', body: JSON.stringify({ statut: 'archive' }) })
    editorStatus.textContent = 'archive'
    editorStatus.className = 'badge s-archive'
    updateEditorButtons('archive')
    statusBar.classList.add('hidden')
    toast('Article archivé')
    await loadArticles()
  } catch (err) { toast('Erreur: ' + err.message) }
})

// RESTORE
btnRestore.addEventListener('click', async () => {
  if (!editingId) return
  try {
    await api(`/articles?id=${editingId}`, { method: 'PUT', body: JSON.stringify({ statut: 'brouillon' }) })
    editorStatus.textContent = 'brouillon'
    editorStatus.className = 'badge s-brouillon'
    updateEditorButtons('brouillon')
    updateStatusBar('brouillon')
    toast('Article restauré en brouillon')
    await loadArticles()
  } catch (err) { toast('Erreur: ' + err.message) }
})

// DELETE
btnDelete.addEventListener('click', async () => {
  if (!editingId) return
  if (!confirm('Supprimer définitivement cet article ? Cette action est irréversible.')) return
  try {
    await api(`/articles?id=${editingId}`, { method: 'DELETE' })
    toast('Article supprimé')
    editingId = null
    showMain()
  } catch (err) { toast('Erreur: ' + err.message) }
})

// REGENERATE
btnRegen.addEventListener('click', () => regenBox.classList.toggle('hidden'))

btnRegenGo.addEventListener('click', async () => {
  const news = currentNews || regenNews
  if (!news) { toast('Aucune actualité source'); return }
  const feedback = regenFeedback.value
  btnRegenGo.disabled = true
  btnRegenGo.textContent = 'Génération...'
  try {
    const data = await api('/generate', {
      method: 'POST',
      body: JSON.stringify({ news, feedback, provider: aiProvider.value, model: getSelectedModel() }),
    })
    currentIaMeta = data.ia
    const art = data.article
    editTitre.value = art.titre_interne || ''
    editCorps.value = `Accroche A :\n${art.accroche_a || ''}\n\nAccroche B :\n${art.accroche_b || ''}\n\n${art.corps || ''}`
    editHashtags.value = (art.hashtags || []).join(' ')
    showArticleImage(art.image_url, art.image_photographer, art.image_photographer_url)
    updateWords()
    updateCharCount()
    renderHashtagSuggestions()
    if (editingId) {
      await api(`/articles?id=${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ titre_interne: art.titre_interne, corps: editCorps.value, hashtags: art.hashtags || [], image_url: art.image_url || null, image_photographer: art.image_photographer || null, image_photographer_url: art.image_photographer_url || null, ia_provider: currentIaMeta.provider, ia_model: currentIaMeta.model, generation_type: currentIaMeta.generation_type, statut: 'brouillon' }),
      })
      editorStatus.textContent = 'brouillon'
      editorStatus.className = 'badge s-brouillon'
      updateEditorButtons('brouillon')
      await loadArticles()
    }
    regenBox.classList.add('hidden')
    regenFeedback.value = ''
    toast('Article régénéré')
  } catch (err) { toast('Erreur: ' + err.message) }
  finally { btnRegenGo.disabled = false; btnRegenGo.textContent = 'Confirmer la régénération' }
})

// NEW ARTICLE
btnNew.addEventListener('click', async () => {
  newsModal.classList.remove('hidden')
  customPrompt.value = ''
  customPrompt.focus()
  $('news-list').innerHTML = '<div class="empty">Recherche des actualités en cours...</div>'
  currentNews = null
  try {
    const data = await api('/news')
    const items = data.news || []
    if (items.length === 0) { $('news-list').innerHTML = '<div class="empty">Aucune actualité trouvée</div>'; return }
    $('news-list').innerHTML = items.map((item, i) =>
      `<div class="news-item" data-idx="${i}">
        <h4>${esc(item.titre)}</h4>
        <div class="src">${esc(item.source)}</div>
        <div class="sum">${esc((item.resume || '').slice(0, 200))}</div>
      </div>`
    ).join('')
    $('news-list').querySelectorAll('.news-item').forEach(el => {
      el.addEventListener('click', () => {
        if (isGenerating) return
        $('news-list').querySelectorAll('.news-item').forEach(n => n.classList.remove('selected'))
        el.classList.add('selected')
        currentNews = items[parseInt(el.dataset.idx)]
        generateFromNews(currentNews)
      })
    })
  } catch (err) { $('news-list').innerHTML = '<div class="empty">Erreur: ' + esc(err.message) + '</div>' }
})

function setGenerating(loading) {
  isGenerating = loading
  const overlay = $('modal-loading')
  if (loading) {
    overlay.classList.remove('hidden')
    btnCustomGenerate.disabled = true
    btnCustomGenerate.textContent = 'Génération...'
  } else {
    overlay.classList.add('hidden')
    btnCustomGenerate.disabled = false
    btnCustomGenerate.textContent = 'Générer'
  }
}

btnCustomGenerate.addEventListener('click', async () => {
  if (isGenerating) return
  const sujet = customPrompt.value.trim()
  if (!sujet || sujet.length < 3) { toast('Indique un sujet (min. 3 caractères)'); return }
  setGenerating(true)
  try {
    const data = await api('/generate', {
      method: 'POST',
      body: JSON.stringify({ customPrompt: sujet, feedback: '', provider: aiProvider.value, model: getSelectedModel() }),
    })
    currentIaMeta = data.ia
    const art = data.article
    showEditor(null)
    editTitre.value = art.titre_interne || sujet
    editCorps.value = `Accroche A :\n${art.accroche_a || ''}\n\nAccroche B :\n${art.accroche_b || ''}\n\n${art.corps || ''}`
    editHashtags.value = (art.hashtags || []).join(' ')
    showArticleImage(art.image_url, art.image_photographer, art.image_photographer_url)
    updateWords()
    updateCharCount()
    renderHashtagSuggestions()
    currentNews = null
    customPrompt.value = ''
    newsModal.classList.add('hidden')
    toast('Article généré !')
  } catch (err) { toast('Erreur: ' + err.message) }
  finally { setGenerating(false) }
})

customPrompt.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnCustomGenerate.click()
})

btnAiPick.addEventListener('click', async () => {
  if (isGenerating) return
  try {
    const data = await api('/news')
    const items = data.news || []
    if (!items.length) { toast('Aucune actualité'); return }
    currentNews = items[Math.floor(Math.random() * items.length)]
    generateFromNews(currentNews)
  } catch (err) { toast('Erreur: ' + err.message) }
})

modalClose.addEventListener('click', () => {
  if (isGenerating) return
  newsModal.classList.add('hidden')
})

async function generateFromNews(news) {
  if (isGenerating) return
  setGenerating(true)
  try {
    const data = await api('/generate', {
      method: 'POST',
      body: JSON.stringify({ news, feedback: '', provider: aiProvider.value, model: getSelectedModel() }),
    })
    currentIaMeta = data.ia
    const art = data.article
    showEditor(null)
    editTitre.value = art.titre_interne || ''
    editCorps.value = `Accroche A :\n${art.accroche_a || ''}\n\nAccroche B :\n${art.accroche_b || ''}\n\n${art.corps || ''}`
    editHashtags.value = (art.hashtags || []).join(' ')
    showArticleImage(art.image_url, art.image_photographer, art.image_photographer_url)
    updateWords()
    updateCharCount()
    renderHashtagSuggestions()
    currentNews = news
    newsModal.classList.add('hidden')
    toast('Article généré !')
  } catch (err) { toast('Erreur: ' + err.message) }
  finally { setGenerating(false) }
}

// INIT
async function init() {
  if (hasSession()) {
    await loadAvailableModels()
    showMain()
  } else showLogin()
}

init()
