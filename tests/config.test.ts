import { describe, expect, it } from "vitest";
import { assertBindings, loadConfig } from "../src/config";
import type { Env } from "../src/types/env";
import { AppError } from "../src/utils/errors";

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
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
    expect(cfg.maxBodyChars).toBe(200_000);
  });

  it("honours numeric overrides", () => {
    const cfg = loadConfig(
      baseEnv({
        INBOX_TTL_SECONDS: "7200",
        MAX_BODY_CHARS: "1000",
      }),
    );
    expect(cfg.inboxTtlSeconds).toBe(7200);
    expect(cfg.maxBodyChars).toBe(1000);
  });

  it("throws when domains empty", () => {
    expect(() => loadConfig(baseEnv({ EMAIL_DOMAINS: "" }))).toThrow(AppError);
  });
});

describe("assertBindings", () => {
  it("passes when DB and KV present", () => {
    expect(() => assertBindings(baseEnv())).not.toThrow();
  });

  it("throws when DB missing", () => {
    expect(() =>
      assertBindings(baseEnv({ DB: undefined as unknown as D1Database })),
    ).toThrow(AppError);
  });
});
