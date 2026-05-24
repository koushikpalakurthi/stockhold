import { NextRequest, NextResponse } from "next/server";
import { confirmReservation } from "@/lib/reservation";
import { getIdempotencyRecord, setIdempotencyRecord } from "@/lib/redis";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const idempotencyKey = request.headers.get("Idempotency-Key") ?? undefined;

    // ── Idempotency check ─────────────────────────────────────────────────
    if (idempotencyKey) {
      try {
        const cached = await getIdempotencyRecord(`confirm:${idempotencyKey}`);
        if (cached) {
          return new NextResponse(cached.body, {
            status: cached.status,
            headers: {
              "Content-Type": "application/json",
              "X-Idempotent-Replayed": "true",
            },
          });
        }
      } catch {
        console.warn("[confirm] Redis unavailable for idempotency check");
      }
    }

    // ── Core confirm logic ─────────────────────────────────────────────────
    const result = await confirmReservation(id);

    let responseBody: string;
    let status: number;

    if (result.outcome === "NOT_FOUND") {
      status = 404;
      responseBody = JSON.stringify({ error: "Reservation not found" });
    } else if (result.outcome === "EXPIRED") {
      status = 410;
      responseBody = JSON.stringify({
        error: "Reservation has expired. The held units have been released.",
        code: "RESERVATION_EXPIRED",
      });
    } else if (result.outcome === "ALREADY_DONE") {
      status = 200;
      responseBody = JSON.stringify({
        message: `Reservation is already ${result.status.toLowerCase()}`,
        status: result.status,
      });
    } else {
      status = 200;
      responseBody = JSON.stringify({ reservation: result.reservation });
    }

    // Cache for idempotency
    if (idempotencyKey) {
      try {
        await setIdempotencyRecord(`confirm:${idempotencyKey}`, status, responseBody);
      } catch { /* best-effort */ }
    }

    return new NextResponse(responseBody, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[POST /api/reservations/${id}/confirm]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
