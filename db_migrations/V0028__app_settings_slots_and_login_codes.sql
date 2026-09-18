CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_app_settings_user ON app_settings(user_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_users_teacher ON users(teacher_id);

CREATE TABLE IF NOT EXISTS lesson_slots (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  slot_date DATE NOT NULL,
  slot_time TIME NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 60,
  booked_by INTEGER REFERENCES users(id),
  booked_at TIMESTAMP,
  lesson_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, slot_date, slot_time)
);

CREATE INDEX IF NOT EXISTS idx_slots_teacher_date ON lesson_slots(teacher_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_slots_booked ON lesson_slots(booked_by);

CREATE TABLE IF NOT EXISTS login_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  code VARCHAR(6) NOT NULL,
  purpose VARCHAR(20) NOT NULL DEFAULT 'login',
  attempts INTEGER NOT NULL DEFAULT 0,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_codes_user ON login_codes(user_id, used);

UPDATE users SET teacher_id = (SELECT id FROM users WHERE role='teacher' ORDER BY id LIMIT 1)
WHERE role = 'student' AND teacher_id IS NULL;
