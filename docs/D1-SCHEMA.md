# D1 Schema (draft)

This is the logical schema for Phase 2 design.  
Migrations will be introduced in Phase 3+ as versioned SQL files.

## Tables (initial)

### domains
- id TEXT PRIMARY KEY
- name TEXT NOT NULL UNIQUE
- created_at TEXT NOT NULL

### inboxes
- id TEXT PRIMARY KEY
- domain_id TEXT NOT NULL REFERENCES domains(id)
- local_part TEXT NOT NULL
- address TEXT NOT NULL UNIQUE          -- local@domain
- token_hash TEXT NOT NULL
- created_at TEXT NOT NULL
- expires_at TEXT NOT NULL
- message_count INTEGER NOT NULL DEFAULT 0
- UNIQUE(domain_id, local_part)

### messages
- id TEXT PRIMARY KEY
- inbox_id TEXT NOT NULL REFERENCES inboxes(id) ON DELETE CASCADE
- message_id_header TEXT               -- for dedup
- from_addr TEXT
- to_addr TEXT
- subject TEXT
- date TEXT
- text_body TEXT                       -- small bodies; large ones may live in R2
- html_r2_key TEXT                     -- optional
- raw_r2_key TEXT                      -- optional
- size_bytes INTEGER
- created_at TEXT NOT NULL
- UNIQUE(inbox_id, message_id_header)  -- when header present

### attachments
- id TEXT PRIMARY KEY
- message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE
- filename TEXT
- content_type TEXT
- size_bytes INTEGER NOT NULL
- r2_key TEXT NOT NULL UNIQUE
- created_at TEXT NOT NULL

### sessions
- id TEXT PRIMARY KEY                  -- or hash of session secret
- created_at TEXT NOT NULL
- expires_at TEXT NOT NULL

### indexes (examples)
- inboxes(expires_at)
- messages(inbox_id, created_at)
- attachments(message_id)

## Notes

- Prefer TEXT ISO-8601 timestamps for simplicity on Workers.
- ON DELETE CASCADE used where D1 supports reliable cascading; otherwise application-level delete order.
- token_hash never stores the raw token.
- Exact SQL migration files will be added when the foundation phase lands.
