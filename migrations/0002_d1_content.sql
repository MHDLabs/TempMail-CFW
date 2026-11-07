-- R2-free content storage: bodies live in D1; attachment bytes are not stored.
ALTER TABLE messages ADD COLUMN html_body TEXT;
ALTER TABLE messages ADD COLUMN otp_code TEXT;
ALTER TABLE messages ADD COLUMN otp_kind TEXT;
ALTER TABLE messages ADD COLUMN otp_source TEXT;

-- Attachment metadata only (no object storage key required for new rows)
ALTER TABLE attachments ADD COLUMN content_disposition TEXT;
ALTER TABLE attachments ADD COLUMN content_id TEXT;
ALTER TABLE attachments ADD COLUMN is_inline INTEGER NOT NULL DEFAULT 0;

-- Historical note: html_r2_key / raw_r2_key / r2_key columns may still exist from 0001
-- for older deployments; new code does not write or read object storage.
