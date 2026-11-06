import type { Env } from "../types/env";

export function getKv(env: Env): KVNamespace {
  if (!env.KV) {
    throw new Error("KV binding is missing");
  }
  return env.KV;
}
