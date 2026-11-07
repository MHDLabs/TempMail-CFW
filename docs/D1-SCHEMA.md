# D1 schema — TempMail-CFW (R2-free)

## Tables

### domains
- `id` TEXT PK
- `name` TEXT UNIQUE
- `created_at` TEXT

### inboxes
- `id` TEXT PK
- `domain_id` TEXT FK
- `local_part` TEXT
- `address` TEXT UNIQUE
- `token_hash` TEXT
- `created_at` TEXT
- `expires_at` TEXT
- `message_count` INTEGER

### messages
- `id` TEXT PK
- `inbox_id` TEXT FK
- `message_id` TEXT (RFC Message-ID, unique per inbox)
- `from_addr`, `to_addr`, `subject`, `date`
- `text_body` TEXT
- `html_body` TEXT (sanitized)
- `otp_code`, `otp_kind`, `otp_source` (optional extraction)
- `size_bytes` INTEGER
- `created_at` TEXT

Historical columns from migration 0001 (`html_r2_key`, `raw_r2_key`) may still exist on upgraded databases but are unused.

### attachments
Metadata only — **no file bytes**:
- `filename`, `content_type`, `size_bytes`
- `content_disposition`, `content_id`, `is_inline`
- Legacy `r2_key` column retained as a NOT NULL unique placeholder (`meta:<uuid>`) for upgraded DBs; not an object-store path.

### sessions
Admin session hashes and expiry.

## Migrations
1. `0001_init.sql` — initial schema (historical R2 key columns)
2. `0002_d1_content.sql` — html_body, otp fields, attachment metadata columns

## Retention
Expired inboxes and related rows are deleted by scheduled cleanup. No object-storage sweep.
