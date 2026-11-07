import { Hono } from "hono";
import type { AppVariables, Env } from "../types/env";
import { getDb } from "../storage/d1";
import { getKv } from "../storage/kv";

export const healthRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

healthRoutes.get("/health", async (c) => {
  const checks: Record<string, boolean> = {
    config: false,
    d1: false,
    kv: false,
  };

  try {
    const cfg = c.get("config");
    checks.config = Boolean(cfg?.domains?.length);
  } catch {
    checks.config = false;
  }

  try {
    const db = getDb(c.env);
    await db.prepare("SELECT 1 AS ok").first();
    checks.d1 = true;
  } catch {
    checks.d1 = false;
  }

  try {
    const kv = getKv(c.env);
    await kv.get("__health__");
    checks.kv = true;
  } catch {
    checks.kv = false;
  }

  const ready = checks.config && checks.d1 && checks.kv;
  return c.json(
    {
      status: ready ? "ok" : "degraded",
      ready,
      service: "temp-mail-api",
      checks,
    },
    ready ? 200 : 503,
  );
});
