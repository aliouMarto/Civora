-- Migration : auth_rbac
-- Ajoute les tables RBAC (roles, utilisateur_roles) et auth (invitations, refresh_tokens).

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. roles
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE "roles" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "agence_id"   UUID,                                          -- NULL = rôle système
  "nom"         TEXT        NOT NULL,
  "description" TEXT,
  "permissions" TEXT[]      NOT NULL DEFAULT '{}',
  "systeme"     BOOLEAN     NOT NULL DEFAULT false,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roles_agence_id_nom_key" UNIQUE ("agence_id", "nom")
);

GRANT SELECT, INSERT, UPDATE, DELETE ON "roles" TO civora_app;
GRANT ALL PRIVILEGES ON "roles" TO civora_admin;

-- Pas de RLS sur roles : les rôles système (agence_id IS NULL) doivent être lisibles
-- sans contexte tenant. Les rôles agence-spécifiques sont filtrés côté appli.
-- (Protection via Guard + vérification agence_id dans le service)

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. utilisateur_roles
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE "utilisateur_roles" (
  "utilisateur_id" UUID        NOT NULL,
  "role_id"        UUID        NOT NULL,
  "assigned_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "utilisateur_roles_pkey" PRIMARY KEY ("utilisateur_id", "role_id"),
  CONSTRAINT "utilisateur_roles_utilisateur_id_fkey"
    FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE,
  CONSTRAINT "utilisateur_roles_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON "utilisateur_roles" TO civora_app;
GRANT ALL PRIVILEGES ON "utilisateur_roles" TO civora_admin;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. invitations
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE "invitations" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "agence_id"   UUID        NOT NULL,
  "email"       TEXT        NOT NULL,
  "role_id"     UUID        NOT NULL,
  "token_hash"  TEXT        NOT NULL,
  "expire_at"   TIMESTAMPTZ NOT NULL,
  "utilisee_at" TIMESTAMPTZ,
  "created_by"  UUID        NOT NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invitations_agence_id_email_idx" ON "invitations"("agence_id", "email");
CREATE INDEX "invitations_token_hash_idx" ON "invitations"("token_hash");

GRANT SELECT, INSERT, UPDATE, DELETE ON "invitations" TO civora_app;
GRANT ALL PRIVILEGES ON "invitations" TO civora_admin;

ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read"   ON "invitations" FOR SELECT USING (agence_id::text = current_setting('app.agence_id', true));
CREATE POLICY "tenant_insert" ON "invitations" FOR INSERT WITH CHECK (agence_id::text = current_setting('app.agence_id', true));
CREATE POLICY "tenant_update" ON "invitations" FOR UPDATE USING (agence_id::text = current_setting('app.agence_id', true)) WITH CHECK (agence_id::text = current_setting('app.agence_id', true));
CREATE POLICY "tenant_delete" ON "invitations" FOR DELETE USING (agence_id::text = current_setting('app.agence_id', true));

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. refresh_tokens
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE "refresh_tokens" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
  "utilisateur_id" UUID        NOT NULL,
  "token_hash"     TEXT        NOT NULL,
  "expire_at"      TIMESTAMPTZ NOT NULL,
  "revoque_at"     TIMESTAMPTZ,
  "user_agent"     TEXT,
  "ip"             TEXT,
  "famille"        UUID        NOT NULL, -- famille de rotation (détection de rejeu)
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refresh_tokens_utilisateur_id_fkey"
    FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE
);

CREATE INDEX "refresh_tokens_utilisateur_id_idx" ON "refresh_tokens"("utilisateur_id");
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

GRANT SELECT, INSERT, UPDATE, DELETE ON "refresh_tokens" TO civora_app;
GRANT ALL PRIVILEGES ON "refresh_tokens" TO civora_admin;

-- refresh_tokens n'a pas de agence_id direct — RLS via jointure inutile ici.
-- La sécurité est assurée : le token_hash est opaque, et le service vérifie
-- que le refresh token appartient bien à l'utilisateur courant via utilisateur_id.

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Seed — 6 rôles système
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO "roles" ("id", "agence_id", "nom", "description", "permissions", "systeme") VALUES
  (gen_random_uuid(), NULL, 'Admin', 'Accès total à toutes les fonctionnalités',
    ARRAY['*:*'], true),
  (gen_random_uuid(), NULL, 'Manager', 'Gestion opérationnelle complète (hors paramètres)',
    ARRAY['biens:read','biens:write','crm:read','crm:write','locations:read','locations:write',
          'ventes:read','ventes:write','compta:read','ged:read','ged:write','rapports:read'], true),
  (gen_random_uuid(), NULL, 'Agent', 'Activités commerciales et locatives',
    ARRAY['biens:read','crm:read','crm:write','locations:read','locations:write',
          'ventes:read','calendrier:read','calendrier:write'], true),
  (gen_random_uuid(), NULL, 'Comptable', 'Accès comptabilité et rapports financiers',
    ARRAY['compta:read','compta:write','biens:read','locations:read','rapports:read'], true),
  (gen_random_uuid(), NULL, 'Marketing', 'Accès CRM et biens (lecture)',
    ARRAY['biens:read','crm:read','crm:write','rapports:read'], true),
  (gen_random_uuid(), NULL, 'PropriétairePortail', 'Portail propriétaire (lecture seule)',
    ARRAY['portail:read'], true)
ON CONFLICT DO NOTHING;
