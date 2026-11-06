import { createApp } from "./app";
import type { Env } from "./types/env";
import { log } from "./utils/log";

const app = createApp();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  /**
   * Email Routing entry. Full MIME pipeline is Phase 5.
   * Foundation rejects cleanly so misconfigured routing is visible.
   */
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    log("info", "email handler invoked (scaffold)", {
      to: message.to,
      from: message.from,
    });
    message.setReject("TempMail-CFW email engine not enabled in this build phase");
  },
};
