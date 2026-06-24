-- Étape 09 — Notifications

CREATE TABLE notifications (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agence_id      UUID        NOT NULL,
  utilisateur_id UUID,
  contact_id     UUID,
  channel        TEXT        NOT NULL,
  template       TEXT        NOT NULL,
  vars           JSONB       NOT NULL DEFAULT '{}',
  status         TEXT        NOT NULL DEFAULT 'queued',
  external_id    TEXT,
  error          TEXT,
  sent_at        TIMESTAMPTZ,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_status
  ON notifications (agence_id, utilisateur_id, status);

CREATE INDEX idx_notifications_channel_status
  ON notifications (agence_id, channel, status);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_tenant_isolation ON notifications
  USING (agence_id = current_setting('app.agence_id', TRUE)::uuid);
