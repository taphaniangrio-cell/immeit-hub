const { CONSTANTS } = require('./constants');
const { log } = require('./logger');

const KEYWORDS = [
  'AMDEC', 'RCM', 'fiabilité', 'GMAO', 'maintenance prédictive',
  'maintenance préventive', 'Industrie 4.0', 'jumeau numérique',
  'IoT industriel', 'maintenance conditionnelle', 'CMMS',
  'reliability', 'predictive maintenance', 'industrie 5.0',
  'asset management', 'vibration analysis', 'thermography',
  'oil analysis', 'condition monitoring', 'maintien en condition',
  'sûreté de fonctionnement', 'disponibilité', 'MTBF', 'FMEA',
];

const RSS_FEEDS = [
  { url: 'https://www.plantengineering.com/feed/', lang: 'en' },
  { url: 'https://www.reliabilityweb.com/feed/', lang: 'en' },
  { url: 'https://www.maintenanceworld.com/feed/', lang: 'en' },
  { url: 'https://www.manufacturing.net/rss/38', lang: 'en' },
  { url: 'https://www.usinenouvelle.com/rss/actualites.xml', lang: 'fr' },
  { url: 'https://www.industrie-technologies.com/feed/', lang: 'fr' },
  { url: 'http://feeds.feedburner.com/IndustrieDuFutur', lang: 'fr' },
  { url: 'https://news.google.com/rss/search?q=maintenance+industrielle+fiabilit%C3%A9+GMAO&hl=fr&gl=FR&ceid=FR:fr', lang: 'fr' },
  { url: 'https://news.google.com/rss/search?q=industrial+maintenance+reliability+prediction&hl=en&gl=US&ceid=US:en', lang: 'en' },
];

const FRENCH_PATTERN = /[éèêëàâäùûüôöîïçœæ]/i;

const cache = { data: null, expiry: 0 };
const CACHE_TTL = CONSTANTS.RSS_CACHE_TTL;
const FETCH_TIMEOUT = CONSTANTS.FETCH_TIMEOUT;

function isFrench(text) {
  return FRENCH_PATTERN.test(text);
}

function extractTag(xml, tag, startIdx = 0) {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const s = xml.indexOf(open, startIdx);
  if (s === -1) return { value: '', end: startIdx };
  const contentStart = s + open.length;
  const e = xml.indexOf(close, contentStart);
  if (e === -1) return { value: '', end: startIdx };
  return { value: xml.slice(contentStart, e), end: e + close.length };
}

function extractCDATA(xml, tag, startIdx = 0) {
  const open = `<${tag}`;
  const s = xml.indexOf(open, startIdx);
  if (s === -1) return { value: '', end: startIdx };
  const closeBracket = xml.indexOf('>', s);
  if (closeBracket === -1) return { value: '', end: startIdx };
  const contentStart = closeBracket + 1;
  const close = `</${tag}>`;
  const e = xml.indexOf(close, contentStart);
  if (e === -1) return { value: '', end: startIdx };
  let raw = xml.slice(contentStart, e);
  const cdataMatch = raw.match(/<!\[CDATA\[(.*?)\]\]>/s);
  return { value: cdataMatch ? cdataMatch[1].trim() : raw.trim(), end: e + close.length };
}

function extractAttrLink(xml, startIdx = 0) {
  const open = `<link`;
  const s = xml.indexOf(open, startIdx);
  if (s === -1) return { value: '', end: startIdx };
  const close = `</link>`;
  const closeTag = xml.indexOf(close, s);
  const closeBracket = xml.indexOf('>', s);

  if (closeBracket === -1) return { value: '', end: startIdx };

  if (closeTag !== -1 && (closeTag < closeBracket || closeBracket === s + open.length)) {
    const start = s + open.length + 1;
    if (closeTag > start) {
      return { value: xml.slice(start, closeTag).trim(), end: closeTag + close.length };
    }
    return { value: '', end: closeTag + close.length };
  }

  const hrefMatch = xml.slice(s, closeBracket).match(/href="([^"]*)"/);
  if (hrefMatch) {
    const endTagEnd = closeBracket + 1;
    return { value: hrefMatch[1], end: endTagEnd };
  }

  return { value: '', end: closeBracket + 1 };
}

function parseRSS(xml) {
  const items = [];
  let pos = 0;

  while (true) {
    const itemStart = xml.indexOf('<item>', pos);
    if (itemStart === -1) break;
    const itemEnd = xml.indexOf('</item>', itemStart);
    if (itemEnd === -1) break;
    const block = xml.slice(itemStart, itemEnd + 7);

    const titleRaw = extractTag(block, 'title');
    const title = titleRaw.value ? titleRaw : extractCDATA(block, 'title');
    const link = extractAttrLink(block);
    const descRaw = extractTag(block, 'description');
    const desc = descRaw.value ? descRaw : extractCDATA(block, 'description');
    const date = extractTag(block, 'pubDate');
    const guid = extractTag(block, 'guid');
    const dcDate = extractTag(block, 'dc:date');

    const cleanDesc = desc.value.replace(/<[^>]+>/g, '').replace(/<!\[CDATA\[(.*?)\]\]>/s, '$1').trim();

    items.push({
      title: title.value,
      link: link.value || guid.value,
      description: cleanDesc,
      pubDate: date.value || dcDate.value,
    });

    pos = itemEnd + 7;
  }

  return items;
}

function filterByKeywords(items) {
  const results = [];
  for (const item of items) {
    const text = (item.title + ' ' + item.description).toLowerCase();
    if (KEYWORDS.some(k => text.includes(k.toLowerCase()))) {
      results.push(item);
    }
  }
  return results;
}

function scoreItem(item) {
  const text = (item.titre + ' ' + item.resume).toLowerCase();
  let matchCount = 0;
  for (const kw of KEYWORDS) {
    if (text.includes(kw.toLowerCase())) matchCount++;
  }
  let score = matchCount * 10;

  if (isFrench(item.titre)) score += 3;

  if (item.date) {
    const age = Date.now() - new Date(item.date).getTime();
    const hours = age / 36e5;
    if (hours < 24) score += 5;
    else if (hours < 72) score += 3;
    else if (hours < 168) score += 1;
  }

  return score;
}

async function fetchRSS(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IMMEIT-Articles/1.0; +https://github.com/taphaniangrio-cell/articles-immeit)' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function translateItems(items) {
  if (items.length === 0) return items;
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return items;

  const toTranslate = items.filter(item => !isFrench(item.titre));
  if (toTranslate.length === 0) return items;

  const prompt = toTranslate.map((item, i) =>
    `[${i}] Titre: ${item.titre}\nRésumé: ${item.resume.slice(0, 200)}`
  ).join('\n\n');

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `Traduis les titres et résumés d'articles techniques (maintenance industrielle) de l'anglais vers le français.
Renvoie UNIQUEMENT un tableau JSON valide, sans balises markdown : [{"titre":"...","resume":"..."}]
Conserve le sens technique exact. Ne traduis pas les marques, acronymes (CMMS, IoT, AI, IIoT, RCM, FMEA, MTBF) ou noms propres.`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) return items;

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1) return items;

    const raw = JSON.parse(text.slice(start, end + 1));
    const translated = Array.isArray(raw) ? raw : [];

    for (let i = 0; i < Math.min(translated.length, toTranslate.length); i++) {
      const t = translated[i];
      if (t) {
        toTranslate[i].titre = t.titre || t.Titre || toTranslate[i].titre;
        toTranslate[i].resume = t.resume || t.Résumé || toTranslate[i].resume;
      }
    }
  } catch (e) { log('warn', 'rss_translation_failed', { error: e?.message }); }

  return items;
}

async function fetchNews() {
  if (Date.now() < cache.expiry && cache.data) {
    return cache.data;
  }

  const globalTimeout = 15000;
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Global RSS timeout')), globalTimeout)
  );

  const fetchPromise = (async () => {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async feed => {
      try {
        const xml = await fetchRSS(feed.url);
        const items = parseRSS(xml);
        const filtered = filterByKeywords(items);

        return filtered.map(item => ({
          titre: item.title,
          url: item.link,
          source: new URL(feed.url).hostname,
          date: item.pubDate,
          resume: item.description.slice(0, 300),
          lang: feed.lang,
        }));
      } catch {
        return [];
      }
    })
  );

  const seen = new Set();
  let allItems = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const item of r.value) {
        const k = item.titre.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          allItems.push(item);
        }
      }
    }
  }

  allItems.sort((a, b) => scoreItem(b) - scoreItem(a));
  allItems = allItems.slice(0, 5);
  allItems = await translateItems(allItems);

  cache.data = allItems;
  cache.expiry = Date.now() + CACHE_TTL;

  return allItems;
})();

  return Promise.race([fetchPromise, timeoutPromise]);
}

module.exports = { fetchNews, RSS_FEEDS };
