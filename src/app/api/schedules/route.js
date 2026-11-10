import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";
import { notifyAllUsers } from "@/lib/notifications";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("schedules")
      .select(
        `
        schedule_id,
        day_of_week,
        type,
        subject_or_role,
        room,
        user:users!schedules_user_id_fkey (
          user_id,
          first_name,
          middle_name,
          last_name
        ),
        shift:shifts!schedules_shift_id_fkey (
          start_time,
          end_time
        )
        `
      )
      .order("schedule_id", { ascending: false });

    if (error) {
      console.error("[SCHEDULES GET ERROR]", error);
      return NextResponse.json(
        { error: "Failed to fetch schedules" },
        { status: 500 }
      );
    }

    const formatted = data.map((s) => {
      const fullName = s.user
        ? [s.user.first_name, s.user.middle_name, s.user.last_name]
            .filter(Boolean)
            .join(" ")
        : "Unknown";

      const conflictWarning = data.some(
        (other) =>
          other.schedule_id !== s.schedule_id &&
          other.user?.user_id === s.user?.user_id &&
          other.day_of_week === s.day_of_week &&
          other.shift?.start_time < s.shift?.end_time &&
          other.shift?.end_time > s.shift?.start_time
      );

      return {
        id:             String(s.schedule_id),
        employeeId:     String(s.user?.user_id ?? ''),
        employeeName:   fullName,
        type:           s.type ?? "shift",
        subjectOrRole:  s.subject_or_role ?? "",
        room:           s.room ?? "",
        dayOfWeek:      s.day_of_week,
        startTime:      s.shift?.start_time?.slice(0, 5) ?? "",
        endTime:        s.shift?.end_time?.slice(0, 5)   ?? "",
        conflictWarning,
      };
    });

    return NextResponse.json({ data: formatted });
  } catch (err) {
    console.error("[SCHEDULES GET ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { employeeId, type, subjectOrRole, room, dayOfWeek, startTime, endTime } = body;

    console.log("[SCHEDULES POST BODY]", { employeeId, type, subjectOrRole, room, dayOfWeek, startTime, endTime });

    if (!employeeId || !type || !subjectOrRole || !dayOfWeek || !startTime || !endTime) {
      return NextResponse.json(
        { error: "employeeId, type, subjectOrRole, dayOfWeek, startTime, and endTime are required" },
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

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("user_id, status")
      .eq("user_id", employeeId)
      .single();

    console.log("[SCHEDULES POST USER]", { user, userError });
    if (userError || !user) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    if (user.status !== "active") {
      return NextResponse.json(
        { error: "Cannot assign a schedule to an inactive employee" },
        { status: 422 }
      );
    }

    const { data: shift, error: shiftError } = await supabase
      .from("shifts")
      .insert({
        shift_name:  subjectOrRole,
        start_time:  startTime,
        end_time:    endTime,
      })
      .select("shift_id")
      .single();

    if (shiftError) {
      console.error("[SCHEDULES POST shift insert ERROR]", shiftError);
      return NextResponse.json(
        { error: "Failed to create shift record" },
        { status: 500 }
      );
    }

    const { data: newSchedule, error: scheduleError } = await supabase
      .from("schedules")
      .insert({
        user_id:        employeeId,
        shift_id:       shift.shift_id,
        effective_date: new Date().toISOString().split("T")[0],
        day_of_week:    dayOfWeek,
        type,
        subject_or_role: subjectOrRole,
        room:            room || null,
      })
      .select("schedule_id")
      .single();

    if (scheduleError) {
      console.error("[SCHEDULES POST ERROR]", scheduleError);
      return NextResponse.json(
        { error: "Failed to create schedule" },
        { status: 500 }
      );
    }

    await notifyAllUsers(supabase, {
      title: "Schedule created",
      message: `A new schedule was created for employee #${employeeId}.`,
      type: "schedule_created",
      relatedId: String(newSchedule.schedule_id),
    });

    return NextResponse.json(
      { message: "Schedule created successfully", id: String(newSchedule.schedule_id) },
      { status: 201 }
    );
  } catch (err) {
    console.error("[SCHEDULES POST ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}