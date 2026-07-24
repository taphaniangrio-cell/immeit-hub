require('dotenv').config();
const { scoreArticle } = require('../lib/quality-score');

// Simulate what the AI should generate
const text = `J'ai visité une aciérie dans le Nord en janvier 2025. J'ai compté 47 pannes en 3 mois sur un site agroalimentaire. On a constaté une baisse de 30% des arrêts depuis juin. Un client dans l'automobile m'a montré que le temps de réponse avait baissé de 50%. Il y a 6 mois, on a équipé l'atelier de 12 capteurs vibration.

La maintenance prédictive n'est plus réservée aux grands groupes. On a installé des capteurs vibrations sur des machines qui tournent depuis 15 ans. Résultat en 4 mois : 40% de pannes évitées. J'ai vérifié les chiffres et c'est cohérent.

On a équipé 3 sites en 2025. Depuis mars, les arrêts non planifiés ont chuté de 35%. J'ai vu les tableaux de bord. Les équipes sont enfin sereines.

Le coût d'investissement s'est élevé à 45 000 euros. Le retour sur investissement a été de 6 mois. J'ai chiffré le gain : 120 000 euros d'arrêts évités sur 12 mois.

Votre usine track-t-elle ses vibrations ?`;

const s = scoreArticle(text);
console.log('Score:', s.total + '/10');
console.log('Anchors:', s.details.personalAnchors.count);
console.log('Matches:', s.details.personalAnchors.matches);
console.log('Contractions:', s.details.contractions.count);
console.log('Words:', s.details.wordCount.count);
console.log('LD:', s.details.lexicalDiversity.value + '%');
console.log('SV:', s.details.sentenceVariety.value + '%');
process.exit();
