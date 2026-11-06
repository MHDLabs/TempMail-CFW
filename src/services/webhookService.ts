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

/**
 * Optional outbound webhook. Configure WEBHOOK_URL (and optionally WEBHOOK_SECRET).
 * Failures are logged and never fail email ingestion.
 */
export async function dispatchMessageWebhook(
  env: Env,
  payload: WebhookPayload,
): Promise<void> {
  const url = (env as Env & { WEBHOOK_URL?: string }).WEBHOOK_URL;
  if (!url) return;

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "TempMail-CFW/0.1",
  };

  const secret = (env as Env & { WEBHOOK_SECRET?: string }).WEBHOOK_SECRET;
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

  try {
    const res = await fetch(url, { method: "POST", headers, body });
    if (!res.ok) {
      log("warn", "webhook non-2xx", { status: res.status });
    }
  } catch (err) {
    log("warn", "webhook dispatch failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
