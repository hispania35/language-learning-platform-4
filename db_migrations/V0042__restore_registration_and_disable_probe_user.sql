UPDATE t_p98019776_language_learning_pl.platform_settings
SET value = '0', updated_at = NOW()
WHERE key = 'registration_open';

UPDATE t_p98019776_language_learning_pl.users
SET is_blocked = TRUE, email = 'removed_probe_' || id || '@example.invalid'
WHERE email LIKE 'probe%@example.com';