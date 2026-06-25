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

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.date_modification = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS articles_updated_at ON articles;
CREATE TRIGGER articles_updated_at
BEFORE UPDATE ON articles
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
