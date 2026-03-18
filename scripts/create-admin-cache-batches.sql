CREATE TABLE IF NOT EXISTS admin_cache_batches (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  file_name        TEXT        NOT NULL DEFAULT 'unknown',
  email_count      INTEGER     NOT NULL DEFAULT 0,
  mailsso_batch_id TEXT,
  status           TEXT        NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'ready', 'saved', 'error')),
  result_count     INTEGER,
  error_message    TEXT,
  fetched_at       TIMESTAMPTZ,
  saved_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_cache_batches_created_at
  ON admin_cache_batches (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_cache_batches_status
  ON admin_cache_batches (status);
