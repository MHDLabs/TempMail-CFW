import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "../src/email/sanitizeHtml";
import { readStreamBounded } from "../src/email/parse";

describe("sanitizeHtml", () => {
  it("strips script tags", () => {
    const out = sanitizeHtml('<p>Hi</p><script>alert(1)</script><b>ok</b>');
    expect(out).toContain("<p>Hi</p>");
    expect(out).toContain("<b>ok</b>");
    expect(out.toLowerCase()).not.toContain("<script");
  });

  it("strips event handlers", () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(out.toLowerCase()).not.toContain("onerror");
  });

  it("blocks javascript urls", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("handles empty", () => {
    expect(sanitizeHtml("")).toBe("");
  });
});

describe("readStreamBounded", () => {
  it("reads full stream under limit", async () => {
    const data = new TextEncoder().encode("hello world");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });
    const buf = await readStreamBounded(stream, 1000);
    expect(new TextDecoder().decode(buf)).toBe("hello world");
  });

  it("rejects oversize stream", async () => {
    const data = new TextEncoder().encode("abcdefghij");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });
    await expect(readStreamBounded(stream, 5)).rejects.toThrow("PAYLOAD_TOO_LARGE");
  });
});
