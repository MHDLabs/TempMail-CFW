import type { ErrorHandler } from "hono";
import type { AppVariables, Env } from "../types/env";
import { isAppError } from "../utils/errors";
import { log } from "../utils/log";

export const errorHandler: ErrorHandler<{
  Bindings: Env;
  Variables: AppVariables;
}> = (err, c) => {
  const requestId = c.get("requestId") ?? "unknown";

  if (isAppError(err)) {
    if (!err.expose || err.status >= 500) {
      log("error", err.message, { requestId, code: err.code, status: err.status });
    }
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.expose ? err.message : "Internal error",
        },
        request_id: requestId,
      },
      err.status as 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 503,
    );
  }

  log("error", err instanceof Error ? err.message : "Unknown error", {
    requestId,
    stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
  });

  return c.json(
    {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Internal error" },
      request_id: requestId,
    },
    500,
  );
};
