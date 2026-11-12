CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  password_version TEXT NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE login_limits (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);

CREATE TABLE progress_seed (
  part INTEGER PRIMARY KEY,
  contents TEXT NOT NULL
);

CREATE TABLE progress_operations (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  payload TEXT NOT NULL
);
