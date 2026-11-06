import { Hono } from "hono";
import { configMiddleware } from "./middleware/config";
import { errorHandler } from "./middleware/errorHandler";
import { requestIdMiddleware } from "./middleware/requestId";
import { securityHeadersMiddleware } from "./middleware/securityHeaders";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { legacyRoutes } from "./routes/legacy";
import { v1AdminRoutes } from "./routes/v1/admin";
import { v1InboxRoutes } from "./routes/v1/inboxes";
import { v1MessageRoutes } from "./routes/v1/messages";
import type { AppVariables, Env } from "./types/env";

export function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  app.use("*", requestIdMiddleware);
  app.use("*", securityHeadersMiddleware);
  app.use("*", configMiddleware);

  app.onError(errorHandler);

  app.route("/", healthRoutes);
  app.route("/", authRoutes);
  app.route("/", legacyRoutes);
  app.route("/api/v1", v1InboxRoutes);
  app.route("/api/v1", v1MessageRoutes);
  app.route("/api/v1", v1AdminRoutes);

  app.notFound((c) =>
    c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Not found" },
        request_id: c.get("requestId"),
      },
      404,
    ),
  );

  return app;
}

export type App = ReturnType<typeof createApp>;
