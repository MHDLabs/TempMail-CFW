import { describe, expect, it } from "vitest";
import { verifyAdminPassword } from "../src/security/passwords";
import {
  buildSessionCookie,
  clearSessionCookie,
  parseSessionCookie,
  SESSION_COOKIE,
} from "../src/services/authService";
import { clientIp } from "../src/services/rateLimitService";

describe("verifyAdminPassword", () => {
  it("accepts matching password", async () => {
    expect(await verifyAdminPassword("s3cret!", "s3cret!")).toBe(true);
  });

  it("rejects mismatch", async () => {
    expect(await verifyAdminPassword("s3cret!", "other")).toBe(false);
  });

  it("rejects empty", async () => {
    expect(await verifyAdminPassword("", "x")).toBe(false);
  });
});

describe("session cookie helpers", () => {
  it("parses and builds cookie", () => {
    const expires = new Date(Date.now() + 3600_000).toISOString();
    const header = buildSessionCookie("abc123", expires);
    expect(header).toContain(`${SESSION_COOKIE}=`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Strict");
    expect(parseSessionCookie(header.split(";")[0])).toBe("abc123");
    expect(parseSessionCookie(`${SESSION_COOKIE}=abc123; Path=/`)).toBe("abc123");
    expect(clearSessionCookie()).toContain("Max-Age=0");
  });
});

describe("clientIp", () => {
  it("prefers CF-Connecting-IP", () => {
    const req = new Request("https://example.com", {
      headers: {
        "CF-Connecting-IP": "1.2.3.4",
        "X-Forwarded-For": "9.9.9.9",
      },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });
});
