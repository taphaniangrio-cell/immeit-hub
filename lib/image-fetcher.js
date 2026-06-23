const PEXELS_API = 'https://api.pexels.com/v1/search';
const API_KEY = process.env.PEXELS_API_KEY;

const GENERIC_WORDS = new Set([
  'le', 'la', 'les', 'des', 'du', 'de', 'un', 'une', 'dans', 'pour', 'par',
  'sur', 'avec', 'est', 'sont', 'que', 'pas', 'une', 'cet', 'cette', 'ses',
  'son', 'aux', 'ces', 'fait', 'peut', 'tout', 'plus', 'très', 'aussi',
  'entre', 'chez', 'sans', 'mais', 'comme', 'quand', 'donc', 'alors', 'leur',
  'cela', 'cette', 'ceux', 'dont', 'rien', 'tous', 'elles', 'ils',
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'this', 'that', 'from',
  'industrial', 'maintenance', 'gmao', 'linkedin',
]);

function extractKeywords(title, hashtags, corps) {
  const sourceWords = [
    ...(title || '').toLowerCase().split(/[\s,;:-]+/),
    ...(hashtags || []).map(h => h.replace('#', '').toLowerCase()),
  ];

  const scored = {};

  for (const word of sourceWords) {
    const clean = word.replace(/[^a-z0-9]/gi, '').trim();
    if (!clean || clean.length < 4 || GENERIC_WORDS.has(clean)) continue;
    scored[clean] = (scored[clean] || 0) + 1;
  }

  const sorted = Object.entries(scored)
    .sort((a, b) => b[1] - a[1])
    .map(e => e[0]);

  const phrases = [];
  if (sorted.length >= 2) phrases.push(sorted[0] + ' ' + sorted[1]);
  if (sorted.length >= 1) phrases.push(sorted[0]);

  if (phrases.length === 0) {
    phrases.push('industrial maintenance', 'factory', 'industry');
  }

  return phrases.slice(0, 3);
}

async function fetchImage(query) {
  if (!API_KEY) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const url = `${PEXELS_API}?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const res = await fetch(url, {
      headers: { Authorization: API_KEY },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.photos?.length) return null;

    const photo = data.photos[0];
    return {
      url: photo.src.large || photo.src.medium,
      photographer: photo.photographer,
      photographer_url: photo.photographer_url,
      alt: photo.alt || query,
    };
  } catch {
    return null;
  }
}

async function findImageForArticle({ titre_interne, hashtags, corps }) {
  const keywords = extractKeywords(titre_interne, hashtags, corps);
  for (const kw of keywords) {
    const result = await fetchImage(kw);
    if (result) return result;
  }
  return null;
}

module.exports = { findImageForArticle };
