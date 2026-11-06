import type { MiddlewareHandler } from "hono";
import type { AppVariables, Env } from "../types/env";
import { createRequestId } from "../utils/requestId";

export const requestIdMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: AppVariables;
}> = async (c, next) => {
  const id = c.req.header("X-Request-Id") || createRequestId();
  c.set("requestId", id);
  await next();
  c.res.headers.set("X-Request-Id", id);
};
