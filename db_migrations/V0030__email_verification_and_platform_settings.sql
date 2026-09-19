ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS verify_token VARCHAR(64),
  ADD COLUMN IF NOT EXISTS verify_sent_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_verify_token ON users (verify_token);

CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO platform_settings (key, value) VALUES ('registration_open', '1')
  ON CONFLICT (key) DO NOTHING;