import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";
import { detectScheduleConflicts, generateConflictSuggestions } from "@/lib/scheduling/conflictDetection";
import { getInitialStatusForCreator } from "@/lib/scheduling/approvalWorkflow";

export async function GET(request) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const facultyId = searchParams.get("facultyId");

    let query = supabase
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
        approved_by,
        approved_at,
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
          name,
          capacity
        )
      `
      )
      .order("day", { ascending: true })
      .order("start_time", { ascending: true });

    if (facultyId) {
      query = query.eq("faculty_id", facultyId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[SCHEDULING GET ERROR]", error);
      return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 });
    }

    const formatted = (data || []).map((row) => {
      const facultyName = row.faculty
        ? [row.faculty.first_name, row.faculty.middle_name, row.faculty.last_name].filter(Boolean).join(" ")
        : "Unknown";

      return {
        id: row.id,
        facultyId: String(row.faculty_id),
        subjectId: row.subject_id,
        roomId: row.room_id,
        day: row.day,
        startTime: String(row.start_time).slice(0, 5),
        endTime: String(row.end_time).slice(0, 5),
        status: row.status,
        createdBy: row.created_by,
        approvedBy: row.approved_by,
        approvedAt: row.approved_at,
        remarks: row.remarks,
        facultyName,
        subject: row.subject,
        room: row.room,

        // Backward-compatible fields used by existing widgets
        employeeName: facultyName,
        dayOfWeek: row.day,
        subjectOrRole: row.subject?.name || "",
        type: "class",
      };
    });

    return NextResponse.json({ data: formatted });
  } catch (err) {
    console.error("[SCHEDULING GET ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { facultyId, subjectId, roomId, day, startTime, endTime, createdBy, creatorRole } = body;

    if (!facultyId || !subjectId || !roomId || !day || !startTime || !endTime || !createdBy) {
      return NextResponse.json(
        { error: "facultyId, subjectId, roomId, day, startTime, endTime, and createdBy are required" },
        { status: 400 }
      );
    }

    if (startTime >= endTime) {
      return NextResponse.json({ error: "startTime must be before endTime" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const conflictResult = await detectScheduleConflicts(supabase, {
      facultyId,
      roomId,
      day,
      startTime,
      endTime,
    });

    if (conflictResult.hasConflict) {
      const suggestions = await generateConflictSuggestions(supabase, {
        facultyId,
        day,
        startTime,
        endTime,
      });

      return NextResponse.json(
        {
          error: "Schedule conflict detected",
          conflict_type: conflictResult.conflict_type,
          conflicts: conflictResult.conflicts,
          suggestions,
        },
        { status: 409 }
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from("schedules")
      .insert({
        faculty_id: facultyId,
        subject_id: subjectId,
        room_id: roomId,
        day,
        start_time: startTime,
        end_time: endTime,
        status: getInitialStatusForCreator(creatorRole),
        created_by: createdBy,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[SCHEDULING POST ERROR]", insertError);
      return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
    }

    return NextResponse.json({ message: "Schedule created", id: inserted.id }, { status: 201 });
  } catch (err) {
    console.error("[SCHEDULING POST ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
