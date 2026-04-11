import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

function statusForRole(role) {
  if (role === "dean") return "pending_dean";
  if (role === "ovpaa") return "pending_ovpaa";
  if (role === "registrar" || role === "hro") return "pending_registrar";
  return null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
    const status = statusForRole(role);

    if (!status) {
      return NextResponse.json({ data: [] });
    }

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("schedules")
      .select(
        `
        id,
        faculty_id,
        subject_id,
        room_id,
        day,
        start_time,
        end_time,
        status,
        created_by,
        remarks,
        faculty:users!schedules_faculty_id_fkey (
          user_id,
          first_name,
          middle_name,
          last_name
        ),
        subject:subjects!schedules_subject_id_fkey (
          id,
          code,
          name
        ),
        room:rooms!schedules_room_id_fkey (
          id,
          name
        )
      `
      )
      .eq("status", status)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[SCHEDULING PENDING ERROR]", error);
      return NextResponse.json({ error: "Failed to fetch pending schedules" }, { status: 500 });
    }

    return NextResponse.json({
      data: (data || []).map((row) => ({
        id: row.id,
        facultyId: String(row.faculty_id),
        facultyName: row.faculty
          ? [row.faculty.first_name, row.faculty.middle_name, row.faculty.last_name].filter(Boolean).join(" ")
          : "Unknown",
        subject: row.subject,
        room: row.room,
        day: row.day,
        startTime: String(row.start_time).slice(0, 5),
        endTime: String(row.end_time).slice(0, 5),
        status: row.status,
        remarks: row.remarks,
        createdBy: row.created_by,
      })),
    });
  } catch (err) {
    console.error("[SCHEDULING PENDING ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
