import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { Env } from "../src/types/env";

function mockEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    R2: {} as R2Bucket,
    KV: {} as KVNamespace,
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

  it("legacy email returns service unavailable in foundation phase", async () => {
    const app = createApp();
    const res = await app.request("/email", { method: "POST" }, mockEnv());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
  });
});
