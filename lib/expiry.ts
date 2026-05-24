import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

/**
 * Release all expired PENDING reservations and return reserved units to stock.
 *
 * This is the heart of the lazy-cleanup + cron belt-and-suspenders approach:
 * - Called at the start of GET /api/products (lazy cleanup on read)
 * - Also called by the /api/cron/cleanup endpoint every 5 minutes
 */
export async function releaseExpiredReservations(): Promise<number> {
  // 1. Find all expired PENDING reservations
  const expired = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: new Date() },
    },
    select: { id: true, productId: true, warehouseId: true, quantity: true },
  });

  if (expired.length === 0) return 0;

  type ExpiredRow = (typeof expired)[number];

  // 2. For each expired reservation, return stock and mark as RELEASED
  //    We use a transaction to keep the two operations atomic
  await prisma.$transaction(
    expired.map((r: ExpiredRow): Prisma.PrismaPromise<unknown> =>
      prisma.warehouseStock.update({
        where: {
          productId_warehouseId: {
            productId: r.productId,
            warehouseId: r.warehouseId,
          },
        },
        data: {
          reservedUnits: { decrement: r.quantity },
        },
      })
    )
  );

  // 3. Bulk mark reservations as RELEASED
  await prisma.reservation.updateMany({
    where: {
      id: { in: expired.map((r: ExpiredRow) => r.id) },
    },
    data: {
      status: "RELEASED",
      releasedAt: new Date(),
    },
  });

  return expired.length;
}
