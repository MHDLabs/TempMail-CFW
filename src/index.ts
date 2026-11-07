import { createApp } from "./app";
import { runCleanup } from "./services/cleanupService";
import { ingestEmail } from "./services/emailIngestService";
import type { Env } from "./types/env";
import { log } from "./utils/log";

const app = createApp();

function isApiPath(pathname: string): boolean {
  return (
    pathname === "/health" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/email") ||
    pathname.startsWith("/auth/")
  );
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (isApiPath(url.pathname)) {
      return app.fetch(request, env, ctx);
    }
    const assets = env.ASSETS;
    if (assets) {
      return assets.fetch(request);
    }
    return app.fetch(request, env, ctx);
  },

  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const result = await ingestEmail(message, env);
      if (result.status === "rejected" || result.status === "failed") {
        log("info", "email not stored", {
          status: result.status,
          reason: result.reason ?? "unknown",
          to: message.to,
        });
      }
    } catch (err) {
      log("error", "email handler failure", {
        error: err instanceof Error ? err.message : "unknown",
        to: message.to,
      });
      try {
        message.setReject("Temporary failure");
      } catch {
        /* already rejected */
      }
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runCleanup(env).catch((err) => {
        log("error", "scheduled cleanup failed", {
          error: err instanceof Error ? err.message : "unknown",
        });
      }),
    );
  },
};
