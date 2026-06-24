-- Étape 12 — Journal d'audit immuable

CREATE TABLE audit_log (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agence_id   UUID,
  actor_id    UUID,
  actor_type  TEXT        NOT NULL DEFAULT 'user',
  action      TEXT        NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  before      JSONB,
  after       JSONB,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_agence_date   ON audit_log (agence_id, occurred_at DESC);
CREATE INDEX idx_audit_log_entity        ON audit_log (agence_id, entity_type, entity_id);
CREATE INDEX idx_audit_log_action        ON audit_log (agence_id, action);

-- RLS (lecture filtrée par agence, mais insert autorisé pour le rôle app)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_tenant_read ON audit_log
  FOR SELECT
  USING (
    agence_id IS NULL
    OR agence_id = current_setting('app.agence_id', TRUE)::uuid
  );

CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT
  WITH CHECK (TRUE);

-- ─── Trigger d'immuabilité ───────────────────────────────────────────────────
-- Seul le rôle civora_admin peut UPDATE/DELETE (pour purge RGPD documentée).
-- Le rôle applicatif (civora_app) est bloqué.

CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'civora_admin' THEN
    RAISE EXCEPTION 'audit_log est immuable : UPDATE/DELETE interdits (rôle: %)', current_user;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER trg_audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
