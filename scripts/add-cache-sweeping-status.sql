-- Add 'cache_sweeping' to the allowed statuses for verification_jobs
ALTER TABLE verification_jobs
  DROP CONSTRAINT verification_jobs_status_check;

ALTER TABLE verification_jobs
  ADD CONSTRAINT verification_jobs_status_check
  CHECK (status IN (
    'seeding',
    'cache_sweeping',
    'queued',
    'running',
    'paused',
    'completed',
    'failed',
    'cancelled'
  ));
