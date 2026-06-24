-- Migration : tenancy_and_rls
-- Crée les 3 tables de tenancy, les rôles PostgreSQL, et active la RLS.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Rôles PostgreSQL
-- ──────────────────────────────────────────────────────────────────────────────

-- Rôle applicatif : utilisé par l'API en production.
-- Non-superuser, pas de BYPASSRLS → soumis à la RLS.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'civora_app') THEN
    CREATE ROLE civora_app LOGIN PASSWORD 'civora_app_secret' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- Rôle admin : migrations, jobs système, super-admin.
-- BYPASSRLS → contourne la RLS, voit tout.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'civora_admin') THEN
    CREATE ROLE civora_admin LOGIN PASSWORD 'civora_admin_secret' NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Tables
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE "agences" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "nom"        TEXT        NOT NULL,
  "slug"       TEXT        NOT NULL,
  "devise"     TEXT        NOT NULL DEFAULT 'XOF',
  "fuseau"     TEXT        NOT NULL DEFAULT 'Africa/Abidjan',
  "langue"     TEXT        NOT NULL DEFAULT 'fr',
  "statut"     TEXT        NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "agences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agences_slug_key" ON "agences"("slug");

CREATE TABLE "entites" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
  "agence_id"      UUID        NOT NULL,
  "nom"            TEXT        NOT NULL,
  "raison_sociale" TEXT,
  "numero_legal"   TEXT,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "entites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entites_agence_id_fkey"
    FOREIGN KEY ("agence_id") REFERENCES "agences"("id") ON DELETE RESTRICT
);

CREATE INDEX "entites_agence_id_idx" ON "entites"("agence_id");

CREATE TABLE "utilisateurs" (
  "id"                 UUID        NOT NULL DEFAULT gen_random_uuid(),
  "agence_id"          UUID        NOT NULL,
  "email"              TEXT        NOT NULL,
  "password_hash"      TEXT        NOT NULL,
  "nom"                TEXT        NOT NULL,
  "prenom"             TEXT        NOT NULL,
  "statut"             TEXT        NOT NULL DEFAULT 'invité',
  "derniere_connexion" TIMESTAMPTZ,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "utilisateurs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "utilisateurs_email_key" UNIQUE ("email"),
  CONSTRAINT "utilisateurs_agence_id_fkey"
    FOREIGN KEY ("agence_id") REFERENCES "agences"("id") ON DELETE RESTRICT
);

CREATE INDEX "utilisateurs_agence_id_idx" ON "utilisateurs"("agence_id");

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Permissions de base pour civora_app
-- ──────────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO civora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "agences"      TO civora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "entites"      TO civora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "utilisateurs" TO civora_app;

GRANT USAGE ON SCHEMA public TO civora_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO civora_admin;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Row-Level Security
-- ──────────────────────────────────────────────────────────────────────────────

-- agences : pas de RLS (table système, visible par tous les rôles app)
-- entites et utilisateurs : RLS stricte

ALTER TABLE "entites"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "utilisateurs" ENABLE ROW LEVEL SECURITY;

-- Force la RLS même pour le propriétaire de la table (le user de migration)
ALTER TABLE "entites"      FORCE ROW LEVEL SECURITY;
ALTER TABLE "utilisateurs" FORCE ROW LEVEL SECURITY;

-- Politique READ : ne voir que les lignes de son agence
CREATE POLICY "tenant_read" ON "entites"
  FOR SELECT
  USING (agence_id::text = current_setting('app.agence_id', true));

CREATE POLICY "tenant_read" ON "utilisateurs"
  FOR SELECT
  USING (agence_id::text = current_setting('app.agence_id', true));

-- Politique INSERT : ne peut insérer que dans sa propre agence
CREATE POLICY "tenant_insert" ON "entites"
  FOR INSERT
  WITH CHECK (agence_id::text = current_setting('app.agence_id', true));

CREATE POLICY "tenant_insert" ON "utilisateurs"
  FOR INSERT
  WITH CHECK (agence_id::text = current_setting('app.agence_id', true));

-- Politique UPDATE : ne peut modifier que ses propres lignes
CREATE POLICY "tenant_update" ON "entites"
  FOR UPDATE
  USING (agence_id::text = current_setting('app.agence_id', true))
  WITH CHECK (agence_id::text = current_setting('app.agence_id', true));

CREATE POLICY "tenant_update" ON "utilisateurs"
  FOR UPDATE
  USING (agence_id::text = current_setting('app.agence_id', true))
  WITH CHECK (agence_id::text = current_setting('app.agence_id', true));

-- Politique DELETE : ne peut supprimer que ses propres lignes
CREATE POLICY "tenant_delete" ON "entites"
  FOR DELETE
  USING (agence_id::text = current_setting('app.agence_id', true));

CREATE POLICY "tenant_delete" ON "utilisateurs"
  FOR DELETE
  USING (agence_id::text = current_setting('app.agence_id', true));
