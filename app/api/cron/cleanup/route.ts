import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredReservations } from "@/lib/expiry";

// Vercel Cron: runs every 5 minutes (configured in vercel.json)
// Secured with CRON_SECRET to prevent unauthorized calls
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const released = await releaseExpiredReservations();
    console.log(`[cron/cleanup] Released ${released} expired reservations`);

    return NextResponse.json({
      success: true,
      releasedCount: released,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[GET /api/cron/cleanup]", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
