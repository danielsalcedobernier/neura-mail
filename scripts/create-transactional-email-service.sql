-- SES configuration per user (dummy data — replace with real credentials in Neon)
CREATE TABLE IF NOT EXISTS ses_configurations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region       text NOT NULL DEFAULT 'us-east-1',
  access_key   text NOT NULL,
  secret_key   text NOT NULL, -- store encrypted in production
  from_email   text NOT NULL,
  from_name    text,
  is_active    boolean NOT NULL DEFAULT true,
  daily_quota  integer NOT NULL DEFAULT 50000,
  sent_today   integer NOT NULL DEFAULT 0,
  day_reset_at timestamp with time zone DEFAULT NOW(),
  created_at   timestamp with time zone DEFAULT NOW(),
  updated_at   timestamp with time zone DEFAULT NOW()
);

-- Sending domains verified with SES
CREATE TABLE IF NOT EXISTS sending_domains (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain             text NOT NULL,
  status             text NOT NULL DEFAULT 'pending', -- pending, verified, failed
  dkim_tokens        jsonb,
  verification_token text,
  verified_at        timestamp with time zone,
  created_at         timestamp with time zone DEFAULT NOW(),
  UNIQUE(user_id, domain)
);

-- Named API keys per user (separate from the global api_key on users table)
CREATE TABLE IF NOT EXISTS transactional_api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  key_hash    text NOT NULL UNIQUE,   -- sha256 hash for lookup
  key_prefix  text NOT NULL,          -- first 8 chars shown to user (e.g. nm_live_ab12)
  is_active   boolean NOT NULL DEFAULT true,
  last_used_at timestamp with time zone,
  created_at  timestamp with time zone DEFAULT NOW()
);

-- Every transactional email sent via /api/v1/emails
CREATE TABLE IF NOT EXISTS transactional_emails (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id     uuid REFERENCES transactional_api_keys(id) ON DELETE SET NULL,
  ses_message_id text,
  from_email     text NOT NULL,
  from_name      text,
  to_email       text NOT NULL,
  reply_to       text,
  subject        text NOT NULL,
  html_body      text,
  text_body      text,
  tags           jsonb,               -- arbitrary key-value tags
  status         text NOT NULL DEFAULT 'queued', -- queued, sent, delivered, bounced, failed
  error_message  text,
  opened_at      timestamp with time zone,
  clicked_at     timestamp with time zone,
  bounced_at     timestamp with time zone,
  delivered_at   timestamp with time zone,
  created_at     timestamp with time zone DEFAULT NOW(),
  sent_at        timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_transactional_emails_user_id ON transactional_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_transactional_emails_created_at ON transactional_emails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactional_api_keys_hash ON transactional_api_keys(key_hash);

-- Dummy SES config (replace access_key / secret_key with real values in Neon)
INSERT INTO ses_configurations (user_id, region, access_key, secret_key, from_email, from_name, daily_quota)
SELECT id, 'us-east-1', 'AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
       'noreply@neuramail.app', 'NeuraMail', 50000
FROM users WHERE role = 'admin' LIMIT 1
ON CONFLICT DO NOTHING;
