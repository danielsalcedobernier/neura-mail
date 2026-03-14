CREATE TABLE IF NOT EXISTS daily_stats (
  date               DATE PRIMARY KEY,
  total_verifications BIGINT NOT NULL DEFAULT 0,
  total_sends         BIGINT NOT NULL DEFAULT 0,
  new_users           BIGINT NOT NULL DEFAULT 0,
  revenue_usd         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- cron_jobs registry (used by maintenance cron to track last run times)
CREATE TABLE IF NOT EXISTS cron_jobs (
  name            TEXT PRIMARY KEY,
  last_run_at     TIMESTAMPTZ,
  last_run_status TEXT,
  run_count       BIGINT NOT NULL DEFAULT 0
);

-- Seed the cron job rows expected by the maintenance cron
INSERT INTO cron_jobs (name) VALUES
  ('cleanup_expired_sessions'),
  ('cleanup_expired_cache'),
  ('expire_user_plans'),
  ('reset_smtp_hourly_counters'),
  ('reset_smtp_daily_counters'),
  ('send_campaign_scheduled'),
  ('retry_failed_sends'),
  ('generate_daily_stats')
ON CONFLICT (name) DO NOTHING;
