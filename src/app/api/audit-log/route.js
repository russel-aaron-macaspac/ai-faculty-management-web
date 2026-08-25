import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

function fullName(user) {
  if (!user) return null;
  return [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(" ") || null;
}

export async function GET(request) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const requestedLimit = Number.parseInt(searchParams.get("limit") ?? "300", 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 1000)
      : 300;

    const [{ data: clearanceLogs, error: clearanceError }, { data: scheduleLogs, error: scheduleError }, { data: generalLogs, error: generalError }] =
      await Promise.all([
        supabase
          .from("clearance_audit_log")
          .select("id, clearance_id, action, performed_by, performer_role, details, created_at")
          .order("created_at", { ascending: false })
          .limit(limit),
        supabase
          .from("schedule_approvals")
          .select("id, schedule_id, role, action, remarks, created_by, timestamp")
          .order("timestamp", { ascending: false })
          .limit(limit),
        supabase
          .from("audit_log")
          .select("id, actor_name, actor_role, category, action, target, details, created_at")
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);

    if (clearanceError) {
      console.error("[AUDIT LOG] clearance_audit_log error", clearanceError);
    }
    if (scheduleError) {
      console.error("[AUDIT LOG] schedule_approvals error", scheduleError);
    }
    if (generalError && generalError.code !== "PGRST205") {
      console.error("[AUDIT LOG] audit_log error", generalError);
    }
    const clearanceIds = [...new Set((clearanceLogs || []).map((row) => row.clearance_id).filter(Boolean))];
    const scheduleIds = [...new Set((scheduleLogs || []).map((row) => row.schedule_id).filter(Boolean))];
    const [{ data: clearances, error: clearancesError }, { data: schedules, error: schedulesError }] = await Promise.all([
      clearanceIds.length
        ? supabase.from("clearances").select("document_id, user_id, office_id").in("document_id", clearanceIds)
        : { data: [], error: null },
      scheduleIds.length
        ? supabase.from("schedules").select("id, faculty_id, subject_id, created_by").in("id", scheduleIds)
        : { data: [], error: null },
    ]);

    if (clearancesError || schedulesError) {
      console.error("[AUDIT LOG] related record lookup error", clearancesError || schedulesError);
    }

    const clearanceUserIds = [...new Set((clearances || []).map((row) => row.user_id).filter(Boolean))];
    const scheduleUserIds = [...new Set([
      ...(schedules || []).map((row) => row.faculty_id),
      ...(schedules || []).map((row) => row.created_by),
    ].filter(Boolean))];
    const officeIds = [...new Set((clearances || []).map((row) => row.office_id).filter(Boolean))];
    const subjectIds = [...new Set((schedules || []).map((row) => row.subject_id).filter(Boolean))];
    const [{ data: clearanceUsers }, { data: scheduleUsers }, { data: offices }, { data: subjects }] = await Promise.all([
      clearanceUserIds.length ? supabase.from("users").select("user_id, supabase_id, first_name, middle_name, last_name").in("supabase_id", clearanceUserIds) : { data: [] },
      scheduleUserIds.length ? supabase.from("users").select("user_id, supabase_id, first_name, middle_name, last_name").in("user_id", scheduleUserIds) : { data: [] },
      officeIds.length ? supabase.from("offices").select("office_id, name").in("office_id", officeIds) : { data: [] },
      subjectIds.length ? supabase.from("subjects").select("id, code, name").in("id", subjectIds) : { data: [] },
    ]);
    const clearanceById = new Map((clearances || []).map((row) => [row.document_id, row]));
    const scheduleById = new Map((schedules || []).map((row) => [row.id, row]));
    const userBySupabaseId = new Map((clearanceUsers || []).map((row) => [row.supabase_id, row]));
    const userById = new Map((scheduleUsers || []).map((row) => [row.user_id, row]));
    const officeById = new Map((offices || []).map((row) => [row.office_id, row]));
    const subjectById = new Map((subjects || []).map((row) => [row.id, row]));

    const clearanceEntries = (clearanceLogs || []).map((row) => {
      const clearance = clearanceById.get(row.clearance_id);
      const facultyName = fullName(userBySupabaseId.get(clearance?.user_id)) ?? "Unknown employee";
      const officeName = officeById.get(clearance?.office_id)?.name ?? "Unknown office";

      return {
        id: `clearance-${row.id}`,
        timestamp: row.created_at,
        actorName: row.performed_by ?? "System",
        actorRole: row.performer_role ?? null,
        category: "Clearance",
        action: row.action ?? "updated",
        target: `${officeName} clearance \u2014 ${facultyName}`,
        details: row.details ?? null,
      };
    });

    const scheduleEntries = (scheduleLogs || []).map((row) => {
      const schedule = scheduleById.get(row.schedule_id);
      const facultyName = fullName(userById.get(schedule?.faculty_id)) ?? "Unknown faculty";
      const subject = subjectById.get(schedule?.subject_id);
      const subjectLabel = subject
        ? `${subject.code} - ${subject.name}`
        : `Schedule #${row.schedule_id}`;

      return {
        id: `schedule-${row.id}`,
        timestamp: row.timestamp,
        actorName: schedule?.created_by
          ? fullName(userById.get(schedule.created_by))
          : (row.role ?? "System"),
        actorRole: row.role ?? null,
        category: "Schedule",
        action: row.action ?? "updated",
        target: `${subjectLabel} \u2014 ${facultyName}`,
        details: row.remarks ?? null,
      };
    });

    const generalEntries = (generalLogs || []).map((row) => ({
      id: `general-${row.id}`,
      timestamp: row.created_at,
      actorName: row.actor_name ?? "System",
      actorRole: row.actor_role ?? null,
      category: row.category === "Clearance" ? "Clearance" : "Schedule",
      action: row.action ?? "updated",
      target: row.target ?? "System event",
      details: row.details ?? null,
    }));

    const combined = [...clearanceEntries, ...scheduleEntries, ...generalEntries].sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    });

    return NextResponse.json({ data: combined });
  } catch (err) {
    console.error("[AUDIT LOG ERROR]", err);
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
  }
}