const fs = require('fs');
const path = require('path');
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
envContent.split(/\r?\n/).forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 0) return;
  const key = trimmed.substring(0, eqIdx).trim();
  let value = trimmed.substring(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = value;
});

const db = require('../lib/db');

async function main() {
  console.log('DATABASE_URL set:', !!process.env.DATABASE_URL, 'length:', process.env.DATABASE_URL?.length);
  
  const articles = await db.getArticles({});
  console.log('Articles:', articles.articles.length);
  const art = articles.articles[0];
  console.log('Article:', art.id, art.titre_interne.substring(0, 50));
  console.log('hashtags:', Array.isArray(art.hashtags), JSON.stringify(art.hashtags).substring(0, 100));
  console.log('accroche_active:', art.accroche_active);
  
  const payload = {
    titre_interne: art.titre_interne,
    accroche_a: art.accroche_a || '',
    accroche_b: art.accroche_b || '',
    accroche_active: art.accroche_active || 'a',
    corps: art.corps,
    hashtags: Array.isArray(art.hashtags) ? art.hashtags.join(' ') : (art.hashtags || ''),
    source_news_source: art.source_news_source || '',
  };
  
  console.log('\nPayload keys:', Object.keys(payload));
  console.log('Payload hashtags type:', typeof payload.hashtags);
  
  try {
    const result = await db.updateArticle(art.id, payload);
    console.log('\nUpdate OK:', result?.id);
  } catch (e) {
    console.error('\nUpdate FAILED:');
    console.error('  message:', e.message);
    console.error('  code:', e.code);
    console.error('  detail:', e.detail);
    console.error('  hint:', e.hint);
    console.error('  where:', e.where);
  }
  
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
