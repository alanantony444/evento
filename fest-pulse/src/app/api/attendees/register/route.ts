import { NextResponse } from "next/server";
import { getDatabase, getFallbackStore } from "@/lib/mongodb";
import { computeCentroidDescriptor } from "@/lib/biometrics";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, phone, ticketTier, college, nfcTagId, faceDescriptors, avatarUrl } = body;

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    const attendeeId = "att_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    const newAttendee = {
      _id: attendeeId,
      name,
      email,
      phone: phone || "",
      ticketTier: ticketTier || "General",
      college: college || "Participant",
      nfcTagId: nfcTagId || "",
      avatarUrl: avatarUrl || "",
      hasBiometrics: Array.isArray(faceDescriptors) && faceDescriptors.length > 0,
      enrolledAt: new Date().toISOString(),
    };

    let centroidDescriptor: number[] | null = null;
    if (newAttendee.hasBiometrics) {
      centroidDescriptor = computeCentroidDescriptor(faceDescriptors);
    }

    const db = await getDatabase();
    if (db) {
      await db.collection<any>("attendees").insertOne(newAttendee);
      if (centroidDescriptor) {
        await db.collection<any>("face_biometrics").insertOne({
          attendeeId,
          descriptor: centroidDescriptor,
          samplesCount: faceDescriptors.length,
          createdAt: new Date(),
        });
      }
    } else {
      // In-memory fallback
      const store = getFallbackStore();
      store.attendees.unshift(newAttendee);
      if (centroidDescriptor) {
        store.biometrics.push({
          attendeeId,
          descriptor: centroidDescriptor,
          samplesCount: faceDescriptors.length,
          createdAt: new Date(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Attendee registered successfully",
      attendee: newAttendee,
      hasBiometrics: Boolean(centroidDescriptor),
      hasNFC: Boolean(nfcTagId),
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
