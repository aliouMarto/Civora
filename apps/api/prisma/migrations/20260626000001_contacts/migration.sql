-- Migration : contacts
-- Lot 1 · Module 1 — Contacts (CRM)
--
-- Crée les 4 tables du module CRM :
--   - contacts        : entité principale, rôles multiples cumulables
--   - segments        : filtres sauvegardés (DSL JSON)
--   - segment_membres : appartenance contact ↔ segment (join table)
--   - interactions    : historique des échanges (email, WhatsApp, appel, note...)
--
-- Toutes ces tables sont sous RLS multi-tenant avec FORCE
-- (le rôle propriétaire n'est PAS dispensé de la RLS — défense en profondeur).
--
-- IMPORTANT : pas de contrainte UNIQUE sur contacts.email ni contacts.telephone.
-- PostgreSQL autorise les NULL multiples dans un index UNIQUE, ce qui contredit
-- la sémantique "si rempli, unique par agence" que l'on veut. L'unicité
-- conditionnelle est gérée côté service (étape 2 du module Contacts).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "contacts" (
  "id"                      UUID        NOT NULL DEFAULT gen_random_uuid(),
  "agence_id"               UUID        NOT NULL,
  "nom"                     TEXT        NOT NULL,
  "prenom"                  TEXT,
  "genre"                   TEXT,
  "langue"                  TEXT        NOT NULL DEFAULT 'fr',
  "email"                   TEXT,
  "telephone"               TEXT,
  "whatsapp"                TEXT,
  "whatsapp_opt_in"         BOOLEAN     NOT NULL DEFAULT FALSE,
  "adresse_ligne1"          TEXT,
  "adresse_ligne2"          TEXT,
  "ville"                   TEXT,
  "commune"                 TEXT,
  "pays"                    TEXT        NOT NULL DEFAULT 'CI',
  "roles"                   TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "source"                  TEXT,
  "tags"                    TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "segments_ia"             TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "score_ia"                INTEGER,
  "score_categorie"         TEXT,
  "score_updated_at"        TIMESTAMPTZ,
  "derniere_interaction_at" TIMESTAMPTZ,
  "created_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by"              UUID,
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contacts_agence_id_fkey"
    FOREIGN KEY ("agence_id") REFERENCES "agences"("id") ON DELETE RESTRICT,
  CONSTRAINT "contacts_score_ia_range_check"
    CHECK (score_ia IS NULL OR (score_ia >= 0 AND score_ia <= 100)),
  CONSTRAINT "contacts_genre_check"
    CHECK (genre IS NULL OR genre IN ('M', 'F', 'AUTRE')),
  CONSTRAINT "contacts_pays_iso2_check"
    CHECK (char_length(pays) = 2)
);

CREATE TABLE "segments" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "agence_id"   UUID        NOT NULL,
  "nom"         TEXT        NOT NULL,
  "description" TEXT,
  "filtres"     JSONB       NOT NULL,
  "systeme"     BOOLEAN     NOT NULL DEFAULT FALSE,
  "created_by"  UUID,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "segments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "segments_agence_id_nom_key" UNIQUE ("agence_id", "nom"),
  CONSTRAINT "segments_agence_id_fkey"
    FOREIGN KEY ("agence_id") REFERENCES "agences"("id") ON DELETE RESTRICT
);

CREATE TABLE "segment_membres" (
  "segment_id" UUID        NOT NULL,
  "contact_id" UUID        NOT NULL,
  "added_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "segment_membres_pkey" PRIMARY KEY ("segment_id", "contact_id"),
  CONSTRAINT "segment_membres_segment_id_fkey"
    FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE CASCADE,
  CONSTRAINT "segment_membres_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE
);

CREATE TABLE "interactions" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "agence_id"   UUID        NOT NULL,
  "contact_id"  UUID        NOT NULL,
  "type"        TEXT        NOT NULL,
  "direction"   TEXT,
  "sujet"       TEXT,
  "contenu"     TEXT,
  "metadata"    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by"  UUID,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "interactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "interactions_agence_id_fkey"
    FOREIGN KEY ("agence_id") REFERENCES "agences"("id") ON DELETE RESTRICT,
  CONSTRAINT "interactions_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE,
  CONSTRAINT "interactions_type_check"
    CHECK (type IN ('email', 'whatsapp', 'sms', 'appel', 'visite', 'note')),
  CONSTRAINT "interactions_direction_check"
    CHECK (direction IS NULL OR direction IN ('sortant', 'entrant'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Indexes B-tree classiques
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX "contacts_agence_id_idx"             ON "contacts" ("agence_id");
CREATE INDEX "contacts_agence_id_email_idx"       ON "contacts" ("agence_id", "email");
CREATE INDEX "contacts_agence_id_telephone_idx"   ON "contacts" ("agence_id", "telephone");
CREATE INDEX "contacts_agence_id_score_ia_idx"    ON "contacts" ("agence_id", "score_ia");
CREATE INDEX "contacts_agence_id_ville_idx"       ON "contacts" ("agence_id", "ville");

CREATE INDEX "segments_agence_id_idx"             ON "segments" ("agence_id");
CREATE INDEX "segment_membres_contact_id_idx"     ON "segment_membres" ("contact_id");

CREATE INDEX "interactions_agence_contact_time_idx"
  ON "interactions" ("agence_id", "contact_id", "occurred_at" DESC);
CREATE INDEX "interactions_agence_type_time_idx"
  ON "interactions" ("agence_id", "type", "occurred_at" DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes GIN pour les recherches par tableau
--    Permettent les requêtes "WHERE 'locataire' = ANY(roles)" en O(log n).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX "contacts_roles_gin_idx"       ON "contacts" USING GIN ("roles");
CREATE INDEX "contacts_tags_gin_idx"        ON "contacts" USING GIN ("tags");
CREATE INDEX "contacts_segments_ia_gin_idx" ON "contacts" USING GIN ("segments_ia");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON "contacts"         TO civora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "segments"         TO civora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "segment_membres"  TO civora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "interactions"     TO civora_app;

GRANT ALL PRIVILEGES ON "contacts"        TO civora_admin;
GRANT ALL PRIVILEGES ON "segments"        TO civora_admin;
GRANT ALL PRIVILEGES ON "segment_membres" TO civora_admin;
GRANT ALL PRIVILEGES ON "interactions"    TO civora_admin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Row-Level Security
--    ENABLE + FORCE pour que même le propriétaire des tables soit filtré.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "contacts"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts"        FORCE  ROW LEVEL SECURITY;
ALTER TABLE "segments"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "segments"        FORCE  ROW LEVEL SECURITY;
ALTER TABLE "segment_membres" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "segment_membres" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "interactions"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interactions"    FORCE  ROW LEVEL SECURITY;

-- ── contacts : isolation directe par agence_id ──────────────────────────────
CREATE POLICY "contacts_tenant" ON "contacts"
  FOR ALL
  USING      (agence_id::text = current_setting('app.agence_id', TRUE))
  WITH CHECK (agence_id::text = current_setting('app.agence_id', TRUE));

-- ── segments : isolation directe par agence_id ──────────────────────────────
CREATE POLICY "segments_tenant" ON "segments"
  FOR ALL
  USING      (agence_id::text = current_setting('app.agence_id', TRUE))
  WITH CHECK (agence_id::text = current_setting('app.agence_id', TRUE));

-- ── segment_membres : isolation via la jointure sur segments ────────────────
-- Le segment doit appartenir à l'agence courante pour que l'association soit
-- visible / modifiable.
CREATE POLICY "segment_membres_tenant" ON "segment_membres"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "segments" s
      WHERE s.id = segment_id
        AND s.agence_id::text = current_setting('app.agence_id', TRUE)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "segments" s
      WHERE s.id = segment_id
        AND s.agence_id::text = current_setting('app.agence_id', TRUE)
    )
  );

-- ── interactions : isolation directe par agence_id ──────────────────────────
CREATE POLICY "interactions_tenant" ON "interactions"
  FOR ALL
  USING      (agence_id::text = current_setting('app.agence_id', TRUE))
  WITH CHECK (agence_id::text = current_setting('app.agence_id', TRUE));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Vérification post-migration
--    Plante si l'une des 4 tables n'a pas relrowsecurity ET relforcerowsecurity.
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
     AND c.relname IN ('contacts', 'segments', 'segment_membres', 'interactions')
     AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Tables sans FORCE ROW LEVEL SECURITY : %', missing;
  END IF;
END $$;

-- Vérifier que les politiques sont bien en place (une par table minimum)
DO $$
DECLARE
  expected_tables TEXT[] := ARRAY['contacts','segments','segment_membres','interactions'];
  t TEXT;
  policy_count INT;
BEGIN
  FOREACH t IN ARRAY expected_tables LOOP
    SELECT count(*) INTO policy_count
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t;
    IF policy_count = 0 THEN
      RAISE EXCEPTION 'Aucune politique RLS trouvée sur %', t;
    END IF;
  END LOOP;
END $$;
