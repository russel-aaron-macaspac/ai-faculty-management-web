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
    const limit = Number.parseInt(searchParams.get("limit") ?? "300", 10);

    const [{ data: clearanceLogs, error: clearanceError }, { data: scheduleLogs, error: scheduleError }] =
      await Promise.all([
        supabase
          .from("clearance_audit_log")
          .select(
            `
            id,
            clearance_id,
            action,
            performed_by,
            performer_role,
            details,
            created_at,
            clearance:clearances!clearance_audit_log_clearance_id_fkey (
              document_id,
              user:users!clearances_user_id_fkey ( first_name, middle_name, last_name ),
              office:offices!clearance_documents_office_id_fkey ( name )
            )
          `
          )
          .order("created_at", { ascending: false })
          .limit(limit),
        supabase
          .from("schedule_approvals")
          .select(
            `
            id,
            schedule_id,
            role,
            action,
            remarks,
            created_at,
            schedule:schedules!schedule_approvals_schedule_id_fkey (
              id,
              faculty:users!schedules_faculty_id_fkey ( first_name, middle_name, last_name ),
              subject:subjects!schedules_subject_id_fkey ( code, name )
            )
          `
          )
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);

    if (clearanceError) {
      console.error("[AUDIT LOG] clearance_audit_log error", clearanceError);
    }
    if (scheduleError) {
      console.error("[AUDIT LOG] schedule_approvals error", scheduleError);
    }

    const clearanceEntries = (clearanceLogs || []).map((row) => {
      const facultyName = fullName(row.clearance?.user) ?? "Unknown employee";
      const officeName = row.clearance?.office?.name ?? "Unknown office";

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
      const facultyName = fullName(row.schedule?.faculty) ?? "Unknown faculty";
      const subjectLabel = row.schedule?.subject
        ? `${row.schedule.subject.code} - ${row.schedule.subject.name}`
        : `Schedule #${row.schedule_id}`;

      return {
        id: `schedule-${row.id}`,
        timestamp: row.created_at,
        actorName: null,
        actorRole: row.role ?? null,
        category: "Schedule",
        action: row.action ?? "updated",
        target: `${subjectLabel} \u2014 ${facultyName}`,
        details: row.remarks ?? null,
      };
    });

    const combined = [...clearanceEntries, ...scheduleEntries].sort((a, b) => {
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