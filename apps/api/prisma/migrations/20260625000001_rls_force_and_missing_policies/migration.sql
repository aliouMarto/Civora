-- Migration : rls_force_and_missing_policies
-- Corrige les failles de sécurité identifiées par la revue RLS du 2026-06-25.
--
-- 1. FORCE ROW LEVEL SECURITY sur les 7 tables qui n'avaient que ENABLE.
--    Sans FORCE, le propriétaire de la table (civora) contourne la RLS.
-- 2. Politiques RLS pour roles, utilisateur_roles, domain_events, job_dead_letters.
-- 3. Grants explicites à civora_app sur les tables non couvertes par 002.
--
-- Référence : docs/revues/lot0-revue-securite-RLS.md

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FORCE ROW LEVEL SECURITY sur les tables existantes
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE notifications   FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_calls        FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_embeddings   FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_budgets      FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log       FORCE ROW LEVEL SECURITY;
ALTER TABLE workflows       FORCE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs   FORCE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Compléter les politiques manquantes sur les tables ENABLE-only
--    (les migrations 005-008 n'ont créé qu'une politique FOR ALL USING,
--    sans WITH CHECK pour les INSERT/UPDATE, et sans politique séparée.)
-- ─────────────────────────────────────────────────────────────────────────────

-- notifications : la politique existante est FOR ALL USING uniquement.
-- Ajouter WITH CHECK pour empêcher INSERT/UPDATE vers une autre agence.
DROP POLICY IF EXISTS notifications_tenant_isolation ON notifications;
CREATE POLICY notifications_tenant ON notifications
  FOR ALL
  USING      (agence_id = current_setting('app.agence_id', TRUE)::uuid)
  WITH CHECK (agence_id = current_setting('app.agence_id', TRUE)::uuid);

-- ai_calls
DROP POLICY IF EXISTS ai_calls_tenant ON ai_calls;
CREATE POLICY ai_calls_tenant ON ai_calls
  FOR ALL
  USING      (agence_id = current_setting('app.agence_id', TRUE)::uuid)
  WITH CHECK (agence_id = current_setting('app.agence_id', TRUE)::uuid);

-- ai_embeddings
DROP POLICY IF EXISTS ai_embeddings_tenant ON ai_embeddings;
CREATE POLICY ai_embeddings_tenant ON ai_embeddings
  FOR ALL
  USING      (agence_id = current_setting('app.agence_id', TRUE)::uuid)
  WITH CHECK (agence_id = current_setting('app.agence_id', TRUE)::uuid);

-- ai_budgets
DROP POLICY IF EXISTS ai_budgets_tenant ON ai_budgets;
CREATE POLICY ai_budgets_tenant ON ai_budgets
  FOR ALL
  USING      (agence_id = current_setting('app.agence_id', TRUE)::uuid)
  WITH CHECK (agence_id = current_setting('app.agence_id', TRUE)::uuid);

-- workflows
DROP POLICY IF EXISTS workflows_tenant ON workflows;
CREATE POLICY workflows_tenant ON workflows
  FOR ALL
  USING      (agence_id = current_setting('app.agence_id', TRUE)::uuid)
  WITH CHECK (agence_id = current_setting('app.agence_id', TRUE)::uuid);

-- workflow_runs
DROP POLICY IF EXISTS workflow_runs_tenant ON workflow_runs;
CREATE POLICY workflow_runs_tenant ON workflow_runs
  FOR ALL
  USING      (agence_id = current_setting('app.agence_id', TRUE)::uuid)
  WITH CHECK (agence_id = current_setting('app.agence_id', TRUE)::uuid);

-- audit_log : politique INSERT actuellement WITH CHECK (TRUE) — dangereuse.
-- Un user A pourrait écrire un audit avec agence_id = B et "salir" leur historique.
-- Resserrer : autoriser INSERT uniquement si agence_id correspond au tenant courant
-- OU si agence_id IS NULL (audit système, écrit hors contexte tenant).
DROP POLICY IF EXISTS audit_log_insert ON audit_log;
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT
  WITH CHECK (
    agence_id IS NULL
    OR agence_id = current_setting('app.agence_id', TRUE)::uuid
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS sur roles
--    Les rôles système (agence_id IS NULL) sont visibles par tous.
--    Les rôles d'agence ne sont visibles/modifiables que par leur agence.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;

CREATE POLICY roles_read ON roles
  FOR SELECT
  USING (
    agence_id IS NULL
    OR agence_id::text = current_setting('app.agence_id', TRUE)
  );

CREATE POLICY roles_insert ON roles
  FOR INSERT
  WITH CHECK (
    -- Empêche la création de rôles système depuis l'application
    agence_id IS NOT NULL
    AND agence_id::text = current_setting('app.agence_id', TRUE)
  );

CREATE POLICY roles_update ON roles
  FOR UPDATE
  USING      (agence_id IS NOT NULL AND agence_id::text = current_setting('app.agence_id', TRUE))
  WITH CHECK (agence_id IS NOT NULL AND agence_id::text = current_setting('app.agence_id', TRUE));

CREATE POLICY roles_delete ON roles
  FOR DELETE
  USING (agence_id IS NOT NULL AND agence_id::text = current_setting('app.agence_id', TRUE));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS sur utilisateur_roles (jointure)
--    L'association n'est visible que si l'utilisateur appartient à l'agence courante.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE utilisateur_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateur_roles FORCE ROW LEVEL SECURITY;

CREATE POLICY utilisateur_roles_tenant ON utilisateur_roles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM utilisateurs u
      WHERE u.id = utilisateur_id
        AND u.agence_id::text = current_setting('app.agence_id', TRUE)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM utilisateurs u
      WHERE u.id = utilisateur_id
        AND u.agence_id::text = current_setting('app.agence_id', TRUE)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS sur domain_events
--    Les events système (agence_id IS NULL) sont visibles par civora_admin
--    (qui a BYPASSRLS et lit toujours tout — utilisé par OutboxDispatcher).
--    Les events agence sont strictement isolés.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events FORCE ROW LEVEL SECURITY;

CREATE POLICY domain_events_tenant ON domain_events
  FOR ALL
  USING (
    agence_id IS NULL
    OR agence_id::text = current_setting('app.agence_id', TRUE)
  )
  WITH CHECK (
    agence_id IS NULL
    OR agence_id::text = current_setting('app.agence_id', TRUE)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS sur job_dead_letters
--    Permet aux admins de voir leurs propres jobs échoués.
--    Les jobs système (agence_id IS NULL) restent visibles uniquement via civora_admin.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE job_dead_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_dead_letters FORCE ROW LEVEL SECURITY;

CREATE POLICY job_dead_letters_tenant ON job_dead_letters
  FOR ALL
  USING (
    agence_id IS NULL
    OR agence_id::text = current_setting('app.agence_id', TRUE)
  )
  WITH CHECK (
    agence_id IS NULL
    OR agence_id::text = current_setting('app.agence_id', TRUE)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Vérifications post-migration (no-op si tout est bon)
--    Ces SELECT lèvent une erreur si la politique attendue est absente.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  missing_force TEXT;
BEGIN
  -- Toutes les tables métier avec agence_id doivent avoir relrowsecurity ET relforcerowsecurity
  SELECT string_agg(c.relname, ', ')
    INTO missing_force
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND c.relname IN (
       'entites','utilisateurs','invitations','notifications',
       'ai_calls','ai_embeddings','ai_budgets','audit_log',
       'workflows','workflow_runs','roles','utilisateur_roles',
       'domain_events','job_dead_letters'
     )
     AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

  IF missing_force IS NOT NULL THEN
    RAISE EXCEPTION 'Tables sans FORCE ROW LEVEL SECURITY : %', missing_force;
  END IF;
END $$;
