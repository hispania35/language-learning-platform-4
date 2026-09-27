ALTER TABLE t_p98019776_language_learning_pl.users
  ADD COLUMN IF NOT EXISTS room_name VARCHAR(80) NOT NULL DEFAULT '';

UPDATE t_p98019776_language_learning_pl.users
SET room_name = 'hispania-teacher-' || id
WHERE role IN ('teacher', 'admin') AND room_name = '';

CREATE UNIQUE INDEX IF NOT EXISTS users_room_name_uniq
  ON t_p98019776_language_learning_pl.users (room_name)
  WHERE room_name <> '';