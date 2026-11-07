import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import type { Env } from "../src/types/env";

vi.mock("../src/repositories/inboxRepo", () => ({
  ensureDomain: vi.fn(async () => ({
    id: "dom-1",
    name: "example.com",
    created_at: new Date().toISOString(),
  })),
  findInboxByLocalPart: vi.fn(async () => null),
  findInboxByAddress: vi.fn(async () => null),
  findInboxById: vi.fn(async () => null),
  insertInbox: vi.fn(async () => undefined),
  deleteInboxById: vi.fn(async () => undefined),
  listMessagesForInbox: vi.fn(async () => []),
}));

vi.mock("../src/services/cleanupService", () => ({
  purgeInbox: vi.fn(async () => undefined),
  runCleanup: vi.fn(async () => ({ inboxesDeleted: 0, sessionsDeleted: 0 })),
}));

function mockDb(): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => ({ ok: 1 }),
        run: async () => ({ success: true }),
        all: async () => ({ results: [] }),
      }),
      first: async () => ({ ok: 1 }),
      run: async () => ({ success: true }),
      all: async () => ({ results: [] }),
    }),
  } as unknown as D1Database;
}

function mockKv(): KVNamespace {
  const map = new Map<string, string>();
  return {
    get: async (key: string) => map.get(key) ?? null,
    put: async (key: string, value: string) => {
      map.set(key, value);
    },
    delete: async (key: string) => {
      map.delete(key);
    },
  } as unknown as KVNamespace;
}

function mockEnv(): Env {
  return {
    DB: mockDb(),
        KV: mockKv(),
    EMAIL_DOMAINS: "example.com",
  };
}

describe("legacy API contract", () => {
  it("POST /email returns required fields", async () => {
    const app = createApp();
    const res = await app.request(
      "/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "contract1" }),
      },
      mockEnv(),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(typeof body.email).toBe("string");
    expect(typeof body.token).toBe("string");
    expect(typeof body.expires_at).toBe("string");
    expect(body).not.toHaveProperty("error");
  });

  it("GET /email/check shape", async () => {
    const app = createApp();
    const res = await app.request("/email/check?name=contract1", {}, mockEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { available: boolean; name: string };
    expect(typeof body.available).toBe("boolean");
    expect(body.name).toBe("contract1");
  });

  it("GET /health shape", async () => {
    const app = createApp();
    const res = await app.request("/health", {}, mockEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string; ready: boolean };
    expect(body.service).toBe("temp-mail-api");
    expect(typeof body.ready).toBe("boolean");
  });
});
