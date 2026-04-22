// route.js
import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";
import { detectScheduleConflicts, generateConflictSuggestions } from "@/lib/scheduling/conflictDetection";
import { getInitialStatusForCreator } from "@/lib/scheduling/approvalWorkflow";

/* SELECT fragments for GET */
const BASE_SCHEDULE_SELECT = `
  id,
  faculty_id,
  subject_id,
  room_id,
  day,
  start_time,
  end_time,
  status,
  created_by,
  approved_by,
  approved_at,
  remarks,
  faculty:users!schedules_faculty_id_fkey (
    user_id,
    employee_no,
    supabase_id,
    first_name,
    middle_name,
    last_name,
    email
  ),
  subject:subjects!schedules_subject_id_fkey (
    id,
    code,
    name
  ),
  room:rooms!schedules_room_id_fkey (
    id,
    name,
    capacity
  )
`;

const SCHEDULE_SELECT_WITH_SECTION = `
  id,
  faculty_id,
  section,
  subject_id,
  room_id,
  day,
  start_time,
  end_time,
  status,
  created_by,
  approved_by,
  approved_at,
  remarks,
  faculty:users!schedules_faculty_id_fkey (
    user_id,
    employee_no,
    supabase_id,
    first_name,
    middle_name,
    last_name,
    email
  ),
  subject:subjects!schedules_subject_id_fkey (
    id,
    code,
    name
  ),
  room:rooms!schedules_room_id_fkey (
    id,
    name,
    capacity
  )
`;

/* Helpers */
function isMissingSectionColumnError(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return message.includes("column") && message.includes("section") && message.includes("does not exist");
}

function looksLikeInteger(value) {
  if (value == null) return false;
  return /^-?\d+$/.test(String(value));
}

function looksLikeUUID(value) {
  if (value == null) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value));
}

/* Safe candidate search */
async function findUserCandidates(supabase, term, limit = 8) {
  if (!term) return [];
  const t = String(term).trim();
  const orFilter = `first_name.ilike.%${t}%,last_name.ilike.%${t}%,email.ilike.%${t}%,employee_no.ilike.%${t}%`;

  const { data, error } = await supabase
    .from("users")
    .select("user_id, employee_no, supabase_id, first_name, middle_name, last_name, email")
    .or(orFilter)
    .limit(limit);

  if (error) {
    console.error("[FIND USER CANDIDATES ERROR]", error);
    return [];
  }
  return data || [];
}

/* Resolver */
async function resolveUserIdentifier(supabase, identifier) {
  if (!identifier) return { userId: null, userUuid: null, debug: "no identifier provided", candidates: [] };
  const s = String(identifier).trim();

  // numeric user_id
  if (looksLikeInteger(s)) {
    const { data, error } = await supabase
      .from("users")
      .select("user_id, supabase_id, employee_no, first_name, last_name, email")
      .eq("user_id", parseInt(s, 10))
      .maybeSingle();
    if (!error && data) return { userId: data.user_id, userUuid: data.supabase_id ?? null, debug: "matched user_id", candidates: [] };
  }

  // employee_no
  {
    const { data, error } = await supabase
      .from("users")
      .select("user_id, supabase_id, employee_no, first_name, last_name, email")
      .ilike("employee_no", s)
      .maybeSingle();
    if (!error && data) return { userId: data.user_id, userUuid: data.supabase_id ?? null, debug: "matched employee_no", candidates: [] };
  }

  // supabase_id
  if (looksLikeUUID(s)) {
    const { data, error } = await supabase
      .from("users")
      .select("user_id, supabase_id, employee_no, first_name, last_name, email")
      .eq("supabase_id", s)
      .maybeSingle();
    if (!error && data) return { userId: data.user_id, userUuid: data.supabase_id ?? null, debug: "matched supabase_id", candidates: [] };
  }

  // email
  if (s.includes("@")) {
    const { data, error } = await supabase
      .from("users")
      .select("user_id, supabase_id, employee_no, first_name, last_name, email")
      .ilike("email", s)
      .maybeSingle();
    if (!error && data) return { userId: data.user_id, userUuid: data.supabase_id ?? null, debug: "matched email", candidates: [] };
  }

  // exact first + last
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    const { data, error } = await supabase
      .from("users")
      .select("user_id, supabase_id, employee_no, first_name, last_name, email")
      .ilike("first_name", first)
      .ilike("last_name", last)
      .maybeSingle();
    if (!error && data) return { userId: data.user_id, userUuid: data.supabase_id ?? null, debug: "matched first+last", candidates: [] };
  }

  // loose candidates
  const candidates = await findUserCandidates(supabase, s, 8);
  if (candidates && candidates.length === 1) {
    const c = candidates[0];
    return { userId: c.user_id ?? null, userUuid: c.supabase_id ?? null, debug: "single loose match auto-selected", candidates: [] };
  }

  return { userId: null, userUuid: null, debug: "no match", candidates: candidates || [] };
}

/* Normalize HH:MM (returns "HH:MM") */
function normalizeHHMM(t) {
  if (!t) return t;
  const parts = String(t).trim().split(":");
  const hh = (parts[0] || "0").padStart(2, "0");
  const mm = (parts[1] || "00").padStart(2, "0");
  return `${hh}:${mm}`;
}

/* GET handler */
export async function GET(request) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const facultyId = searchParams.get("facultyId");

    let query = supabase
      .from("schedules")
      .select(SCHEDULE_SELECT_WITH_SECTION)
      .order("day", { ascending: true })
      .order("start_time", { ascending: true });

    if (facultyId) {
      query = query.eq("faculty_id", facultyId);
    }

    let { data, error } = await query;

    if (error && isMissingSectionColumnError(error)) {
      let fallbackQuery = supabase
        .from("schedules")
        .select(BASE_SCHEDULE_SELECT)
        .order("day", { ascending: true })
        .order("start_time", { ascending: true });

      if (facultyId) {
        fallbackQuery = fallbackQuery.eq("faculty_id", facultyId);
      }

      const fallbackResponse = await fallbackQuery;
      data = fallbackResponse.data;
      error = fallbackResponse.error;
    }

    if (error) {
      console.error("[SCHEDULING GET ERROR]", error);
      return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 });
    }

    const formatted = (data || []).map((row) => {
      const facultyName = row.faculty
        ? [row.faculty.first_name, row.faculty.middle_name, row.faculty.last_name].filter(Boolean).join(" ")
        : "Unknown";

      return {
        id: row.id,
        facultyId: String(row.faculty_id),
        section: row.section ?? null,
        subjectId: row.subject_id,
        roomId: row.room_id,
        day: row.day,
        startTime: String(row.start_time).slice(0, 5),
        endTime: String(row.end_time).slice(0, 5),
        status: row.status,
        createdBy: row.created_by,
        approvedBy: row.approved_by,
        approvedAt: row.approved_at,
        remarks: row.remarks,
        facultyName,
        subject: row.subject,
        room: row.room,
        employeeName: facultyName,
        dayOfWeek: row.day,
        subjectOrRole: row.subject?.name || "",
        type: "class",
      };
    });

    return NextResponse.json({ data: formatted });
  } catch (err) {
    console.error("[SCHEDULING GET ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* POST handler */
export async function POST(request) {
  try {
    const body = await request.json();
    const { facultyId, section, subjectId, roomId, day, startTime, endTime, createdBy, creatorRole } = body;

    if (!facultyId || !subjectId || !roomId || !day || !startTime || !endTime || !createdBy) {
      return NextResponse.json(
        { error: "facultyId, subjectId, roomId, day, startTime, endTime, and createdBy are required" },
        { status: 400 }
      );
    }

    // Normalize times to HH:MM
    const normalizedStart = normalizeHHMM(startTime);
    const normalizedEnd = normalizeHHMM(endTime);

    if (normalizedStart >= normalizedEnd) {
      return NextResponse.json({ error: "startTime must be before endTime" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    console.info("[SCHEDULING POST] raw facultyId:", facultyId, "createdBy:", createdBy);

    let resolvedFaculty = { userId: null, userUuid: null, debug: null, candidates: [] };
    if (looksLikeUUID(facultyId)) {
      const { data: byUuid, error: uuidErr } = await supabase
        .from("users")
        .select("user_id, supabase_id, employee_no, first_name, middle_name, last_name, email")
        .eq("supabase_id", facultyId)
        .maybeSingle();
      if (!uuidErr && byUuid) {
        resolvedFaculty = { userId: byUuid.user_id, userUuid: byUuid.supabase_id, debug: "matched supabase_id direct", candidates: [] };
      }
    }
    if (!resolvedFaculty.userId && !resolvedFaculty.userUuid) {
      resolvedFaculty = await resolveUserIdentifier(supabase, facultyId);
    }

    if (!resolvedFaculty.userId && resolvedFaculty.userUuid && looksLikeUUID(resolvedFaculty.userUuid)) {
      const { data: byUuid, error: uuidErr } = await supabase
        .from("users")
        .select("user_id, supabase_id")
        .eq("supabase_id", resolvedFaculty.userUuid)
        .maybeSingle();
      if (!uuidErr && byUuid) resolvedFaculty.userId = byUuid.user_id;
    }

    if (!resolvedFaculty.userId && !resolvedFaculty.userUuid) {
      const candidates = resolvedFaculty.candidates && resolvedFaculty.candidates.length ? resolvedFaculty.candidates : await findUserCandidates(supabase, facultyId, 8);
      return NextResponse.json(
        {
          error: "Faculty not found",
          debug: resolvedFaculty.debug,
          received: facultyId,
          candidates: candidates.map((c) => ({
            user_id: c.user_id,
            employee_no: c.employee_no,
            supabase_id: c.supabase_id,
            name: [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" "),
            email: c.email,
          })),
        },
        { status: 400 }
      );
    }

    let resolvedCreator = { userId: null, userUuid: null, debug: null, candidates: [] };
    if (looksLikeInteger(createdBy)) {
      const { data, error } = await supabase
        .from("users")
        .select("user_id, supabase_id")
        .eq("user_id", parseInt(createdBy, 10))
        .maybeSingle();
      if (!error && data) resolvedCreator = { userId: data.user_id, userUuid: data.supabase_id ?? null, debug: "matched creator by numeric user_id", candidates: [] };
    }
    if (!resolvedCreator.userId && looksLikeUUID(createdBy)) {
      const { data: byUuid, error: uuidErr } = await supabase
        .from("users")
        .select("user_id, supabase_id")
        .eq("supabase_id", createdBy)
        .maybeSingle();
      if (!uuidErr && byUuid) resolvedCreator = { userId: byUuid.user_id, userUuid: byUuid.supabase_id, debug: "matched creator supabase_id", candidates: [] };
    }
    if (!resolvedCreator.userId && !resolvedCreator.userUuid) {
      resolvedCreator = await resolveUserIdentifier(supabase, createdBy);
    }
    if (!resolvedCreator.userId && resolvedCreator.userUuid && looksLikeUUID(resolvedCreator.userUuid)) {
      const { data: byUuid, error: uuidErr } = await supabase
        .from("users")
        .select("user_id, supabase_id")
        .eq("supabase_id", resolvedCreator.userUuid)
        .maybeSingle();
      if (!uuidErr && byUuid) resolvedCreator.userId = byUuid.user_id;
    }
    if (!resolvedCreator.userId) {
      const candidates = resolvedCreator.candidates && resolvedCreator.candidates.length ? resolvedCreator.candidates : await findUserCandidates(supabase, createdBy, 8);
      return NextResponse.json(
        {
          error: "Creator not found",
          debug: resolvedCreator.debug,
          received: createdBy,
          candidates: candidates.map((c) => ({
            user_id: c.user_id,
            employee_no: c.employee_no,
            supabase_id: c.supabase_id,
            name: [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" "),
            email: c.email,
          })),
        },
        { status: 400 }
      );
    }
    console.info("[SCHEDULING POST] resolvedFaculty:", resolvedFaculty);
    console.info("[SCHEDULING POST] resolvedCreator:", resolvedCreator);
    let conflictResult = { hasConflict: false };
    try {
      conflictResult = await detectScheduleConflicts(supabase, {
        userId: resolvedFaculty.userId ?? null,
        userUuid: resolvedFaculty.userUuid ?? null,
        roomId,
        day,
        startTime: normalizedStart,
        endTime: normalizedEnd,
      });
    } catch (confErr) {
      console.error("[CONFLICT DETECTION ERROR]", confErr);
      return NextResponse.json({ error: "Conflict detection failed", details: String(confErr) }, { status: 500 });
    }

    if (conflictResult.hasConflict) {
      const suggestions = await generateConflictSuggestions(supabase, {
        userId: resolvedFaculty.userId ?? null,
        userUuid: resolvedFaculty.userUuid ?? null,
        day,
        startTime: normalizedStart,
        endTime: normalizedEnd,
      });

      return NextResponse.json(
        {
          error: "Schedule conflict detected",
          conflict_type: conflictResult.conflict_type,
          conflicts: conflictResult.conflicts,
          suggestions,
        },
        { status: 409 }
      );
    }

    const insertPayload = {
      faculty_id: resolvedFaculty.userId ?? undefined,
      subject_id: subjectId,
      room_id: roomId,
      day,
      start_time: normalizedStart,
      end_time: normalizedEnd,
      status: getInitialStatusForCreator(creatorRole),
      created_by: resolvedCreator.userId ?? undefined,
      ...(section ? { section } : {}),
    };

    if (resolvedFaculty.userUuid && looksLikeUUID(resolvedFaculty.userUuid)) {
      insertPayload.faculty_id_uuid = resolvedFaculty.userUuid;
    }

    Object.keys(insertPayload).forEach((k) => {
      if (insertPayload[k] === undefined) delete insertPayload[k];
    });

    console.info("[SCHEDULING POST] insertPayload:", insertPayload);

    let { data: inserted, error: insertError } = await supabase
      .from("schedules")
      .insert(insertPayload)
      .select("id")
      .maybeSingle();

    if (insertError && section && isMissingSectionColumnError(insertError)) {
      const fallbackPayload = { ...insertPayload };
      delete fallbackPayload.section;

      console.info("[SCHEDULING POST] retrying insert without section:", fallbackPayload);

      const fallbackInsert = await supabase
        .from("schedules")
        .insert(fallbackPayload)
        .select("id")
        .maybeSingle();

      inserted = fallbackInsert.data;
      insertError = fallbackInsert.error;
    }

    if (insertError) {
      console.error("[SCHEDULING POST ERROR]", insertError);
      console.error("[SCHEDULING POST PAYLOAD]", insertPayload);
      return NextResponse.json({ error: "Failed to create schedule", details: insertError.message }, { status: 500 });
    }

    if (!inserted) {
      console.error("[SCHEDULING POST ERROR] No row returned after insert");
      return NextResponse.json({ error: "Schedule insert returned no data" }, { status: 500 });
    }

    return NextResponse.json({ message: "Schedule created", id: inserted.id }, { status: 201 });
  } catch (err) {
    console.error("[SCHEDULING POST ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
