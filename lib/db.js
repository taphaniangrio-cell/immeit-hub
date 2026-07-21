const { Pool } = require('pg');
const dns = require('dns');
const { log } = require('./logger');

try { dns.setDefaultResultOrder('ipv4first'); } catch {}

let pool = null;
let lastPoolError = 0;
let schemaEnsured = false;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS articles (
  id SERIAL PRIMARY KEY,
  titre_interne TEXT NOT NULL,
  corps TEXT NOT NULL,
  accroche_a TEXT,
  accroche_b TEXT,
  hashtags TEXT[] DEFAULT '{}',
  source_news_titre TEXT,
  source_news_url TEXT,
  source_news_source TEXT,
  ia_provider TEXT,
  ia_model TEXT,
  generation_type TEXT CHECK (generation_type IN ('news', 'custom')),
  custom_subject TEXT,
  statut TEXT NOT NULL DEFAULT 'brouillon',
  date_creation TIMESTAMP WITH TIME ZONE DEFAULT now(),
  date_validation TIMESTAMP WITH TIME ZONE,
  date_publication TIMESTAMP WITH TIME ZONE,
  date_modification TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_articles_statut ON articles(statut);
CREATE INDEX IF NOT EXISTS idx_articles_date_creation ON articles(date_creation DESC);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS accroche_active TEXT DEFAULT 'a';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS ia_provider TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS ia_model TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS generation_type TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS custom_subject TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_photographer TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_photographer_url TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_options TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS versions JSONB DEFAULT '[]'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_source_news_url ON articles(source_news_url) WHERE source_news_url IS NOT NULL;
`;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL non configurée — ajoutez-la dans .env');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
      max: 5,
      idleTimeoutMillis: 30000,
      allowExitOnIdle: false,
    });
    pool.on('error', (err) => {
      lastPoolError = Date.now();
      log('error', 'db_pool_idle_error', { error: err.message });
    });
    ensureSchema().catch(err => {
      log('error', 'schema_migration_failed', { error: err.message });
    });
  }
  return pool;
}

async function ensureSchema() {
  if (schemaEnsured) return;
  const client = await getPool().connect();
  try {
    await client.query(SCHEMA_SQL);
    schemaEnsured = true;
    log('info', 'schema_ensured', { status: 'ok' });
  } finally {
    client.release();
  }
}

function mapRow(row) {
  if (!row) return null;
  if (row.image_options && typeof row.image_options === 'string') {
    try { row.image_options = JSON.parse(row.image_options); } catch { row.image_options = null; }
  }
  return row;
}

function mapRows(rows) {
  return rows.map(mapRow);
}

async function query(text, params, retries = 2) {
  let client;
  const queryStart = Date.now();
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      client = await getPool().connect();
      const result = await client.query(text, params);
      const queryDuration = Date.now() - queryStart;
      if (queryDuration > 5000) {
        log('warn', 'db_slow_query', { duration: queryDuration, attempt });
      }
      return result;
    } catch (err) {
      if (client) try { client.release(); } catch {}
      client = null;
      
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 200;
        log('warn', 'db_query_retry', { attempt: attempt + 1, delay, error: err.message });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      log('error', 'db_query_failed', { attempts: retries + 1, error: err.message, duration: Date.now() - queryStart });
      throw err;
    } finally {
      if (client) try { client.release(); } catch {}
    }
  }
}

function isHealthy() {
  return pool && !pool.ended && (Date.now() - lastPoolError > 60000);
}

function getPoolStats() {
  if (!pool) return null;
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    ended: pool.ended,
  };
}

async function getArticles(filters = {}) {
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 100));
  const offset = (page - 1) * limit;

  let whereClause = '';
  const params = [];
  const conditions = [];

  if (filters.statut) {
    conditions.push(`statut = $${params.length + 1}`);
    params.push(filters.statut);
  }

  if (conditions.length) whereClause = ' WHERE ' + conditions.join(' AND ');

  const countResult = await query(`SELECT COUNT(*) FROM articles${whereClause}`, params);
  const total = parseInt(countResult.rows[0].count);

  const result = await query(
    `SELECT * FROM articles${whereClause} ORDER BY date_creation DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { articles: mapRows(result.rows), total, page, limit };
}

async function getArticleById(id) {
  const result = await query('SELECT * FROM articles WHERE id = $1', [id]);
  return mapRow(result.rows[0] || null);
}

async function createArticle(data) {
  const result = await query(
    `INSERT INTO articles (titre_interne, corps, accroche_a, accroche_b, accroche_active, hashtags, source_news_titre, source_news_url, source_news_source, ia_provider, ia_model, generation_type, custom_subject, statut, image_url, image_photographer, image_photographer_url, image_options)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING *`,
    [
      data.titre_interne,
      data.corps,
      data.accroche_a || null,
      data.accroche_b || null,
      data.accroche_active || 'a',
      Array.isArray(data.hashtags) ? data.hashtags : (typeof data.hashtags === 'string' ? data.hashtags.split(/[\s,;]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean) : []),
      data.source_news_titre || null,
      data.source_news_url || null,
      data.source_news_source || null,
      data.ia_provider || null,
      data.ia_model || null,
      data.generation_type || null,
      data.custom_subject || null,
      data.statut || 'brouillon',
      data.image_url || null,
      data.image_photographer || null,
      data.image_photographer_url || null,
      data.image_options !== undefined ? JSON.stringify(data.image_options) : null,
    ]
  );
  return mapRow(result.rows[0]);
}

const ALLOWED_COLUMNS = new Set([
  'titre_interne', 'corps', 'accroche_a', 'accroche_b', 'accroche_active', 'hashtags',
  'source_news_titre', 'source_news_url', 'source_news_source',
  'ia_provider', 'ia_model', 'generation_type', 'custom_subject',
  'statut', 'image_url', 'image_photographer', 'image_photographer_url',
  'image_options', 'versions', 'date_validation', 'date_publication',
]);

async function updateArticle(id, data) {
  const fields = [];
  const params = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (key === 'id') continue;
    if (!ALLOWED_COLUMNS.has(key)) continue;
    if ((key === 'image_options' || key === 'versions') && value) {
      fields.push(`${key} = $${idx++}`);
      params.push(JSON.stringify(value));
    } else if (key === 'hashtags' && typeof value === 'string') {
      // Convertir la string "#tag1 #tag2" en array PostgreSQL TEXT[]
      const arr = value.split(/[\s,;]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean);
      fields.push(`${key} = $${idx++}`);
      params.push(arr);
    } else {
      fields.push(`${key} = $${idx++}`);
      params.push(value);
    }
  }

  if (!fields.length) return null;

  fields.push(`date_modification = now()`);
  params.push(id);

  const result = await query(
    `UPDATE articles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return mapRow(result.rows[0]) || null;
}

async function deleteArticle(id) {
  const result = await query('DELETE FROM articles WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

module.exports = {
  query,
  getArticles,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
  isHealthy,
  getPoolStats,
};
