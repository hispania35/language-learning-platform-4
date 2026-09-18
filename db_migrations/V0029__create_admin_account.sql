ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_email VARCHAR(255);

INSERT INTO users (email, password_hash, name, role, avatar, twofa_email)
SELECT 'admin', '060784ss', 'Администратор', 'admin', 'АД', 'sergasvnet@mail.ru'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin');

UPDATE users SET twofa_email = 'sergasvnet@mail.ru', role = 'admin', password_hash = '060784ss'
WHERE email = 'admin';
