ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS use_all_servers BOOLEAN NOT NULL DEFAULT true;

-- Make smtp_server_id optional (already nullable, just document intent)
-- When use_all_servers = true, smtp_server_id is ignored and the balancer is used
-- When use_all_servers = false, smtp_server_id must be set
COMMENT ON COLUMN campaigns.use_all_servers IS
  'When true, the SMTP load balancer distributes sends across all active servers. When false, smtp_server_id is used exclusively.';
