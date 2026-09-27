UPDATE t_p98019776_language_learning_pl.users
SET is_blocked = TRUE, blocked_at = NOW()
WHERE email LIKE 'probe.teacher.%';