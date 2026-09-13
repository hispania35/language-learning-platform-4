CREATE TABLE IF NOT EXISTS t_p98019776_language_learning_pl.library_subjects (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL,
    name VARCHAR(80) NOT NULL,
    color VARCHAR(20) DEFAULT '#c0392b',
    created_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS library_subjects_teacher_name
    ON t_p98019776_language_learning_pl.library_subjects (teacher_id, lower(name));

ALTER TABLE t_p98019776_language_learning_pl.library_items
    ADD COLUMN IF NOT EXISTS subject_id INTEGER;

INSERT INTO t_p98019776_language_learning_pl.library_subjects (teacher_id, name, color)
SELECT u.id, s.name, s.color
FROM t_p98019776_language_learning_pl.users u
CROSS JOIN (VALUES ('Испанский', '#c0392b'), ('Немецкий', '#2c3e50'), ('Английский', '#2980b9')) AS s(name, color)
WHERE u.role = 'teacher'
ON CONFLICT DO NOTHING;
