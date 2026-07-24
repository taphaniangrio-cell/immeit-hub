require('dotenv').config();
const { scoreArticle } = require('../lib/quality-score');

// Test with text that should have anchors
const texts = [
  "J'ai vu une usine en décembre 2025. J'ai compté les pannes. On a constaté une hausse de 30%. Depuis 6 mois, ça tourne bien.",
  "J\u2019ai vu une usine en d\u00e9cembre 2025. J\u2019ai compt\u00e9 les pannes. On a constat\u00e9 une hausse de 30%.",
  "J'ai visit\u00e9 un site dans le Nord. Le directeur m'a montr\u00e9 les chiffres. Il y a 3 mois, on a \u00e9quip\u00e9 la ligne.",
];

texts.forEach((t, i) => {
  const s = scoreArticle(t);
  console.log(`Text ${i+1}: score=${s.total}, anchors=${s.details.personalAnchors.count}, matches=${JSON.stringify(s.details.personalAnchors.matches)}`);
});
