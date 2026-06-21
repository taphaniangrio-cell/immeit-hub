const CTX = `P2M-IMMEIT — cabinet de conseil en méthodes de maintenance et performance industrielle, fondé en 2024.
Expertises : Ingénierie de fiabilité (AMDEC, RCM), Déploiement de GMAO (Coswin, SAP PM, Maximo, CARL, DIMOMAINT), Digitalisation des processus de maintenance.
Implantation : Dakar (Keur Massar) et Paris, opérations au Mali et en Côte d'Ivoire.
Cible : groupes industriels, directions maintenance, responsables fiabilité.
Ton : expert mais accessible, orienté terrain, pas de jargon gratuit, toujours relié à un bénéfice concret.`

const RSS_FEEDS = [
  'https://www.plantengineering.com/feed/',
  'https://www.reliabilityweb.com/feed/',
  'https://www.efficientplantmag.com/feed/',
  'https://www.techniques-ingenieur.fr/feed/actualites',
]

const KEYWORDS = ['AMDEC','RCM','fiabilité','GMAO','maintenance prédictive','maintenance préventive','Industrie 4.0',
  'jumeau numérique','IoT industriel','maintenance conditionnelle','CMMS','reliability','predictive maintenance']

const SYSTEM_PROMPT = `Tu rédiges des posts LinkedIn pour IMMEIT (contexte ci-dessous).
Contraintes strictes :
- Sujet exclusivement lié à la maintenance industrielle / fiabilité / GMAO. Si l'actualité sort de ce périmètre, refuse en commençant ta réponse par "REFUS:".
- Longueur : 150 à 250 mots.
- Structure : accroche forte dans les 2 premières lignes, angle d'expertise IMMEIT, conseil actionnable, question ou ouverture en fin (pas de CTA commercial).
- Densité : chaque phrase apporte une information.
- Pas d'emoji excessif (2-3 max).
- Génère 2 variantes d'accroche.

Réponds UNIQUEMENT par un objet JSON valide, sans texte avant/après :
{"titre_interne":"...","accroche_a":"...","accroche_b":"...","corps":"...","hashtags":["...","..."]}
Contexte entreprise : ${CTX}`

let API_KEY = ''
let articles = []
let filter = ''
let editingId = null
let currentNews = null
let regenNews = null

const $ = id => document.getElementById(id)

// DOM refs
const configScreen = $('config-screen'), mainScreen = $('main-screen'), editorScreen = $('editor-screen')
const configForm = $('config-form'), apiKeyInput = $('api-key'), configError = $('config-error')
const editTitre = $('edit-titre'), editCorps = $('edit-corps'), editHashtags = $('edit-hashtags')
const btnBack = $('btn-back'), btnSave = $('btn-save'), btnValidate = $('btn-validate')
const btnCopy = $('btn-copy'), btnDelete = $('btn-delete'), btnRegen = $('btn-regen'), btnRegenGo = $('btn-regen-go')
const btnNew = $('btn-new'), btnConfig = $('btn-config')
const newsModal = $('news-modal'), modalClose = $('modal-close'), btnAiPick = $('btn-ai-pick')
const regenBox = $('regen-box'), regenFeedback = $('regen-feedback')
const wordCount = $('word-count'), editorStatus = $('editor-status'), editorTitle = $('editor-title')
const quotaDisplay = $('quota-display')

function toast(msg) {
  const t = $('toast')
  t.textContent = msg
  t.classList.remove('hidden')
  setTimeout(() => t.classList.add('hidden'), 2600)
}

function saveState() { localStorage.setItem('immeit_articles', JSON.stringify(articles)) }
function loadState() {
  try { articles = JSON.parse(localStorage.getItem('immeit_articles')) || [] } catch { articles = [] }
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML }

function fmtDate(d) {
  if (!d) return ''
  const date = new Date(d)
  return date.toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

function statusClass(s) { return 's-' + (s || 'brouillon') }

let quotaError = false

///// GROQ
async function callGroq(prompt, system) {
  if (!API_KEY) throw new Error('CLÉ_MANQUANTE')
  const url = 'https://api.groq.com/openai/v1/chat/completions'
  const res = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${API_KEY}`},
    body:JSON.stringify({
      model:'llama-3.3-70b-versatile',
      messages:[{role:'system',content:system},{role:'user',content:prompt}],
      temperature:0.7,max_tokens:3072,
    }),
  })
  let data
  try { data = await res.json() } catch { data = {} }
  if (!res.ok || data.error) {
    const status = res.status
    const msg = (data.error?.message || '').toLowerCase()
    if (status === 429 || msg.includes('quota') || msg.includes('rate limit') || msg.includes('too many requests')) {
      quotaError = true
      throw new Error('QUOTA')
    }
    if (status === 401 || msg.includes('invalid') || msg.includes('unauthorized') || msg.includes('auth')) throw new Error('CLÉ_INVALIDE')
    if (status === 404) throw new Error('MODÈLE_INTROUVABLE')
    throw new Error(`ERREUR_API (HTTP ${status})`)
  }
  return data.choices?.[0]?.message?.content || ''
}

///// RSS
async function fetchRSSFeed(rssUrl) {
  const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`)
  const xml = await r.text()
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  return Array.from(doc.querySelectorAll('item')).map(item => ({
    title: item.querySelector('title')?.textContent || '',
    link: item.querySelector('link')?.textContent || '',
    pubDate: item.querySelector('pubDate')?.textContent || '',
    description: (item.querySelector('description')?.textContent || '').replace(/<[^>]+>/g,''),
  }))
}

async function fetchNews() {
  const results = []
  for (const url of RSS_FEEDS) {
    try {
      const items = await fetchRSSFeed(url)
      for (const item of items) {
        const text = (item.title + ' ' + item.description).toLowerCase()
        if (KEYWORDS.some(k => text.includes(k.toLowerCase()))) {
          results.push({
            titre: item.title,
            url: item.link,
            source: new URL(url).hostname,
            date: item.pubDate,
            resume: item.description.slice(0,300),
          })
        }
      }
    } catch {}
  }
  const seen = new Set()
  return results.filter(i => { const k = i.titre.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 15)
}

///// GÉNÉRATION
async function generateArticle(news, feedback) {
  let prompt = `Actualité source :\nTitre : ${news.titre}\nSource : ${news.source}\nURL : ${news.url}\nRésumé : ${news.resume}\n\nGénère un post LinkedIn à partir de cette actualité.`
  if (feedback) prompt += `\n\nConsignes supplémentaires : ${feedback}`
  const text = await callGroq(prompt, SYSTEM_PROMPT)
  if (text.startsWith('REFUS:')) throw new Error(text.slice(6).trim())
  try {
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    return json
  } catch { throw new Error('Réponse IA invalide. Réessaie.') }
}

///// CONFIG
function hasKey() { return !!localStorage.getItem('immeit_groq_key') }

function loadKey() {
  API_KEY = localStorage.getItem('immeit_groq_key') || ''
}

configForm.addEventListener('submit', async e => {
  e.preventDefault()
  $('config-error').classList.add('hidden')
  const key = apiKeyInput.value.trim()
  API_KEY = key
  try {
    const resp = await callGroq('Réponds "OK" en un mot.', 'Sois concis.')
    localStorage.setItem('immeit_groq_key', key)
    showMain()
  } catch (err) {
    const msgs = { 'QUOTA':'Quota dépassé. Réessaie plus tard ou crée un nouveau compte sur console.groq.com.','CLÉ_INVALIDE':'Clé API invalide.','CLÉ_MANQUANTE':'Veuillez entrer une clé.','MODÈLE_INTROUVABLE':'Modèle non trouvé sur Groq. Essaie un autre modèle.' }
    $('config-error').textContent = msgs[err.message] || err.message
    $('config-error').classList.remove('hidden')
  }
})

///// NAVIGATION
function showConfig() {
  configScreen.classList.remove('hidden')
  mainScreen.classList.add('hidden')
  editorScreen.classList.add('hidden')
  apiKeyInput.value = localStorage.getItem('immeit_groq_key') || ''
  apiKeyInput.focus()
}

function showMain() {
  configScreen.classList.add('hidden')
  editorScreen.classList.add('hidden')
  mainScreen.classList.remove('hidden')
  loadState()
  renderArticles()
  updateQuota()
}

function showEditor(article) {
  mainScreen.classList.add('hidden')
  editorScreen.classList.remove('hidden')
  editingId = article ? article.id : null
  regenNews = null

  if (article) {
    editorTitle.textContent = 'Modifier l\'article'
    editTitre.value = article.titre_interne || ''
    editCorps.value = article.corps || ''
    const h = article.hashtags || []
    editHashtags.value = Array.isArray(h) ? h.join(' ') : h
    editorStatus.textContent = article.statut
    editorStatus.className = 'badge ' + statusClass(article.statut)
    $('btn-validate').textContent = article.statut === 'valide' ? 'Déjà validé' : 'Valider'
    $('btn-validate').disabled = article.statut === 'valide' || article.statut === 'publie'
    if (article.source_news_titre) regenNews = { titre:article.source_news_titre, url:article.source_news_url||'', resume:(article.corps||'').slice(0,200) }
  } else {
    editorTitle.textContent = 'Nouvel article'
    editTitre.value = ''
    editCorps.value = ''
    editHashtags.value = ''
    editorStatus.textContent = 'brouillon'
    editorStatus.className = 'badge s-brouillon'
    $('btn-validate').textContent = 'Valider'
    $('btn-validate').disabled = true
  }
  updateWords()
  regenBox.classList.add('hidden')
}

btnBack.addEventListener('click', () => showMain())

///// AFFICHAGE ARTICLES
function renderArticles() {
  const list = $('article-list')
  const filtered = filter ? articles.filter(a => a.statut === filter) : articles
  if (filtered.length === 0) { list.innerHTML = '<div class="empty">Aucun article trouvé</div>'; return }

  list.innerHTML = filtered.map(a => `
    <div class="article-card" data-id="${a.id}">
      <div class="article-card-top">
        <h3>${esc(a.titre_interne || '(sans titre)')}</h3>
        <span class="status ${statusClass(a.statut)}">${a.statut}</span>
      </div>
      <div class="meta">
        <span>${fmtDate(a.date_creation)}</span>
        ${a.source_news_titre ? `<span>${esc(a.source_news_titre.slice(0, 50))}</span>` : ''}
      </div>
    </div>`).join('')

  list.querySelectorAll('.article-card').forEach(c => {
    c.addEventListener('click', () => {
      const a = articles.find(x => x.id === c.dataset.id)
      if (a) showEditor(a)
    })
  })
}

///// FILTRES
document.querySelectorAll('.filter-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active'))
    b.classList.add('active')
    filter = b.dataset.filter
    renderArticles()
  })
})

///// QUOTA
async function updateQuota() {
  if (!API_KEY) return
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { 'Authorization': `Bearer ${API_KEY}` } })
    if (r.ok) quotaDisplay.textContent = '✓ API Groq connectée'
    else quotaDisplay.textContent = ''
  } catch { quotaDisplay.textContent = '' }
}

///// WORDS
editCorps.addEventListener('input', updateWords)
function updateWords() {
  const w = editCorps.value.trim() ? editCorps.value.trim().split(/\s+/).length : 0
  wordCount.textContent = w + ' mots'
}

///// SAUVEGARDE
btnSave.addEventListener('click', () => {
  const data = {
    titre_interne: $('edit-titre').value,
    corps: $('edit-corps').value,
    hashtags: $('edit-hashtags').value.split(/\s+/).filter(h => h),
    source_news_titre: editingId ? (articles.find(a => a.id === editingId)?.source_news_titre || currentNews?.titre || null) : (currentNews?.titre || null),
    source_news_url: editingId ? (articles.find(a => a.id === editingId)?.source_news_url || currentNews?.url || null) : (currentNews?.url || null),
  }

  if (editingId) {
    const idx = articles.findIndex(a => a.id === editingId)
    if (idx !== -1) { articles[idx] = { ...articles[idx], ...data }; toast('Article enregistré') }
  } else {
    data.id = genId()
    data.statut = 'brouillon'
    data.date_creation = new Date().toISOString()
    articles.unshift(data)
    editingId = data.id
    $('editor-status').textContent = 'brouillon'
    $('editor-status').className = 'badge s-brouillon'
    $('btn-validate').disabled = false
    toast('Article créé')
  }
  saveState()
  renderArticles()
})

///// VALIDATION
btnValidate.addEventListener('click', () => {
  if (!editingId) return
  const a = articles.find(x => x.id === editingId)
  if (!a) return
  a.statut = 'valide'
  a.date_validation = new Date().toISOString()
  saveState()
  $('editor-status').textContent = 'valide'
  $('editor-status').className = 'badge s-valide'
  $('btn-validate').textContent = 'Déjà validé'
  $('btn-validate').disabled = true
  toast('Article validé')
  renderArticles()
})

///// COPIER
btnCopy.addEventListener('click', async () => {
  let text = $('edit-corps').value
  const h = $('edit-hashtags').value.split(/\s+/).filter(h => h)
  if (h.length) text += '\n\n' + h.join(' ')
  try {
    await navigator.clipboard.writeText(text)
    if (editingId) {
      const a = articles.find(x => x.id === editingId)
      if (a) { a.statut = 'publie'; a.date_publication = new Date().toISOString(); saveState() }
      $('editor-status').textContent = 'publie'
      $('editor-status').className = 'badge s-publie'
      $('btn-validate').disabled = true
      renderArticles()
    }
    toast('Copié dans le presse-papiers !')
  } catch { toast('Erreur de copie') }
})

///// SUPPRIMER
btnDelete.addEventListener('click', () => {
  if (!editingId) return
  if (!confirm('Supprimer cet article ?')) return
  articles = articles.filter(a => a.id !== editingId)
  saveState()
  toast('Article supprimé')
  showMain()
})

///// RÉGÉNÉRATION
btnRegen.addEventListener('click', () => $('regen-box').classList.toggle('hidden'))

btnRegenGo.addEventListener('click', async () => {
  const news = currentNews || regenNews
  if (!news) { toast('Aucune actualité source. Regénère depuis "Nouvel article".'); return }
  const feedback = $('regen-feedback').value
  btnRegenGo.disabled = true
  btnRegenGo.textContent = 'Génération...'
  try {
    const art = await generateArticle(news, feedback)
    $('edit-titre').value = art.titre_interne || ''
    const corps = `Accroche A :\n${art.accroche_a || ''}\n\nAccroche B :\n${art.accroche_b || ''}\n\n${art.corps || ''}`
    $('edit-corps').value = corps
    $('edit-hashtags').value = (art.hashtags || []).join(' ')
    updateWords()
    if (editingId) {
      const a = articles.find(x => x.id === editingId)
      if (a) { a.titre_interne = art.titre_interne; a.corps = corps; a.hashtags = art.hashtags; a.statut = 'brouillon'; saveState() }
      $('editor-status').textContent = 'brouillon'
      $('editor-status').className = 'badge s-brouillon'
      $('btn-validate').textContent = 'Valider'
      $('btn-validate').disabled = false
      renderArticles()
    }
    $('regen-box').classList.add('hidden')
    $('regen-feedback').value = ''
    toast('Article régénéré')
  } catch (err) { toast('Erreur : ' + err.message) }
  finally { btnRegenGo.disabled = false; btnRegenGo.textContent = 'Confirmer la régénération' }
})

///// NOUVEL ARTICLE
btnNew.addEventListener('click', async () => {
  newsModal.classList.remove('hidden')
  $('news-list').innerHTML = '<div class="empty">Recherche des actualités en cours...</div>'
  currentNews = null
  try {
    const items = await fetchNews()
    if (items.length === 0) { $('news-list').innerHTML = '<div class="empty">Aucune actualité trouvée</div>'; return }
    $('news-list').innerHTML = items.map((item, i) =>
      `<div class="news-item" data-idx="${i}"><h4>${esc(item.titre)}</h4><div class="src">${esc(item.source)}</div><div class="sum">${esc((item.resume||'').slice(0,200))}</div></div>`
    ).join('')
    $('news-list').querySelectorAll('.news-item').forEach(el => {
      el.addEventListener('click', () => {
        $('news-list').querySelectorAll('.news-item').forEach(n => n.classList.remove('selected'))
        el.classList.add('selected')
        currentNews = items[parseInt(el.dataset.idx)]
        generateFromNews(currentNews)
      })
    })
  } catch (err) { $('news-list').innerHTML = '<div class="empty">Erreur : ' + esc(err.message) + '</div>' }
})

btnAiPick.addEventListener('click', async () => {
  try {
    const items = await fetchNews()
    if (!items.length) { toast('Aucune actualité'); return }
    currentNews = items[Math.floor(Math.random() * items.length)]
    generateFromNews(currentNews)
  } catch (err) { toast('Erreur : ' + err.message) }
})

modalClose.addEventListener('click', () => newsModal.classList.add('hidden'))

async function generateFromNews(news) {
  $('news-list').innerHTML = '<div class="empty">Génération de l\'article...</div>'
  try {
    const art = await generateArticle(news, '')
    showEditor(null)
    $('edit-titre').value = art.titre_interne || ''
    const corps = `Accroche A :\n${art.accroche_a || ''}\n\nAccroche B :\n${art.accroche_b || ''}\n\n${art.corps || ''}`
    $('edit-corps').value = corps
    $('edit-hashtags').value = (art.hashtags || []).join(' ')
    updateWords()
    currentNews = news
    newsModal.classList.add('hidden')
    toast('Article généré !')
  } catch (err) { $('news-list').innerHTML = '<div class="empty">Erreur : ' + esc(err.message) + '</div>' }
}

///// CONFIG BUTTON
btnConfig.addEventListener('click', showConfig)

///// INIT
function init() {
  loadKey()
  if (hasKey()) { showMain() } else { showConfig() }
}

init()
