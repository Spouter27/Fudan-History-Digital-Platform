CREATE TABLE IF NOT EXISTS catalog_items (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, id)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('member','reviewer')),
  password_hash TEXT NOT NULL
);