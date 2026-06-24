-- Migration: job_dead_letter

CREATE TABLE job_dead_letters (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agence_id  UUID,
  queue      TEXT        NOT NULL,
  job_name   TEXT        NOT NULL,
  job_id     TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  error      TEXT        NOT NULL,
  stack      TEXT,
  attempts   INTEGER     NOT NULL,
  failed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_dead_letters_queue_failed
  ON job_dead_letters (queue, failed_at DESC);
