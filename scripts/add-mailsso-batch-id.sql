ALTER TABLE verification_job_items
  ADD COLUMN IF NOT EXISTS mailsso_batch_id TEXT;

CREATE INDEX IF NOT EXISTS idx_vji_mailsso_batch_id
  ON verification_job_items (mailsso_batch_id)
  WHERE mailsso_batch_id IS NOT NULL;
