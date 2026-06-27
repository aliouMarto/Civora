-- Migration : insights
-- Lot 1 · Module 2 · Étape 3 — Table mutualisée des recommandations IA.
--
-- Le champ `module` permet de partager la table entre tous les modules
-- métier (biens, contacts, locations, ventes...). Pattern identique aux
-- tables import_jobs/export_jobs.

CREATE TABLE "insights" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "agence_id"    UUID        NOT NULL,
  "module"       TEXT        NOT NULL,
  "type"         TEXT        NOT NULL,
  "cible_type"   TEXT,
  "cible_id"     UUID,
  "severity"     TEXT        NOT NULL DEFAULT 'info',
  "titre"        TEXT        NOT NULL,
  "message"      TEXT        NOT NULL,
  "action_label" TEXT,
  "action_url"   TEXT,
  "data"         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  "dismissed_at" TIMESTAMPTZ,
  "acted_on_at"  TIMESTAMPTZ,
  "expires_at"   TIMESTAMPTZ,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "insights_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "insights_agence_id_fkey"
    FOREIGN KEY ("agence_id") REFERENCES "agences"("id") ON DELETE RESTRICT,
  CONSTRAINT "insights_severity_check"
    CHECK (severity IN ('info', 'warn', 'critical')),
  CONSTRAINT "insights_module_check"
    CHECK (module IN ('biens', 'contacts', 'locations', 'ventes', 'compta')),
  CONSTRAINT "insights_cible_type_check"
    CHECK (cible_type IS NULL OR cible_type IN ('bien', 'contact', 'agence', 'commune', 'bail', 'reservation'))
);

CREATE INDEX "insights_agence_module_severity_idx"
  ON "insights" ("agence_id", "module", "severity", "dismissed_at");
CREATE INDEX "insights_agence_cible_idx"
  ON "insights" ("agence_id", "cible_type", "cible_id");
CREATE INDEX "insights_agence_module_created_idx"
  ON "insights" ("agence_id", "module", "created_at" DESC);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "insights" TO civora_app;
GRANT ALL PRIVILEGES ON "insights" TO civora_admin;

-- ENABLE + FORCE ROW LEVEL SECURITY (défense en profondeur Lot 0)
ALTER TABLE "insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insights" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "insights_tenant" ON "insights"
  FOR ALL
  USING      (agence_id::text = current_setting('app.agence_id', TRUE))
  WITH CHECK (agence_id::text = current_setting('app.agence_id', TRUE));

-- Vérification
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'insights'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'Table insights : FORCE ROW LEVEL SECURITY non actif';
  END IF;
END $$;
