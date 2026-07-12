const API_BASE = '/api'
const APP_VERSION = '160'

// Cache invalidation : reload si un nouveau déploiement est détecté
;(() => {
  const htmlEl = document.getElementById('app-version')
  const htmlVersion = (htmlEl?.textContent || '').replace(/^v/, '') || '0'
  const storedVersion = localStorage.getItem('immeit_app_version')

  // Évite la boucle infinie : ne reload qu'1x par session
  const alreadyReloaded = sessionStorage.getItem('immeit_reloaded')

  if ((htmlVersion !== APP_VERSION || (storedVersion && storedVersion !== APP_VERSION)) && !alreadyReloaded) {
    localStorage.setItem('immeit_app_version', APP_VERSION)
    // Invalider aussi le cache dashboard pour forcer un rechargement fresh
    localStorage.removeItem('immeit_dash_cache')
    sessionStorage.setItem('immeit_reloaded', '1')
    if (htmlEl) htmlEl.textContent = 'v' + APP_VERSION
    location.reload()
    return
  }
  if (!storedVersion) localStorage.setItem('immeit_app_version', APP_VERSION)
})()

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
let accrocheActive = 'a'
const PAGE_SIZE = 10
const LINKEDIN_TARGET = 1500

const $ = id => document.getElementById(id)

const appContainer = $('shell'), loginScreen = $('login-screen'), mainScreen = $('main-screen'), editorScreen = $('editor-screen')
const loginForm = $('login-form'), loginPassword = $('login-password'), loginError = $('login-error')
const editTitre = $('edit-titre'), editAccrocheA = $('edit-accroche-a'), editAccrocheB = $('edit-accroche-b'), editCorps = $('edit-corps'), editHashtags = $('edit-hashtags')
const editSource = $('edit-source'), editIaInfo = $('edit-ia-info'), editDates = $('edit-dates')
const editorPlaceholder = $('editor-placeholder'), editorForm = $('editor-form')
const btnBack = $('btn-back'), btnSave = $('btn-save'), btnValidate = $('btn-validate')
const btnCopy = $('btn-copy'), btnDelete = $('btn-delete'), btnRegen = $('btn-regen'), btnRegenGo = $('btn-regen-go')
const btnNew = $('btn-new'), btnLogout = $('btn-logout')
const btnArchive = $('btn-archive'), btnRestore = $('btn-restore')
const btnPrev = $('btn-prev'), btnNext = $('btn-next'), pageInfo = $('page-info')
const newsModal = $('news-modal'), modalClose = $('modal-close'), btnAiPick = $('btn-ai-pick')
const customPrompt = $('custom-prompt'), btnCustomGenerate = $('btn-custom-generate')
const regenBox = $('regen-box'), regenFeedback = $('regen-feedback')
const wordCount = $('word-count'), editorStatus = $('editor-status')
const articleList = $('article-list'), statusBar = $('status-bar')
const charCount = $('char-count'), saveIndicator = $('save-indicator')
const hashtagSuggestions = $('hashtag-suggestions')
const editImages = $('edit-images')
const btnAddImage = $('btn-add-image'), btnReplaceImage = $('btn-replace-image'), btnRemoveImage = $('btn-remove-image')
const imageSearchBox = $('image-search-box'), imageSearchInput = $('image-search-input'), imageSearchResults = $('image-search-results')
const accrocheRadios = document.querySelectorAll('input[name="accroche-active"]')
const accrocheCards = document.querySelectorAll('.accroche-card')
const aiProvider = $('ai-provider-main'), aiModel = $('ai-model-main'), aiKeyStatus = $('ai-key-status-main')
const btnPreview = $('btn-preview'), linkedinPreview = $('linkedin-preview'), liPreviewBody = $('li-preview-body'), btnClosePreview = $('btn-close-preview')
const navArticles = document.querySelector('[data-app="articles"]'), navDashboard = document.querySelector('[data-app="dashboard"]')
const dashboardScreen = $('dashboard-screen'), dashContent = $('dash-content')

const dashLoading = $('dash-loading'), dashError = $('dash-error'), dashErrorText = $('dash-error-text')
const shellTitle = $('shell-title'), shellTopbar = $('shell-topbar')

const excelToDate = val => {
  const num = parseFloat(String(val).replace(',', '.'))
  if (!isNaN(num) && num > 40000 && num < 60000) return new Date(Math.round((num - 25569) * 86400000))
  return null
}

const SUGGESTED_HASHTAGS = [
  '#MaintenanceIndustrielle', '#GMAO', '#Fiabilite', '#MaintenancePredictive',
  '#Industrie40', '#RCM', '#AMDEC', '#IoT', '#CMMS', '#MaintenancePreventive',
  '#TransitionNumerique', '#PerformanceIndustrielle', '#SecuriteDesEquipements',
  '#ImmEIT', '#ConseilMaintenance', '#Optimisation',
]

let articleImages = []
let selectedImageIndex = -1

function showToast(message, type = 'success', duration = 3000) {
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }
  const existing = document.querySelector('.toast-custom')
  if (existing) {
    existing.style.animation = 'fadeOut .2s ease forwards'
    setTimeout(() => existing.remove(), 200)
  }
  const toast = document.createElement('div')
  toast.className = 'toast-custom'
  toast.dataset.type = type
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.animation = 'fadeOut .2s ease forwards'
    setTimeout(() => toast.remove(), 200)
  }, duration)
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

function getCookie(name) {
  return document.cookie.split('; ').find(r => r.startsWith(name + '='))?.split('=')[1]
}

async function api(path, options = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const controller = new AbortController()
  const ms = options.timeout || (path.includes('/generate') ? 60000 : path.includes('/dashboard') ? 25000 : 20000)
  const timeout = setTimeout(() => controller.abort(new Error('Délai d\'attente dépassé (' + (ms / 1000) + 's)')), ms)
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  const method = (options.method || 'GET').toUpperCase()
  if (method !== 'GET') {
    const csrf = getCookie('csrf')
    if (csrf) headers['X-CSRF-Token'] = csrf
  }
  try {
    const res = await fetch(`${API_BASE}${path}${sep}_=${Date.now()}`, {
      ...options,
      headers,
      credentials: 'same-origin',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (res.status === 401) {
      document.cookie = 'session=; Path=/; Max-Age=0'
      localStorage.removeItem('immeit_session')
      showLogin()
      throw new Error('Session expirée. Veuillez vous reconnecter.')
    }
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    return data
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

function hasSession() {
  return localStorage.getItem('immeit_session') === '1'
}



// --- AI MODEL SELECTOR ---
async function loadAvailableModels() {
  try {
    const data = await api('/models')
    availableModels = data.models || {}
    const providerSel = aiProvider
    const modelSel = aiModel
    providerSel.innerHTML = ''
    const savedProvider = localStorage.getItem('immeit_ai_provider') || 'groq'

    for (const [key, prov] of Object.entries(availableModels)) {
      const opt = document.createElement('option')
      opt.value = key
      opt.textContent = prov.label + (prov.enabled ? '' : ' ⚠ clé manquante')
      providerSel.appendChild(opt)
    }

    providerSel.value = savedProvider
    updateModelList(savedProvider)
    updateKeyStatus(savedProvider)

    providerSel.addEventListener('change', () => {
      const p = providerSel.value
      localStorage.setItem('immeit_ai_provider', p)
      updateModelList(p)
      updateKeyStatus(p)
    })
  } catch {
    aiProvider.innerHTML = '<option value="">Erreur</option>'
    aiModel.innerHTML = '<option value="">—</option>'
  }
}

function updateModelList(providerKey) {
  const prov = availableModels?.[providerKey]
  const modelSel = aiModel
  modelSel.innerHTML = ''
  if (!prov || !prov.models) {
    modelSel.innerHTML = '<option value="">—</option>'
    return
  }
  const savedModel = localStorage.getItem(`immeit_ai_model_${providerKey}`)
  for (const m of prov.models) {
    const opt = document.createElement('option')
    opt.value = m.id
    opt.textContent = m.free ? m.label : `${m.label} 💳`
    modelSel.appendChild(opt)
  }
  if (savedModel && prov.models.some(m => m.id === savedModel)) {
    modelSel.value = savedModel
  } else if (prov.default) {
    modelSel.value = prov.default
  }
}

function updateKeyStatus(providerKey) {
  const prov = availableModels?.[providerKey]
  aiKeyStatus.textContent = prov?.enabled ? '✓' : '✗'
  aiKeyStatus.className = 'key-status ' + (prov?.enabled ? 'key-ok' : 'key-missing')
}

function getSelectedModel() {
  return aiModel.value || null
}

// --- IMAGE MANAGEMENT ---
function renderImages() {
  const el = editImages
  if (!articleImages.length) {
    el.innerHTML = '<div class="images-empty">Aucune illustration</div>'
    btnReplaceImage.classList.add('hidden')
    btnRemoveImage.classList.add('hidden')
    selectedImageIndex = -1
    return
  }
  el.innerHTML = articleImages.map((img, i) => {
    const sel = i === selectedImageIndex ? ' selected' : ''
    return `<div class="image-item${sel}" data-idx="${i}">
      <img src="${esc(img.thumbnail || img.url)}" alt="${esc(img.alt || 'Illustration ' + (i+1))}" loading="lazy" onerror="this.parentElement.classList.add('broken')">
      <span class="image-item-idx">${i + 1}</span>
      ${img.photographer ? `<a href="${esc(img.photographer_url || '#')}" target="_blank" rel="noopener" class="image-item-credit">📷 ${esc(img.photographer)}</a>` : ''}
    </div>`
  }).join('')

  el.querySelectorAll('.image-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedImageIndex = parseInt(item.dataset.idx)
      renderImages()
      btnReplaceImage.classList.remove('hidden')
      btnRemoveImage.classList.remove('hidden')
      markDirty()
    })
  })

  if (articleImages.length === 0) {
    selectedImageIndex = -1
    btnReplaceImage.classList.add('hidden')
    btnRemoveImage.classList.add('hidden')
    return
  }
  if (selectedImageIndex === -1 || selectedImageIndex >= articleImages.length) {
    selectedImageIndex = articleImages.length - 1
    btnReplaceImage.classList.remove('hidden')
    btnRemoveImage.classList.remove('hidden')
    renderImages()
  }
}

function removeSelectedImage() {
  if (selectedImageIndex < 0 || selectedImageIndex >= articleImages.length) return
  articleImages.splice(selectedImageIndex, 1)
  selectedImageIndex = Math.min(selectedImageIndex, articleImages.length - 1)
  renderImages()
  markDirty()
}

btnAddImage.addEventListener('click', () => {
  imageSearchBox.classList.remove('hidden')
  imageSearchInput.value = ''
  imageSearchInput.focus()
  imageSearchResults.innerHTML = ''
})

btnReplaceImage.addEventListener('click', () => {
  imageSearchBox.classList.remove('hidden')
  imageSearchInput.value = ''
  imageSearchInput.focus()
  imageSearchResults.innerHTML = ''
})

btnRemoveImage.addEventListener('click', removeSelectedImage)

let _imageSearchTimer
imageSearchInput.addEventListener('input', () => {
  clearTimeout(_imageSearchTimer)
  const q = imageSearchInput.value.trim()
  if (q.length < 3) { imageSearchResults.innerHTML = ''; return }
  _imageSearchTimer = setTimeout(async () => {
    try {
      const data = await api(`/images?query=${encodeURIComponent(q)}`)
      const photos = data.photos || []
      if (!photos.length) { imageSearchResults.innerHTML = '<div class="empty">Aucun résultat</div>'; return }
      imageSearchResults.innerHTML = photos.map(p => `
        <div class="search-result-item" data-url="${esc(p.url)}" data-thumb="${esc(p.thumbnail)}" data-photographer="${esc(p.photographer)}" data-photographer-url="${esc(p.photographer_url)}" data-alt="${esc(p.alt || '')}">
          <img src="${esc(p.thumbnail)}" alt="${esc(p.alt || '')}" loading="lazy">
          <div class="search-result-overlay">+</div>
        </div>
      `).join('')
      imageSearchResults.querySelectorAll('.search-result-item').forEach(el => {
        el.addEventListener('click', () => {
          const img = {
            url: el.dataset.url,
            thumbnail: el.dataset.thumb,
            photographer: el.dataset.photographer,
            photographer_url: el.dataset.photographerUrl,
            alt: el.dataset.alt,
          }
          if (selectedImageIndex >= 0 && selectedImageIndex < articleImages.length) {
            articleImages[selectedImageIndex] = img
          } else {
            articleImages.push(img)
            selectedImageIndex = articleImages.length - 1
          }
          renderImages()
          imageSearchBox.classList.add('hidden')
          markDirty()
        })
      })
    } catch { imageSearchResults.innerHTML = '<div class="empty">Erreur réseau</div>' }
  }, 300)
})

function setArticleImages(images, primaryUrl) {
  articleImages = []
  if (images && images.length) {
    articleImages = images.slice()
  } else if (primaryUrl) {
    articleImages = [{ url: primaryUrl, thumbnail: primaryUrl, photographer: '', photographer_url: '', alt: '' }]
  }
  selectedImageIndex = articleImages.length > 0 ? 0 : -1
  renderImages()
}

// --- LOGIN ---
loginForm.addEventListener('submit', async e => {
  e.preventDefault()
  loginError.classList.add('hidden')
  try {
    const data = await api('/auth', { method: 'POST', body: JSON.stringify({ password: loginPassword.value.trim() }) })
    localStorage.setItem('immeit_session', '1')
    showMain()
  } catch (err) {
    loginError.textContent = err.message
    loginError.classList.remove('hidden')
  }
})

btnLogout.addEventListener('click', async () => {
  disconnectSSE()
  try {
    await api('/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) })
  } catch {}
  localStorage.removeItem('immeit_session')
  showLogin()
})

function showLogin() {
  appContainer.classList.add('hidden')
  loginScreen.classList.remove('hidden')
  mainScreen.classList.add('hidden')
  editorScreen.classList.add('hidden')
  dashboardScreen.classList.add('hidden')
  document.querySelector('.app-row')?.classList.add('hidden')
  loginPassword.value = ''
  loginPassword.focus()
}

function showMain() {
  loginScreen.classList.add('hidden')
  mainScreen.classList.remove('hidden')
  editorScreen.classList.remove('hidden')
  dashboardScreen.classList.add('hidden')
  document.querySelector('.app-row')?.classList.remove('hidden')
  appContainer.classList.remove('hidden')
  const aiSel = document.getElementById('shell-ai-selector')
  if (aiSel) aiSel.style.display = ''
  if (shellTitle) { shellTitle.style.display = ''; shellTitle.textContent = 'Articles' }
  if (shellTopbar) shellTopbar.classList.remove('hidden')
  navArticles?.classList.add('active')
  navDashboard?.classList.remove('active')
  localStorage.setItem('immeit_last_view', 'articles')
  resetEditor()
  currentPage = 1
  if (!availableModels) loadAvailableModels()
  loadArticles()
}

function resetEditor() {
  editingId = null
  editorPlaceholder.classList.remove('hidden')
  editorForm.classList.add('hidden')
  currentNews = null
  currentIaMeta = null
}

function showEditor(article) {
  editorPlaceholder.classList.add('hidden')
  editorForm.classList.remove('hidden')
  editingId = article ? article.id : null
  regenNews = null

  if (article) {
    editTitre.value = article.titre_interne || ''
    editAccrocheA.value = article.accroche_a || ''
    editAccrocheB.value = article.accroche_b || ''
    accrocheActive = article.accroche_active || 'a'
    accrocheRadios.forEach(r => r.checked = r.value === accrocheActive)
    accrocheCards.forEach(c => c.classList.toggle('selected', c.dataset.value === accrocheActive))
    editCorps.value = article.corps || ''
    const h = article.hashtags || []
    editHashtags.value = Array.isArray(h) ? h.join(' ') : String(h)
    editorStatus.textContent = article.statut
    editorStatus.className = 'badge ' + statusClass(article.statut)
    editSource.textContent = article.source_news_titre ? esc(article.source_news_titre) : '—'
    editIaInfo.textContent = article.ia_provider
      ? `${article.ia_provider} / ${article.ia_model || '—'} · ${article.generation_type === 'custom' ? 'sujet: ' + (article.custom_subject || '') : 'actualité: ' + (article.source_news_titre || '')}`
      : '—'
    editDates.textContent = [
      article.date_creation ? 'Créé: ' + fmtDate(article.date_creation) : '',
      article.date_validation ? 'Validé: ' + fmtDate(article.date_validation) : '',
      article.date_publication ? 'Publié: ' + fmtDate(article.date_publication) : '',
    ].filter(Boolean).join('\n') || '—'

    currentIaMeta = {
      provider: article.ia_provider || null,
      model: article.ia_model || null,
      generation_type: article.generation_type || null,
      custom_subject: article.custom_subject || null,
    }

    if (article.source_news_titre) {
      regenNews = { titre: article.source_news_titre, url: article.source_news_url || '', resume: (article.corps || '').slice(0, 200), source: article.source_news_source || '' }
    }

    setArticleImages(article.image_options || (article.image_url ? [{ url: article.image_url, thumbnail: article.image_url, photographer: article.image_photographer || '', photographer_url: article.image_photographer_url || '', alt: '' }] : []), article.image_url)
    updateEditorButtons(article.statut)
    updateStatusBar(article.statut)
  } else {
    editTitre.value = ''
    editAccrocheA.value = ''
    editAccrocheB.value = ''
    accrocheActive = 'a'
    accrocheRadios.forEach(r => r.checked = r.value === 'a')
    accrocheCards.forEach(c => c.classList.toggle('selected', c.dataset.value === 'a'))
    editCorps.value = ''
    editHashtags.value = ''
    editSource.textContent = currentNews ? esc(currentNews.titre) : '—'
    editIaInfo.textContent = currentIaMeta
      ? `${currentIaMeta.provider} / ${currentIaMeta.model || '—'} · ${currentIaMeta.generation_type === 'custom' ? 'sujet: ' + (currentIaMeta.custom_subject || '') : 'actualité: ' + (currentNews?.titre || '')}`
      : '—'
    editDates.textContent = '—'
    editorStatus.textContent = 'brouillon'
    editorStatus.className = 'badge s-brouillon'
    setArticleImages(currentIaMeta?.image_options || [], null)
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
  ;[btnSave, btnValidate, btnCopy, btnRegen, btnArchive, btnRestore, btnDelete, btnPreview].forEach(hide)
  btnSave.disabled = false
  btnValidate.disabled = false

  if (statut === 'brouillon_nouveau') {
    show(btnSave); show(btnRegen); show(btnDelete); btnValidate.disabled = true
  } else if (statut === 'brouillon' || statut === 'en_revision') {
    show(btnSave); show(btnValidate); show(btnRegen); show(btnDelete); show(btnPreview)
  } else if (statut === 'valide' || statut === 'publie') {
    show(btnCopy); show(btnArchive); show(btnRegen); show(btnPreview)
  } else if (statut === 'archive') {
    show(btnRestore); show(btnDelete)
  }
}

btnBack.addEventListener('click', () => showMain())

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
    const imageOptions = articleImages.length ? articleImages : null
    await api(`/articles?id=${editingId}`, {
      method: 'PUT',
      body: JSON.stringify({
      titre_interne: editTitre.value,
      accroche_a: editAccrocheA.value || null,
      accroche_b: editAccrocheB.value || null,
      accroche_active: accrocheActive,
      corps: editCorps.value,
      hashtags: editHashtags.value.split(/\s+/).filter(h => h),
      image_url: articleImages[0]?.url || null,
      image_photographer: articleImages[0]?.photographer || null,
      image_photographer_url: articleImages[0]?.photographer_url || null,
      image_options: imageOptions,
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
  if (isDirty) e.returnValue = ''
})

editTitre.addEventListener('input', markDirty)
editAccrocheA.addEventListener('input', markDirty)
editAccrocheB.addEventListener('input', markDirty)
editCorps.addEventListener('input', () => { markDirty(); updateWords(); updateCharCount() })
editHashtags.addEventListener('input', markDirty)

function injectAccrocheIntoBody() {
  const selected = accrocheActive === 'a' ? editAccrocheA.value : editAccrocheB.value
  const current = editCorps.value
  let clean = current

  const aVal = editAccrocheA.value
  const bVal = editAccrocheB.value

  if (aVal && clean.startsWith(aVal)) {
    clean = clean.slice(aVal.length).replace(/^\n+/, '')
  } else if (bVal && clean.startsWith(bVal)) {
    clean = clean.slice(bVal.length).replace(/^\n+/, '')
  }

  editCorps.value = selected ? selected + '\n\n' + clean : clean
  updateWords()
  updateCharCount()
  markDirty()
}

accrocheCards.forEach(c => {
  c.addEventListener('click', () => {
    const val = c.dataset.value
    accrocheActive = val
    accrocheRadios.forEach(r => r.checked = r.value === val)
    accrocheCards.forEach(card => card.classList.toggle('selected', card.dataset.value === val))
    injectAccrocheIntoBody()
  })
})

editAccrocheA.addEventListener('input', () => {
  if (accrocheActive === 'a') markDirty()
})
editAccrocheB.addEventListener('input', () => {
  if (accrocheActive === 'b') markDirty()
})

function formatHashtags(input) {
  return input
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
    .filter(tag => /^#[a-zA-ZÀ-ÿ0-9_]+$/.test(tag))
    .join(' ')
}

editHashtags.addEventListener('blur', (e) => {
  e.target.value = formatHashtags(e.target.value)
  renderHashtagSuggestions()
})

let _loadSeq = 0
function loadArticles() {
  const seq = ++_loadSeq
  showSkeleton(articleList)
  const params = new URLSearchParams()
  if (filter) params.set('statut', filter)
  params.set('limit', '50')
  if (currentPage > 1) params.set('page', String(currentPage))
  api(`/articles?${params}`).then(data => {
    if (seq !== _loadSeq) return
    articles = data.articles || []
    currentPage = 1
    if (!editingId && articles.length > 0) {
      showEditor(articles[0])
    }
    renderArticles()
  }).catch(() => {
    if (seq !== _loadSeq) return
    articleList.innerHTML = '<div class="empty">Erreur de chargement <button class="btn btn--ghost btn-sm" onclick="loadArticles()">Réessayer</button></div>'
  })
}

function showSkeleton(container) {
  container.innerHTML = Array(5).fill('<div class="skeleton skeleton-card"></div>').join('')
}

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

  articleList.innerHTML = page.map((a, i) => {
    const selected = editingId === a.id ? ' selected' : ''
    return `<div class="article-card${selected}" data-id="${a.id}">
      <div class="article-card-top">
        <span class="num">${start + i + 1}</span>
        <h3>${esc(a.titre_interne || '(sans titre)')}</h3>
        <span class="status ${statusClass(a.statut)}">${a.statut}</span>
      </div>
      <div class="meta">
        <span>${fmtDate(a.date_creation)}</span>
        ${a.ia_provider ? `<span class="ia-badge">${esc(a.ia_provider)} / ${esc(a.ia_model || '—')} · ${a.generation_type === 'custom' ? 'sujet: ' + esc(a.custom_subject || '').slice(0, 40) : 'actualité: ' + esc(a.source_news_titre || '').slice(0, 40)}</span>` : ''}
      </div>
      ${a.image_url ? `<div class="article-card-img"><img src="${esc(a.image_url)}" alt="" loading="lazy" onerror="this.parentElement.remove()"></div>` : ''}
    </div>`
  }).join('')

  articleList.querySelectorAll('.article-card').forEach(c => {
    c.addEventListener('click', () => {
      const a = articles.find(x => x.id === parseInt(c.dataset.id))
      if (a) { showEditor(a); renderArticles() }
    })
  })

  if (totalPages > 1) {
    $('pagination').classList.remove('hidden')
    pageInfo.textContent = `Page ${currentPage} / ${totalPages} (${articles.length} articles)`
    btnPrev.disabled = currentPage <= 1
    btnNext.disabled = currentPage >= totalPages
  } else $('pagination').classList.add('hidden')
}

btnPrev.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--
    const start = (currentPage - 1) * PAGE_SIZE
    const a = articles[start]
    if (a) showEditor(a)
    renderArticles()
  }
})
btnNext.addEventListener('click', () => {
  const t = Math.ceil(articles.length / PAGE_SIZE)
  if (currentPage < t) {
    currentPage++
    const start = (currentPage - 1) * PAGE_SIZE
    const a = articles[start]
    if (a) showEditor(a)
    renderArticles()
  }
})

document.querySelectorAll('.tab').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'))
    b.classList.add('active')
    filter = b.dataset.filter
    editingId = null
    loadArticles()
  })
})

function updateWords() {
  const text = editCorps.value
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const chars = text.length
  const pct = Math.min(100, Math.round(words / LINKEDIN_TARGET * 100))
  const color = words < 800 ? '#F59E0B' : words <= 2000 ? '#10B981' : '#EF4444'

  wordCount.innerHTML = `
    <span style="color:${color};font-weight:600">${words} mots</span>
    <span style="color:var(--clr-text-light)"> · ${chars} car. · ${pct}% cible LinkedIn</span>
  `
}

function updateCharCount() {
  const len = editCorps.value.length
  charCount.textContent = `${len} / 3000 car.`
  charCount.className = 'char-count'
  if (len > 2900) charCount.classList.add('warn')
  if (len > 3000) charCount.classList.add('over')
}

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
  if (btnSave.disabled) return
  btnSave.disabled = true
  btnSave.textContent = 'Sauvegarde…'
  const imageOptions = articleImages.length ? articleImages : null
  const data = {
    titre_interne: editTitre.value,
    accroche_a: editAccrocheA.value || null,
    accroche_b: editAccrocheB.value || null,
    accroche_active: accrocheActive,
    corps: editCorps.value,
    hashtags: editHashtags.value.split(/\s+/).filter(h => h),
    image_url: articleImages[0]?.url || null,
    image_photographer: articleImages[0]?.photographer || null,
    image_photographer_url: articleImages[0]?.photographer_url || null,
    image_options: imageOptions,
  }
  try {
    if (editingId) {
      await api(`/articles?id=${editingId}`, { method: 'PUT', body: JSON.stringify(data) })
      showToast('Article enregistré', 'success')
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
      articles.unshift(result.article)
      renderArticles()
      editorStatus.textContent = 'brouillon'
      editorStatus.className = 'badge s-brouillon'
      updateEditorButtons('brouillon')
      isDirty = false
      setSaveStatus('✓ Sauvegardé', 'saved')
      showToast('Article créé', 'success')
      return
    }
    const updated = await api(`/articles?id=${editingId}`, { method: 'GET' })
    const idx = articles.findIndex(a => a.id === editingId)
    if (idx !== -1) articles[idx] = updated.article
    renderArticles()
  } catch (err) { showToast('Erreur: ' + err.message, 'error') }
  finally { btnSave.disabled = false; btnSave.textContent = 'Sauvegarder' }
})

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
    showToast('Article validé', 'success')
    const idx = articles.findIndex(a => a.id === editingId)
    if (idx !== -1) { articles[idx].statut = 'valide'; renderArticles() }
  } catch (err) { showToast('Erreur: ' + err.message, 'error') }
})

// --- FORMAT FOR LINKEDIN (nettoyage avant copie) ---
function formatForLinkedIn(text) {
  let result = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-]\s+/gm, '• ')
    .replace(/^•\s*/gm, '• ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return result
}

function renderLinkedInPreview(text) {
  const lines = text.split('\n')
  let html = ''
  let inList = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      if (inList) { html += '</ul>'; inList = false }
      html += '<div class="li-spacer"></div>'
      continue
    }

    const bulletMatch = trimmed.match(/^[•\-]\s+(.*)/)
    if (bulletMatch) {
      if (!inList) { html += '<ul class="li-list">'; inList = true }
      html += `<li>${esc(bulletMatch[1])}</li>`
      continue
    }

    if (inList) { html += '</ul>'; inList = false }

    const escaped = esc(trimmed)
    const formatted = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    html += `<p class="li-paragraph">${formatted}</p>`
  }
  if (inList) html += '</ul>'

  return html
}

btnCopy.addEventListener('click', async () => {
  let text = formatForLinkedIn(editCorps.value)
  const h = editHashtags.value.split(/\s+/).filter(h => h)
  if (h.length) text += '\n\n' + h.join(' ')

  if (text.length > 3000) {
    showToast(`⚠ ${text.length} car. (max 3000 recommandé)`, 'warning')
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
      const idx = articles.findIndex(a => a.id === editingId)
      if (idx !== -1) { articles[idx].statut = 'publie'; renderArticles() }
    }
    showToast('Copié pour LinkedIn !', 'success')
  } catch { showToast('Erreur de copie', 'error') }
})

// --- LINKEDIN PREVIEW (improved) ---
btnPreview.addEventListener('click', () => {
  let bodyHtml = ''

  if (articleImages.length > 0) {
    bodyHtml += `<div class="li-cover"><img src="${esc(articleImages[0].url)}" alt="Illustration" onerror="this.parentElement.remove()"></div>`
  }

  bodyHtml += renderLinkedInPreview(editCorps.value)

  const h = editHashtags.value.split(/\s+/).filter(h => h)
  if (h.length) {
    bodyHtml += `<div class="li-hashtags">${h.map(t => `<span class="li-hashtag">${esc(t)}</span>`).join(' ')}</div>`
  }

  liPreviewBody.innerHTML = bodyHtml
  linkedinPreview.classList.remove('hidden')
})

btnClosePreview.addEventListener('click', () => {
  linkedinPreview.classList.add('hidden')
})

linkedinPreview.addEventListener('click', (e) => {
  if (e.target === linkedinPreview) linkedinPreview.classList.add('hidden')
})

btnArchive.addEventListener('click', async () => {
  if (!editingId) return
  try {
    await api(`/articles?id=${editingId}`, { method: 'PUT', body: JSON.stringify({ statut: 'archive' }) })
    editorStatus.textContent = 'archive'
    editorStatus.className = 'badge s-archive'
    updateEditorButtons('archive')
    statusBar.classList.add('hidden')
    showToast('Article archivé', 'info')
    const idx = articles.findIndex(a => a.id === editingId)
    if (idx !== -1) { articles[idx].statut = 'archive'; renderArticles() }
  } catch (err) { showToast('Erreur: ' + err.message, 'error') }
})

btnRestore.addEventListener('click', async () => {
  if (!editingId) return
  try {
    await api(`/articles?id=${editingId}`, { method: 'PUT', body: JSON.stringify({ statut: 'brouillon' }) })
    editorStatus.textContent = 'brouillon'
    editorStatus.className = 'badge s-brouillon'
    updateEditorButtons('brouillon')
    updateStatusBar('brouillon')
    showToast('Article restauré en brouillon', 'info')
    const idx = articles.findIndex(a => a.id === editingId)
    if (idx !== -1) { articles[idx].statut = 'brouillon'; renderArticles() }
  } catch (err) { showToast('Erreur: ' + err.message, 'error') }
})

btnDelete.addEventListener('click', async () => {
  if (!editingId) return
  if (!confirm('Supprimer définitivement cet article ? Cette action est irréversible.')) return
  try {
    await api(`/articles?id=${editingId}`, { method: 'DELETE' })
    showToast('Article supprimé', 'info')
    editingId = null
    showMain()
  } catch (err) { showToast('Erreur: ' + err.message, 'error') }
})

// REGEN CHIPS
document.querySelectorAll('.regen-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    regenFeedback.value = chip.dataset.hint
  })
})

btnRegen.addEventListener('click', () => regenBox.classList.toggle('hidden'))

btnRegenGo.addEventListener('click', async () => {
  const news = currentNews || regenNews
  const customSubject = currentIaMeta?.custom_subject || null
  if (!news && !customSubject) { showToast('Aucune actualité source ou sujet disponible pour la régénération', 'warning'); return }
  const feedback = regenFeedback.value
  btnRegenGo.disabled = true
  btnRegenGo.textContent = 'Génération...'
  try {
    const data = await api('/generate', {
      method: 'POST',
      body: JSON.stringify({
        ...(news ? { news } : {}),
        ...(customSubject ? { customPrompt: customSubject } : {}),
        feedback,
        provider: aiProvider.value,
        model: getSelectedModel(),
      }),
    })
    currentIaMeta = data.ia
    currentIaMeta.image_options = data.article?.image_options || []
    const art = data.article
    editTitre.value = art.titre_interne || ''
    editAccrocheA.value = art.accroche_a || ''
    editAccrocheB.value = art.accroche_b || ''
    accrocheActive = 'a'
    accrocheRadios.forEach(r => r.checked = r.value === 'a')
    accrocheCards.forEach(c => c.classList.toggle('selected', c.dataset.value === 'a'))
    editCorps.value = (art.accroche_a || '') + '\n\n' + (art.corps || '')
    editHashtags.value = (art.hashtags || []).join(' ')
    setArticleImages(art.image_options || [], art.image_url)
    updateWords()
    updateCharCount()
    renderHashtagSuggestions()
    if (editingId) {
      const imageOptions = articleImages.length ? articleImages : null
      await api(`/articles?id=${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({
          titre_interne: art.titre_interne,
          accroche_a: art.accroche_a || null,
          accroche_b: art.accroche_b || null,
          corps: art.corps || '',
          hashtags: art.hashtags || [],
          image_url: articleImages[0]?.url || null,
          image_photographer: articleImages[0]?.photographer || null,
          image_photographer_url: articleImages[0]?.photographer_url || null,
          image_options: imageOptions,
          ia_provider: currentIaMeta.provider,
          ia_model: currentIaMeta.model,
          generation_type: currentIaMeta.generation_type,
          custom_subject: customSubject,
          statut: 'brouillon',
        }),
      })
      editorStatus.textContent = 'brouillon'
      editorStatus.className = 'badge s-brouillon'
      updateEditorButtons('brouillon')
      const idx = articles.findIndex(a => a.id === editingId)
    if (idx !== -1) { articles[idx].titre_interne = art.titre_interne; articles[idx].statut = 'brouillon'; renderArticles() }
    }
    regenBox.classList.add('hidden')
    regenFeedback.value = ''
    showToast('Article régénéré', 'success')
  } catch (err) { showToast('Erreur: ' + err.message, 'error') }
  finally { btnRegenGo.disabled = false; btnRegenGo.textContent = 'Confirmer la régénération' }
})

function extractTitle(body) {
  const firstLine = body.split('\n').find(l => l.trim().length > 0) ?? ''
  return firstLine.replace(/^#+\s*/, '').slice(0, 80)
}

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
    Object.assign(btnCustomGenerate.style, { minHeight: '44px' })
  } else {
    overlay.classList.add('hidden')
    btnCustomGenerate.disabled = false
    btnCustomGenerate.textContent = 'Générer'
  }
}

btnCustomGenerate.addEventListener('click', async () => {
  if (isGenerating) return
  const sujet = customPrompt.value.trim()
  if (!sujet || sujet.length < 3) { showToast('Indique un sujet (min. 3 caractères)', 'warning'); return }
  setGenerating(true)
  try {
    const data = await api('/generate', {
      method: 'POST',
      body: JSON.stringify({ customPrompt: sujet, feedback: '', provider: aiProvider.value, model: getSelectedModel() }),
    })
    currentIaMeta = data.ia
    currentIaMeta.image_options = data.article?.image_options || []
    const art = data.article
    showEditor(null)
    editTitre.value = art.titre_interne || sujet
    editAccrocheA.value = art.accroche_a || ''
    editAccrocheB.value = art.accroche_b || ''
    accrocheActive = 'a'
    accrocheRadios.forEach(r => r.checked = r.value === 'a')
    accrocheCards.forEach(c => c.classList.toggle('selected', c.dataset.value === 'a'))
    editCorps.value = (art.accroche_a || '') + '\n\n' + (art.corps || '')
    editHashtags.value = (art.hashtags || []).join(' ')
    setArticleImages(art.image_options || [], art.image_url)
    updateWords()
    updateCharCount()
    renderHashtagSuggestions()
    if (!art.titre_interne) {
      editTitre.value = extractTitle(editCorps.value) || sujet
    }
    currentNews = null
    customPrompt.value = ''
    newsModal.classList.add('hidden')
    showToast('Article généré !', 'success')
  } catch (err) { showToast('Erreur: ' + err.message, 'error') }
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
    if (!items.length) { showToast('Aucune actualité', 'warning'); return }
    currentNews = items[Math.floor(Math.random() * items.length)]
    generateFromNews(currentNews)
  } catch (err) { showToast('Erreur: ' + err.message, 'error') }
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
    currentIaMeta.image_options = data.article?.image_options || []
    const art = data.article
    showEditor(null)
    editTitre.value = art.titre_interne || ''
    editAccrocheA.value = art.accroche_a || ''
    editAccrocheB.value = art.accroche_b || ''
    accrocheActive = 'a'
    accrocheRadios.forEach(r => r.checked = r.value === 'a')
    accrocheCards.forEach(c => c.classList.toggle('selected', c.dataset.value === 'a'))
    editCorps.value = (art.accroche_a || '') + '\n\n' + (art.corps || '')
    editHashtags.value = (art.hashtags || []).join(' ')
    setArticleImages(art.image_options || [], art.image_url)
    updateWords()
    updateCharCount()
    renderHashtagSuggestions()
    if (!art.titre_interne) {
      editTitre.value = extractTitle(editCorps.value)
    }
    currentNews = news
    newsModal.classList.add('hidden')
    showToast('Article généré !', 'success')
  } catch (err) { showToast('Erreur: ' + err.message, 'error') }
  finally { setGenerating(false) }
}

// ─── DASHBOARD ──────────────────────────────────────────

var _dashUserFiltered = false
function _dashHasActiveFilters() {
  if (_dashUserFiltered) return true
  var _st = document.getElementById('dash-filter-global-status')
  var _sr = document.getElementById('dash-filter-global-search')
  if (_st && _st.value) return true
  if (_sr && _sr.value.trim()) return true
  if (window._dashFieldFilters && Object.keys(window._dashFieldFilters).length > 0) return true
  return false
}

function showDashboard() {
  loginScreen.classList.add('hidden')
  mainScreen.classList.add('hidden')
  editorScreen.classList.add('hidden')
  dashboardScreen.classList.remove('hidden')
  document.querySelector('.app-row')?.classList.add('hidden')
  appContainer.classList.remove('hidden')
  const aiSel = document.getElementById('shell-ai-selector')
  if (aiSel) aiSel.style.display = 'none'
  if (shellTitle) shellTitle.style.display = 'none'
  if (shellTopbar) shellTopbar.classList.add('hidden')
  navDashboard?.classList.add('active')
  navArticles?.classList.remove('active')
  localStorage.setItem('immeit_last_view', 'dashboard')
  console.log('[DASH] showDashboard — _dashNeedsRefresh mis à false')
  window._dashNeedsRefresh = false
  loadDashboard()
}

navDashboard?.addEventListener('click', e => { e.preventDefault(); showDashboard() })
navArticles?.addEventListener('click', e => { e.preventDefault(); showMain() })

function loadCachedDashboard() {
  try {
    var cached = localStorage.getItem('immeit_dash_cache')
    if (cached) {
      var data = JSON.parse(cached)
      if (data && data.synced && data.synced.items) {
        renderDashboard(data)
        window._lastSyncTime = data._cachedAt || Date.now()
        updateDashInfo()
        return true
      }
    }
  } catch {}
  return false
}

var _dashSavedFilters = null
let _dashLoading = false
async function loadDashboard() {
  console.log('[DASH] loadDashboard appelé, _dashLoading=' + _dashLoading + ', userFiltered=' + _dashUserFiltered)
  if (_dashLoading) return
  _dashLoading = true
  dashLoading.classList.remove('hidden')
  dashError.classList.add('hidden')

  loadCachedDashboard()

  try {
    const data = await api('/dashboard')
    window._dashLastLoaded = Date.now()
    window._lastSyncTime = Date.now()
    window._dashLastData = data
    try { localStorage.setItem('immeit_dash_cache', JSON.stringify({ ...data, _cachedAt: Date.now() })) } catch {}
    renderDashboard(data)
    updateDashInfo()
    startSyncTimer()
  } catch (err) {
    if (!loadCachedDashboard()) {
      dashError.classList.remove('hidden')
      dashErrorText.textContent = err.message || 'Erreur de chargement du tableau de bord'
    }
  } finally {
    _dashLoading = false
    dashLoading.classList.add('hidden')
  }
  var _refreshBtn = document.getElementById('btn-dash-refresh')
  var _syncBtn = document.getElementById('btn-dash-sync')
  if (_refreshBtn && !_refreshBtn._wired) { _refreshBtn.onclick = handleDashRefresh; _refreshBtn._wired = true }
  if (_syncBtn && !_syncBtn._wired) { _syncBtn.onclick = handleDashSync; _syncBtn._wired = true }
}

function updateDashInfo() {
  var el = document.getElementById('dash-update-info')
  if (el) el.textContent = 'À l\'instant'
}

async function handleDashSync() {
  var btn = document.getElementById('btn-dash-sync')
  if (!btn || btn.classList.contains('syncing')) return
  btn.classList.add('syncing')
  try {
    const result = await api('/sync', { method: 'POST', timeout: 90000 })
    if (result.success && result.count > 0) {
      showToast(result.message || result.count + ' lignes synchronisées ✓', 'success')
    } else {
      showToast(result.message || 'Aucune donnée disponible', 'warning')
    }
    if (result.success && result.items && result.items.length > 0 && result.headers) {
      var syncData = {
        articles: window._dashLastData ? window._dashLastData.articles : null,
        sharepoint: { connected: true, lastSync: result.syncedAt },
        synced: { headers: result.headers, items: result.items, syncedAt: result.syncedAt, source: result.source, _rawCount: result.rawCount }
      }
      window._dashLastData = syncData
      try { localStorage.setItem('immeit_dash_cache', JSON.stringify({ ...syncData, _cachedAt: Date.now() })) } catch {}
      renderDashboard(syncData)
      updateDashInfo()
    } else if (!_dashUserFiltered) {
      await loadDashboard()
    } else {
      console.log('[DASH] Sync effectué, loadDashboard ignoré — filtres actifs')
    }
  } catch (err) {
    showToast('Erreur synchronisation: ' + err.message, 'error')
  } finally {
    btn.classList.remove('syncing')
  }
}

async function handleDashRefresh() {
  var btn = document.getElementById('btn-dash-refresh')
  if (!btn || btn.classList.contains('syncing')) return
  btn.classList.add('syncing')
  try {
    if (window._dashLastData) {
      renderDashboard(window._dashLastData)
      updateDashInfo()
      showToast('Affichage rafraîchi ✓', 'success', 1500)
    } else {
      await loadDashboard()
      showToast('Données actualisées ✓', 'success')
    }
  } catch (err) {
    showToast('Erreur: ' + err.message, 'error')
  } finally {
    btn.classList.remove('syncing')
  }
}





function countUp(el, target, duration = 600) {
  const isInt = Number.isInteger(target)
  const start = performance.now()
  function step(now) {
    const progress = Math.min((now - start) / duration, 1)
    const current = isInt ? Math.round(progress * target) : parseFloat((progress * target).toFixed(1))
    const textNode = [...el.childNodes].find(n => n.nodeType === 3)
    if (textNode) textNode.textContent = current
    else el.textContent = current
    if (progress < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function startSyncTimer() {
  if (window._syncTimerInterval) clearInterval(window._syncTimerInterval)
  if (window._autoRefreshTimer) clearTimeout(window._autoRefreshTimer)
  if (window._dashPollInterval) clearInterval(window._dashPollInterval)
  function tick() {
    var el = document.getElementById('dash-update-info')
    if (!el) return
    const lastSync = window._lastSyncTime
    if (!lastSync) { el.textContent = ''; return }
    const elapsed = Math.floor((Date.now() - lastSync) / 1000)
    if (elapsed < 5)     el.textContent = 'À l\'instant'
    else if (elapsed < 60) el.textContent = 'Mis à jour il y a ' + elapsed + 's'
    else if (elapsed < 3600) el.textContent = 'Mis à jour il y a ' + Math.floor(elapsed / 60) + ' min'
    else el.textContent = 'Mis à jour à ' + new Date(lastSync).toLocaleTimeString('fr-FR')
  }
  tick()
  window._syncTimerInterval = setInterval(tick, 5000)
  window._dashPollInterval = setInterval(function() {
    var _hf = _dashHasActiveFilters()
    if (!_hf && Date.now() - (window._dashLastLoaded || 0) > 120000) {
      console.log('[DASH] Poll → pas de filtres actifs, reload')
      loadDashboard()
    } else if (_hf) {
      console.log('[DASH] Poll → filtres actifs, pas de reload')
    }
  }, 30000)
  connectSSE()
  setupVisibilityRefresh()
}

function disconnectSSE() {
  if (window._sseConn) {
    window._sseConn.close()
    window._sseConn = null
  }
  window._sseRetryCount = 0
}

function connectSSE() {
  if (window._sseConn) return
  if (window._sseRetryCount === undefined) window._sseRetryCount = 0
  var url = window.location.origin + '/api/events'
  var es = new EventSource(url)
  es.addEventListener('connected', function(e) {
    window._sseRetryCount = 0
  })
  es.addEventListener('dashboard-updated', function(e) {
    try {
      var data = JSON.parse(e.data)
      var _src = data && data.source
      var ds = document.getElementById('dashboard-screen')
      if (ds && !ds.classList.contains('hidden')) {
        var _syncEl = document.getElementById('btn-dash-sync')
        var _refEl = document.getElementById('btn-dash-refresh')
        if ((_syncEl && _syncEl.classList.contains('syncing')) || (_refEl && _refEl.classList.contains('syncing'))) return
        if (Date.now() - (window._dashLastLoaded || 0) < 3000) {
          console.log('[DASH] SSE ignoré — trop tôt depuis dernier loadDashboard (' + _src + ')')
          window._lastSyncTime = Date.now()
          return
        }
        window._lastSyncTime = Date.now()
        var _hf = _dashHasActiveFilters()
        console.log('[DASH] SSE dashboard-updated, hasFilters=' + _hf + ', userFiltered=' + _dashUserFiltered + ', source=' + _src)
        if (_hf) {
          window._dashNeedsRefresh = true
        } else {
          loadDashboard()
        }
      } else {
        window._dashNeedsRefresh = true
      }
    } catch (err) {
      console.warn('[SSE] Erreur parsing:', err)
    }
  })
  es.addEventListener('error', function() {
    es.close()
    window._sseConn = null
    window._sseRetryCount++
    var delay = Math.min(30000, 1000 * Math.pow(2, window._sseRetryCount))
    setTimeout(connectSSE, delay)
  })
  window._sseConn = es
}

function setupVisibilityRefresh() {
  if (window._visSetup) return
  window._visSetup = true
  document.addEventListener('visibilitychange', function() {
    var _hf = _dashHasActiveFilters()
    console.log('[DASH] visibilitychange, hidden=' + document.hidden + ', needsRefresh=' + window._dashNeedsRefresh + ', hasFilters=' + _hf + ', userFiltered=' + _dashUserFiltered)
    if (!document.hidden && window._dashNeedsRefresh && !_hf) {
      window._dashNeedsRefresh = false
      loadDashboard()
    }
  })
  window.addEventListener('focus', function() {
    var _hf = _dashHasActiveFilters()
    console.log('[DASH] focus, needsRefresh=' + window._dashNeedsRefresh + ', hasFilters=' + _hf + ', userFiltered=' + _dashUserFiltered)
    if (window._dashNeedsRefresh && !_hf) {
      window._dashNeedsRefresh = false
      loadDashboard()
    }
  })
}

function renderDashboard(data) {
  var _savedUserFiltered = _dashUserFiltered
  console.log('[DASH] renderDashboard, _dashUserFiltered=' + _savedUserFiltered)
  const { articles, sharepoint, synced } = data
  dashContent.innerHTML = ''

  const hasSynced = synced && synced.headers && synced.items && synced.items.length > 0
  const hasSPData = sharepoint?.connected && sharepoint?.stats

  let displayHeaders, displayItems, displayStats
  if (hasSPData) {
    displayHeaders = sharepoint.headers
    displayItems = sharepoint.items
    displayStats = computeClientStats(sharepoint.headers, sharepoint.items)
  } else if (hasSynced) {
    displayHeaders = synced.headers
    displayItems = synced.items
    displayStats = computeClientStats(synced.headers, synced.items)
  }

  if (!displayStats) {
    dashContent.innerHTML = '<div class="dash-empty-state"><div class="dash-empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><p>En attente de synchronisation. Les données seront chargées automatiquement.</p></div>'
    return
  }

  const s = displayStats

  var statsArea = document.createElement('div')
  statsArea.id = 'dash-stats-area'
  dashContent.appendChild(statsArea)

  var _baseHeaders = displayHeaders
  var _baseItems = displayItems
  window._dashFieldFilters = {}
  var _findFieldKey = function(hint) {
    var hints = {
      'demandeur': ['demandeur', 'demandeurs', 'requester'],
      'avancement': ['etat', 'avancement', 'statut', 'status', 'état'],
      'type': ['type'],
      'nature': ['nature'],
      'site': ['site'],
      'stockage': ['stockage'],
      'stockage_adv': ['stockage_adv', 'stockage_adv', 'adveso'],
    }
    var hk = function(s) { return s.toLowerCase().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '') }
    var keys = hints[hint] || [hint]
    var header = null
    for (var k = 0; k < keys.length; k++) {
      var kh = hk(keys[k])
      header = _baseHeaders.find(function(x) { return hk(x) === kh || hk(x).indexOf(kh) >= 0 })
      if (header) break
    }
    if (header) {
      var fk = hk(header)
      var found = _baseItems.length > 0 && _baseItems[0].hasOwnProperty ? _baseItems[0].hasOwnProperty(fk) : (fk in (_baseItems[0] || {}))
      if (found) return fk
      var alt = Object.keys(_baseItems[0] || {}).find(function(k) { return k.indexOf(hk(hint)) >= 0 })
      return alt || fk
    }
    return Object.keys(_baseItems[0] || {}).find(function(k) { return hk(k).indexOf(hk(hint).slice(0, 6)) >= 0 }) || null
  }

  var parseItemDate = function(raw) {
    if (!raw) return null
    var candidates = String(raw).split(/[,;\n\r]+/)
    for (var c = 0; c < candidates.length; c++) {
      var val = candidates[c].trim()
      if (!val) continue
      try {
        var d = excelToDate(val)
        if (d && !isNaN(d.getTime())) return d
        if (/\//.test(val)) {
          var parts = val.split('/')
          if (parts.length === 3) { d = new Date(parts[2], parts[1] - 1, parts[0]); if (!isNaN(d.getTime())) return d }
        }
        d = new Date(val)
        if (!isNaN(d.getTime())) return d
      } catch {}
    }
    return null
  }

  function buildStatsSections(stats, items) {
    statsArea.innerHTML = ''
    var total = stats.total

    // ─── HEALTH SCORE ──────────────────────────────────────────
    const ecart = stats.ecart || { avg: 0 }
    const avgConf = Math.round((stats.tauxConf1 + stats.tauxConfDem) / 2)
    const score = Math.round((avgConf + stats.duree.zeroPct + (ecart.avg <= 0 ? 100 : Math.max(0, 100 - ecart.avg * 10))) / 3)
    const healthCls = score >= 80 ? 'good' : score >= 55 ? 'mid' : 'bad'
    const healthLabel = score >= 80 ? 'Bon' : score >= 55 ? 'Moyen' : 'À améliorer'
    const healthTitle = score >= 80 ? 'Tableau de bord opérationnel'
      : score >= 55 ? 'Quelques points d\'attention'
      : 'Actions correctives nécessaires'
    const healthDesc = score >= 80
      ? `Les indicateurs sont au vert. Conf. 1ère diffusion (IMMEIT) : ${stats.tauxConf1}% · Conf. vérification (P2M) : ${stats.tauxConfDem}% · ${stats.duree.zeroPct}% traités en J+0.`
      : score >= 55
      ? `Conf. 1ère diffusion : ${stats.tauxConf1}% · Conf. vérification P2M : ${stats.tauxConfDem}% · ${stats.duree.zeroPct}% J+0. ${ecart.avg > 0 ? 'Écart moyen ' + ecart.avg + 'j à réduire.' : 'Délais sous contrôle.'}`
      : `Conf. 1ère diffusion : ${stats.tauxConf1}% · Conf. vérification P2M : ${stats.tauxConfDem}% · Délais : ${stats.duree.zeroPct}% J+0 — actions prioritaires requises.`

    const C = 2 * Math.PI * 30
    const offset = C * (1 - score / 100)
    const health = document.createElement('div')
    health.className = 'dash-health'
    health.innerHTML = `
      <div class="dash-health-score-wrap">
        <svg class="dash-health-score-svg" viewBox="0 0 72 72">
          <circle class="dash-health-score-bg" cx="36" cy="36" r="30"/>
          <circle class="dash-health-score-arc ${healthCls}" cx="36" cy="36" r="30"
            stroke-dasharray="${C}" stroke-dashoffset="${C}" data-target="${offset}" />
        </svg>
        <div class="dash-health-score-num ${healthCls}">0</div>
      </div>
      <div class="dash-health-info">
        <div class="dash-health-label">Score de santé · ${healthLabel}</div>
        <div class="dash-health-title">${healthTitle}</div>
        <div class="dash-health-desc">${healthDesc}</div>
      </div>
    `
    statsArea.appendChild(health)
    requestAnimationFrame(() => {
      const arc = health.querySelector('.dash-health-score-arc')
      const num = health.querySelector('.dash-health-score-num')
      if (arc) arc.style.strokeDashoffset = offset
      if (num) countUp(num, score, 600)
    })

    // ─── KPI CARDS (5) ─────────────────────────────────────────
    const conf1Color = stats.tauxConf1 >= 80 ? '#10B981' : stats.tauxConf1 >= 60 ? '#F59E0B' : '#EF4444'
    const confDemColor = stats.tauxConfDem >= 80 ? '#10B981' : stats.tauxConfDem >= 60 ? '#F59E0B' : '#EF4444'
    const dureeColor = stats.duree.zeroPct >= 90 ? '#10B981' : stats.duree.zeroPct >= 70 ? '#F59E0B' : '#EF4444'
    const ecartColor = ecart.avg <= 0 ? '#10B981' : ecart.avg <= 3 ? '#F59E0B' : '#EF4444'

  const kpis = document.createElement('div')
  kpis.className = 'dash-kpi-grid'
  kpis.innerHTML = `
    <div class="dash-kpi-card" style="--accent:#0A66C2">
      <div class="dash-kpi-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg></div>
      <div class="dash-kpi-body">
        <span class="dash-kpi-label">Total</span>
        <span class="dash-kpi-value" data-target="${total}">${total}</span>
        <span class="dash-kpi-sub">demandes ${new Date().getFullYear()}</span>
      </div>
    </div>
    <div class="dash-kpi-card" style="--accent:${conf1Color}">
      <div class="dash-kpi-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
      <div class="dash-kpi-body">
        <span class="dash-kpi-label">Conf. 1ère diffusion</span>
        <span class="dash-kpi-value" data-target="${stats.tauxConf1}">${stats.tauxConf1}<span style="font-size:.55em;margin-left:1px">%</span></span>
        <span class="dash-kpi-sub">IMMEIT → rapport reçu conforme</span>
      </div>
    </div>
    <div class="dash-kpi-card" style="--accent:${confDemColor}">
      <div class="dash-kpi-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><path d="M21.5 11.5A10 10 0 1 1 12 2a10 10 0 0 1 9.5 6.69"/></svg></div>
      <div class="dash-kpi-body">
        <span class="dash-kpi-label">Conf. vérification</span>
        <span class="dash-kpi-value" data-target="${stats.tauxConfDem}">${stats.tauxConfDem}<span style="font-size:.55em;margin-left:1px">%</span></span>
        <span class="dash-kpi-sub">P2M → travail IMMEIT conforme</span>
      </div>
    </div>
    <div class="dash-kpi-card" style="--accent:${dureeColor}">
      <div class="dash-kpi-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
      <div class="dash-kpi-body">
        <span class="dash-kpi-label">J+0</span>
        <span class="dash-kpi-value" data-target="${stats.duree.zeroPct}">${stats.duree.zeroPct}<span style="font-size:.55em;margin-left:1px">%</span></span>
        <span class="dash-kpi-sub">traités le jour même</span>
      </div>
    </div>
    <div class="dash-kpi-card" style="--accent:${ecartColor}">
      <div class="dash-kpi-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>
      <div class="dash-kpi-body">
        <span class="dash-kpi-label">Écart</span>
        <span class="dash-kpi-value" data-target="${Math.abs(ecart.avg)}">${ecart.avg <= 0 ? '' : '+'}${Math.abs(ecart.avg)}<span style="font-size:.55em;margin-left:1px">j</span></span>
        <span class="dash-kpi-sub">${ecart.avg <= 0 ? 'avance' : 'retard'} moyen</span>
      </div>
    </div>
  `
    statsArea.appendChild(kpis)

    const kpiValues = kpis.querySelectorAll('.dash-kpi-value[data-target]')
    kpiValues.forEach((el, i) => {
      const target = parseFloat(el.dataset.target)
      if (isNaN(target)) return
      const textNode = [...el.childNodes].find(n => n.nodeType === 3)
      if (textNode) textNode.textContent = '0'
      else el.textContent = '0'
      setTimeout(() => countUp(el, target, 500), i * 80)
    })
    // ─── INSIGHTS ──────────────────────────────────────────────
    const insights = []
    if (stats.avancementDist.length > 0) {
      const alertStatuses = stats.avancementDist.filter(a => /en.cours|valid.e.*p2m.*solder|a solder/i.test(a.label))
      alertStatuses.forEach(function(a) {
        const n = a.count
        insights.push(`<span class="dash-insight"><span class="dash-insight-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span><span class="dash-insight-text"><strong>${n} demande${n > 1 ? 's' : ''}</strong> ${a.label}</span></span>`)
      })
    }
    if (stats.monthlyTrend && stats.monthlyTrend.length >= 1) {
      var _norm2 = function(x) { return x.trim().toLowerCase().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '') }
      var _monthLabel = function(mk) { var p = mk.split('-'); var months = ['janv','f\u00e9vr','mars','avr','mai','juin','juil','ao\u00fbt','sept','oct','nov','d\u00e9c']; return months[parseInt(p[1],10)-1] + ' ' + p[0] }
      var _findDateField = function() {
        if (_baseHeaders && _baseHeaders.length) {
          var _hdr = _baseHeaders.find(function(x) { return _norm2(x) === _norm2('Date de dépôt du dossier sur docinfo') })
          if (_hdr) return _norm2(_hdr)
        }
        if (items[0]) {
          var k = Object.keys(items[0]).find(function(k) { return /^date_/.test(k) && (k.indexOf('dpt') >= 0 || k.indexOf('depot') >= 0) })
          if (k) return k
          k = Object.keys(items[0]).find(function(k) { return /^date_/.test(k) })
          if (k) return k
        }
        return ''
      }
      var last = stats.monthlyTrend[stats.monthlyTrend.length - 1]
      var first = stats.monthlyTrend[0]
      var now = new Date(), curMk = String(now.getFullYear()) + '-' + String(now.getMonth() + 1).padStart(2, '0')
      var isCur = last.month === curMk
      var insightText = ''

      if (stats.monthlyTrend.length === 1) {
        insightText = '<strong>' + last.count + '</strong> demande' + (last.count > 1 ? 's' : '') + ' en ' + _monthLabel(last.month)
      } else if (isCur && stats.monthlyTrend.length >= 2) {
        var df = _findDateField()
        if (df) {
          var maxDay = 0
          items.forEach(function(item) {
            var r = item[df]; if (!r) return
            var d = parseItemDate(r)
            if (d) {
              var mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
              if (mk === curMk && d.getDate() > maxDay) maxDay = d.getDate()
            }
          })
          if (maxDay > 0 && maxDay < 28) {
            var curC = 0, prevC = 0, _prevMk = stats.monthlyTrend[stats.monthlyTrend.length - 2].month
            items.forEach(function(item) {
              var r = item[df]; if (!r) return
              var d = parseItemDate(r)
              if (d) {
                var mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
                if (mk === curMk && d.getDate() <= maxDay) curC++
                if (mk === _prevMk && d.getDate() <= maxDay) prevC++
              }
            })
            var pct = prevC > 0 ? Math.round(((curC - prevC) / prevC) * 100) : 0
            var arrow = curC > prevC ? '\u2197' : curC < prevC ? '\u2198' : '\u2192'
            insightText = '<strong>' + curC + '</strong> demande' + (curC > 1 ? 's' : '') + ' sur les ' + maxDay + ' premiers jours de ' + _monthLabel(last.month) + ' \u2014 ' + arrow + ' ' + (pct > 0 ? '+' : '') + pct + '% par rapport \u00e0 ' + prevC + ' sur la m\u00eame p\u00e9riode en ' + _monthLabel(_prevMk)
          } else {
            var _prev2 = stats.monthlyTrend[stats.monthlyTrend.length - 2]
            var pct2 = _prev2.count > 0 ? Math.round(((last.count - _prev2.count) / _prev2.count) * 100) : 0
            var arrow2 = last.count > _prev2.count ? '\u2197' : last.count < _prev2.count ? '\u2198' : '\u2192'
            insightText = '<strong>' + last.count + '</strong> demande' + (last.count > 1 ? 's' : '') + ' en ' + _monthLabel(last.month) + ' \u2014 ' + arrow2 + ' ' + (pct2 > 0 ? '+' : '') + pct2 + '% par rapport \u00e0 ' + _prev2.count + ' en ' + _monthLabel(_prev2.month)
          }
        }
      }

      if (!insightText && stats.monthlyTrend.length >= 3) {
        var _total = 0; for (var _ti = 0; _ti < stats.monthlyTrend.length; _ti++) _total += stats.monthlyTrend[_ti].count
        insightText = '<strong>' + _total + '</strong> demande' + (_total > 1 ? 's' : '') + ' sur ' + _monthLabel(first.month) + '\u2013' + _monthLabel(last.month) + ' \u2014 tendance ' + (last.count > first.count ? 'haussi\u00e8re' : last.count < first.count ? 'baissi\u00e8re' : 'stable') + ' (' + first.count + ' \u2192 ' + last.count + ')'
      }

      if (!insightText && stats.monthlyTrend.length >= 2) {
        var _prev2 = stats.monthlyTrend[stats.monthlyTrend.length - 2]
        var pct2 = _prev2.count > 0 ? Math.round(((last.count - _prev2.count) / _prev2.count) * 100) : 0
        var arrow2 = last.count > _prev2.count ? '\u2197' : last.count < _prev2.count ? '\u2198' : '\u2192'
        insightText = '<strong>' + last.count + '</strong> demande' + (last.count > 1 ? 's' : '') + ' en ' + _monthLabel(last.month) + ' \u2014 ' + arrow2 + ' ' + (pct2 > 0 ? '+' : '') + pct2 + '% par rapport \u00e0 ' + _prev2.count + ' en ' + _monthLabel(_prev2.month)
      }

      if (insightText) {
        insights.push('<span class="dash-insight"><span class="dash-insight-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span><span class="dash-insight-text">' + insightText + '</span></span>')
      }
    }
    if (insights.length > 0) {
      const insWrap = document.createElement('div')
      insWrap.className = 'dash-insights'
      insWrap.innerHTML = insights.join('')
      statsArea.appendChild(insWrap)
    }

    // ─── SECTION : CONFORMITÉ ─────────────────────────────────
    if (stats.conf1Dist.length > 0 || stats.confDemDist.length > 0) {
      const confGrid = document.createElement('div')
      confGrid.className = 'dash-charts-grid'
      if (stats.conf1Dist.length > 0) confGrid.appendChild(createGaugeChart('Conformité 1ère diffusion', stats.conf1Dist, confColors))
      if (stats.confDemDist.length > 0) confGrid.appendChild(createGaugeChart('Conformité demande', stats.confDemDist, confColors))
      if (confGrid.children.length > 0) {
        const section = document.createElement('div')
        section.className = 'dash-section'
        section.innerHTML = `<div class="dash-section-header"><h3>Conformité</h3><span class="dash-section-toggle open" id="dash-toggle-conf">▼</span></div><div class="dash-section-body" id="dash-body-conf"></div>`
        section.querySelector('.dash-section-body').appendChild(confGrid)
        section.querySelector('.dash-section-header').addEventListener('click', () => {
          const body = section.querySelector('.dash-section-body')
          const toggle = section.querySelector('.dash-section-toggle')
          body.classList.toggle('collapsed')
          toggle.classList.toggle('open')
        })
        statsArea.appendChild(section)
      }
    }

    // ─── SECTION : STOCKAGE ────────────────────────────────────
    if (stats.stockageDist && stats.stockageDist.length > 0 && stats.stockageAdvesoDist && stats.stockageAdvesoDist.length > 0) {
      var stockageGrid = document.createElement('div')
      stockageGrid.className = 'dash-charts-grid'
      stockageGrid.appendChild(createPieChart('Stockage DOCINFO', stats.stockageDist.filter(function(d) { return d.count > 0 && d.label.trim() }), stockageColors))
      stockageGrid.appendChild(createPieChart('Stockage ADVESO', stats.stockageAdvesoDist.filter(function(d) { return d.count > 0 && d.label.trim() }), stockageColors))
      var stockageSection = document.createElement('div')
      stockageSection.className = 'dash-section'
      stockageSection.innerHTML = '<div class="dash-section-header"><h3><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Stockage</h3><span class="dash-section-toggle open" id="dash-toggle-stockage">▼</span></div><div class="dash-section-body" id="dash-body-stockage"></div>'
      stockageSection.querySelector('.dash-section-body').appendChild(stockageGrid)
      stockageSection.querySelector('.dash-section-header').addEventListener('click', function() {
        var body = stockageSection.querySelector('.dash-section-body')
        var toggle = stockageSection.querySelector('.dash-section-toggle')
        body.classList.toggle('collapsed')
        toggle.classList.toggle('open')
      })
      statsArea.appendChild(stockageSection)
    }

    // ─── SECTION : AVANCEMENT + TYPE ──────────────────────────
    if (stats.avancementDist.length > 0 && stats.typeDist.length > 0) {
      const chartsGrid = document.createElement('div')
      chartsGrid.className = 'dash-charts-grid'
      chartsGrid.appendChild(createBarChart('État d\'avancement', stats.avancementDist, statusColors))
      chartsGrid.appendChild(createDonutChart('Type de demande', stats.typeDist.slice(0, 8), typeColors))
      const section = document.createElement('div')
      section.className = 'dash-section'
      section.innerHTML = '<div class="dash-section-header"><h3><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>Avancement & Type</h3><span class="dash-section-toggle open">▼</span></div><div class="dash-section-body" id="dash-body-avancement"></div>'
      section.querySelector('.dash-section-body').appendChild(chartsGrid)
      section.querySelector('.dash-section-header').addEventListener('click', function() {
        var b = this.parentNode.querySelector('.dash-section-body')
        var t = this.parentNode.querySelector('.dash-section-toggle')
        b.classList.toggle('collapsed')
        t.classList.toggle('open')
      })
      statsArea.appendChild(section)
    }

    // ─── SECTION : NATURE + SITE ──────────────────────────────
    if (stats.natureDist.length > 0 || stats.siteDist.length > 0) {
      const row2 = document.createElement('div')
      row2.className = 'dash-charts-grid'
      if (stats.natureDist.length > 0) row2.appendChild(createBarChart('Nature', stats.natureDist.slice(0, 8), natureColors))
      if (stats.siteDist.length > 0) row2.appendChild(createDonutChart('Par site', stats.siteDist.slice(0, 8), siteColors))
      if (row2.children.length > 0) {
        const section = document.createElement('div')
        section.className = 'dash-section'
        section.innerHTML = `<div class="dash-section-header"><h3>Détails</h3><span class="dash-section-toggle open" id="dash-toggle-details">▼</span></div><div class="dash-section-body" id="dash-body-details"></div>`
        section.querySelector('.dash-section-body').appendChild(row2)
        section.querySelector('.dash-section-header').addEventListener('click', () => {
          const body = section.querySelector('.dash-section-body')
          const toggle = section.querySelector('.dash-section-toggle')
          body.classList.toggle('collapsed')
          toggle.classList.toggle('open')
        })
        statsArea.appendChild(section)
      }
    }

    // ─── SECTION : TOP DEMANDEURS ─────────────────────────────
    if (stats.topDemandeurs.length > 0) {
      const demSection = document.createElement('div')
      demSection.className = 'dash-section'
      demSection.innerHTML = `<div class="dash-section-header"><h3><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Top 10 demandeurs</h3><span class="dash-section-toggle open" id="dash-toggle-dem">▼</span></div><div class="dash-section-body" id="dash-body-dem"></div>`
      const list = document.createElement('div')
      list.className = 'dash-bar-list'
      const maxDem = Math.max(...stats.topDemandeurs.map(d => d.count), 1)
      stats.topDemandeurs.forEach(function(item) {
        var pct = (item.count / maxDem) * 100
        var ratio = item.count / maxDem
        var h = 220 - Math.round(ratio * 40)
        var s = 65 + Math.round(ratio * 25)
        var l = 70 - Math.round(ratio * 30)
        var bar = document.createElement('div')
        bar.className = 'dash-bar-item'
        bar.innerHTML = '<div class="dash-bar-header"><span class="dash-bar-label">' + esc(item.label) + '</span><span class="dash-bar-count">' + item.count + '</span></div><div class="dash-bar-track"><div class="dash-bar-fill" style="width:' + pct + '%;background:hsl(' + h + ',' + s + '%,' + l + '%)"></div></div>'
        list.appendChild(bar)
      })
      demSection.querySelector('.dash-section-body').appendChild(list)
      demSection.querySelector('.dash-section-header').addEventListener('click', () => {
        const body = demSection.querySelector('.dash-section-body')
        const toggle = demSection.querySelector('.dash-section-toggle')
        body.classList.toggle('collapsed')
        toggle.classList.toggle('open')
      })
      statsArea.appendChild(demSection)
    }

    // ─── SECTION : ÉVOLUTION MENSUELLE ────────────────────────
    if (stats.monthlyTrend && stats.monthlyTrend.length > 0) {
      const monthlySection = document.createElement('div')
      monthlySection.className = 'dash-section'
      monthlySection.innerHTML = `<div class="dash-section-header"><h3><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Évolution mensuelle</h3><span class="dash-section-toggle open" id="dash-toggle-monthly">▼</span></div><div class="dash-section-body" id="dash-body-monthly"></div>`
      monthlySection.querySelector('.dash-section-body').appendChild(createLineChart('', stats.monthlyTrend))
      var _lastM = stats.monthlyTrend[stats.monthlyTrend.length - 1]
      var _curMk = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')
      if (_lastM && _lastM.month === _curMk) {
        var _note = document.createElement('div')
        _note.style.cssText = 'font-size:10px;color:var(--clr-text-muted);padding:4px 0 0;text-align:center;border-top:1px solid var(--clr-border);margin-top:8px'
        _note.textContent = '* Mois en cours — données partielles (J' + new Date().getDate() + ')'
        monthlySection.querySelector('.dash-section-body').appendChild(_note)
      }
      monthlySection.querySelector('.dash-section-header').addEventListener('click', () => {
        const body = monthlySection.querySelector('.dash-section-body')
        const toggle = monthlySection.querySelector('.dash-section-toggle')
        body.classList.toggle('collapsed')
        toggle.classList.toggle('open')
      })
      statsArea.appendChild(monthlySection)
    }
  } // end buildStatsSections

  var todayStr = new Date().toISOString().slice(0, 10)

  // Initial render
  buildStatsSections(s, displayItems)

  var _gpfnorm = function(x) { return x.toLowerCase().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '') }
  var _gpfh = function(name) {
    var n = _gpfnorm(name)
    var match = displayHeaders.find(function(x) { return _gpfnorm(x) === n || x === name })
    return match ? _gpfnorm(match) : ''
  }
  var gpStatusField = _gpfh("Etat d'avance de la demande")
  var gpDateField = (_baseItems[0] ? Object.keys(_baseItems[0]).find(function(k) { return k.indexOf('date_') === 0 && (k.indexOf('_dpt') >= 0 || k.indexOf('depot') >= 0) && k.indexOf('docinfo') >= 0 }) : '') || ''

  // Compute earliest deposit date from all items
  var minDateStr = ''
  if (gpDateField && _baseItems.length) {
    var minTs = Infinity
    _baseItems.forEach(function(item) {
      var d = parseItemDate(item[gpDateField])
      if (d && d.getTime() < minTs) minTs = d.getTime()
    })
    if (minTs < Infinity) {
      var dd = new Date(minTs)
      minDateStr = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0') + '-' + String(dd.getDate()).padStart(2, '0')
    }
  }
  var dateStartVal = minDateStr || (new Date().getFullYear() + '-01-01')
  var dateEndVal = todayStr

  // Set default values on date inputs after they've been created
  var startInput = document.getElementById('dash-date-start')
  var endInput = document.getElementById('dash-date-end')
  if (startInput) {
    startInput.value = dateStartVal
    startInput.onchange = function() { dateStartVal = this.value; _dashUserFiltered = true; applyGlobalFilters() }
  }
  if (endInput) {
    endInput.value = dateEndVal
    endInput.onchange = function() { dateEndVal = this.value; _dashUserFiltered = true; applyGlobalFilters() }
  }
  var resetBtn = document.getElementById('btn-dash-reset')
  function _dashUpdateResetBtn() {
    if (!resetBtn) return
    var has = (statusSel && statusSel.value) || (searchInput && searchInput.value.trim())
           || (startInput && startInput.value !== (minDateStr || (new Date().getFullYear() + '-01-01')))
           || (endInput && endInput.value !== todayStr)
           || (window._dashFieldFilters && Object.keys(window._dashFieldFilters).length > 0)
    resetBtn.disabled = !has
  }
  if (resetBtn) {
    resetBtn.onclick = function() {
      if (resetBtn.classList.contains('syncing') || resetBtn.disabled) return
      resetBtn.classList.add('syncing')
      _dashUserFiltered = false
      if (startInput) { startInput.value = minDateStr || (new Date().getFullYear() + '-01-01'); dateStartVal = startInput.value }
      if (endInput) { endInput.value = todayStr; dateEndVal = endInput.value }
      if (searchInput) searchInput.value = ''
      if (statusSel) statusSel.value = ''
      window._dashFieldFilters = {}
      applyGlobalFilters()
      if (window._dashNeedsRefresh) {
        window._dashNeedsRefresh = false
        loadDashboard()
      }
      showToast('Filtres réinitialisés ✓', 'success')
      setTimeout(function() { resetBtn.classList.remove('syncing') }, 300)
    }
  }

  var filterPanel = document.createElement('div')
  filterPanel.className = 'dash-section'
  filterPanel.id = 'dash-filter-panel'
  filterPanel.innerHTML = [
    '<div class="dash-section-header" style="cursor:default;user-select:auto">',
    '  <h3 style="display:flex;align-items:center;gap:8px">',
    '    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
    '    Filtres',
    '  </h3>',
    '</div>',
    '<div class="dash-section-body" style="padding:var(--space-3) var(--space-5)">',
    '  <div class="dash-table-filter-row" style="margin:0;border:none">',
    '    <span class="filter-label">Statut</span>',
    '    <select id="dash-filter-global-status"><option value="">Tous les statuts</option></select>',
    '    <span class="filter-label" style="margin-left:12px">Recherche</span>',
    '    <input type="text" id="dash-filter-global-search" placeholder="Mot-clé\u2026" style="min-width:200px">',
    '  </div>',
    '</div>'
  ].join('\n')

  if (gpStatusField) {
    var uniqueSt = [...new Set(_baseItems.map(function(i) { return i[gpStatusField] || '' }).filter(Boolean))]
    var sel = filterPanel.querySelector('#dash-filter-global-status')
    uniqueSt.forEach(function(s) { var o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o) })
  }

  dashContent.appendChild(filterPanel)

  var chipsBar = document.createElement('div')
  chipsBar.id = 'dash-filter-chips'
  chipsBar.className = 'dash-filter-chips'
  document.querySelector('#dashboard-screen .dash-header')?.insertAdjacentElement('afterend', chipsBar)

  function _dashRenderFilterChips() {
    chipsBar.innerHTML = ''
    var chips = []
    var ff = window._dashFieldFilters || {}
    for (var fk in ff) {
      var label = _baseHeaders.find(function(h) { return fk === h.toLowerCase().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '') })
      chips.push({ type: 'field', label: ff[fk], remove: function(k) { return function() { delete window._dashFieldFilters[k]; applyGlobalFilters() } }(fk) })
    }
    if (statusSel && statusSel.value) {
      chips.push({ type: 'status', label: statusSel.value, remove: function() { statusSel.value = ''; applyGlobalFilters() } })
    }
    if (searchInput && searchInput.value.trim()) {
      chips.push({ type: 'search', label: searchInput.value.trim(), remove: function() { searchInput.value = ''; applyGlobalFilters() } })
    }
    if ((dateStartVal && dateStartVal !== (minDateStr || (new Date().getFullYear() + '-01-01'))) || (dateEndVal && dateEndVal !== todayStr)) {
      var fmt = d => d.split('-').reverse().join('-')
      var dLabel = dateStartVal && dateEndVal ? fmt(dateStartVal) + ' → ' + fmt(dateEndVal) : (dateStartVal ? 'depuis ' + fmt(dateStartVal) : 'jusqu\'à ' + fmt(dateEndVal))
      chips.push({ type: 'date', label: dLabel, remove: function() { if (startInput) { startInput.value = minDateStr || (new Date().getFullYear() + '-01-01'); dateStartVal = startInput.value }; if (endInput) { endInput.value = todayStr; dateEndVal = endInput.value }; applyGlobalFilters() } })
    }
    if (chips.length === 0) { chipsBar.classList.add('hidden'); return }
    chipsBar.classList.remove('hidden')
    for (var i = 0; i < chips.length; i++) {
      var c = document.createElement('span')
      c.className = 'dash-filter-chip dash-filter-chip--' + chips[i].type
      c.innerHTML = '<span class="dash-filter-chip-label">' + esc(chips[i].label) + '</span><button class="dash-filter-chip-remove" title="Retirer ce filtre">&times;</button>'
      c.querySelector('.dash-filter-chip-remove').onclick = chips[i].remove
      chipsBar.appendChild(c)
    }
  }

  var tableCard
  var statusSel = filterPanel.querySelector('#dash-filter-global-status')
  var searchInput = filterPanel.querySelector('#dash-filter-global-search')
  _dashUpdateResetBtn()

  function applyGlobalFilters() {
    _dashTableState.page = 1
    var _norm = function(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') }
    var stVal = _norm(statusSel.value.toLowerCase())
    var searchVal = _norm(searchInput.value.toLowerCase())
    var dsVal = dateStartVal
    var deVal = dateEndVal
    var ds = dsVal ? new Date(dsVal + 'T00:00:00') : null
    var de = deVal ? new Date(deVal + 'T23:59:59') : null
    var _ff = window._dashFieldFilters || {}
    var filtered = _baseItems.filter(function(item) {
      var st = _norm((item[gpStatusField] || '').toLowerCase())
      if (stVal && st !== stVal) return false
      for (var _fk in _ff) {
        var _ival = (item[_fk] || '')
        var _ffv = _ff[_fk]
        if (!_norm(_ival.toLowerCase()).includes(_norm(_ffv.toLowerCase()))) return false
      }
      if (searchVal) {
        var allText = _norm(Object.values(item).join(' ').toLowerCase())
        if (!allText.includes(searchVal)) return false
      }
      if (gpDateField && (ds || de)) {
        var dt = parseItemDate(item[gpDateField])
        if (dt) {
          if (ds && dt < ds) return false
          if (de && dt > de) return false
        }
      }
      return true
    })
    var newStats = computeClientStats(_baseHeaders, filtered)
    buildStatsSections(newStats, filtered)
    renderFilteredTable(filtered, newStats)
    _dashRenderFilterChips()
    _dashUpdateResetBtn()
  }

  function renderFilteredTable(filtered, ns) {
    var newCard = renderDataTable(displayHeaders, filtered, ns || s, gpStatusField)
    if (tableCard) { tableCard.replaceWith(newCard) } else { dashContent.appendChild(newCard) }
    tableCard = newCard
  }

  statusSel.addEventListener('change', function() { console.log('[DASH] Filtre status changé'); _dashUserFiltered = true; applyGlobalFilters() })
  var searchTimer
  searchInput.addEventListener('input', function() {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(function() { _dashUserFiltered = true; applyGlobalFilters() }, 250)
  })

  statsArea.addEventListener('click', function(e) {
    var target = e.target.closest('.dash-bar-item, .dash-donut-row')
    if (!target) return
    var lbl = target.querySelector('.dash-bar-label, .dash-donut-lbl')
    if (!lbl) return
    var text = lbl.textContent.trim()
    if (!text) return
    var chart = target.closest('.dash-chart-card')
    var hintKey = null
    if (chart) {
      var h4 = chart.querySelector('h4')
      if (h4) {
        var t = h4.textContent.trim().toLowerCase()
        if (t.indexOf('état') >= 0 || t.indexOf('avancement') >= 0) hintKey = 'avancement'
        else if (t.indexOf('type') >= 0) hintKey = 'type'
        else if (t === 'nature') hintKey = 'nature'
        else if (t === 'par site') hintKey = 'site'
        else if (t.indexOf('stockage docinfo') >= 0) hintKey = 'stockage'
        else if (t.indexOf('stockage adveso') >= 0) hintKey = 'stockage_adv'
      }
    } else {
      var sec = target.closest('.dash-section')
      if (sec && sec.querySelector('#dash-body-dem')) hintKey = 'demandeur'
    }
    if (hintKey) {
      var fk = _findFieldKey(hintKey)
      if (fk) {
        window._dashFieldFilters[fk] = text
      }
    }
    _dashUserFiltered = true
    applyGlobalFilters()
    showToast('Filtre actif : ' + text, 'info', 2000)
  })

  if (_baseItems.length > 0) applyGlobalFilters()
  _dashUserFiltered = _savedUserFiltered
}

function computeClientStats(headers, items) {
  const norm = x => x.trim().toLowerCase().normalize('NFC').replace(/\uFFFD/g, '').replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '')
  const h = name => {
    const n = norm(name)
    const match = headers.find(x => norm(x) === n || x === name)
    const header = match || headers.find(x => norm(x).includes(n.slice(0, 6))) || ''
    return header ? norm(header) : ''
  }

  const f = {
    avancement: h('Etat d\'avance de la demande'),
    type: h('Type de demande'),
    nature: h('Nature de la demande'),
    site: h('Site'),
    demandeur: h('Demandeurs'),
    date: h('Date de dépôt du dossier sur docinfo'),
    conf1: h('Conformité à la première diffusion'),
    confDem: h('Conformité de la demande'),
    duree: h('Durée de traitement (jours) 1'),
    echeance: h('Echéance contractuelle (jours) 1'),
    ecart: h('Ecart de traitement (jour) 1'),
    stockage: h('Stockage'),
    stockageAdv: h('Stockage ADVESO'),
  }

  const MAX_DAYS = 365
  const parseNum = val => { if (!val) return NaN; const n = parseFloat(String(val).replace(',', '.').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? NaN : n }

  const groups = {
    avancement: {}, avLabel: {}, type: {}, typeLabel: {},
    nature: {}, natureLabel: {}, site: {}, siteLabel: {},
    demandeur: {}, demLabel: {},
    conf1: {}, conf1Label: {}, confDem: {}, confDemLabel: {},
    stockage: {}, stockageLabel: {}, stockageAdv: {}, stockageAdvLabel: {},
    monthly: {},
  }
  const delais = { duree: [], echeance: [], ecart: [] }

  function addGroup(slugMap, labelMap, raw) {
    var v = (raw || '').trim()
    if (!v) return
    var gk = v.replace(/[^ -~]+/g, '').toLowerCase()
    slugMap[gk] = (slugMap[gk] || 0) + 1
    var prev = labelMap[gk]
    if (!prev || (v.indexOf('\ufffd') < 0 && v.length >= prev.length)) labelMap[gk] = v
  }

  var l = items.length
  for (var i = 0; i < l; i++) {
    var it = items[i]

    addGroup(groups.avancement, groups.avLabel, it[f.avancement])
    addGroup(groups.type, groups.typeLabel, it[f.type])
    addGroup(groups.nature, groups.natureLabel, it[f.nature])
    addGroup(groups.site, groups.siteLabel, it[f.site])

    var de = (it[f.demandeur] || '').trim()
    if (de) {
      var key = de.replace(/[^a-zA-Z]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
      groups.demandeur[key] = (groups.demandeur[key] || 0) + 1
      var prev = groups.demLabel[key]
      if (!prev || (de.indexOf('\ufffd') < 0 && de.length >= prev.length)) groups.demLabel[key] = de
    }

    addGroup(groups.conf1, groups.conf1Label, it[f.conf1])
    addGroup(groups.confDem, groups.confDemLabel, it[f.confDem])
    addGroup(groups.stockage, groups.stockageLabel, it[f.stockage])
    addGroup(groups.stockageAdv, groups.stockageAdvLabel, it[f.stockageAdv])

    var du = parseNum(it[f.duree]); if (!isNaN(du) && du >= 0 && du <= MAX_DAYS) delais.duree.push(du)
    var ecVal = parseNum(it[f.echeance]); if (!isNaN(ecVal) && ecVal >= 0 && ecVal <= MAX_DAYS) delais.echeance.push(ecVal)
    var ec = parseNum(it[f.ecart]); if (!isNaN(ec) && Math.abs(ec) <= MAX_DAYS) delais.ecart.push(ec)

    var rd = it[f.date] || ''
    if (rd) {
      var _candidates = String(rd).split(/[,;\n\r]+/)
      for (var _c = 0; _c < _candidates.length; _c++) {
        var _val = _candidates[_c].trim()
        if (!_val) continue
        try {
          var d = excelToDate(_val)
          if (!d || isNaN(d.getTime())) {
            if (_val.indexOf('/') >= 0) { var p = _val.split('/'); if (p.length === 3) d = new Date(p[2], p[1] - 1, p[0]) }
            else d = new Date(_val)
          }
          if (d && !isNaN(d.getTime())) {
            var mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
            groups.monthly[mk] = (groups.monthly[mk] || 0) + 1
            break
          }
        } catch {}
      }
    }
  }

  const toDist = (obj, labelMap) => {
    var keys = Object.keys(obj)
    var out = []
    for (var k = 0; k < keys.length; k++) {
      out.push({ label: labelMap ? (labelMap[keys[k]] || keys[k]) : keys[k], count: obj[keys[k]] })
    }
    return out.sort(function(a, b) { return b.count - a.count })
  }
  const sortedMonthly = Object.entries(groups.monthly).sort(function(a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0 }).map(function(a) { return { month: a[0], count: a[1] } })

  const topDem = Object.entries(groups.demandeur).map(function(a) { return { label: groups.demLabel[a[0]], count: a[1] } }).sort(function(a, b) { return b.count - a.count }).slice(0, 10)

  const conf1Vals = groups.conf1; var conf1T = Object.values(conf1Vals).reduce(function(a, b) { return a + b }, 0); var conf1O = (conf1Vals['oui'] || 0) + (conf1Vals['conforme'] || 0)
  const confDemVals = groups.confDem; var confDemT = Object.values(confDemVals).reduce(function(a, b) { return a + b }, 0); var confDemO = (confDemVals['oui'] || 0) + (confDemVals['conforme'] || 0)

  const delaiStats = function(vals) {
    if (vals.length === 0) return { min: 0, max: 0, avg: 0, median: 0, count: 0, zeroPct: 0, gtZero: 0 }
    var sorted = vals.slice().sort(function(a, b) { return a - b })
    var sum = 0; for (var k = 0; k < vals.length; k++) sum += vals[k]
    var zc = 0; for (var k = 0; k < vals.length; k++) { if (vals[k] === 0) zc++ }
    return {
      min: sorted[0], max: sorted[sorted.length - 1],
      avg: Math.round((sum / vals.length) * 10) / 10,
      median: sorted[Math.floor(sorted.length / 2)],
      count: vals.length,
      zeroPct: vals.length > 0 ? Math.round((zc / vals.length) * 100) : 0,
      gtZero: vals.length - zc,
    }
  }

  return {
    total: l,
    avancementDist: toDist(groups.avancement, groups.avLabel),
    typeDist: toDist(groups.type, groups.typeLabel),
    natureDist: toDist(groups.nature, groups.natureLabel),
    siteDist: toDist(groups.site, groups.siteLabel),
    topDemandeurs: topDem,
    tauxConf1: conf1T > 0 ? Math.round((conf1O / conf1T) * 100) : 0,
    conf1Dist: toDist(conf1Vals, groups.conf1Label).map(function(a) { return { label: a.label.charAt(0).toUpperCase() + a.label.slice(1), count: a.count } }),
    tauxConfDem: confDemT > 0 ? Math.round((confDemO / confDemT) * 100) : 0,
    confDemDist: toDist(confDemVals, groups.confDemLabel).map(function(a) { return { label: a.label.charAt(0).toUpperCase() + a.label.slice(1), count: a.count } }),
    stockageDist: toDist(groups.stockage, groups.stockageLabel),
    stockageAdvesoDist: toDist(groups.stockageAdv, groups.stockageAdvLabel),
    duree: delaiStats(delais.duree),
    echeance: delaiStats(delais.echeance),
    ecart: delaiStats(delais.ecart),
    monthlyTrend: sortedMonthly,
  }
}

const statusColors = {
  'Nouvelle': '#0A66C2', 'Nouveau': '#0A66C2',
  'En cours': '#B45309', 'Encours': '#B45309',
  'En attente': '#64748B', 'Enattente': '#64748B',
  'Terminée': '#15803D', 'Terminé': '#15803D', 'Termine': '#15803D',
  'Annulée': '#DC2626', 'Annulé': '#DC2626', 'Annule': '#DC2626',
  'A traiter': '#F59E0B', 'Atraiter': '#F59E0B',
  'Clôturée': '#16A34A', 'Cloturee': '#16A34A', 'Clôturé': '#16A34A',
}

const natureColors = {
  'AMDEC': '#0A66C2', 'AMDEC ': '#0A66C2',
  'MQT': '#7C3AED',
  'Sécurité': '#DC2626', 'Securite': '#DC2626',
  'Maintenance': '#D4A017',
  'Qualité': '#16A34A', 'Qualite': '#16A34A',
  'Fiabilité': '#0D9488', 'Fiabilite': '#0D9488',
  'GMAO': '#6366F1',
}

const siteColors = ['#DC2626', '#0D9488', '#16A34A', '#F59E0B', '#7C3AED', '#EA580C', '#65A30D', '#EC4899', '#D97706', '#BE123C']

const typeColors = ['#2563EB', '#DC2626', '#16A34A', '#F59E0B', '#9333EA', '#0D9488', '#EC4899', '#D97706', '#0891B2', '#6366F1']

const confColors = { 'Oui': '#16A34A', 'Non': '#DC2626', 'Conforme': '#16A34A', 'Non conforme': '#DC2626' }
const stockageColors = { 'Oui': '#16A34A', 'Non': '#DC2626', 'Non concerné': '#94A3B8', 'Non concerne': '#94A3B8' }

function createBarChart(title, data, colorMap) {
  const card = document.createElement('div')
  card.className = 'dash-chart-card'
  card.innerHTML = `<h4>${title}</h4>`
  if (!data || data.length === 0) {
    card.innerHTML += '<div style="color:var(--clr-text-muted);font-size:var(--text-sm);padding:20px 0;text-align:center">Aucune donnée</div>'
    return card
  }
  const maxCount = Math.max(...data.map(d => d.count))
  const list = document.createElement('div')
  list.className = 'dash-bar-list'
  data.forEach(item => {
    const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0
    const color = typeof colorMap === 'function' ? colorMap(item.label) : (colorMap[item.label] || '#0A66C2')
    const bar = document.createElement('div')
    bar.className = 'dash-bar-item'
    bar.innerHTML = `
      <div class="dash-bar-header">
        <span class="dash-bar-label">${esc(item.label)}</span>
        <span class="dash-bar-count">${item.count}</span>
      </div>
      <div class="dash-bar-track">
        <div class="dash-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    `
    list.appendChild(bar)
  })
  card.appendChild(list)
  return card
}

function createGaugeChart(title, data, colorMap) {
  var card = document.createElement('div')
  card.className = 'dash-chart-card'
  card.innerHTML = '<h4>' + title + '</h4>'
  if (!data || data.length === 0) {
    card.innerHTML += '<div style="color:var(--clr-text-muted);font-size:var(--text-sm);padding:20px 0;text-align:center">Aucune donn\u00e9e</div>'
    return card
  }
  var total = data.reduce(function(s, d) { return s + d.count }, 0)
  if (total === 0) {
    card.innerHTML += '<div style="color:var(--clr-text-muted);font-size:var(--text-sm);padding:20px 0;text-align:center">Aucune donn\u00e9e</div>'
    return card
  }
  var yesEntry = data.find(function(d) { return /oui|conforme/i.test(d.label) })
  var pct = yesEntry ? Math.round(yesEntry.count / total * 100) : 0
  var gaugeColor = pct >= 80 ? '#10B981' : pct >= 60 ? '#F59E0B' : '#EF4444'

  var wrap = document.createElement('div')
  wrap.className = 'dash-gauge-wrap'

  var svgNS = 'http://www.w3.org/2000/svg'
  var svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('width', '130')
  svg.setAttribute('height', '80')
  svg.setAttribute('viewBox', '0 0 130 85')
  svg.style.flexShrink = '0'

  var cx = 65, cy = 65, r = 44

  var bg = document.createElementNS(svgNS, 'path')
  bg.setAttribute('d', 'M ' + (cx - r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy)
  bg.setAttribute('fill', 'none')
  bg.setAttribute('stroke', 'var(--clr-border)')
  bg.setAttribute('stroke-width', '16')
  bg.setAttribute('stroke-linecap', 'round')
  svg.appendChild(bg)

  if (pct > 0) {
    var endAngle = Math.PI * (1 + pct / 100)
    var endX = cx + r * Math.cos(endAngle)
    var endY = cy + r * Math.sin(endAngle)
    var fg = document.createElementNS(svgNS, 'path')
    fg.setAttribute('d', 'M ' + (cx - r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + endX.toFixed(2) + ' ' + endY.toFixed(2))
    fg.setAttribute('fill', 'none')
    fg.setAttribute('stroke', gaugeColor)
    fg.setAttribute('stroke-width', '16')
    fg.setAttribute('stroke-linecap', 'round')
    svg.appendChild(fg)
  }

  var txt = document.createElementNS(svgNS, 'text')
  txt.setAttribute('x', cx)
  txt.setAttribute('y', cy + 16)
  txt.setAttribute('text-anchor', 'middle')
  txt.setAttribute('font-size', '28')
  txt.setAttribute('font-weight', '800')
  txt.setAttribute('fill', 'var(--clr-text-primary)')
  txt.innerHTML = pct + '%'
  svg.appendChild(txt)

  wrap.appendChild(svg)

  var legend = document.createElement('div')
  legend.className = 'dash-donut-legend'
  data.forEach(function(item) {
    var ipct = Math.round(item.count / total * 100)
    var isGreen = /oui|conforme/i.test(item.label)
    var color = typeof colorMap === 'function' ? colorMap(item.label) : (colorMap[item.label] || (isGreen ? '#16A34A' : '#DC2626'))
    var row = document.createElement('div')
    row.className = 'dash-donut-row'
    row.innerHTML = '<span class="dash-donut-dot" style="background:' + color + '"></span><span class="dash-donut-lbl">' + esc(item.label) + '</span><span class="dash-donut-pct">' + ipct + '%</span><span class="dash-donut-cnt">' + item.count + '</span>'
    legend.appendChild(row)
  })
  wrap.appendChild(legend)
  card.appendChild(wrap)
  return card
}

function createPieChart(title, data, colorMap) {
  var card = document.createElement('div')
  card.className = 'dash-chart-card'
  card.innerHTML = '<h4>' + title + '</h4>'
  if (!data || data.length === 0) {
    card.innerHTML += '<div style="color:var(--clr-text-muted);font-size:var(--text-sm);padding:20px 0;text-align:center">Aucune donn\u00e9e</div>'
    return card
  }
  var total = data.reduce(function(s, d) { return s + d.count }, 0)
  if (total === 0) {
    card.innerHTML += '<div style="color:var(--clr-text-muted);font-size:var(--text-sm);padding:20px 0;text-align:center">Aucune donn\u00e9e</div>'
    return card
  }
  var wrap = document.createElement('div')
  wrap.className = 'dash-donut-wrap'

  var svgNS = 'http://www.w3.org/2000/svg'
  var svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('width', '110')
  svg.setAttribute('height', '110')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.style.flexShrink = '0'

  var cx = 50, cy = 50, r = 40
  var startAngle = -Math.PI / 2

  data.forEach(function(item) {
    var pct = item.count / total
    var endAngle = startAngle + pct * 2 * Math.PI
    var color = typeof colorMap === 'function' ? colorMap(item.label) : (colorMap[item.label] || '#0A66C2')

    var x1 = cx + r * Math.cos(startAngle)
    var y1 = cy + r * Math.sin(startAngle)
    var x2 = cx + r * Math.cos(endAngle)
    var y2 = cy + r * Math.sin(endAngle)
    var largeArc = pct > 0.5 ? 1 : 0

    var path = document.createElementNS(svgNS, 'path')
    path.setAttribute('d', 'M ' + cx + ' ' + cy + ' L ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' Z')
    path.setAttribute('fill', color)
    path.setAttribute('stroke', '#fff')
    path.setAttribute('stroke-width', '1.5')
    svg.appendChild(path)

    startAngle = endAngle
  })

  wrap.appendChild(svg)

  var legend = document.createElement('div')
  legend.className = 'dash-donut-legend'
  data.forEach(function(item) {
    var pct = Math.round(item.count / total * 100)
    var color = typeof colorMap === 'function' ? colorMap(item.label) : (colorMap[item.label] || '#0A66C2')
    var row = document.createElement('div')
    row.className = 'dash-donut-row'
    row.innerHTML = '<span class="dash-donut-dot" style="background:' + color + '"></span><span class="dash-donut-lbl">' + esc(item.label) + '</span><span class="dash-donut-pct">' + pct + '%</span><span class="dash-donut-cnt">' + item.count + '</span>'
    legend.appendChild(row)
  })
  wrap.appendChild(legend)
  card.appendChild(wrap)
  return card
}

function createDonutChart(title, data, colorMap) {
  const card = document.createElement('div')
  card.className = 'dash-chart-card'
  card.innerHTML = `<h4>${title}</h4>`
  if (!data || data.length === 0) {
    card.innerHTML += '<div style="color:var(--clr-text-muted);font-size:var(--text-sm);padding:20px 0;text-align:center">Aucune donnée</div>'
    return card
  }
  const total = data.reduce((s, d) => s + d.count, 0)
  if (total === 0) {
    card.innerHTML += '<div style="color:var(--clr-text-muted);font-size:var(--text-sm);padding:20px 0;text-align:center">Aucune donnée</div>'
    return card
  }
  const wrap = document.createElement('div')
  wrap.className = 'dash-donut-wrap'
  const svgNS = 'http://www.w3.org/2000/svg'
  const size = 110
  const svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('width', size)
  svg.setAttribute('height', size)
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.style.flexShrink = '0'
  const cx = 50, cy = 50, r = 38, sw = 17
  const circ = 2 * Math.PI * r
  let offset = 0
  data.forEach((item, idx) => {
    const pct = item.count / total
    const len = pct * circ
    const color = typeof colorMap === 'function' ? colorMap(item.label) : Array.isArray(colorMap) ? (colorMap[idx] || '#64748B') : (colorMap[item.label] || '#64748B')
    const circle = document.createElementNS(svgNS, 'circle')
    circle.setAttribute('cx', cx)
    circle.setAttribute('cy', cy)
    circle.setAttribute('r', r)
    circle.setAttribute('fill', 'none')
    circle.setAttribute('stroke', color)
    circle.setAttribute('stroke-width', sw)
    circle.setAttribute('stroke-dasharray', `${Math.max(len, 0.5)} ${circ - len}`)
    circle.setAttribute('stroke-dashoffset', -offset)
    circle.setAttribute('transform', `rotate(-90 ${cx} ${cy})`)
    svg.appendChild(circle)
    offset += len
  })
  const hole = document.createElementNS(svgNS, 'text')
  hole.setAttribute('x', cx)
  hole.setAttribute('y', cy + 4)
  hole.setAttribute('text-anchor', 'middle')
  hole.setAttribute('font-size', '16')
  hole.setAttribute('font-weight', '700')
  hole.setAttribute('fill', 'var(--clr-text-primary)')
  hole.innerHTML = total
  svg.appendChild(hole)
  wrap.appendChild(svg)
  const legend = document.createElement('div')
  legend.className = 'dash-donut-legend'
  data.forEach((item, idx) => {
    const pct = Math.round(item.count / total * 100)
    const color = typeof colorMap === 'function' ? colorMap(item.label) : Array.isArray(colorMap) ? (colorMap[idx] || '#64748B') : (colorMap[item.label] || '#64748B')
    const row = document.createElement('div')
    row.className = 'dash-donut-row'
    row.innerHTML = `
      <span class="dash-donut-dot" style="background:${color}"></span>
      <span class="dash-donut-lbl">${esc(item.label)}</span>
      <span class="dash-donut-pct">${pct}%</span>
      <span class="dash-donut-cnt">${item.count}</span>
    `
    legend.appendChild(row)
  })
  wrap.appendChild(legend)
  card.appendChild(wrap)
  return card
}

function createLineChart(title, data) {
  const card = document.createElement('div')
  card.className = 'dash-chart-card'
  if (title) card.innerHTML = `<h4>${title}</h4>`
  if (!data || data.length === 0) {
    card.innerHTML += '<div style="color:var(--clr-text-muted);font-size:var(--text-sm);padding:20px 0;text-align:center">Aucune donnée</div>'
    return card
  }
  const w = Math.max(data.length * 60 + 40, 300)
  const h = 150
  const pad = { top: 16, right: 12, bottom: 24, left: 36 }
  const plotW = w - pad.left - pad.right
  const plotH = h - pad.top - pad.bottom
  const maxVal = Math.max(...data.map(d => d.count), 1)
  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', h)
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  svg.style.display = 'block'
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * plotH
    const val = Math.round(maxVal * (1 - i / 4))
    const line = document.createElementNS(svgNS, 'line')
    line.setAttribute('x1', pad.left)
    line.setAttribute('y1', y)
    line.setAttribute('x2', w - pad.right)
    line.setAttribute('y2', y)
    line.setAttribute('stroke', 'var(--clr-border)')
    line.setAttribute('stroke-width', '1')
    svg.appendChild(line)
    const lbl = document.createElementNS(svgNS, 'text')
    lbl.setAttribute('x', pad.left - 6)
    lbl.setAttribute('y', y + 3)
    lbl.setAttribute('text-anchor', 'end')
    lbl.setAttribute('fill', 'var(--clr-text-muted)')
    lbl.setAttribute('font-size', '9')
    lbl.innerHTML = val
    svg.appendChild(lbl)
  }
  const points = data.map((d, i) => ({
    x: pad.left + (i / Math.max(data.length - 1, 1)) * plotW,
    y: pad.top + (1 - d.count / maxVal) * plotH,
    count: d.count,
    label: d.month.slice(5)
  }))
  const area = document.createElementNS(svgNS, 'polygon')
  const areaPts = `${points[0].x},${pad.top + plotH} ` +
    points.map(p => `${p.x},${p.y}`).join(' ') +
    ` ${points[points.length - 1].x},${pad.top + plotH}`
  area.setAttribute('points', areaPts)
  area.setAttribute('fill', 'rgba(59,130,246,.08)')
  svg.appendChild(area)
  const polyline = document.createElementNS(svgNS, 'polyline')
  polyline.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '))
  polyline.setAttribute('fill', 'none')
  polyline.setAttribute('stroke', '#3B82F6')
  polyline.setAttribute('stroke-width', '2.5')
  polyline.setAttribute('stroke-linecap', 'round')
  polyline.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(polyline)
  points.forEach((p, i) => {
    const dot = document.createElementNS(svgNS, 'circle')
    dot.setAttribute('cx', p.x)
    dot.setAttribute('cy', p.y)
    dot.setAttribute('r', i === points.length - 1 ? '4' : '3')
    dot.setAttribute('fill', i === points.length - 1 ? '#2563EB' : '#3B82F6')
    dot.setAttribute('stroke', '#fff')
    dot.setAttribute('stroke-width', '1.5')
    svg.appendChild(dot)
    const vLabel = document.createElementNS(svgNS, 'text')
    vLabel.setAttribute('x', p.x)
    vLabel.setAttribute('y', p.y - 9)
    vLabel.setAttribute('text-anchor', 'middle')
    vLabel.setAttribute('fill', '#1E40AF')
    vLabel.setAttribute('font-size', '10')
    vLabel.setAttribute('font-weight', 'bold')
    vLabel.innerHTML = p.count
    svg.appendChild(vLabel)
  })
  points.forEach(p => {
    const lbl = document.createElementNS(svgNS, 'text')
    lbl.setAttribute('x', p.x)
    lbl.setAttribute('y', h - 4)
    lbl.setAttribute('text-anchor', 'middle')
    lbl.setAttribute('fill', 'var(--clr-text-muted)')
    lbl.setAttribute('font-size', '9')
    lbl.innerHTML = p.label
    svg.appendChild(lbl)
  })
  card.appendChild(svg)
  return card
}

var _dashTableState = {}

function renderDataTable(headers, items, stats, statusField) {
  const norm = x => x.trim().toLowerCase().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '')
  const h = name => {
    const n = norm(name)
    const match = headers.find(x => norm(x) === n || x === name)
    return match ? norm(match) : ''
  }
  if (!statusField) statusField = h("Etat d'avance de la demande")

  const typeField = h('Type de demande')
  const natureField = h('Nature de la demande')
  const siteField = h('Site')
  const demandeurField = h('Demandeurs')
  const dateField = h('Date de dépôt du dossier sur docinfo')
  const dateTraitField = h('Date de traitement IMMEIT')

  const displayFields = [
    { key: '_row', label: '#' },
    { key: dateField, label: 'Dépôt' },
    { key: siteField, label: 'Site' },
    { key: demandeurField, label: 'Demandeur' },
    { key: typeField, label: 'Type' },
    { key: natureField, label: 'Nature' },
    { key: statusField, label: 'Avancement' },
    { key: dateTraitField, label: 'Traitement' },
  ].filter(f => f.key)

  const headerHtml = displayFields.map(f => `<th>${esc(f.label)}</th>`).join('')
  function getCellValue(item, key) { return item[key] !== undefined ? item[key] : '' }

  if (!_dashTableState.page) _dashTableState.page = 1
  
  const PAGE_SIZE = 50
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  if (_dashTableState.page > totalPages) _dashTableState.page = totalPages

  const page = _dashTableState.page
  const start = (page - 1) * PAGE_SIZE
  const pageItems = items.slice(start, start + PAGE_SIZE)

  const rowsHtml = pageItems.map(item => {
    const status = (getCellValue(item, statusField) || '').toLowerCase().replace(/[\s\-]+/g, '-')
    const cells = displayFields.map(f => {
      const val = String(getCellValue(item, f.key))
      const displayVal = val.length > 60 ? val.slice(0, 60) + '\u2026' : val
      if (f.key === statusField) {
        return '<td><span' + (status ? ' class="dash-badge dash-st-' + status + '"' : '') + '>' + esc(displayVal || '\u2014') + '</span></td>'
      }
      if (f.key === dateField || f.key === dateTraitField) {
        return '<td style="white-space:nowrap">' + esc(formatDateCell(displayVal) || '\u2014') + '</td>'
      }
      return '<td>' + esc(displayVal || '\u2014') + '</td>'
    }).join('')
    return '<tr>' + cells + '</tr>'
  }).join('')

  const end = Math.min(start + PAGE_SIZE, items.length)

  const card = document.createElement('div')
  card.className = 'dash-section'
  card.id = 'dash-table-card'

  var pageBtn = function(label, pg, cls) {
    return '<button class="btn btn--ghost btn-sm ' + cls + '" data-page="' + pg + '"' + (pg === page ? ' disabled' : '') + '>' + label + '</button>'
  }

  card.innerHTML = [
    '<div class="dash-section-header" style="cursor:default">',
    '  <h3>Demandes <span style="font-weight:400;color:var(--clr-text-muted);font-size:var(--text-xs)">' + (start + 1) + '\u2013' + end + '/' + items.length + '</span></h3>',
    '  <div style="display:flex;align-items:center;gap:6px">',
         pageBtn('\u2039 Pr\u00e9c\u00e9dent', page - 1, page <= 1 ? 'hidden' : '') +
         '<span style="font-size:var(--text-xs);color:var(--clr-text-muted)">Page ' + page + '/' + totalPages + '</span>' +
         pageBtn('Suivant \u203a', page + 1, page >= totalPages ? 'hidden' : ''),
    '  </div>',
    '</div>',
    '<div class="dash-section-body dash-table-wrap">',
    '  <table><thead><tr>' + headerHtml + '</tr></thead><tbody>' + rowsHtml + '</tbody></table>',
    '</div>'
  ].join('\n')

  card.querySelectorAll('[data-page]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _dashTableState.page = parseInt(btn.dataset.page)
      var oldCard = document.getElementById('dash-table-card')
      var parent = oldCard.parentNode
      var newCard = renderDataTable(headers, items, stats, statusField)
      parent.replaceChild(newCard, oldCard)
    })
  })

  return card
}

function formatDateCell(val) {
  if (!val) return '—'
  try {
    const num = parseFloat(String(val).replace(',', '.'))
    if (!isNaN(num) && num > 40000 && num < 60000) {
      const d = new Date(Math.round((num - 25569) * 86400000))
      if (!isNaN(d.getTime())) return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    }
    const d = new Date(val)
    if (isNaN(d.getTime())) return String(val).slice(0, 10)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return String(val).slice(0, 10)
  }
}

// INIT
function init() {
  if (hasSession()) {
    var lastView = localStorage.getItem('immeit_last_view')
    if (lastView === 'dashboard') showDashboard()
    else showMain()
    loadAvailableModels()
  } else showLogin()
}

init()
