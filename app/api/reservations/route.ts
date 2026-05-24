import { NextRequest, NextResponse } from "next/server";
import { ReserveRequestSchema } from "@/lib/schemas";
import { createReservation } from "@/lib/reservation";
import { getIdempotencyRecord, setIdempotencyRecord } from "@/lib/redis";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const parsed = ReserveRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { productId, warehouseId, quantity } = parsed.data;
    const idempotencyKey = request.headers.get("Idempotency-Key") ?? undefined;

    // ── Idempotency check ─────────────────────────────────────────────────
    if (idempotencyKey) {
      try {
        const cached = await getIdempotencyRecord(idempotencyKey);
        if (cached) {
          // Return the original response — no side effects on retry
          return new NextResponse(cached.body, {
            status: cached.status,
            headers: {
              "Content-Type": "application/json",
              "X-Idempotent-Replayed": "true",
            },
          });
        }
      } catch {
        // Redis unavailable — proceed without idempotency
        console.warn("[reservations POST] Redis unavailable for idempotency check");
      }
    }

    // ── Core reservation logic ────────────────────────────────────────────
    const result = await createReservation(
      { productId, warehouseId, quantity },
      idempotencyKey
    );

    if (!result.success) {
      const status =
        result.code === "INSUFFICIENT_STOCK"
          ? 409
          : result.code === "LOCK_FAILED"
          ? 429
          : 404;

      const responseBody = JSON.stringify({ error: result.message, code: result.code });

      // Cache the error response for idempotency too
      if (idempotencyKey) {
        try {
          await setIdempotencyRecord(idempotencyKey, status, responseBody);
        } catch { /* best-effort */ }
      }

      return new NextResponse(responseBody, {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const responseBody = JSON.stringify({ reservation: result.reservation });

    // Store successful response for future idempotency retries
    if (idempotencyKey) {
      try {
        await setIdempotencyRecord(idempotencyKey, 201, responseBody);
      } catch { /* best-effort */ }
    }

    return new NextResponse(responseBody, {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[POST /api/reservations]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        product: true,
        warehouse: true,
      },
    });

    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    return NextResponse.json({ reservation });
  } catch (err) {
    console.error("[GET /api/reservations]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
