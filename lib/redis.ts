import { Redis } from "@upstash/redis";

// Upstash Redis client — works over HTTP, no persistent connection needed
// Works seamlessly with Vercel serverless functions
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const LOCK_TTL_SECONDS = 10; // How long a lock is held before auto-release
export const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24; // 24 hours

/**
 * Acquire a distributed lock using Redis SETNX.
 * Returns true if lock acquired, false if already held.
 */
export async function acquireLock(key: string): Promise<boolean> {
  const result = await redis.set(key, "1", {
    nx: true, // Only set if not exists
    ex: LOCK_TTL_SECONDS,
  });
  return result === "OK";
}

/**
 * Release a distributed lock.
 */
export async function releaseLock(key: string): Promise<void> {
  await redis.del(key);
}

/**
 * Get idempotency record from Redis.
 */
export async function getIdempotencyRecord(
  key: string
): Promise<{ status: number; body: string } | null> {
  const record = await redis.get<{ status: number; body: string }>(
    `idem:${key}`
  );
  return record;
}

/**
 * Store idempotency record in Redis with 24h TTL.
 */
export async function setIdempotencyRecord(
  key: string,
  status: number,
  body: string
): Promise<void> {
  await redis.set(
    `idem:${key}`,
    { status, body },
    { ex: IDEMPOTENCY_TTL_SECONDS }
  );
}
