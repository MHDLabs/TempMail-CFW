import type { AppConfig, Env } from "../types/env";
import type { CreateInboxResult, InboxPublic, LegacyMessage } from "../types/inbox";
import {
  ensureDomain,
  findInboxByAddress,
  findInboxById,
  findInboxByLocalPart,
  insertInbox,
  listMessagesForInbox,
} from "../repositories/inboxRepo";
import { constantTimeCompare, generateRandomName, generateToken, hashToken } from "../security/tokens";
import { Errors } from "../utils/errors";
import { purgeInbox } from "./cleanupService";
import { isValidLocalPart } from "../utils/validation";

function isExpired(expiresAtIso: string): boolean {
  return Date.parse(expiresAtIso) <= Date.now();
}

export async function checkNameAvailable(
  env: Env,
  config: AppConfig,
  name: string,
  domainName?: string,
): Promise<{ available: boolean; name: string; domain: string }> {
  if (!isValidLocalPart(name, config.maxNameLength)) {
    throw Errors.invalidName();
  }
  if (!config.defaultDomain && config.domains.length === 0) {
    throw Errors.serviceUnavailable("No email domains configured");
  }
  const domain = (domainName || config.defaultDomain).toLowerCase();
  if (!config.domains.includes(domain)) {
    throw Errors.invalidRequest("Domain not configured");
  }
  const domainRow = await ensureDomain(env, domain);
  const existing = await findInboxByLocalPart(env, domainRow.id, name.toLowerCase());
  const available = !existing || isExpired(existing.expires_at);
  return { available, name: name.toLowerCase(), domain };
}

export async function createInbox(
  env: Env,
  config: AppConfig,
  options: { name?: string; domain?: string } = {},
): Promise<CreateInboxResult> {
  if (!config.defaultDomain && config.domains.length === 0) {
    throw Errors.serviceUnavailable("No email domains configured");
  }

  const domainName = (options.domain || config.defaultDomain).toLowerCase();
  if (!config.domains.includes(domainName)) {
    throw Errors.invalidRequest("Domain not configured");
  }

  const domainRow = await ensureDomain(env, domainName);
  const requested = options.name?.trim().toLowerCase() ?? "";

  if (requested && !isValidLocalPart(requested, config.maxNameLength)) {
    throw Errors.invalidName();
  }

  const maxAttempts = requested ? 1 : 8;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const localPart = requested || generateRandomName(8);
    if (!isValidLocalPart(localPart, config.maxNameLength)) {
      throw Errors.invalidName();
    }

    const existing = await findInboxByLocalPart(env, domainRow.id, localPart);
    if (existing && !isExpired(existing.expires_at)) {
      if (requested) throw Errors.nameTaken();
      continue;
    }
    // Expired inbox with same name: delete then recreate
    if (existing && isExpired(existing.expires_at)) {
      await purgeInbox(env, existing.id);
    }

    const token = await generateToken(32);
    const token_hash = await hashToken(token);
    const id = crypto.randomUUID();
    const now = new Date();
    const expires = new Date(now.getTime() + config.inboxTtlSeconds * 1000);
    const address = `${localPart}@${domainName}`;

    try {
      await insertInbox(env, {
        id,
        domain_id: domainRow.id,
        local_part: localPart,
        address,
        token_hash,
        created_at: now.toISOString(),
        expires_at: expires.toISOString(),
        message_count: 0,
      });
      return {
        id,
        email: address,
        token,
        expires_at: expires.toISOString(),
        local_part: localPart,
      };
    } catch (err) {
      lastError = err;
      if (requested) throw Errors.nameTaken();
      // random collision — retry
    }
  }

  throw lastError instanceof Error ? Errors.nameTaken() : Errors.internal();
}

export async function verifyInboxAccess(
  env: Env,
  inbox: { token_hash: string; expires_at: string },
  bearerToken: string | null,
): Promise<void> {
  if (!bearerToken) throw Errors.unauthorized();
  const hash = await hashToken(bearerToken);
  if (!constantTimeCompare(hash, inbox.token_hash)) {
    throw Errors.unauthorized();
  }
  if (isExpired(inbox.expires_at)) {
    throw Errors.inboxNotFound("Inbox expired");
  }
}

export async function getInboxByName(
  env: Env,
  config: AppConfig,
  localPart: string,
  bearerToken: string | null,
): Promise<{ inbox: InboxPublic; messages: LegacyMessage[] }> {
  if (!isValidLocalPart(localPart, config.maxNameLength)) {
    throw Errors.invalidName();
  }
  if (!config.defaultDomain) {
    throw Errors.serviceUnavailable("No email domains configured");
  }

  const address = `${localPart.toLowerCase()}@${config.defaultDomain}`;
  const row = await findInboxByAddress(env, address);
  if (!row || isExpired(row.expires_at)) {
    throw Errors.inboxNotFound();
  }
  await verifyInboxAccess(env, row, bearerToken);

  const rows = await listMessagesForInbox(env, row.id);
  const messages: LegacyMessage[] = [];
  for (const m of rows) {
        messages.push({
      id: m.id,
      from: m.from_addr ?? "",
      to: m.to_addr ?? row.address,
      subject: m.subject ?? "",
      date: m.date ?? m.created_at,
      text: m.text_body ?? "",
      html: m.html_body ?? "",
      otp: m.otp_code
        ? {
            code: m.otp_code,
            kind: m.otp_kind ?? "otp",
            source: m.otp_source ?? "text",
          }
        : null,
    });
  }

  return {
    inbox: {
      id: row.id,
      email: row.address,
      expires_at: row.expires_at,
      message_count: row.message_count,
      created_at: row.created_at,
    },
    messages,
  };
}

export async function getInboxById(
  env: Env,
  id: string,
  bearerToken: string | null,
): Promise<InboxPublic> {
  const row = await findInboxById(env, id);
  if (!row || isExpired(row.expires_at)) {
    throw Errors.inboxNotFound();
  }
  await verifyInboxAccess(env, row, bearerToken);
  return {
    id: row.id,
    email: row.address,
    expires_at: row.expires_at,
    message_count: row.message_count,
    created_at: row.created_at,
  };
}

export async function deleteInboxByName(
  env: Env,
  config: AppConfig,
  localPart: string,
  bearerToken: string | null,
): Promise<void> {
  if (!isValidLocalPart(localPart, config.maxNameLength)) {
    throw Errors.invalidName();
  }
  if (!config.defaultDomain) {
    throw Errors.serviceUnavailable("No email domains configured");
  }
  const address = `${localPart.toLowerCase()}@${config.defaultDomain}`;
  const row = await findInboxByAddress(env, address);
  if (!row) {
    throw Errors.inboxNotFound();
  }
  await verifyInboxAccess(env, row, bearerToken);
  await purgeInbox(env, row.id);
}

export async function deleteInboxByIdService(
  env: Env,
  id: string,
  bearerToken: string | null,
): Promise<void> {
  const row = await findInboxById(env, id);
  if (!row) throw Errors.inboxNotFound();
  await verifyInboxAccess(env, row, bearerToken);
  await purgeInbox(env, id);
}

export function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}
