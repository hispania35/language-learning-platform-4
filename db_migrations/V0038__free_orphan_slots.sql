-- Окна, привязанные к уже удалённым урокам, снова становятся свободными
UPDATE lesson_slots s
SET booked_by = NULL, booked_at = NULL, lesson_id = NULL
WHERE s.lesson_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = s.lesson_id);