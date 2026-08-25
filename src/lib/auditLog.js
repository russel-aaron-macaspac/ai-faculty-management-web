export async function recordAuditEvent(supabase, event) {
  const { error } = await supabase.from("audit_log").insert({
    actor_name: event.actorName ?? null,
    actor_role: event.actorRole ?? null,
    category: event.category,
    action: event.action,
    target: event.target,
    details: event.details ?? null,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[AUDIT LOG EVENT ERROR]", error);
  }
}

export async function recordClearanceAuditEvent(supabase, event) {
  const { error } = await supabase.from("clearance_audit_log").insert({
    clearance_id: event.clearanceId,
    action: event.action,
    performed_by: event.actorName ?? event.actorId ?? null,
    performer_role: event.actorRole ?? null,
    details: event.details == null ? null : JSON.stringify(event.details),
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[CLEARANCE AUDIT LOG EVENT ERROR]", error);
  }
}