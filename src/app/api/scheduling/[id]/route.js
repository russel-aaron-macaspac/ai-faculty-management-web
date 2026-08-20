import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";
import { getInitialStatusForCreator } from "@/lib/scheduling/approvalWorkflow";

function isMissingSectionColumnError(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return message.includes("column") && message.includes("section") && message.includes("does not exist");
}

function normalizeHHMM(value) {
  if (!value) return value;

  const parts = String(value).trim().split(":");
  const hours = (parts[0] || "0").padStart(2, "0");
  const minutes = (parts[1] || "00").padStart(2, "0");

  return `${hours}:${minutes}`;
}

async function fetchScheduleById(supabase, id) {
  const { data, error } = await supabase
    .from("schedules")
    .select("id, faculty_id, subject_id, room_id, section, day, start_time, end_time, status, created_by")
    .eq("id", id)
    .single();

  return { data, error };
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { actorId, actorRole, facultyId, subjectId, roomId, section, day, startTime, endTime, units, lectureContactHours, labContactHours, classSize, loadType } = body;

    if (!actorId || !actorRole) {
      return NextResponse.json({ error: "actorId and actorRole are required" }, { status: 400 });
    }

    if (!facultyId || !subjectId || !roomId || !day || !startTime || !endTime) {
      return NextResponse.json(
        { error: "facultyId, subjectId, roomId, day, startTime, and endTime are required" },
        { status: 400 }
      );
    }

    if (!['regular', 'overload'].includes(loadType)) {
      return NextResponse.json({ error: "loadType must be regular or overload" }, { status: 400 });
    }

    const normalizedStart = normalizeHHMM(startTime);
    const normalizedEnd = normalizeHHMM(endTime);

    if (normalizedStart >= normalizedEnd) {
      return NextResponse.json({ error: "startTime must be before endTime" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: schedule, error: fetchError } = await fetchScheduleById(supabase, id);

    if (fetchError || !schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    if (actorRole !== "admin" && String(schedule.created_by) !== String(actorId)) {
      return NextResponse.json({ error: "You can only edit schedules you created" }, { status: 403 });
    }

    const updatePayload = {
      faculty_id: facultyId,
      subject_id: subjectId,
      room_id: roomId,
      day,
      start_time: normalizedStart,
      end_time: normalizedEnd,
      units: units ?? null,
      lecture_contact_hours: lectureContactHours ?? null,
      lab_contact_hours: labContactHours ?? null,
      class_size: classSize ?? null,
      load_type: loadType,
      approved_by: null,
      approved_at: null,
      remarks: null,
      status: getInitialStatusForCreator(actorRole),
    };

    if (section !== undefined) {
      updatePayload.section = section || null;
    }

    let { error: updateError } = await supabase.from("schedules").update(updatePayload).eq("id", id);

    if (updateError && section !== undefined && isMissingSectionColumnError(updateError)) {
      const fallbackPayload = { ...updatePayload };
      delete fallbackPayload.section;

      const fallbackUpdate = await supabase.from("schedules").update(fallbackPayload).eq("id", id);
      updateError = fallbackUpdate.error;
    }

    if (updateError) {
      console.error("[SCHEDULING UPDATE ERROR]", updateError);
      return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
    }

    return NextResponse.json({ message: "Schedule updated successfully" });
  } catch (err) {
    console.error("[SCHEDULING UPDATE ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { actorId, actorRole } = body;

    if (!actorId || !actorRole) {
      return NextResponse.json({ error: "actorId and actorRole are required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: schedule, error: fetchError } = await fetchScheduleById(supabase, id);

    if (fetchError || !schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    if (actorRole !== "admin" && String(schedule.created_by) !== String(actorId)) {
      return NextResponse.json({ error: "You can only delete schedules you created" }, { status: 403 });
    }

    const { error: deleteError } = await supabase.from("schedules").delete().eq("id", id);

    if (deleteError) {
      console.error("[SCHEDULING DELETE ERROR]", deleteError);
      return NextResponse.json({ error: "Failed to delete schedule" }, { status: 500 });
    }

    return NextResponse.json({ message: "Schedule deleted successfully" });
  } catch (err) {
    console.error("[SCHEDULING DELETE ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}