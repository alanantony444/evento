import { NextResponse } from "next/server";
import { getDatabase, getFallbackStore } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.toLowerCase() || "";
    const tier = searchParams.get("tier");

    const db = await getDatabase();
    let attendees: any[] = [];

    if (db) {
      const filter: any = {};
      if (tier && tier !== "ALL") {
        filter.ticketTier = tier;
      }
      if (query) {
        filter.$or = [
          { name: { $regex: query, $options: "i" } },
          { email: { $regex: query, $options: "i" } },
          { nfcTagId: { $regex: query, $options: "i" } },
        ];
      }
      attendees = await db.collection<any>("attendees").find(filter).sort({ enrolledAt: -1 }).toArray();
    } else {
      const store = getFallbackStore();
      attendees = store.attendees.filter((att) => {
        const matchesQuery =
          !query ||
          att.name.toLowerCase().includes(query) ||
          att.email.toLowerCase().includes(query) ||
          (att.nfcTagId && att.nfcTagId.toLowerCase().includes(query));
        const matchesTier = !tier || tier === "ALL" || att.ticketTier === tier;
        return matchesQuery && matchesTier;
      });
    }

    return NextResponse.json({
      success: true,
      count: attendees.length,
      attendees,
    });
  } catch (error) {
    console.error("Attendee list error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
