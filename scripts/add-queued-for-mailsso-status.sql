ALTER TABLE verification_job_items DROP CONSTRAINT IF EXISTS verification_job_items_status_check;
ALTER TABLE verification_job_items ADD CONSTRAINT verification_job_items_status_check
  CHECK (status IN ('pending', 'queued_for_mailsso', 'processing', 'completed', 'failed'));
