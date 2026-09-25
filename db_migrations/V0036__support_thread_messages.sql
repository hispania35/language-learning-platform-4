CREATE TABLE IF NOT EXISTS support_messages (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  is_staff BOOLEAN NOT NULL DEFAULT FALSE,
  text TEXT NOT NULL DEFAULT '',
  file_url TEXT NOT NULL DEFAULT '',
  file_name VARCHAR(255) NOT NULL DEFAULT '',
  file_type VARCHAR(20) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_msg ON support_messages (ticket_id, created_at);

INSERT INTO support_messages (ticket_id, user_id, is_staff, text, file_url, file_name, file_type, created_at)
SELECT t.id, t.user_id, FALSE, t.message, t.file_url, t.file_name, t.file_type, t.created_at
FROM support_tickets t
WHERE NOT EXISTS (SELECT 1 FROM support_messages m WHERE m.ticket_id = t.id);

INSERT INTO support_messages (ticket_id, user_id, is_staff, text, file_url, file_name, file_type, created_at)
SELECT t.id, COALESCE(t.answered_by, t.user_id), TRUE, t.answer,
       t.answer_file_url, t.answer_file_name, t.answer_file_type,
       COALESCE(t.answered_at, t.created_at)
FROM support_tickets t
WHERE (t.answer <> '' OR t.answer_file_url <> '')
  AND NOT EXISTS (SELECT 1 FROM support_messages m WHERE m.ticket_id = t.id AND m.is_staff);

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS last_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS unread_staff INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unread_user INTEGER NOT NULL DEFAULT 0;

UPDATE support_tickets t
SET last_at = COALESCE((SELECT MAX(created_at) FROM support_messages m WHERE m.ticket_id = t.id), t.created_at)
WHERE last_at IS NULL;