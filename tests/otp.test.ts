import { describe, expect, it } from "vitest";
import { extractOtp } from "../src/services/otpExtractService";

describe("extractOtp", () => {
  it("extracts labeled OTP from subject", () => {
    const r = extractOtp({ subject: "Your verification code is 482913", text: "" });
    expect(r?.code).toBe("482913");
    expect(r?.source).toBe("subject");
  });

  it("extracts 6-digit from body", () => {
    const r = extractOtp({
      subject: "Hello",
      text: "Use 193847 to continue signing in.",
    });
    expect(r?.code).toBe("193847");
    expect(r?.source).toBe("text");
  });

  it("prefers subject over body", () => {
    const r = extractOtp({
      subject: "Code: 111222",
      text: "Another 333444 appears here",
    });
    expect(r?.code).toBe("111222");
  });

  it("returns null when no code", () => {
    expect(extractOtp({ subject: "Hi", text: "No codes here" })).toBeNull();
  });
});
