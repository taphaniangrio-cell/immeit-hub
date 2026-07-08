const { CONSTANTS } = require('./constants');

const PEXELS_API = 'https://api.pexels.com/v1/search';
const API_KEY = process.env.PEXELS_API_KEY;
const imageCache = new Map();
const IMAGE_CACHE_TTL = CONSTANTS.IMAGE_CACHE_TTL;

const INDUSTRY_KEYWORDS = {
  'pompe': 'industrial pump',
  'moteur': 'industrial motor',
  'usine': 'factory',
  'industrie': 'factory production',
  'maintenance': 'industrial maintenance',
  'engrenage': 'gear industrial',
  'roulement': 'bearing industrial',
  'hydraulique': 'hydraulic system',
  'pneumatique': 'pneumatic system',
  'électrique': 'electrical maintenance',
  'capteur': 'industrial sensor',
  'automatisme': 'industrial automation',
  'tableau': 'electrical panel',
  'armoire': 'electrical cabinet',
  'vibration': 'vibration analysis',
  'thermique': 'thermal imaging',
  'fiabilité': 'reliability engineering',
  'inspection': 'industrial inspection',
  'soudure': 'welding industrial',
  'turbine': 'industrial turbine',
  'convoyeur': 'conveyor belt',
  'robot': 'industrial robot',
  'chaîne': 'production line',
  'énergie': 'industrial energy',
  'sécurité': 'industrial safety',
  'chantier': 'construction site',
  'atelier': 'workshop industry',
  'machine': 'industrial machinery',
  'équipement': 'industrial equipment',
  'outil': 'industrial tools',
  'diagnostic': 'industrial diagnostic',
  'performance': 'industrial performance',
  'production': 'manufacturing plant',
  'contrôle': 'quality control industrial',
};

const GENERIC_WORDS = new Set([
  'le', 'la', 'les', 'des', 'du', 'de', 'un', 'une', 'dans', 'pour', 'par',
  'sur', 'avec', 'est', 'sont', 'que', 'pas', 'une', 'cet', 'cette', 'ses',
  'son', 'aux', 'ces', 'fait', 'peut', 'tout', 'plus', 'très', 'aussi',
  'entre', 'chez', 'sans', 'mais', 'comme', 'quand', 'donc', 'alors', 'leur',
  'cela', 'cette', 'ceux', 'dont', 'rien', 'tous', 'elles', 'ils',
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'this', 'that', 'from',
  'industrial', 'maintenance', 'gmao', 'linkedin',
]);

const FALLBACK_QUERIES = [
  'industrial maintenance',
  'factory production',
];

function extractKeywords(title, hashtags, corps) {
  const sourceText = [
    title || '',
    ...(hashtags || []).map(h => h.replace('#', '')),
    corps || '',
  ].join(' ').toLowerCase();

  const words = sourceText.split(/[\s,;:.!?()\[\]{}"«»'']+/);

  const scored = {};

  for (const word of words) {
    const clean = word.replace(/[^a-z0-9àâäæçéèêëîïôœùûüÿ]/gi, '').trim();
    if (!clean || clean.length < 3 || GENERIC_WORDS.has(clean)) continue;

    const mapped = INDUSTRY_KEYWORDS[clean] || clean;
    scored[mapped] = (scored[mapped] || 0) + 1;
  }

  const sorted = Object.entries(scored)
    .sort((a, b) => b[1] - a[1])
    .map(e => e[0]);

  const phrases = [];
  if (sorted.length >= 3) phrases.push(sorted[0] + ' ' + sorted[1] + ' ' + sorted[2]);
  if (sorted.length >= 2) phrases.push(sorted[0] + ' ' + sorted[1]);
  if (sorted.length >= 1) phrases.push(sorted[0]);
  for (const f of FALLBACK_QUERIES) {
    if (!phrases.includes(f)) phrases.push(f);
  }

  return phrases.slice(0, 6);
}

function mapPhoto(photo) {
  return {
    url: photo.src.large || photo.src.medium,
    thumbnail: photo.src.small || photo.src.tiny,
    photographer: photo.photographer,
    photographer_url: photo.photographer_url,
    alt: photo.alt || '',
  };
}

async function searchPexels(query, perPage = 4) {
  if (!API_KEY) return [];

  const cacheKey = `${query}:${perPage}`;
  const cached = imageCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), CONSTANTS.IMAGE_FETCH_TIMEOUT);

    const url = `${PEXELS_API}?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`;
    const res = await fetch(url, {
      headers: { Authorization: API_KEY },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return [];

    const data = await res.json();
    const photos = (data.photos || []).map(mapPhoto);

    imageCache.set(cacheKey, { data: photos, expiry: Date.now() + IMAGE_CACHE_TTL });

    return photos;
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

async function findImagesForArticle({ titre_interne, hashtags, corps, image_keywords }) {
  const raw = image_keywords && image_keywords.length > 0
    ? image_keywords.slice(0, 3)
    : extractKeywords(titre_interne, hashtags, corps).slice(0, 3);
  const seen = new Set();
  const deduped = raw.filter(k => { const key = k.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
  const queries = [...deduped, ...FALLBACK_QUERIES].slice(0, 3);

  const results = await Promise.allSettled(queries.map(kw => searchPexels(kw, 3)));
  const all = [];
  const seenUrls = new Set();
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    for (const p of r.value) {
      if (!seenUrls.has(p.url) && all.length < 6) {
        seenUrls.add(p.url);
        all.push(p);
      }
    }
  }
  return all;
}

module.exports = { findImagesForArticle };
