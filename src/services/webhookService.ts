import type { Env } from "../types/env";
import { log } from "../utils/log";

export type WebhookPayload = {
  event: "message.received";
  inbox: string;
  message_id: string;
  from: string;
  subject: string;
  date: string | null;
  otp: { code: string; kind: string } | null;
  received_at: string;
};

function isSafeWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (host.endsWith(".local")) return false;
    // Basic private-range checks
    if (/^(10\.|192\.168\.|169\.254\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Optional outbound webhook with bounded timeout.
 * Failures never fail email ingestion.
 */
export async function dispatchMessageWebhook(
  env: Env,
  payload: WebhookPayload,
): Promise<void> {
  const url = env.WEBHOOK_URL;
  if (!url) return;
  if (!isSafeWebhookUrl(url)) {
    log("warn", "webhook url rejected");
    return;
  }

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "TempMail-CFW/0.1",
  };

  const secret = env.WEBHOOK_SECRET;
  if (secret) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
    headers["X-TempMail-Signature"] = `sha256=${hex}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      log("warn", "webhook non-2xx", { status: res.status });
    }
  } catch (err) {
    log("warn", "webhook dispatch failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
  } finally {
    clearTimeout(timer);
  }
}
