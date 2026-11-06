-- Initial schema for TempMail-CFW
-- Applied via wrangler d1 migrations

CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inboxes (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL,
  local_part TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (domain_id) REFERENCES domains(id),
  UNIQUE (domain_id, local_part)
);

CREATE INDEX IF NOT EXISTS idx_inboxes_expires_at ON inboxes(expires_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  inbox_id TEXT NOT NULL,
  message_id_header TEXT,
  from_addr TEXT,
  to_addr TEXT,
  subject TEXT,
  date TEXT,
  text_body TEXT,
  html_r2_key TEXT,
  raw_r2_key TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (inbox_id) REFERENCES inboxes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_inbox_created ON messages(inbox_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_dedup
  ON messages(inbox_id, message_id_header)
  WHERE message_id_header IS NOT NULL;

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  filename TEXT,
  content_type TEXT,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
