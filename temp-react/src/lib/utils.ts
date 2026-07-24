import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function esc(str: string): string {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

export function fmtDate(d: string | Date): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function statusClass(s: string): string {
  return `s-${s}`;
}

export function excelToDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val === 'number') {
    const epoch = new Date(1899, 11, 30);
    return new Date(epoch.getTime() + val * 86400000);
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d;
  const parts = String(val).split('/');
  if (parts.length === 3) {
    const parsed = new Date(+parts[2], +parts[1] - 1, +parts[0]);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export function formatForLinkedIn(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/^---$/gm, '')
    .replace(/^- /gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface QualityScore {
  total: number;
  breakdown: {
    lexicalDiversity: { score: number; max: number; value: number; label: string };
    sentenceVariety: { score: number; max: number; value: number; label: string };
    contractions: { score: number; max: number; value: number; label: string };
    hedgeWords: { score: number; max: number; value: number; label: string };
    personalAnchors: { score: number; max: number; value: number; label: string };
    wordCount: { score: number; max: number; value: number; label: string };
  };
}

const HEDGE_WORDS = /(\b(arguably|il pourrait être dit|dans certains cas|certains experts|on peut avancer|il est important de noter|il convient de souligner|force est de constater|it could be argued|in some cases|some experts believe|it is important to note)\b)/gi;
const CONTRACTIONS = /(?:j['\u2019]ai|j['\u2019]suis|j['\u2019]pense|j['\u2019]dis|j['\u2019]vais|j['\u2019]crois|j['\u2019]vois|j['\u2019]fais|c['\u2019]est|c['\u2019]que|c['\u2019]là|c['\u2019]qui|on fait|y['\u2019]a|t['\u2019]as|n['\u2019]attendez|n['\u2019]attendons|qu['\u2019]on|qu['\u2019]il|qu['\u2019]elle|qu['\u2019]elles|qu['\u2019]ils|s['\u2019]est|n['\u2019]est|n['\u2019]a|y['\u2019]avait|c['\u2019]était|j['\u2019]avais|j['\u2019]aurais|on a|on a vu|on a constaté)/gi;
const PERSONAL_ANCHORS = /(\d{1,3}\s*%|il y a \d+|en \d{4}|la semaine dernière|ce mois[- ]?ci|hier|aujourd['\u2019]hui|dans mon|de mon|notre client|un client|j['\u2019]ai \w+|j['\u2019]y \w+ \w+|m['\u2019]a \w+|on a \w+|on a vu|on a constaté|on a équipé|on a installé|on fait|on travaille avec|on accompagne|je \w+|depuis \d+|pendant \d+|\d+ mois|\d+ semaines|\d+ heures|\d+ jours|\d+ ans|\d+ années)/gi;

export function scoreArticleQuality(text: string): QualityScore {
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const uniqueWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-zà-ÿ]/g, '')));

  // Lexical diversity: unique/total, target > 0.70
  const lexicalDiversityValue = wordCount > 0 ? uniqueWords.size / wordCount : 0;
  const lexicalDiversityScore = Math.min(10, Math.round(lexicalDiversityValue / 0.80 * 10));

  // Sentence variety: coefficient of variation of sentence lengths
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentLengths = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
  const avgLen = sentLengths.reduce((a, b) => a + b, 0) / (sentLengths.length || 1);
  const variance = sentLengths.reduce((a, b) => a + Math.pow(b - avgLen, 2), 0) / (sentLengths.length || 1);
  const cv = avgLen > 0 ? Math.sqrt(variance) / avgLen : 0;
  const sentenceVarietyScore = Math.min(10, Math.round(cv / 0.60 * 10));

  // Contractions: target > 4 per 1000 words
  const contractionMatches = text.match(CONTRACTIONS) || [];
  const contractionDensity = (contractionMatches.length / (wordCount || 1)) * 1000;
  const contractionsScore = Math.min(10, Math.round(Math.min(contractionDensity, 8) / 8 * 10));

  // Hedge words: penalize if > 4 per 500 words
  const hedgeMatches = text.match(HEDGE_WORDS) || [];
  const hedgeDensity = (hedgeMatches.length / (wordCount || 1)) * 500;
  const hedgeWordsScore = Math.min(10, Math.max(0, 10 - Math.round(hedgeDensity * 3)));

  // Personal anchors: target > 3
  const personalMatches = text.match(PERSONAL_ANCHORS) || [];
  const personalAnchorsScore = Math.min(10, Math.round(Math.min(personalMatches.length, 5) / 5 * 10));

  // Word count: target 300-500
  const wordCountScore = wordCount >= 300 && wordCount <= 500 ? 10 :
    wordCount >= 200 && wordCount <= 600 ? 7 :
    wordCount >= 150 ? 4 : 2;

  const total = Math.round(
    lexicalDiversityScore * 0.2 +
    sentenceVarietyScore * 0.2 +
    contractionsScore * 0.15 +
    hedgeWordsScore * 0.15 +
    personalAnchorsScore * 0.15 +
    wordCountScore * 0.15
  );

  return {
    total,
    breakdown: {
      lexicalDiversity: {
        score: lexicalDiversityScore, max: 10, value: lexicalDiversityValue,
        label: `Diversité lexicale: ${(lexicalDiversityValue * 100).toFixed(0)}% (cible >70%)`
      },
      sentenceVariety: {
        score: sentenceVarietyScore, max: 10, value: cv,
        label: `Variété phrases: ${(cv * 100).toFixed(0)}% (cible >45%)`
      },
      contractions: {
        score: contractionsScore, max: 10, value: contractionMatches.length,
        label: `Contractions: ${contractionMatches.length} (cible >4)`
      },
      hedgeWords: {
        score: hedgeWordsScore, max: 10, value: hedgeMatches.length,
        label: `Mots vagues: ${hedgeMatches.length} (max 4/500 mots)`
      },
      personalAnchors: {
        score: personalAnchorsScore, max: 10, value: personalMatches.length,
        label: `Ancrages personnels: ${personalMatches.length} (cible >3)`
      },
      wordCount: {
        score: wordCountScore, max: 10, value: wordCount,
        label: `Longueur: ${wordCount} mots (cible 300-500)`
      },
    }
  };
}

export function scoreColor(score: number): string {
  if (score >= 7) return 'text-emerald-600';
  if (score >= 5) return 'text-amber-600';
  return 'text-rose-600';
}

export function scoreLabel(score: number): string {
  if (score >= 8) return 'Excellent';
  if (score >= 7) return 'Bon';
  if (score >= 5) return 'Moyen';
  if (score >= 3) return 'Faible';
  return 'À revoir';
}

export function formatHashtags(input: string): string {
  return input
    .split(/[\s,;]+/)
    .map(t => t.trim().replace(/^#/, '').replace(/[^a-zA-Z0-9_éèêëàâäùûüôöîïçÉÈÊËÀÂÄÙÛÜÔÖÎÏÇ]/g, ''))
    .filter(Boolean)
    .map(t => `#${t}`)
    .join(' ');
}

export const SUGGESTED_HASHTAGS = [
  '#maintenance', '#GMAO', '#industrie', '#performance', '#innovation',
  '#qualité', '#sécurité', '#IoT', '#transformationDigitale', '#optimisation',
  '#assetManagement', '#prédictif', '#digitalisation', '#fiabilité', '#SAP', '#Lean'
];

export const LINKEDIN_TARGET = 400;
export const PAGE_SIZE = 10;
export const APP_VERSION = '170';
