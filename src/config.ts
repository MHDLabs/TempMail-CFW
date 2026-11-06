import type { AppConfig, Env } from "./types/env";

const DEFAULTS = {
  inboxTtlSeconds: 3600,
  sessionTtlSeconds: 43200,
  maxMessagesPerInbox: 50,
  maxMessageSizeBytes: 1_048_576,
  maxAttachmentSizeBytes: 10_485_760,
  maxNameLength: 32,
} as const;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * Validate and normalize Worker env into a typed AppConfig.
 * Throws if required structural bindings are missing at runtime use-sites;
 * domain list must be non-empty for inbox operations.
 */
export function loadConfig(env: Env): AppConfig {
  const domains = (env.EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  return {
    domains,
    defaultDomain: domains[0] ?? "",
    inboxTtlSeconds: parsePositiveInt(env.INBOX_TTL_SECONDS, DEFAULTS.inboxTtlSeconds),
    sessionTtlSeconds: parsePositiveInt(env.SESSION_TTL_SECONDS, DEFAULTS.sessionTtlSeconds),
    maxMessagesPerInbox: parsePositiveInt(
      env.MAX_MESSAGES_PER_INBOX,
      DEFAULTS.maxMessagesPerInbox,
    ),
    maxMessageSizeBytes: parsePositiveInt(
      env.MAX_MESSAGE_SIZE_BYTES,
      DEFAULTS.maxMessageSizeBytes,
    ),
    maxAttachmentSizeBytes: parsePositiveInt(
      env.MAX_ATTACHMENT_SIZE_BYTES,
      DEFAULTS.maxAttachmentSizeBytes,
    ),
    maxNameLength: parsePositiveInt(env.MAX_NAME_LENGTH, DEFAULTS.maxNameLength),
    panelPassword: env.PANEL_PASSWORD?.length ? env.PANEL_PASSWORD : null,
    sessionSecret: env.SESSION_SECRET?.length ? env.SESSION_SECRET : null,
  };
}

export function assertBindings(env: Env): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!env.DB) missing.push("DB");
  if (!env.KV) missing.push("KV");
  // R2 is required for attachments but may be optional in earliest scaffold tests
  if (!env.R2) missing.push("R2");
  if (missing.length) return { ok: false, missing };
  return { ok: true };
}
