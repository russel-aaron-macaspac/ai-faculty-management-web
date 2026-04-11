export const SCHEDULE_STATUSES = [
  "pending_program_chair",
  "pending_dean",
  "pending_ovpaa",
  "pending_registrar",
  "approved",
  "rejected",
];

export const APPROVAL_ROLES = ["dean", "ovpaa", "registrar", "hro"];

export function getInitialStatusForCreator(role) {
  if (role === "program_chair") {
    return "pending_dean";
  }

  return "pending_program_chair";
}

export function canRoleActOnStatus(role, status) {
  if (role === "dean") return status === "pending_dean";
  if (role === "ovpaa") return status === "pending_ovpaa";
  if (role === "registrar" || role === "hro") return status === "pending_registrar";
  return false;
}

export function resolveNextStatus({ currentStatus, role, action }) {
  if (action === "reject") {
    return "rejected";
  }

  if (role === "dean" && currentStatus === "pending_dean") {
    return "pending_ovpaa";
  }

  if (role === "ovpaa" && currentStatus === "pending_ovpaa") {
    return "pending_registrar";
  }

  if ((role === "registrar" || role === "hro") && currentStatus === "pending_registrar") {
    return "approved";
  }

  return null;
}
