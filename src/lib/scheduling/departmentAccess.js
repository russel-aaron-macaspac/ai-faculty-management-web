export async function getDepartmentScope(supabase, actorId, actorRole) {
  if ((!actorId && !actorRole) || actorRole === "admin") {
    return { isAdmin: true, departmentId: null, actor: null };
  }

  if (actorRole !== "program_chair" || !actorId) {
    return { isAdmin: false, departmentId: null, actor: null };
  }

  const identifier = String(actorId).trim();
  let query = supabase
    .from("users")
    .select("user_id, supabase_id, role, department_id")
    .eq("role", "program_chair");

  query = /^\d+$/.test(identifier)
    ? query.eq("user_id", Number(identifier))
    : query.eq("supabase_id", identifier);

  const { data: actor, error } = await query.maybeSingle();
  if (error || !actor) {
    return { isAdmin: false, departmentId: null, actor: null };
  }

  return {
    isAdmin: false,
    departmentId: actor.department_id ?? null,
    actor,
  };
}

export function hasDepartmentAccess(scope, departmentId) {
  return scope.isAdmin || (scope.departmentId != null && String(scope.departmentId) === String(departmentId));
}