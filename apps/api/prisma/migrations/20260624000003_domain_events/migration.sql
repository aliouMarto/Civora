-- Migration: domain_events + event_handler_offsets (Outbox pattern)

CREATE TABLE domain_events (
  id             UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agence_id      UUID,
  type           TEXT         NOT NULL,
  version        INTEGER      NOT NULL DEFAULT 1,
  aggregate_type TEXT         NOT NULL,
  aggregate_id   UUID         NOT NULL,
  payload        JSONB        NOT NULL DEFAULT '{}',
  metadata       JSONB        NOT NULL DEFAULT '{}',
  occurred_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  published_at   TIMESTAMPTZ,
  attempts       INTEGER      NOT NULL DEFAULT 0,
  last_error     TEXT
);

CREATE INDEX idx_domain_events_published_at
  ON domain_events (published_at)
  WHERE published_at IS NULL;  -- partial index : seuls les non-publiés

CREATE INDEX idx_domain_events_agence_type
  ON domain_events (agence_id, type);

CREATE INDEX idx_domain_events_aggregate
  ON domain_events (aggregate_type, aggregate_id);

-- Table d'idempotence : un handler ne traite jamais 2× le même événement
CREATE TABLE event_handler_offsets (
  handler_name TEXT        NOT NULL,
  event_id     UUID        NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (handler_name, event_id)
);
