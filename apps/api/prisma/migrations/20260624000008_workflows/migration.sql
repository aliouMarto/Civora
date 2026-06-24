-- Étape 13 — Moteur de workflows

CREATE TABLE workflows (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agence_id   UUID        NOT NULL,
  code        TEXT        NOT NULL,
  nom         TEXT        NOT NULL,
  description TEXT,
  type        TEXT        NOT NULL DEFAULT 'rule',
  statut      TEXT        NOT NULL DEFAULT 'inactif',
  trigger     JSONB       NOT NULL DEFAULT '{}',
  conditions  JSONB       NOT NULL DEFAULT '[]',
  actions     JSONB       NOT NULL DEFAULT '[]',
  params      JSONB       NOT NULL DEFAULT '{}',
  version     INTEGER     NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_workflows_agence_code_version ON workflows (agence_id, code, version);
CREATE INDEX idx_workflows_agence_statut ON workflows (agence_id, statut);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflows_tenant ON workflows
  USING (agence_id = current_setting('app.agence_id', TRUE)::uuid);

CREATE TABLE workflow_runs (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agence_id        UUID        NOT NULL,
  workflow_id      UUID        NOT NULL REFERENCES workflows(id),
  workflow_version INTEGER     NOT NULL DEFAULT 1,
  trigger_event_id UUID,
  status           TEXT        NOT NULL,
  conditions_result JSONB      NOT NULL DEFAULT '{}',
  actions_log      JSONB       NOT NULL DEFAULT '[]',
  error            TEXT,
  dry_run          BOOLEAN     NOT NULL DEFAULT FALSE,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ
);

CREATE INDEX idx_workflow_runs ON workflow_runs (agence_id, workflow_id, started_at DESC);

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_runs_tenant ON workflow_runs
  USING (agence_id = current_setting('app.agence_id', TRUE)::uuid);
