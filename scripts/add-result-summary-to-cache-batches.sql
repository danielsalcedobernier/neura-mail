ALTER TABLE admin_cache_batches
  ADD COLUMN IF NOT EXISTS result_summary JSONB;
