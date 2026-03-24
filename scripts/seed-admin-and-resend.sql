-- =============================================================
-- 1. Create/update admin user with bcrypt hash for password: Admin@1234!
--    Hash generated with bcrypt cost 10
-- =============================================================
INSERT INTO users (
  email,
  password_hash,
  full_name,
  role,
  is_active,
  email_verified
)
VALUES (
  'admin@neuramail.io',
  '$2a$10$0sdtlNaQ.F7P5wvKnq6UxO2b2uSuaGpH7TfsPaJgZHtZ3kK9/2aSi',
  'Super Admin',
  'admin',
  true,
  true
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = '$2a$10$0sdtlNaQ.F7P5wvKnq6UxO2b2uSuaGpH7TfsPaJgZHtZ3kK9/2aSi',
  role = 'admin',
  is_active = true,
  email_verified = true,
  full_name = 'Super Admin';

-- Ensure admin has a credit row
INSERT INTO user_credits (user_id, balance, total_purchased, total_used)
SELECT id, 0, 0, 0 FROM users WHERE email = 'admin@neuramail.io'
ON CONFLICT (user_id) DO NOTHING;

-- =============================================================
-- 2. Upsert Resend api_connection (dummy credentials)
--    Used for: email verification on signup + forgot password emails
-- =============================================================
INSERT INTO api_connections (
  display_name,
  service_name,
  credentials,
  extra_config,
  is_active,
  notes
)
VALUES (
  'Resend (Transactional Email)',
  'resend',
  '{"api_key": "re_REPLACE_WITH_REAL_KEY_xxxxxxxxxxxx"}',
  '{"from_email": "no-reply@neuramail.io", "from_name": "NeuraMail", "reply_to": "support@neuramail.io"}',
  true,
  'Used for signup email verification and forgot password emails. Replace api_key with a real Resend API key from resend.com.'
)
ON CONFLICT DO NOTHING;
