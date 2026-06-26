-- Migration : import_export_jobs
-- Lot 1 · Module 1 · Étape 5 — pipelines d'import/export réutilisables.
--
-- Le champ `module` permet d'étendre ces deux tables aux modules futurs
-- (biens, baux, ged...) sans dupliquer la structure.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "import_jobs" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "agence_id"       UUID        NOT NULL,
  "module"          TEXT        NOT NULL,
  "fichier_key"     TEXT        NOT NULL,
  "mapping"         JSONB       NOT NULL,
  "options"         JSONB       NOT NULL,
  "total_rows"      INTEGER     NOT NULL DEFAULT 0,
  "processed"       INTEGER     NOT NULL DEFAULT 0,
  "imported"        INTEGER     NOT NULL DEFAULT 0,
  "skipped"         INTEGER     NOT NULL DEFAULT 0,
  "errors"          INTEGER     NOT NULL DEFAULT 0,
  "errors_file_key" TEXT,
  "status"          TEXT        NOT NULL DEFAULT 'queued',
  "error_message"   TEXT,
  "started_at"      TIMESTAMPTZ,
  "finished_at"     TIMESTAMPTZ,
  "created_by"      UUID        NOT NULL,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "import_jobs_agence_id_fkey"
    FOREIGN KEY ("agence_id") REFERENCES "agences"("id") ON DELETE RESTRICT,
  CONSTRAINT "import_jobs_status_check"
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  CONSTRAINT "import_jobs_module_check"
    CHECK (module IN ('contacts', 'biens', 'baux', 'ged'))
);

CREATE TABLE "export_jobs" (
  "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
  "agence_id"     UUID        NOT NULL,
  "module"        TEXT        NOT NULL,
  "format"        TEXT        NOT NULL,
  "filtres"       JSONB       NOT NULL,
  "columns"       JSONB,
  "total_rows"    INTEGER,
  "fichier_key"   TEXT,
  "status"        TEXT        NOT NULL DEFAULT 'queued',
  "error_message" TEXT,
  "created_by"    UUID        NOT NULL,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "finished_at"   TIMESTAMPTZ,
  "expires_at"    TIMESTAMPTZ NOT NULL,
  CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "export_jobs_agence_id_fkey"
    FOREIGN KEY ("agence_id") REFERENCES "agences"("id") ON DELETE RESTRICT,
  CONSTRAINT "export_jobs_status_check"
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  CONSTRAINT "export_jobs_format_check"
    CHECK (format IN ('csv', 'xlsx')),
  CONSTRAINT "export_jobs_module_check"
    CHECK (module IN ('contacts', 'biens', 'baux', 'ged'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX "import_jobs_agence_module_status_idx"
  ON "import_jobs" ("agence_id", "module", "status");
CREATE INDEX "import_jobs_agence_created_idx"
  ON "import_jobs" ("agence_id", "created_at" DESC);

CREATE INDEX "export_jobs_agence_module_status_idx"
  ON "export_jobs" ("agence_id", "module", "status");
CREATE INDEX "export_jobs_expires_idx"
  ON "export_jobs" ("expires_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON "import_jobs" TO civora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "export_jobs" TO civora_app;
GRANT ALL PRIVILEGES ON "import_jobs" TO civora_admin;
GRANT ALL PRIVILEGES ON "export_jobs" TO civora_admin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Row-Level Security (ENABLE + FORCE — défense en profondeur Lot 0)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "import_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_jobs" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "export_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "export_jobs" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "import_jobs_tenant" ON "import_jobs"
  FOR ALL
  USING      (agence_id::text = current_setting('app.agence_id', TRUE))
  WITH CHECK (agence_id::text = current_setting('app.agence_id', TRUE));

CREATE POLICY "export_jobs_tenant" ON "export_jobs"
  FOR ALL
  USING      (agence_id::text = current_setting('app.agence_id', TRUE))
  WITH CHECK (agence_id::text = current_setting('app.agence_id', TRUE));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Vérification post-migration
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ')
    INTO missing
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND c.relname IN ('import_jobs', 'export_jobs')
     AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Tables sans FORCE ROW LEVEL SECURITY : %', missing;
  END IF;
END $$;
