/** Cloudflare Worker bindings and validated config. */

export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  KV: KVNamespace;
  EMAIL_DOMAINS: string;
  PANEL_PASSWORD?: string;
  SESSION_SECRET?: string;
  INBOX_TTL_SECONDS?: string;
  SESSION_TTL_SECONDS?: string;
  MAX_MESSAGES_PER_INBOX?: string;
  MAX_MESSAGE_SIZE_BYTES?: string;
  MAX_ATTACHMENT_SIZE_BYTES?: string;
  MAX_NAME_LENGTH?: string;
}

export interface AppConfig {
  domains: string[];
  defaultDomain: string;
  inboxTtlSeconds: number;
  sessionTtlSeconds: number;
  maxMessagesPerInbox: number;
  maxMessageSizeBytes: number;
  maxAttachmentSizeBytes: number;
  maxNameLength: number;
  panelPassword: string | null;
  sessionSecret: string | null;
}

export type AppVariables = {
  requestId: string;
  config: AppConfig;
};
