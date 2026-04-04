import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

function todayDate() {
  return new Date().toISOString().split("T")[0];
}

function resolveStatus(shiftStartTime) {
  if (!shiftStartTime) return "present";

  const today = todayDate();
  const [h, m, s] = shiftStartTime.split(":").map(Number);
  const shiftStart = new Date(
    `${today}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s ?? 0).padStart(2, "0")}`
  );

  const GRACE_MINUTES = 15;
  shiftStart.setMinutes(shiftStart.getMinutes() + GRACE_MINUTES);

  return new Date() > shiftStart ? "late" : "present";
}

export async function POST(request) {
  try {
    const { uid, device_id } = await request.json();

    if (!uid) {
      return NextResponse.json(
        { error: "UID is required" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const normalizedUID = uid.trim().toUpperCase();
    const today = todayDate();
    const now = new Date().toISOString();

    // 1. Find user by RFID UID
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("user_id, first_name, middle_name, last_name, role, status, employee_no, office_id")
      .eq("rfid_card_uid", normalizedUID)
      .eq("status", "active")
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Card not registered or user inactive" },
        { status: 401 }
      );
    }

    const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const { data: schedule } = await supabase
      .from("schedules")
      .select("schedule_id, shifts ( start_time, end_time )")
      .eq("user_id", user.user_id)
      .eq("day_of_week", dayOfWeek)
      .lte("effective_date", today)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: existingLog, error: logError } = await supabase
      .from("attendance_logs")
      .select("log_id, time_in, time_out, status")
      .eq("user_id", user.user_id)
      .eq("log_date", today)
      .maybeSingle();

    if (logError) throw logError;

    const full_name = [user.first_name, user.middle_name, user.last_name]
      .filter(Boolean)
      .join(" ");

    if (!existingLog) {
      const status = resolveStatus(schedule?.shifts?.start_time ?? null);

      const { error: insertError } = await supabase
        .from("attendance_logs")
        .insert({
          user_id: user.user_id,
          schedule_id: schedule?.schedule_id ?? null,
          log_date: today,
          time_in: now,
          status,
          remarks: `RFID scan via ${device_id ?? "unknown"}`,
        });

      if (insertError) throw insertError;

      return NextResponse.json({
        action: "TIME-IN",
        status,
        user: { id: user.user_id, full_name, role: user.role },
        timestamp: now,
      });
    }

    if (existingLog.time_in && !existingLog.time_out) {
      const { error: updateError } = await supabase
        .from("attendance_logs")
        .update({
          time_out: now,
          remarks: `RFID scan via ${device_id ?? "unknown"}`,
        })
        .eq("log_id", existingLog.log_id);

      if (updateError) throw updateError;

      return NextResponse.json({
        action: "TIME-OUT",
        status: existingLog.status,
        user: { id: user.user_id, full_name, role: user.role },
        timestamp: now,
      });
    }

    return NextResponse.json(
      { error: "Attendance already recorded for today" },
      { status: 409 }
    );
  } catch (err) {
    console.error("[ATTENDANCE ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? todayDate();
    const user_id = searchParams.get("user_id");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") ?? "100", 10);

    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("attendance_logs")
      .select(`
        log_id,
        log_date,
        time_in,
        time_out,
        status,
        remarks,
        created_at,
        users (
          user_id,
          employee_no,
          first_name,
          middle_name,
          last_name,
          role
        )
      `)
      .eq("log_date", date)
      .order("time_in", { ascending: true })
      .limit(limit);

    if (user_id) query = query.eq("user_id", Number(user_id));
    if (status) query = query.eq("status", status);

    const { data: records, error } = await query;

    if (error) throw error;

    return NextResponse.json({ date, count: records.length, records });
  } catch (err) {
    console.error("[ATTENDANCE ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}