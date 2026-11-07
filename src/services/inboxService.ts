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
import { generateRandomName } from "../security/tokens";
import { Errors } from "../utils/errors";
import { isValidLocalPart } from "../utils/validation";
import { purgeInbox } from "./cleanupService";

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
  const domain = domainName?.toLowerCase() || config.defaultDomain;
  if (!config.domains.includes(domain)) {
    throw Errors.invalidRequest("Unknown domain");
  }
  const domainRow = await ensureDomain(env, domain);
  const existing = await findInboxByLocalPart(env, domainRow.id, name.toLowerCase());
  return {
    available: !existing || isExpired(existing.expires_at),
    name: name.toLowerCase(),
    domain,
  };
}

export async function createInbox(
  env: Env,
  config: AppConfig,
  opts: { name?: string; domain?: string } = {},
): Promise<CreateInboxResult> {
  const domainName = (opts.domain || config.defaultDomain).toLowerCase();
  if (!config.domains.includes(domainName)) {
    throw Errors.invalidRequest("Unknown domain");
  }
  const domainRow = await ensureDomain(env, domainName);

  let local = (opts.name || "").toLowerCase().trim();
  if (local) {
    if (!isValidLocalPart(local, config.maxNameLength)) throw Errors.invalidName();
  } else {
    local = generateRandomName();
  }

  const existing = await findInboxByLocalPart(env, domainRow.id, local);
  if (existing && !isExpired(existing.expires_at)) {
    throw Errors.invalidRequest("Name already taken");
  }
  if (existing && isExpired(existing.expires_at)) {
    await purgeInbox(env, existing.id);
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + config.inboxTtlSeconds * 1000);
  const address = `${local}@${domainName}`;

  await insertInbox(env, {
    id,
    domain_id: domainRow.id,
    local_part: local,
    address,
    token_hash: "none", // token system removed; column retained for schema compat
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    message_count: 0,
  });

  return {
    id,
    email: address,
    token: "", // removed
    expires_at: expires.toISOString(),
  };
}

export async function getInboxByName(
  env: Env,
  config: AppConfig,
  localPart: string,
  domainName?: string,
): Promise<{ inbox: InboxPublic; messages: LegacyMessage[] }> {
  if (!isValidLocalPart(localPart, config.maxNameLength)) {
    throw Errors.invalidName();
  }
  const domain = (domainName || config.defaultDomain).toLowerCase();
  const domainRow = await ensureDomain(env, domain);
  const row = await findInboxByLocalPart(env, domainRow.id, localPart.toLowerCase());
  if (!row || isExpired(row.expires_at)) throw Errors.inboxNotFound();

  const rows = await listMessagesForInbox(env, row.id);
  const messages: LegacyMessage[] = rows.map((m) => ({
    id: m.id,
    from: m.from_addr ?? "",
    to: m.to_addr ?? row.address,
    subject: m.subject ?? "",
    date: m.date ?? m.created_at,
    text: m.text_body ?? "",
    html: m.html_body ?? "",
    otp: m.otp_code
      ? { code: m.otp_code, kind: m.otp_kind ?? "otp", source: m.otp_source ?? "text" }
      : null,
  }));

  return {
    inbox: {
      id: row.id,
      email: row.address,
      expires_at: row.expires_at,
      created_at: row.created_at,
      message_count: row.message_count,
    },
    messages,
  };
}

export async function getInboxById(
  env: Env,
  id: string,
): Promise<InboxPublic> {
  const row = await findInboxById(env, id);
  if (!row || isExpired(row.expires_at)) throw Errors.inboxNotFound();
  return {
    id: row.id,
    email: row.address,
    expires_at: row.expires_at,
    created_at: row.created_at,
    message_count: row.message_count,
  };
}

export async function deleteInboxByName(
  env: Env,
  config: AppConfig,
  localPart: string,
  domainName?: string,
): Promise<void> {
  const domain = (domainName || config.defaultDomain).toLowerCase();
  const domainRow = await ensureDomain(env, domain);
  const row = await findInboxByLocalPart(env, domainRow.id, localPart.toLowerCase());
  if (!row) throw Errors.inboxNotFound();
  await purgeInbox(env, row.id);
}

export async function deleteInboxByIdService(env: Env, id: string): Promise<void> {
  const row = await findInboxById(env, id);
  if (!row) throw Errors.inboxNotFound();
  await purgeInbox(env, id);
}
