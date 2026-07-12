const { Pool } = require('pg');
const { log } = require('./logger');

let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL non configurée — ajoutez-la dans .env');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false, sslmode: 'verify-full' },
      connectionTimeoutMillis: 10000,
      max: 5,
    });
    pool.on('error', (err) => {
      log('error', 'db_pool_idle_error', { error: err.message });
    });
  }
  return pool;
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
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      client = await getPool().connect();
      const result = await client.query(text, params);
      return result;
    } catch (err) {
      if (client) try { client.release(); } catch {}
      client = null;
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 200;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    } finally {
      if (client) try { client.release(); } catch {}
    }
  }
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
      data.hashtags || [],
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
};
