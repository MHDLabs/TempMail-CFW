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

function mockEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    R2: {} as R2Bucket,
    KV: mockKv(),
    EMAIL_DOMAINS: "example.com",
    ...overrides,
  };
}

describe("createApp", () => {
  it("registers health route", async () => {
    const app = createApp();
    const res = await app.request("/health", {}, mockEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string; ready: boolean };
    expect(body.service).toBe("temp-mail-api");
    expect(body.ready).toBe(true);
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("registers v1 health", async () => {
    const app = createApp();
    const res = await app.request("/api/v1/health", {}, mockEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { request_id: string };
    expect(body.request_id).toBeTruthy();
  });

  it("returns structured 404", async () => {
    const app = createApp();
    const res = await app.request("/no-such-route", {}, mockEnv());
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("POST /email creates inbox (legacy shape)", async () => {
    const app = createApp();
    const res = await app.request(
      "/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "alice" }),
      },
      mockEnv(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      success: boolean;
      email: string;
      token: string;
      expires_at: string;
    };
    expect(body.success).toBe(true);
    expect(body.email).toBe("alice@example.com");
    expect(body.token).toBeTruthy();
    expect(body.expires_at).toBeTruthy();
  });

  it("GET /email/check works", async () => {
    const app = createApp();
    const res = await app.request("/email/check?name=bob", {}, mockEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { available: boolean; name: string };
    expect(body.available).toBe(true);
    expect(body.name).toBe("bob");
  });

  it("POST /api/v1/inboxes returns id", async () => {
    const app = createApp();
    const res = await app.request(
      "/api/v1/inboxes",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      mockEnv(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean; id: string; email: string; token: string };
    expect(body.success).toBe(true);
    expect(body.id).toBeTruthy();
    expect(body.email).toContain("@example.com");
  });
});
