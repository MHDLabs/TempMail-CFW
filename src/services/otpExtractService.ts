/**
 * Deterministic extraction of common one-time codes from subject/text.
 * No ML / AI — ordered heuristics only.
 */

export type ExtractedCode = {
  code: string;
  kind: "otp" | "numeric" | "alphanumeric";
  source: "subject" | "text";
};

const PATTERNS: Array<{ kind: ExtractedCode["kind"]; re: RegExp }> = [
  // Explicit OTP / verification / code labels
  {
    kind: "otp",
    re: /(?:one[-\s]?time(?:\s+pass(?:code|word))?|otp|verification code|security code|auth(?:entication)? code|login code|your code is|code[:\s]+)\s*[:\-]?\s*[`'"“]?([A-Z0-9]{4,8})[`'"”]?/i,
  },
  // Standalone 6-digit (most common)
  { kind: "numeric", re: /\b(\d{6})\b/ },
  // 4–8 digit sequences near "code"
  { kind: "numeric", re: /code[^A-Z0-9]{0,12}(\d{4,8})/i },
  // Alphanumeric 6–8 near code
  { kind: "alphanumeric", re: /code[^A-Z0-9]{0,12}([A-Z0-9]{6,8})\b/i },
];

function firstMatch(source: "subject" | "text", content: string): ExtractedCode | null {
  if (!content) return null;
  for (const { kind, re } of PATTERNS) {
    const m = content.match(re);
    if (m?.[1]) {
      return { code: m[1], kind, source };
    }
  }
  return null;
}

/**
 * Prefer subject, then body text. Returns at most one best code.
 */
export function extractOtp(input: {
  subject?: string | null;
  text?: string | null;
}): ExtractedCode | null {
  const fromSubject = firstMatch("subject", input.subject ?? "");
  if (fromSubject) return fromSubject;
  return firstMatch("text", input.text ?? "");
}
