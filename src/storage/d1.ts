import type { Env } from "../types/env";

/** Thin D1 access helper. Repositories should use this rather than env.DB directly. */
export function getDb(env: Env): D1Database {
  if (!env.DB) {
    throw new Error("D1 binding DB is missing");
  }
  return env.DB;
}
