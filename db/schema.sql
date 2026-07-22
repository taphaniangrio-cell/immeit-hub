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
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_articles_statut ON articles(statut);
CREATE INDEX IF NOT EXISTS idx_articles_date_creation ON articles(date_creation DESC);

-- Migration for existing databases (safe to run multiple times)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS ia_provider TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS ia_model TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS generation_type TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS custom_subject TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_photographer TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_photographer_url TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_options TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS versions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS accroche_active TEXT DEFAULT 'a';

-- Dashboard cache for synced SharePoint data
CREATE TABLE IF NOT EXISTS dashboard_cache (
  cache_key TEXT PRIMARY KEY,
  cache_data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE dashboard_cache ENABLE ROW LEVEL SECURITY;

-- Auto-update trigger for dashboard_cache.updated_at
CREATE OR REPLACE FUNCTION update_dashboard_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dashboard_cache_updated_at ON dashboard_cache;
CREATE TRIGGER dashboard_cache_updated_at
BEFORE UPDATE ON dashboard_cache
FOR EACH ROW EXECUTE FUNCTION update_dashboard_updated_at();

-- Unique constraint on source_news_url for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_source_news_url ON articles(source_news_url) WHERE source_news_url IS NOT NULL;

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_articles_fts ON articles USING gin(to_tsvector('french', titre_interne || ' ' || corps));

-- Index on hashtags for tag-based queries
CREATE INDEX IF NOT EXISTS idx_articles_hashtags ON articles USING gin(hashtags);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.date_modification = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS articles_updated_at ON articles;
CREATE TRIGGER articles_updated_at
BEFORE UPDATE ON articles
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Alert deduplication table removed — emails are now sent on every change detected.
-- DROP TABLE IF EXISTS alert_dedup;

-- Alert history: audit trail of all sent alert emails
CREATE TABLE IF NOT EXISTS alert_history (
  id SERIAL PRIMARY KEY,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  changes_count INTEGER NOT NULL,
  critical_count INTEGER DEFAULT 0,
  normal_count INTEGER DEFAULT 0,
  low_count INTEGER DEFAULT 0,
  change_hashes TEXT[] DEFAULT '{}',
  source TEXT
);
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_alert_history_sent_at ON alert_history(sent_at DESC);
