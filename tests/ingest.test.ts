import { describe, expect, it, vi, beforeEach } from "vitest";

const state = {
  messages: new Map<string, { message_id: string | null }>(),
  slots: new Map<string, number>(),
  failInsert: false,
};

vi.mock("../src/repositories/inboxRepo", () => ({
  findInboxByAddress: vi.fn(async () => ({
    id: "inbox-1",
    domain_id: "d1",
    local_part: "user",
    address: "user@example.com",
    token_hash: "x",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    message_count: 0,
  })),
}));

vi.mock("../src/repositories/messageRepo", () => ({
  findMessageByMessageId: vi.fn(async (_e: unknown, inboxId: string, mid: string) => {
    for (const m of state.messages.values()) {
      if (m.message_id === mid) return { id: "dup" };
    }
    return null;
  }),
  tryReserveMessageSlot: vi.fn(async (_e: unknown, inboxId: string, max: number) => {
    const n = state.slots.get(inboxId) ?? 0;
    if (n >= max) return false;
    state.slots.set(inboxId, n + 1);
    return true;
  }),
  releaseMessageSlot: vi.fn(async (_e: unknown, inboxId: string) => {
    const n = state.slots.get(inboxId) ?? 0;
    state.slots.set(inboxId, Math.max(0, n - 1));
  }),
  insertMessage: vi.fn(async (_e: unknown, row: { id: string; message_id: string | null }) => {
    if (state.failInsert) throw new Error("D1 unavailable");
    state.messages.set(row.id, { message_id: row.message_id });
  }),
  insertAttachmentMeta: vi.fn(async () => undefined),
}));

vi.mock("../src/services/webhookService", () => ({
  dispatchMessageWebhook: vi.fn(async () => undefined),
}));

import { ingestEmail } from "../src/services/emailIngestService";
import type { Env } from "../src/types/env";

function env(): Env {
  return {
    DB: {} as D1Database,
    KV: {} as KVNamespace,
    EMAIL_DOMAINS: "example.com",
  };
}

function msg(overrides: Partial<ForwardableEmailMessage> = {}): ForwardableEmailMessage {
  const raw = new TextEncoder().encode(
    "From: a@b.com\r\nSubject: Code 123456\r\nMessage-ID: <m1@x>\r\n\r\nHello 123456\r\n",
  );
  return {
    from: "a@b.com",
    to: "user@example.com",
    rawSize: raw.byteLength,
    headers: new Headers(),
    raw: new ReadableStream({
      start(c) {
        c.enqueue(raw);
        c.close();
      },
    }),
    setReject: vi.fn(),
    forward: vi.fn(),
    ...overrides,
  } as unknown as ForwardableEmailMessage;
}

describe("ingestEmail", () => {
  beforeEach(() => {
    state.messages.clear();
    state.slots.clear();
    state.failInsert = false;
  });

  it("stores a message", async () => {
    const r = await ingestEmail(msg(), env());
    expect(r.status).toBe("stored");
  });

  it("rejects unknown domain", async () => {
    const r = await ingestEmail(msg({ to: "user@other.com" }), env());
    expect(r.status).toBe("rejected");
    expect(r.reason).toBe("unknown_domain");
  });

  it("fails hard on D1 insert error (not duplicate)", async () => {
    state.failInsert = true;
    const m = msg();
    const r = await ingestEmail(m, env());
    expect(r.status).toBe("failed");
    expect(m.setReject).toHaveBeenCalled();
  });
});
