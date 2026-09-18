import { NextResponse } from "next/server";
import { getDatabase, getFallbackStore } from "@/lib/mongodb";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { attendeeId, zoneId, gate, method, type } = body;

    if (!attendeeId || !zoneId) {
      return NextResponse.json({ error: "attendeeId and zoneId are required" }, { status: 400 });
    }

    const checkinType = type === "CHECK_OUT" ? "CHECK_OUT" : "CHECK_IN";
    const db = await getDatabase();

    let attendee: any = null;
    let zone: any = null;

    if (db) {
      attendee = await db.collection<any>("attendees").findOne({ _id: attendeeId });
      zone = await db.collection<any>("zones").findOne({ _id: zoneId });
    } else {
      const store = getFallbackStore();
      attendee = store.attendees.find((a) => a._id === attendeeId);
      zone = store.zones.find((z) => z._id === zoneId);
    }

    if (!attendee) {
      return NextResponse.json({ error: "Attendee not found" }, { status: 404 });
    }
    if (!zone) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    // Check capacity limit on check-in
    if (checkinType === "CHECK_IN" && zone.currentOccupancy >= zone.maxCapacity) {
      return NextResponse.json(
        {
          allowed: false,
          error: "ZONE_FULL",
          message: `Zone [${zone.name}] is at maximum capacity (${zone.currentOccupancy}/${zone.maxCapacity}). Entry temporarily restricted for safety.`,
          zone,
          attendee,
        },
        { status: 403 }
      );
    }

    // VIP Restricted check
    if (zone.category === "Restricted" && attendee.ticketTier !== "VIP" && attendee.ticketTier !== "All-Access") {
      return NextResponse.json(
        {
          allowed: false,
          error: "TIER_RESTRICTED",
          message: `Access Denied: [${zone.name}] requires VIP or All-Access pass. Current pass: ${attendee.ticketTier}`,
          zone,
          attendee,
        },
        { status: 403 }
      );
    }

    // New occupancy calculation
    const delta = checkinType === "CHECK_IN" ? 1 : -1;
    const newOccupancy = Math.max(0, (zone.currentOccupancy || 0) + delta);

    const logRecord = {
      _id: "chk_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      attendeeId: attendee._id,
      attendeeName: attendee.name,
      ticketTier: attendee.ticketTier,
      college: attendee.college,
      zoneId: zone._id,
      zoneName: zone.name,
      gate: gate || "Main Mobile Scanner",
      method: method || "FACE",
      type: checkinType,
      timestamp: new Date().toISOString(),
    };

    if (db) {
      await db.collection<any>("zones").updateOne({ _id: zoneId }, { $set: { currentOccupancy: newOccupancy } });
      await db.collection<any>("checkin_logs").insertOne(logRecord);
    } else {
      const store = getFallbackStore();
      zone.currentOccupancy = newOccupancy;
      store.checkins.unshift(logRecord);
    }

    const occupancyPercent = Math.round((newOccupancy / zone.maxCapacity) * 100);
    let crowdStatus = "Normal";
    if (occupancyPercent >= 95) crowdStatus = "Critical";
    else if (occupancyPercent >= 80) crowdStatus = "Warning";

    return NextResponse.json({
      success: true,
      allowed: true,
      type: checkinType,
      message: `${checkinType === "CHECK_IN" ? "Entry Granted" : "Exit Logged"}: ${attendee.name}`,
      log: logRecord,
      attendee,
      zone: {
        ...zone,
        currentOccupancy: newOccupancy,
        occupancyPercent,
        crowdStatus,
      },
    });
  } catch (error) {
    console.error("Checkin error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
