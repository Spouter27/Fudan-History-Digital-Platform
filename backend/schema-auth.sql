CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  year INTEGER NOT NULL,
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  consent INTEGER NOT NULL CHECK (consent = 1),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','withdrawn')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  review_note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS submissions_owner ON submissions(owner_id, created_at);
CREATE INDEX IF NOT EXISTS submissions_status ON submissions(status, created_at);

CREATE TABLE IF NOT EXISTS review_logs (
  id TEXT PRIMARY KEY,
  submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
