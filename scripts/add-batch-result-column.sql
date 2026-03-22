ALTER TABLE verification_jobs
  ADD COLUMN IF NOT EXISTS mailsso_batch_result       jsonb        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mailsso_result_fetched_at  timestamptz  DEFAULT NULL;
