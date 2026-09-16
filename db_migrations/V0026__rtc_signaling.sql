CREATE TABLE IF NOT EXISTS rtc_signals (
    id SERIAL PRIMARY KEY,
    room VARCHAR(128) NOT NULL,
    sender_id INTEGER NOT NULL,
    kind VARCHAR(16) NOT NULL,
    payload TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rtc_signals_room ON rtc_signals(room, id);
CREATE INDEX IF NOT EXISTS idx_rtc_signals_created ON rtc_signals(created_at);

CREATE TABLE IF NOT EXISTS rtc_peers (
    room VARCHAR(128) NOT NULL,
    user_id INTEGER NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    last_seen TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (room, user_id)
);
