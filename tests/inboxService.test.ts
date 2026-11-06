import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig, Env } from "../src/types/env";
import type { InboxRow } from "../src/types/inbox";
import { constantTimeCompare, generateRandomName, hashToken } from "../src/security/tokens";
import { isValidLocalPart } from "../src/utils/validation";

const store = {
  domains: new Map<string, { id: string; name: string; created_at: string }>(),
  inboxes: new Map<string, InboxRow>(),
};

vi.mock("../src/repositories/inboxRepo", () => ({
  ensureDomain: vi.fn(async (_env: Env, domainName: string) => {
    const existing = [...store.domains.values()].find((d) => d.name === domainName);
    if (existing) return existing;
    const row = { id: crypto.randomUUID(), name: domainName, created_at: new Date().toISOString() };
    store.domains.set(row.id, row);
    return row;
  }),
  findInboxByLocalPart: vi.fn(async (_env: Env, domainId: string, localPart: string) => {
    return (
      [...store.inboxes.values()].find(
        (i) => i.domain_id === domainId && i.local_part === localPart,
      ) ?? null
    );
  }),
  findInboxByAddress: vi.fn(async (_env: Env, address: string) => {
    return [...store.inboxes.values()].find((i) => i.address === address) ?? null;
  }),
  findInboxById: vi.fn(async (_env: Env, id: string) => store.inboxes.get(id) ?? null),
  insertInbox: vi.fn(async (_env: Env, row: InboxRow) => {
    const clash = [...store.inboxes.values()].find(
      (i) => i.domain_id === row.domain_id && i.local_part === row.local_part,
    );
    if (clash) throw new Error("UNIQUE constraint failed");
    store.inboxes.set(row.id, { ...row, message_count: row.message_count ?? 0 });
  }),
  deleteInboxById: vi.fn(async (_env: Env, id: string) => {
    store.inboxes.delete(id);
  }),
  listMessagesForInbox: vi.fn(async () => []),
}));

import {
  checkNameAvailable,
  createInbox,
  deleteInboxByName,
  extractBearer,
  getInboxByName,
} from "../src/services/inboxService";

const config: AppConfig = {
  domains: ["example.com"],
  defaultDomain: "example.com",
  inboxTtlSeconds: 3600,
  sessionTtlSeconds: 43200,
  maxMessagesPerInbox: 50,
  maxMessageSizeBytes: 1_048_576,
  maxAttachmentSizeBytes: 10_485_760,
  maxNameLength: 32,
  panelPassword: null,
  sessionSecret: null,
};

const env = {} as Env;

beforeEach(() => {
  store.domains.clear();
  store.inboxes.clear();
});

describe("validation helpers", () => {
  it("validates local parts", () => {
    expect(isValidLocalPart("abc")).toBe(true);
    expect(isValidLocalPart("ab")).toBe(false);
    expect(isValidLocalPart("bad name")).toBe(false);
  });

  it("extracts bearer tokens", () => {
    expect(extractBearer("Bearer abc123")).toBe("abc123");
    expect(extractBearer("Basic x")).toBeNull();
    expect(extractBearer(undefined)).toBeNull();
  });

  it("hashes and compares tokens", async () => {
    const h1 = await hashToken("secret");
    const h2 = await hashToken("secret");
    expect(constantTimeCompare(h1, h2)).toBe(true);
    expect(constantTimeCompare(h1, await hashToken("other"))).toBe(false);
  });

  it("generates random names", () => {
    expect(generateRandomName(8)).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe("createInbox", () => {
  it("creates random inbox", async () => {
    const result = await createInbox(env, config, {});
    expect(result.email).toMatch(/^[a-f0-9]+@example\.com$/);
    expect(result.token).toHaveLength(64);
    expect(result.id).toBeTruthy();
    expect(Date.parse(result.expires_at)).toBeGreaterThan(Date.now());
  });

  it("creates custom name", async () => {
    const result = await createInbox(env, config, { name: "testuser" });
    expect(result.email).toBe("testuser@example.com");
  });

  it("rejects invalid name", async () => {
    await expect(createInbox(env, config, { name: "ab" })).rejects.toMatchObject({
      code: "INVALID_NAME",
    });
  });

  it("rejects taken name", async () => {
    await createInbox(env, config, { name: "taken" });
    await expect(createInbox(env, config, { name: "taken" })).rejects.toMatchObject({
      code: "NAME_TAKEN",
    });
  });
});

describe("checkNameAvailable", () => {
  it("reports available and taken", async () => {
    const a = await checkNameAvailable(env, config, "free");
    expect(a.available).toBe(true);
    await createInbox(env, config, { name: "free" });
    const b = await checkNameAvailable(env, config, "free");
    expect(b.available).toBe(false);
  });
});

describe("get and delete inbox", () => {
  it("reads with valid token and rejects bad token", async () => {
    const created = await createInbox(env, config, { name: "reader" });
    const ok = await getInboxByName(env, config, "reader", created.token);
    expect(ok.inbox.email).toBe("reader@example.com");
    expect(ok.messages).toEqual([]);

    await expect(getInboxByName(env, config, "reader", "wrong")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("deletes inbox with token", async () => {
    const created = await createInbox(env, config, { name: "gone" });
    await deleteInboxByName(env, config, "gone", created.token);
    await expect(getInboxByName(env, config, "gone", created.token)).rejects.toMatchObject({
      code: "INBOX_NOT_FOUND",
    });
  });
});
