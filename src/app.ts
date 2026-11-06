import { Hono } from "hono";
import { configMiddleware } from "./middleware/config";
import { errorHandler } from "./middleware/errorHandler";
import { requestIdMiddleware } from "./middleware/requestId";
import { healthRoutes } from "./routes/health";
import { legacyRoutes } from "./routes/legacy";
import { v1InboxRoutes } from "./routes/v1/inboxes";
import type { AppVariables, Env } from "./types/env";

export function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  app.use("*", requestIdMiddleware);
  app.use("*", configMiddleware);

  app.onError(errorHandler);

  app.route("/", healthRoutes);
  app.route("/", legacyRoutes);
  app.route("/api/v1", v1InboxRoutes);

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
