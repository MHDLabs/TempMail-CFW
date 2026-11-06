import type { MiddlewareHandler } from "hono";
import { loadConfig } from "../config";
import type { AppVariables, Env } from "../types/env";

export const configMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: AppVariables;
}> = async (c, next) => {
  c.set("config", loadConfig(c.env));
  await next();
};
