import { prisma } from "./prisma";
import { acquireLock, releaseLock } from "./redis";
import type { ReserveRequest } from "./schemas";

const RESERVATION_WINDOW_MINUTES = parseInt(
  process.env.RESERVATION_WINDOW_MINUTES ?? "10",
  10
);

export interface ReservationResult {
  success: true;
  reservation: {
    id: string;
    productId: string;
    warehouseId: string;
    quantity: number;
    status: string;
    expiresAt: Date;
    confirmedAt: Date | null;
    releasedAt: Date | null;
    createdAt: Date;
  };
}

export interface ReservationError {
  success: false;
  code: "INSUFFICIENT_STOCK" | "STOCK_NOT_FOUND" | "LOCK_FAILED";
  message: string;
}

/**
 * Create a reservation with race-condition safety.
 *
 * Strategy:
 * 1. Acquire a Redis distributed lock per (productId, warehouseId) — serializes
 *    concurrent requests for the same SKU, prevents thundering herd.
 * 2. Inside the lock, run a Prisma transaction that atomically:
 *    a. Checks that (totalUnits - reservedUnits) >= quantity
 *    b. Increments reservedUnits
 *    c. Inserts the Reservation row
 *
 * The atomic UPDATE at step 2 is the real safety net. Even if Redis is
 * unavailable (lock skipped), the Postgres check prevents oversell because
 * the constraint check + update happen in a single serializable transaction.
 */
export async function createReservation(
  req: ReserveRequest,
  idempotencyKey?: string
): Promise<ReservationResult | ReservationError> {
  const lockKey = `lock:reserve:${req.productId}:${req.warehouseId}`;
  let lockAcquired = false;

  try {
    // Step 1: Try to acquire distributed lock (best-effort — degrade gracefully)
    try {
      lockAcquired = await acquireLock(lockKey);
      if (!lockAcquired) {
        // Lock contention — another request is mid-flight for this SKU
        // Fall through to the DB transaction which will still be correct,
        // but we return an error to signal the client to retry
        return {
          success: false,
          code: "LOCK_FAILED",
          message:
            "Another reservation for this product is being processed. Please try again in a moment.",
        };
      }
    } catch {
      // Redis unavailable — proceed without the lock.
      // The DB transaction below is still atomic and correct.
      console.warn(
        "[reservation] Redis lock unavailable, proceeding without lock"
      );
      lockAcquired = false;
    }

    // Step 2: Atomic DB transaction
    const result = await prisma.$transaction(async (tx) => {
      // 2a. Fetch current stock with a row-level lock (SELECT FOR UPDATE in raw Postgres)
      //     Prisma doesn't expose SELECT FOR UPDATE directly, so we use $queryRaw
      const stocks = await tx.$queryRaw<
        Array<{
          id: string;
          totalUnits: number;
          reservedUnits: number;
          availableUnits: number;
        }>
      >`
        SELECT id, "totalUnits", "reservedUnits",
               ("totalUnits" - "reservedUnits") AS "availableUnits"
        FROM "WarehouseStock"
        WHERE "productId" = ${req.productId}
          AND "warehouseId" = ${req.warehouseId}
        FOR UPDATE
      `;

      if (stocks.length === 0) {
        throw new Error("STOCK_NOT_FOUND");
      }

      const stock = stocks[0];
      const available = Number(stock.availableUnits);

      if (available < req.quantity) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      // 2b. Atomically increment reservedUnits
      await tx.warehouseStock.update({
        where: {
          productId_warehouseId: {
            productId: req.productId,
            warehouseId: req.warehouseId,
          },
        },
        data: {
          reservedUnits: { increment: req.quantity },
        },
      });

      // 2c. Create the reservation row
      const expiresAt = new Date(
        Date.now() + RESERVATION_WINDOW_MINUTES * 60 * 1000
      );

      const reservation = await tx.reservation.create({
        data: {
          productId: req.productId,
          warehouseId: req.warehouseId,
          quantity: req.quantity,
          status: "PENDING",
          expiresAt,
          idempotencyKey: idempotencyKey ?? null,
        },
      });

      return reservation;
    });

    return { success: true, reservation: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";

    if (msg === "INSUFFICIENT_STOCK") {
      return {
        success: false,
        code: "INSUFFICIENT_STOCK",
        message: "Not enough stock available for this product at this warehouse.",
      };
    }

    if (msg === "STOCK_NOT_FOUND") {
      return {
        success: false,
        code: "STOCK_NOT_FOUND",
        message: "No stock record found for this product and warehouse combination.",
      };
    }

    throw err; // Re-throw unexpected errors
  } finally {
    // Always release the lock if we acquired it
    if (lockAcquired) {
      try {
        await releaseLock(lockKey);
      } catch {
        // Best-effort release — lock will auto-expire after LOCK_TTL_SECONDS
      }
    }
  }
}

/**
 * Confirm a reservation (payment succeeded).
 * Returns null if not found, "EXPIRED" if past expiresAt, "ALREADY_DONE" if not PENDING.
 */
export async function confirmReservation(id: string): Promise<
  | { outcome: "CONFIRMED"; reservation: { id: string; status: string; confirmedAt: Date | null } }
  | { outcome: "NOT_FOUND" }
  | { outcome: "EXPIRED" }
  | { outcome: "ALREADY_DONE"; status: string }
> {
  const reservation = await prisma.reservation.findUnique({ where: { id } });

  if (!reservation) return { outcome: "NOT_FOUND" };
  if (reservation.status === "CONFIRMED") {
    return { outcome: "ALREADY_DONE", status: "CONFIRMED" };
  }
  if (reservation.status === "RELEASED") {
    return { outcome: "ALREADY_DONE", status: "RELEASED" };
  }
  // PENDING — check expiry
  if (reservation.expiresAt <= new Date()) {
    // Auto-release the stock
    await releaseReservationById(id, reservation);
    return { outcome: "EXPIRED" };
  }

  const updated = await prisma.reservation.update({
    where: { id },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });

  return { outcome: "CONFIRMED", reservation: updated };
}

/**
 * Release a reservation (payment failed or user cancelled).
 */
export async function releaseReservation(id: string): Promise<
  | { outcome: "RELEASED"; reservation: { id: string; status: string } }
  | { outcome: "NOT_FOUND" }
  | { outcome: "ALREADY_DONE"; status: string }
> {
  const reservation = await prisma.reservation.findUnique({ where: { id } });

  if (!reservation) return { outcome: "NOT_FOUND" };
  if (reservation.status !== "PENDING") {
    return { outcome: "ALREADY_DONE", status: reservation.status };
  }

  const updated = await releaseReservationById(id, reservation);
  return { outcome: "RELEASED", reservation: updated };
}

/**
 * Internal helper — decrement reservedUnits and mark RELEASED in a transaction.
 */
async function releaseReservationById(
  id: string,
  reservation: { productId: string; warehouseId: string; quantity: number }
) {
  const [updated] = await prisma.$transaction([
    prisma.reservation.update({
      where: { id },
      data: { status: "RELEASED", releasedAt: new Date() },
    }),
    prisma.warehouseStock.update({
      where: {
        productId_warehouseId: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
      },
      data: { reservedUnits: { decrement: reservation.quantity } },
    }),
  ]);
  return updated;
}
