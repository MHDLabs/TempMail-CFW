import { describe, expect, it } from "vitest";
import { isValidLocalPart } from "../src/utils/validation";
import { constantTimeCompare, generateRandomName } from "../src/security/tokens";

describe("isValidLocalPart", () => {
  it("accepts valid names", () => {
    expect(isValidLocalPart("abc")).toBe(true);
    expect(isValidLocalPart("test_123")).toBe(true);
    expect(isValidLocalPart("a-b_c")).toBe(true);
  });

  it("rejects invalid names", () => {
    expect(isValidLocalPart("ab")).toBe(false);
    expect(isValidLocalPart("")).toBe(false);
    expect(isValidLocalPart("has space")).toBe(false);
    expect(isValidLocalPart("bad@name")).toBe(false);
    expect(isValidLocalPart("a".repeat(40))).toBe(false);
  });
});

describe("tokens", () => {
  it("generateRandomName produces hex of expected length", () => {
    const name = generateRandomName(8);
    expect(name).toMatch(/^[a-f0-9]{16}$/);
  });

  it("constantTimeCompare works", () => {
    expect(constantTimeCompare("abc", "abc")).toBe(true);
    expect(constantTimeCompare("abc", "abd")).toBe(false);
    expect(constantTimeCompare("abc", "ab")).toBe(false);
  });
});
