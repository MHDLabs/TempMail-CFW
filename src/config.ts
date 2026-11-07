import type { AppConfig, Env } from "./types/env";
import { Errors } from "./utils/errors";

const DEFAULTS = {
  inboxTtlSeconds: 3600,
  sessionTtlSeconds: 43_200,
  maxMessagesPerInbox: 50,
  maxMessageSizeBytes: 1_048_576, // 1 MiB total inbound message
  maxBodyChars: 200_000,
  maxNameLength: 32,
} as const;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export function loadConfig(env: Env): AppConfig {
  const domains = (env.EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  if (domains.length === 0) {
    throw Errors.serviceUnavailable("EMAIL_DOMAINS is not configured");
  }

  return {
    domains,
    defaultDomain: domains[0]!,
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
    maxBodyChars: parsePositiveInt(env.MAX_BODY_CHARS, DEFAULTS.maxBodyChars),
    maxNameLength: parsePositiveInt(env.MAX_NAME_LENGTH, DEFAULTS.maxNameLength),
    panelPassword: env.PANEL_PASSWORD?.length ? env.PANEL_PASSWORD : null,
  };
}

export function assertBindings(env: Env): void {
  const missing: string[] = [];
  if (!env.DB) missing.push("DB");
  if (!env.KV) missing.push("KV");
  if (missing.length) {
    throw Errors.serviceUnavailable(`Missing bindings: ${missing.join(", ")}`);
  }
}
