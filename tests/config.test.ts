import { describe, expect, it } from "vitest";
import { assertBindings, loadConfig } from "../src/config";
import type { Env } from "../src/types/env";

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    R2: {} as R2Bucket,
    KV: {} as KVNamespace,
    EMAIL_DOMAINS: "mail.example.com,alt.example.com",
    ...overrides,
  };
}

describe("loadConfig", () => {
  it("parses domains and defaults", () => {
    const cfg = loadConfig(baseEnv());
    expect(cfg.domains).toEqual(["mail.example.com", "alt.example.com"]);
    expect(cfg.defaultDomain).toBe("mail.example.com");
    expect(cfg.inboxTtlSeconds).toBe(3600);
    expect(cfg.maxNameLength).toBe(32);
  });

  it("honours numeric overrides", () => {
    const cfg = loadConfig(
      baseEnv({
        INBOX_TTL_SECONDS: "7200",
        MAX_NAME_LENGTH: "16",
      }),
    );
    expect(cfg.inboxTtlSeconds).toBe(7200);
    expect(cfg.maxNameLength).toBe(16);
  });

  it("handles empty domains", () => {
    const cfg = loadConfig(baseEnv({ EMAIL_DOMAINS: "" }));
    expect(cfg.domains).toEqual([]);
    expect(cfg.defaultDomain).toBe("");
  });
});

describe("assertBindings", () => {
  it("passes when DB KV R2 present", () => {
    expect(assertBindings(baseEnv())).toEqual({ ok: true });
  });

  it("reports missing bindings", () => {
    const result = assertBindings(baseEnv({ DB: undefined as unknown as D1Database }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("DB");
    }
  });
});
