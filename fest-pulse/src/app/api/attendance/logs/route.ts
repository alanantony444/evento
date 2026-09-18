import { NextResponse } from "next/server";
import { getDatabase, getFallbackStore } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const zoneId = searchParams.get("zoneId");
    const limit = parseInt(searchParams.get("limit") || "30", 10);

    const db = await getDatabase();
    let logs: any[] = [];

    if (db) {
      const filter = zoneId ? { zoneId } : {};
      logs = await db
        .collection<any>("checkin_logs")
        .find(filter)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
    } else {
      const store = getFallbackStore();
      logs = store.checkins
        .filter((c) => !zoneId || c.zoneId === zoneId)
        .slice(0, limit);
    }

    return NextResponse.json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error) {
    console.error("Attendance logs error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
