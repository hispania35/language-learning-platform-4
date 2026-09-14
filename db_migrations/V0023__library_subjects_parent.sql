ALTER TABLE library_subjects ADD COLUMN IF NOT EXISTS parent_id INTEGER NULL;
CREATE INDEX IF NOT EXISTS idx_library_subjects_parent ON library_subjects(parent_id);