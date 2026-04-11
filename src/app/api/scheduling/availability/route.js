import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const facultyId = searchParams.get("facultyId");

    if (!facultyId) {
      return NextResponse.json({ error: "facultyId is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("faculty_availability")
      .select("id, faculty_id, day, start_time, end_time")
      .eq("faculty_id", facultyId)
      .order("day", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.error("[AVAILABILITY GET ERROR]", error);
      return NextResponse.json({ error: "Failed to fetch availability" }, { status: 500 });
    }

    const formatted = (data || []).map((row) => ({
      id: row.id,
      facultyId: String(row.faculty_id),
      day: row.day,
      startTime: String(row.start_time).slice(0, 5),
      endTime: String(row.end_time).slice(0, 5),
    }));

    return NextResponse.json({ data: formatted });
  } catch (err) {
    console.error("[AVAILABILITY GET ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { facultyId, entries } = body;

    if (!facultyId || !Array.isArray(entries)) {
      return NextResponse.json({ error: "facultyId and entries are required" }, { status: 400 });
    }

    for (const entry of entries) {
      if (!entry.day || !entry.startTime || !entry.endTime) {
        return NextResponse.json({ error: "Each availability entry requires day, startTime, and endTime" }, { status: 400 });
      }

      if (entry.startTime >= entry.endTime) {
        return NextResponse.json({ error: "Availability startTime must be before endTime" }, { status: 400 });
      }
    }

    const supabase = createSupabaseAdminClient();

    const { error: deleteError } = await supabase
      .from("faculty_availability")
      .delete()
      .eq("faculty_id", facultyId);

    if (deleteError) {
      console.error("[AVAILABILITY PUT DELETE ERROR]", deleteError);
      return NextResponse.json({ error: "Failed to reset availability" }, { status: 500 });
    }

    if (entries.length === 0) {
      return NextResponse.json({ message: "Availability updated", data: [] });
    }

    const payload = entries.map((entry) => ({
      faculty_id: facultyId,
      day: entry.day,
      start_time: entry.startTime,
      end_time: entry.endTime,
    }));

    const { data, error: insertError } = await supabase
      .from("faculty_availability")
      .insert(payload)
      .select("id, faculty_id, day, start_time, end_time");

    if (insertError) {
      console.error("[AVAILABILITY PUT INSERT ERROR]", insertError);
      return NextResponse.json({ error: "Failed to save availability" }, { status: 500 });
    }

    return NextResponse.json({
      message: "Availability updated",
      data: (data || []).map((row) => ({
        id: row.id,
        facultyId: String(row.faculty_id),
        day: row.day,
        startTime: String(row.start_time).slice(0, 5),
        endTime: String(row.end_time).slice(0, 5),
      })),
    });
  } catch (err) {
    console.error("[AVAILABILITY PUT ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
