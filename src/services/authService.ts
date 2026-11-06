import type { AppConfig, Env } from "../types/env";
import { getDb } from "../storage/d1";
import { generateToken, hashToken, constantTimeCompare } from "../security/tokens";
import { verifyAdminPassword } from "../security/passwords";
import { Errors } from "../utils/errors";

export const SESSION_COOKIE = "__Host-session";

export async function loginAdmin(
  env: Env,
  config: AppConfig,
  password: string,
): Promise<{ sessionId: string; expiresAt: string }> {
  if (!config.panelPassword) {
    throw Errors.serviceUnavailable("Admin password not configured");
  }
  const ok = await verifyAdminPassword(password, config.panelPassword);
  if (!ok) {
    throw Errors.unauthorized("Invalid credentials");
  }

  const raw = await generateToken(32);
  const idHash = await hashToken(raw);
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionTtlSeconds * 1000);
  const db = getDb(env);
  await db
    .prepare(`INSERT INTO sessions (id, created_at, expires_at) VALUES (?, ?, ?)`)
    .bind(idHash, now.toISOString(), expires.toISOString())
    .run();

  return { sessionId: raw, expiresAt: expires.toISOString() };
}

export async function logoutAdmin(env: Env, rawSessionId: string | null): Promise<void> {
  if (!rawSessionId) return;
  const idHash = await hashToken(rawSessionId);
  const db = getDb(env);
  await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(idHash).run();
}

export async function requireAdminSession(
  env: Env,
  rawSessionId: string | null,
): Promise<{ expires_at: string }> {
  if (!rawSessionId) throw Errors.unauthorized();
  const idHash = await hashToken(rawSessionId);
  const db = getDb(env);
  const row = await db
    .prepare(`SELECT id, expires_at FROM sessions WHERE id = ?`)
    .bind(idHash)
    .first<{ id: string; expires_at: string }>();
  if (!row) throw Errors.unauthorized();
  if (Date.parse(row.expires_at) <= Date.now()) {
    await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(idHash).run();
    throw Errors.unauthorized("Session expired");
  }
  return { expires_at: row.expires_at };
}

export function parseSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) {
      return decodeURIComponent(rest.join("=").trim()) || null;
    }
  }
  return null;
}

export function buildSessionCookie(sessionId: string, expiresAt: string): string {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  // __Host- requires Secure, path=/, no Domain
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

/** Simple CSRF: require matching custom header on state-changing cookie auth */
export function assertCsrf(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const header = request.headers.get("X-Requested-With");
  if (header !== "TempMail-CFW") {
    throw Errors.forbidden("Missing CSRF header");
  }
}
