import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "../src/email/sanitizeHtml";

describe("sanitizeHtml", () => {
  it("strips scripts", () => {
    const out = sanitizeHtml(`<p>Hi</p><script>alert(1)</script>`);
    expect(out).toContain("<p>");
    expect(out.toLowerCase()).not.toContain("script");
  });

  it("blocks javascript urls", () => {
    const out = sanitizeHtml(`<a href="javascript:alert(1)">x</a>`);
    expect(out).not.toContain("javascript:");
  });

  it("allows safe https links", () => {
    const out = sanitizeHtml(`<a href="https://example.com">x</a>`);
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain("noopener");
  });

  it("removes images and remote resources", () => {
    const out = sanitizeHtml(`<img src="https://track.example/pixel.gif"><p>ok</p>`);
    expect(out.toLowerCase()).not.toContain("<img");
    expect(out).toContain("<p>");
  });
});
