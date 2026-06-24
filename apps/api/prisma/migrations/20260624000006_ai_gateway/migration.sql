-- Étape 10 — AI Gateway (pgvector requis depuis étape 02)

CREATE TABLE ai_calls (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agence_id      UUID        NOT NULL,
  module         TEXT        NOT NULL,
  task           TEXT        NOT NULL,
  provider       TEXT        NOT NULL,
  model          TEXT        NOT NULL,
  input_tokens   INTEGER     NOT NULL DEFAULT 0,
  output_tokens  INTEGER     NOT NULL DEFAULT 0,
  cost_cents     INTEGER     NOT NULL DEFAULT 0,
  latency_ms     INTEGER     NOT NULL DEFAULT 0,
  status         TEXT        NOT NULL DEFAULT 'ok',
  prompt_hash    TEXT,
  error          TEXT,
  correlation_id UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_calls_agence_date   ON ai_calls (agence_id, created_at DESC);
CREATE INDEX idx_ai_calls_agence_module ON ai_calls (agence_id, module, task);

-- RLS
ALTER TABLE ai_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_calls_tenant ON ai_calls
  USING (agence_id = current_setting('app.agence_id', TRUE)::uuid);

-- Embeddings (pgvector)
CREATE TABLE ai_embeddings (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agence_id   UUID        NOT NULL,
  source_type TEXT        NOT NULL,
  source_id   UUID        NOT NULL,
  chunk_index INTEGER     NOT NULL DEFAULT 0,
  content     TEXT        NOT NULL,
  embedding   vector(1536),
  model       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_embeddings_source ON ai_embeddings (agence_id, source_type, source_id);
-- Index HNSW pour la recherche vecteur (cosine similarity)
CREATE INDEX idx_ai_embeddings_hnsw ON ai_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

ALTER TABLE ai_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_embeddings_tenant ON ai_embeddings
  USING (agence_id = current_setting('app.agence_id', TRUE)::uuid);

-- Budget
CREATE TABLE ai_budgets (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agence_id           UUID        NOT NULL UNIQUE,
  monthly_limit_cents INTEGER     NOT NULL DEFAULT 1000,
  current_month       TEXT        NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM'),
  used_cents          INTEGER     NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_budgets_tenant ON ai_budgets
  USING (agence_id = current_setting('app.agence_id', TRUE)::uuid);
