CREATE TABLE IF NOT EXISTS card_decks (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  lang_from VARCHAR(30) DEFAULT 'Испанский',
  lang_to VARCHAR(30) DEFAULT 'Русский',
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cards (
  id SERIAL PRIMARY KEY,
  deck_id INTEGER NOT NULL,
  front TEXT NOT NULL,
  back TEXT,
  example TEXT,
  example_ru TEXT,
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS card_deck_assignments (
  id SERIAL PRIMARY KEY,
  deck_id INTEGER NOT NULL,
  student_id INTEGER,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS card_progress (
  id SERIAL PRIMARY KEY,
  card_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  known BOOLEAN DEFAULT false,
  attempts INTEGER DEFAULT 0,
  correct INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_deckassign_student ON card_deck_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_deckassign_deck ON card_deck_assignments(deck_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cardprogress_uniq ON card_progress(card_id, student_id);