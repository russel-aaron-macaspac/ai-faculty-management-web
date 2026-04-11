import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";
import { canRoleActOnStatus, resolveNextStatus } from "@/lib/scheduling/approvalWorkflow";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { role, action, remarks, actorId } = body;

    if (!role || !action || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "role and valid action are required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: schedule, error: scheduleError } = await supabase
      .from("schedules")
      .select("id, status")
      .eq("id", id)
      .single();

    if (scheduleError || !schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    if (!canRoleActOnStatus(role, schedule.status)) {
      return NextResponse.json({ error: "Role cannot process this schedule status" }, { status: 403 });
    }

    const nextStatus = resolveNextStatus({
      currentStatus: schedule.status,
      role,
      action,
    });

    if (!nextStatus) {
      return NextResponse.json({ error: "Invalid workflow transition" }, { status: 400 });
    }

    const updatePayload = {
      status: nextStatus,
      approved_by: actorId || role,
      approved_at: new Date().toISOString(),
      remarks: remarks || null,
    };

    const { data: updated, error: updateError } = await supabase
      .from("schedules")
      .update(updatePayload)
      .eq("id", id)
      .select("id, status, approved_by, approved_at, remarks")
      .single();

    if (updateError) {
      console.error("[SCHEDULING APPROVAL UPDATE ERROR]", updateError);
      return NextResponse.json({ error: "Failed to update schedule status" }, { status: 500 });
    }

    const { error: logError } = await supabase.from("schedule_approvals").insert({
      schedule_id: id,
      role,
      action,
      remarks: remarks || null,
    });

    if (logError) {
      console.error("[SCHEDULING APPROVAL LOG ERROR]", logError);
    }

    return NextResponse.json({ message: "Schedule updated", data: updated });
  } catch (err) {
    console.error("[SCHEDULING APPROVAL ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
