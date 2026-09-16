CREATE TABLE IF NOT EXISTS exercises (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    template VARCHAR(30) NOT NULL DEFAULT 'quiz',
    subject VARCHAR(100),
    instruction TEXT,
    items TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercises_teacher ON exercises(teacher_id);

CREATE TABLE IF NOT EXISTS exercise_assignments (
    id SERIAL PRIMARY KEY,
    exercise_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exassign_uniq ON exercise_assignments(exercise_id, student_id);

CREATE TABLE IF NOT EXISTS exercise_results (
    id SERIAL PRIMARY KEY,
    exercise_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    score INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0,
    seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exresults_ex ON exercise_results(exercise_id);
CREATE INDEX IF NOT EXISTS idx_exresults_student ON exercise_results(student_id);
