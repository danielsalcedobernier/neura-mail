ALTER TABLE smtp_servers
  ADD COLUMN IF NOT EXISTS warmup_enabled       boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warmup_start_date    timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_initial_per_minute  integer  DEFAULT 10,
  ADD COLUMN IF NOT EXISTS warmup_increment_per_minute integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS warmup_days_per_step integer      DEFAULT 3,
  ADD COLUMN IF NOT EXISTS warmup_max_per_minute integer;

COMMENT ON COLUMN smtp_servers.warmup_enabled               IS 'Whether warmup is active for this server';
COMMENT ON COLUMN smtp_servers.warmup_start_date            IS 'When warmup started (resets if disabled/re-enabled)';
COMMENT ON COLUMN smtp_servers.warmup_initial_per_minute    IS 'Starting send rate (emails/min) when warmup begins';
COMMENT ON COLUMN smtp_servers.warmup_increment_per_minute  IS 'How many emails/min to add each step';
COMMENT ON COLUMN smtp_servers.warmup_days_per_step         IS 'How many days between each increment step';
COMMENT ON COLUMN smtp_servers.warmup_max_per_minute        IS 'Cap for warmup — never exceeds this (and never exceeds max_per_minute)';
