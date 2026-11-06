import type { Env } from "../types/env";

export function getR2(env: Env): R2Bucket {
  if (!env.R2) {
    throw new Error("R2 binding is missing");
  }
  return env.R2;
}
