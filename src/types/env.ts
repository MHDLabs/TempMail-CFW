export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ASSETS?: Fetcher;
  AI?: Ai;
  EMAIL_DOMAINS: string;
  PANEL_PASSWORD?: string;
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
  INBOX_TTL_SECONDS?: string;
  SESSION_TTL_SECONDS?: string;
  MAX_MESSAGES_PER_INBOX?: string;
  MAX_MESSAGE_SIZE_BYTES?: string;
  MAX_BODY_CHARS?: string;
  MAX_NAME_LENGTH?: string;
}

export interface AppConfig {
  domains: string[];
  defaultDomain: string;
  inboxTtlSeconds: number;
  sessionTtlSeconds: number;
  maxMessagesPerInbox: number;
  maxMessageSizeBytes: number;
  maxBodyChars: number;
  maxNameLength: number;
  panelPassword: string | null;
}

export type AppVariables = {
  requestId: string;
  config: AppConfig;
};
