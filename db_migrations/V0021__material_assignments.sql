CREATE TABLE IF NOT EXISTS material_assignments (
  id SERIAL PRIMARY KEY,
  material_id INTEGER NOT NULL,
  student_id INTEGER,
  lesson_id INTEGER,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matassign_material ON material_assignments(material_id);
CREATE INDEX IF NOT EXISTS idx_matassign_student ON material_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_matassign_lesson ON material_assignments(lesson_id);