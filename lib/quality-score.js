const HEDGE_WORDS = /\b(arguably|il pourrait être dit|dans certains cas|certains experts|on peut avancer|il est important de noter|il convient de souligner|force est de constater|it could be argued|in some cases|some experts believe|it is important to note)\b/gi;
const CONTRACTIONS = /(?:j['\u2019]ai|j['\u2019]suis|j['\u2019]pense|j['\u2019]dis|j['\u2019]vais|j['\u2019]crois|j['\u2019]vois|j['\u2019]fais|c['\u2019]est|c['\u2019]que|c['\u2019]là|c['\u2019]qui|on fait|y['\u2019]a|t['\u2019]as|n['\u2019]attendez|n['\u2019]attendons|qu['\u2019]on|qu['\u2019]il|qu['\u2019]elle|qu['\u2019]elles|qu['\u2019]ils|s['\u2019]est|n['\u2019]est|n['\u2019]a|y['\u2019]avait|c['\u2019]était|j['\u2019]avais|j['\u2019]aurais|on a|on a vu|on a constaté)/gi;
const PERSONAL_ANCHORS = /(\d{1,3}\s*%|il y a \d+|en \d{4}|la semaine dernière|ce mois[- ]?ci|hier|aujourd['\u2019]hui|dans mon|de mon|notre client|un client|j['\u2019]ai \w+|j['\u2019]y \w+ \w+|m['\u2019]a \w+|on a \w+|on a vu|on a constaté|on a équipé|on a installé|on fait|on travaille avec|on accompagne|je \w+|depuis \d+|pendant \d+|\d+ mois|\d+ semaines|\d+ heures|\d+ jours|\d+ ans|\d+ années)/gi;

function scoreArticle(text) {
  if (!text || typeof text !== 'string') return { total: 0, details: {} };

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const uniqueWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-zà-ÿ]/g, '')));

  const lexicalDiversity = wordCount > 0 ? uniqueWords.size / wordCount : 0;
  const ldScore = Math.min(10, Math.round(lexicalDiversity / 0.80 * 10));

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentLengths = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
  const avgLen = sentLengths.reduce((a, b) => a + b, 0) / (sentLengths.length || 1);
  const variance = sentLengths.reduce((a, b) => a + Math.pow(b - avgLen, 2), 0) / (sentLengths.length || 1);
  const cv = avgLen > 0 ? Math.sqrt(variance) / avgLen : 0;
  const svScore = Math.min(10, Math.round(cv / 0.60 * 10));

  const contractionMatches = text.match(CONTRACTIONS) || [];
  const contractionDensity = (contractionMatches.length / (wordCount || 1)) * 1000;
  const cScore = Math.min(10, Math.round(Math.min(contractionDensity, 8) / 8 * 10));

  const hedgeMatches = text.match(HEDGE_WORDS) || [];
  const hedgeDensity = (hedgeMatches.length / (wordCount || 1)) * 500;
  const hScore = Math.min(10, Math.max(0, 10 - Math.round(hedgeDensity * 3)));

  const personalMatches = text.match(PERSONAL_ANCHORS) || [];
  const pScore = Math.min(10, Math.round(Math.min(personalMatches.length, 5) / 5 * 10));

  const wScore = wordCount >= 300 && wordCount <= 500 ? 10 :
    wordCount >= 200 && wordCount <= 600 ? 7 :
    wordCount >= 150 ? 4 : 2;

  const total = Math.round(
    ldScore * 0.2 +
    svScore * 0.2 +
    cScore * 0.15 +
    hScore * 0.15 +
    pScore * 0.15 +
    wScore * 0.15
  );

  return {
    total,
    details: {
      lexicalDiversity: { score: ldScore, value: Math.round(lexicalDiversity * 100), count: uniqueWords.size, total: wordCount },
      sentenceVariety: { score: svScore, value: Math.round(cv * 100) },
      contractions: { score: cScore, count: contractionMatches.length, density: Math.round(contractionDensity * 10) / 10 },
      hedgeWords: { score: hScore, count: hedgeMatches.length },
      personalAnchors: { score: pScore, count: personalMatches.length, matches: personalMatches.slice(0, 10) },
      wordCount: { score: wScore, count: wordCount },
    }
  };
}

function getImprovementFeedback(scoreResult) {
  const d = scoreResult.details;
  const feedback = [];

  if (d.contractions.count < 8) {
    feedback.push(`CONTRACTIONS: tu as ${d.contractions.count}, il en faut minimum 8. Écris "j'ai" "c'est" "on fait" "y'a" "t'as" "j'dis" "c'là" "qu'on" "c'que" "j'pense" directement dans ton texte, pas en détachant l'apostrophe.`);
  }
  if (d.personalAnchors.count < 3) {
    feedback.push(`ANCRAGES PERSONNELS: tu as ${d.personalAnchors.count}, il en faut minimum 3. Tu DOIS inclure dans ton texte des phrases comme :
- "J'ai vu [quelque chose] sur un site [ville] en [mois] 2025"
- "J'ai compté [X] pannes sur [durée] chez [type] client"
- "On a constaté que [observation chiffrée] depuis [date]"
- "Un client dans [secteur] m'a montré que [chiffre]"
- "Il y a [X] mois, on a équipé [lieu] avec [équipement]"
- "J'ai vérifié [chiffre] sur [durée] et [résultat]"
Chaque phrase = 1 ancrage. Tu en need au moins 3 dans tout le corps.`);
  }
  if (d.wordCount.count < 300) {
    feedback.push(`LONGUEUR: ${d.wordCount.count} mots, il en faut minimum 300. Ajoute des détails chiffrés, des exemples clients, des retours terrain.`);
  }
  if (d.sentenceVariety.value < 45) {
    feedback.push(`VARIÉTÉ DES PHRASES: coefficient ${d.sentenceVariety.value}%, il faut >45%. Alterne : phrase de 3 mots, puis phrase de 30 mots, puis phrase de 5 mots. La variation est critique.`);
  }
  if (d.lexicalDiversity.value < 60) {
    feedback.push(`DIVERSITÉ LEXICALE: ${d.lexicalDiversity.value}%, utilise des synonymes. Pas "problème" 5 fois → "panne", "défaillance", "incident", "dysfonctionnement".`);
  }
  if (d.hedgeWords.count > 0) {
    feedback.push(`HEDGE WORDS: ${d.hedgeWords.count} trouvés. Supprime "il est important de noter", "force est de constater", "dans certains cas".`);
  }

  return feedback;
}

module.exports = { scoreArticle, getImprovementFeedback };
