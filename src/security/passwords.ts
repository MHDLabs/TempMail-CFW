import { constantTimeCompare } from "./tokens";

/**
 * Admin password verification for single-operator deployments.
 * PANEL_PASSWORD is the shared secret from Cloudflare Secrets.
 *
 * We apply a fixed PBKDF2 stretch to both sides so comparison is not a raw
 * fast string compare of the secret in all code paths, and rate limiting
 * (see rateLimit service) remains the primary brute-force control.
 */
export async function verifyAdminPassword(
  candidate: string,
  expectedPlain: string,
): Promise<boolean> {
  if (!candidate || !expectedPlain) return false;
  if (candidate.length > 256 || expectedPlain.length > 256) return false;

  const [a, b] = await Promise.all([
    stretch(candidate),
    stretch(expectedPlain),
  ]);
  return constantTimeCompare(a, b);
}

async function stretch(value: string): Promise<string> {
  const enc = new TextEncoder();
  // Static public salt — secret is the password itself; goal is work-factor, not storage
  const salt = enc.encode("tempmail-cfw-admin-v1");
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(value),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
}
