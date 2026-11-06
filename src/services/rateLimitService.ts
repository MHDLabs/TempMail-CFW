import { getKv } from "../storage/kv";
import type { Env } from "../types/env";
import { Errors } from "../utils/errors";

export type RateLimitAction = "login" | "create_inbox" | "read_inbox";

const WINDOWS: Record<RateLimitAction, { limit: number; windowSeconds: number }> = {
  login: { limit: 10, windowSeconds: 300 },
  create_inbox: { limit: 30, windowSeconds: 600 },
  read_inbox: { limit: 120, windowSeconds: 60 },
};

/**
 * Fixed-window rate limit via KV. Eventual consistency is acceptable.
 * Key pattern: rl:{action}:{bucket}:{id}
 */
export async function assertRateLimit(
  env: Env,
  action: RateLimitAction,
  id: string,
): Promise<void> {
  const cfg = WINDOWS[action];
  const bucket = Math.floor(Date.now() / 1000 / cfg.windowSeconds);
  const key = `rl:${action}:${bucket}:${id}`;
  const kv = getKv(env);

  const currentRaw = await kv.get(key);
  const current = currentRaw ? Number.parseInt(currentRaw, 10) : 0;
  if (Number.isFinite(current) && current >= cfg.limit) {
    throw Errors.tooManyAttempts(`Rate limit exceeded for ${action}`);
  }

  const next = (Number.isFinite(current) ? current : 0) + 1;
  await kv.put(key, String(next), { expirationTtl: cfg.windowSeconds + 60 });
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
