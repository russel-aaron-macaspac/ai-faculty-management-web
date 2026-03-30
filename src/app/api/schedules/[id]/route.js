import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { type, subjectOrRole, room, dayOfWeek, startTime, endTime } = body;

    if (!type || !subjectOrRole || !dayOfWeek || !startTime || !endTime) {
      return NextResponse.json(
        { error: "type, subjectOrRole, dayOfWeek, startTime, and endTime are required" },
        { status: 400 }
      );
    }

    if (!["class", "shift"].includes(type)) {
      return NextResponse.json(
        { error: 'type must be "class" or "shift"' },
        { status: 400 }
      );
    }

    if (startTime > endTime) {
      return NextResponse.json(
        { error: "startTime must be before endTime" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    // Get the schedule with its shift_id
    const { data: schedule, error: fetchError } = await supabase
      .from("schedules")
      .select("schedule_id, shift_id")
      .eq("schedule_id", id)
      .single();

    if (fetchError || !schedule) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
    }

    // Update the shift
    const { error: shiftError } = await supabase
      .from("shifts")
      .update({
        shift_name: subjectOrRole,
        start_time: startTime,
        end_time: endTime,
      })
      .eq("shift_id", schedule.shift_id);

    if (shiftError) {
      console.error("[SCHEDULE PUT shift update ERROR]", shiftError);
      return NextResponse.json(
        { error: "Failed to update shift" },
        { status: 500 }
      );
    }

    // Update the schedule
    const { data: updatedSchedule, error: scheduleError } = await supabase
      .from("schedules")
      .update({
        day_of_week: dayOfWeek,
        type,
        subject_or_role: subjectOrRole,
        room: room || null,
      })
      .eq("schedule_id", id)
      .select()
      .single();

    if (scheduleError) {
      console.error("[SCHEDULE PUT ERROR]", scheduleError);
      return NextResponse.json(
        { error: "Failed to update schedule" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Schedule updated successfully", data: updatedSchedule });
  } catch (err) {
    console.error("[SCHEDULE PUT ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const supabase = createSupabaseAdminClient();

    const { data: schedule, error: fetchError } = await supabase
      .from("schedules")
      .select("schedule_id, shift_id")
      .eq("schedule_id", id)
      .single();

    if (fetchError || !schedule) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
    }

    const { error: scheduleDeleteError } = await supabase
      .from("schedules")
      .delete()
      .eq("schedule_id", id);

    if (scheduleDeleteError) {
      console.error("[SCHEDULE DELETE ERROR]", scheduleDeleteError);
      return NextResponse.json(
        { error: "Failed to delete schedule" },
        { status: 500 }
      );
    }

    await supabase
      .from("shifts")
      .delete()
      .eq("shift_id", schedule.shift_id);

    return NextResponse.json({ message: "Schedule deleted successfully" });
  } catch (err) {
    console.error("[SCHEDULE DELETE ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}