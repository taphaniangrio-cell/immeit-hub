const { Pool } = require('@neondatabase/serverless');

let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL non configurée — ajoutez-la dans .env');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, max: 3 });
    pool.on('error', () => {});
  }
  return pool;
}

async function query(text, params) {
  let client;
  try {
    client = await getPool().connect();
    const result = await client.query(text, params);
    return result;
  } catch (err) {
    throw err;
  } finally {
    if (client) try { client.release(); } catch {}
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

  return { articles: result.rows, total, page, limit };
}

async function getArticleById(id) {
  const result = await query('SELECT * FROM articles WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createArticle(data) {
  const result = await query(
    `INSERT INTO articles (titre_interne, corps, accroche_a, accroche_b, hashtags, source_news_titre, source_news_url, source_news_source, ia_provider, ia_model, generation_type, custom_subject, statut)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      data.titre_interne,
      data.corps,
      data.accroche_a || null,
      data.accroche_b || null,
      data.hashtags || [],
      data.source_news_titre || null,
      data.source_news_url || null,
      data.source_news_source || null,
      data.ia_provider || null,
      data.ia_model || null,
      data.generation_type || null,
      data.custom_subject || null,
      data.statut || 'brouillon',
    ]
  );
  return result.rows[0];
}

async function updateArticle(id, data) {
  const fields = [];
  const params = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (key === 'id') continue;
    fields.push(`${key} = $${idx++}`);
    params.push(value);
  }

  if (!fields.length) return null;

  fields.push(`date_modification = now()`);
  params.push(id);

  const result = await query(
    `UPDATE articles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return result.rows[0] || null;
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
