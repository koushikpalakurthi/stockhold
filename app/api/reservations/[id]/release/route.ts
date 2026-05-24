import { NextRequest, NextResponse } from "next/server";
import { releaseReservation } from "@/lib/reservation";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const result = await releaseReservation(id);

    if (result.outcome === "NOT_FOUND") {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    if (result.outcome === "ALREADY_DONE") {
      return NextResponse.json(
        {
          message: `Reservation is already ${result.status.toLowerCase()}`,
          status: result.status,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ reservation: result.reservation });
  } catch (err) {
    console.error(`[POST /api/reservations/${id}/release]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
