INSERT INTO cron_jobs (name) VALUES
  ('verify_seed'),
  ('verify_sweep'),
  ('verify_process')
ON CONFLICT (name) DO NOTHING;
