CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  topic VARCHAR(40) NOT NULL DEFAULT 'other',
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new',
  answer TEXT NOT NULL DEFAULT '',
  answered_by INTEGER REFERENCES users(id),
  answered_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_status ON support_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_user ON support_tickets (user_id, created_at DESC);