import { Hono } from "hono";
import { assertBindings } from "../config";
import type { AppVariables, Env } from "../types/env";

export const healthRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

healthRoutes.get("/health", (c) => {
  const bindings = assertBindings(c.env);
  const ready = bindings.ok;
  return c.json({
    status: ready ? "ok" : "degraded",
    ready,
    service: "temp-mail-api",
    ...(bindings.ok ? {} : { missing: bindings.missing }),
  });
});

healthRoutes.get("/api/v1/health", (c) => {
  const bindings = assertBindings(c.env);
  return c.json({
    status: bindings.ok ? "ok" : "degraded",
    ready: bindings.ok,
    service: "temp-mail-api",
    request_id: c.get("requestId"),
  });
});
