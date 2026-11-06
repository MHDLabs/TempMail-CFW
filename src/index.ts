import { createApp } from "./app";
import { ingestEmail } from "./services/emailIngestService";
import type { Env } from "./types/env";
import { log } from "./utils/log";

const app = createApp();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const result = await ingestEmail(message, env);
      if (result.status === "rejected") {
        log("info", "email rejected", { reason: result.reason ?? "unknown", to: message.to });
      }
    } catch (err) {
      log("error", "email handler failure", {
        error: err instanceof Error ? err.message : "unknown",
        to: message.to,
      });
      try {
        message.setReject("Temporary failure");
      } catch {
        /* already rejected or closed */
      }
    }
  },
};
