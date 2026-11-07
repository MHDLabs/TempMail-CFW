import { Hono } from "hono";
import type { AppVariables, Env } from "../../types/env";
import {
  assertCsrf,
  buildSessionCookie,
  clearSessionCookie,
  loginAdmin,
  logoutAdmin,
  parseSessionCookie,
  requireAdminSession,
} from "../../services/authService";
import { assertRateLimit, clientIp } from "../../services/rateLimitService";
import { runCleanup } from "../../services/cleanupService";
import { getDb } from "../../storage/d1";
import { Errors } from "../../utils/errors";

export const v1AdminRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

v1AdminRoutes.post("/admin/login", async (c) => {
  await assertRateLimit(c.env, "login", clientIp(c.req.raw));
  let body: { password?: string } = {};
  try {
    body = (await c.req.json()) as { password?: string };
  } catch {
    throw Errors.invalidRequest("JSON body required");
  }
  if (typeof body.password !== "string" || !body.password) {
    throw Errors.invalidRequest("password required");
  }

  const config = c.get("config");
  const { sessionId, expiresAt } = await loginAdmin(c.env, config, body.password);
  c.header("Set-Cookie", buildSessionCookie(sessionId, expiresAt));
  return c.json({
    success: true,
    expires_at: expiresAt,
  });
});

v1AdminRoutes.post("/admin/logout", async (c) => {
  assertCsrf(c.req.raw);
  const raw = parseSessionCookie(c.req.header("Cookie"));
  await logoutAdmin(c.env, raw);
  c.header("Set-Cookie", clearSessionCookie());
  return c.json({ success: true });
});

v1AdminRoutes.get("/admin/session", async (c) => {
  const raw = parseSessionCookie(c.req.header("Cookie"));
  const session = await requireAdminSession(c.env, raw);
  return c.json({
    success: true,
    authenticated: true,
    expires_at: session.expires_at,
  });
});

v1AdminRoutes.get("/admin/inboxes", async (c) => {
  const raw = parseSessionCookie(c.req.header("Cookie"));
  await requireAdminSession(c.env, raw);
  const db = getDb(c.env);
  const result = await db
    .prepare(
      `SELECT id, address, created_at, expires_at, message_count
       FROM inboxes ORDER BY created_at DESC LIMIT 100`,
    )
    .all<{
      id: string;
      address: string;
      created_at: string;
      expires_at: string;
      message_count: number;
    }>();
  return c.json({
    success: true,
    inboxes: result.results ?? [],
  });
});

v1AdminRoutes.post("/admin/cleanup", async (c) => {
  assertCsrf(c.req.raw);
  const raw = parseSessionCookie(c.req.header("Cookie"));
  await requireAdminSession(c.env, raw);
  const stats = await runCleanup(c.env);
  return c.json({ success: true, ...stats });
});

v1AdminRoutes.post("/admin/ai/summary", async (c) => {
  assertCsrf(c.req.raw);
  const raw = parseSessionCookie(c.req.header("Cookie"));
  await requireAdminSession(c.env, raw);
  let body: { text?: string } = {};
  try {
    body = (await c.req.json()) as { text?: string };
  } catch {
    throw Errors.invalidRequest("JSON body required");
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) throw Errors.invalidRequest("text required");
  if (!c.env.AI) {
    // Free-tier friendly fallback without Workers AI binding
    const snippet = text.slice(0, 280).replace(/\s+/g, " ");
    return c.json({
      success: true,
      summary: snippet + (text.length > 280 ? "…" : ""),
      provider: "local-fallback",
    });
  }
  try {
    const result = (await c.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "system",
          content:
            "Summarize the email in 2 short sentences. If a verification/OTP code is present, state it clearly.",
        },
        { role: "user", content: text.slice(0, 4000) },
      ],
      max_tokens: 200,
    })) as { response?: string };
    return c.json({
      success: true,
      summary: result.response ?? "No summary",
      provider: "workers-ai",
    });
  } catch {
    const snippet = text.slice(0, 280).replace(/\s+/g, " ");
    return c.json({
      success: true,
      summary: snippet + (text.length > 280 ? "…" : ""),
      provider: "local-fallback",
    });
  }
});
