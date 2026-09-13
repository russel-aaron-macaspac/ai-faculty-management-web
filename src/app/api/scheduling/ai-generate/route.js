import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ONLINE_ROOM_PATTERN = /online|virtual|remote|tbd|tba/i;

function toMinutes(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : Number.NaN;
}

function toTime(value) {
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}

function overlaps(start, end, otherStart, otherEnd) {
  return start < otherEnd && end > otherStart;
}

function hasFacultyTimeConflict(facultyBookings, day, start, end) {
  return facultyBookings.some((booking) => booking.day === day && overlaps(start, end, booking.start, booking.end));
}

function isOnlineRoom(name) {
  return ONLINE_ROOM_PATTERN.test(String(name || ""));
}

function normalizeSections(subject) {
  const sections = Array.isArray(subject.sections) ? subject.sections : [subject.section];
  return [...new Set(sections.map((value) => String(value || "").trim()).filter(Boolean))];
}

function scheduleSections(schedule) {
  return String(schedule.section || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function touchesExistingClass(bookings, day, start, end) {
  return bookings.some((booking) => booking.day === day && (booking.start === end || booking.end === start));
}

function preventsSectionSandwich(bookings, sections, day, start, end) {
  return sections.some((section) => {
    const sectionBookings = bookings
      .filter((booking) => booking.sections.includes(section) && booking.day === day)
      .sort((left, right) => left.start - right.start);
    const before = sectionBookings.some((booking) => booking.end === start);
    const after = sectionBookings.some((booking) => booking.start === end);
    return before && after;
  });
}

function scoreCandidate({ roomBookings, sectionBookings, sections, day, start, end, subjectDuration }) {
  let score = 0;
  const roomTouchesClass = touchesExistingClass(roomBookings, day, start, end);
  const touchesSchoolBoundary = start === 7 * 60 || end === 20 * 60;
  if (roomTouchesClass || touchesSchoolBoundary) score += 10;
  if (preventsSectionSandwich(sectionBookings, sections, day, start, end)) score += 10;

  const isAfternoon = start >= 12 * 60;
  const isMorning = end <= 12 * 60;
  if ((subjectDuration === 180 && isAfternoon) || (subjectDuration === 120 && isMorning)) score += 5;
  return score;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const roomId = String(body.roomId || "").trim();
    let assignments = [];
    if (Array.isArray(body.assignments)) {
      assignments = body.assignments;
    } else if (body.facultyId && Array.isArray(body.subjects)) {
      assignments = [{ facultyId: body.facultyId, subjects: body.subjects }];
    }
    const durationMinutes = Number(body.durationMinutes) || 90;
    const requestedClassSize = Number(body.classSize) || 0;
    const loadType = body.loadType || "regular";

    if (!roomId || assignments.length === 0) {
      return NextResponse.json({ error: "roomId and at least one faculty assignment are required" }, { status: 400 });
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      return NextResponse.json({ error: "durationMinutes must be a positive integer" }, { status: 400 });
    }
    if (!Number.isFinite(requestedClassSize) || requestedClassSize < 0) {
      return NextResponse.json({ error: "classSize must be a non-negative number" }, { status: 400 });
    }
    if (!["regular", "overload"].includes(loadType)) {
      return NextResponse.json({ error: "loadType must be regular or overload" }, { status: 400 });
    }
    if (assignments.some((assignment) => !assignment?.facultyId || !Array.isArray(assignment.subjects) || assignment.subjects.length === 0 || assignment.subjects.some((subject) => !subject || !String(subject.code || "").trim() || !String(subject.name || "").trim()))) {
      return NextResponse.json({ error: "Each faculty assignment requires a faculty and at least one subject with a code and name" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const facultyIds = [...new Set(assignments.map((assignment) => String(assignment.facultyId)))];
    const { data: faculties, error: facultyError } = await supabase.from("users").select("user_id, supabase_id, first_name, middle_name, last_name").in("user_id", facultyIds);
    if (facultyError) throw facultyError;
    if (faculties?.length !== facultyIds.length) return NextResponse.json({ error: "One or more faculty members were not found or have no Supabase UUID" }, { status: 400 });

    const facultyById = new Map(faculties.map((faculty) => [String(faculty.user_id), faculty]));
    const facultyUuidById = new Map(faculties.map((faculty) => [String(faculty.user_id), faculty.supabase_id]));
    const { data: availability, error: availabilityError } = await supabase.from("faculty_availability").select("faculty_id, day, start_time, end_time, delivery_mode").in("faculty_id", faculties.map((faculty) => faculty.supabase_id));
    if (availabilityError) throw availabilityError;

    const { data: assignedSchedules, error: assignedSchedulesError } = await supabase
      .from("schedules")
      .select("subject_id, faculty_id")
      .neq("status", "rejected");
    if (assignedSchedulesError) throw assignedSchedulesError;

    const unavailable = [];
    const availableAssignments = assignments.map((assignment) => ({
      ...assignment,
      facultyId: String(assignment.facultyId),
      subjects: assignment.subjects.filter((subject) => {
        const assignedElsewhere = (assignedSchedules || []).some((schedule) => String(schedule.subject_id) === String(subject.subjectId) && String(schedule.faculty_id) !== String(assignment.facultyId));
        if (assignedElsewhere) unavailable.push({ subjectId: subject.subjectId ?? null, facultyId: String(assignment.facultyId), code: String(subject.code).trim(), name: String(subject.name).trim(), reason: "This subject is already assigned to another faculty member." });
        return !assignedElsewhere;
      }),
    }));

    const campusAvailability = (availability || []).filter((row) => row.delivery_mode !== "online");
    const availableDays = [...new Set(campusAvailability.map((row) => row.day))];
    let existingSchedules = [];
    if (availableDays.length > 0) {
      const { data, error } = await supabase.from("schedules").select("faculty_id, room_id, section, day, start_time, end_time, status").in("day", availableDays).neq("status", "rejected");
      if (error) throw error;
      existingSchedules = data || [];
    }

    const { data: selectedRoom, error: roomError } = await supabase.from("rooms").select("id, name, capacity").eq("id", roomId).maybeSingle();
    if (roomError) throw roomError;
    if (!selectedRoom) return NextResponse.json({ error: "Selected room was not found" }, { status: 400 });

    const facultyBookings = new Map(facultyIds.map((id) => [id, existingSchedules.filter((schedule) => String(schedule.faculty_id) === id).map((schedule) => ({ day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time) }))]));
    const roomBookings = existingSchedules.map((schedule) => ({ roomId: String(schedule.room_id), day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time), sections: scheduleSections(schedule) }));
    const sectionBookings = existingSchedules.map((schedule) => ({ day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time), sections: scheduleSections(schedule) }));
    const windowsByFaculty = new Map(facultyIds.map((id) => [id, campusAvailability.filter((row) => String(row.faculty_id) === String(facultyUuidById.get(id))).map((row) => ({ day: row.day, start: toMinutes(row.start_time), end: toMinutes(row.end_time) })).filter((window) => DAYS.includes(window.day) && Number.isFinite(window.start) && Number.isFinite(window.end) && window.start < window.end).sort((left, right) => DAYS.indexOf(left.day) - DAYS.indexOf(right.day) || left.start - right.start)]));
    const generated = [];
    const unplaced = [];

    for (const assignment of availableAssignments) {
      const faculty = facultyById.get(assignment.facultyId);
      const facultyName = [faculty?.first_name, faculty?.middle_name, faculty?.last_name].filter(Boolean).join(" ") || assignment.facultyId;
      for (const subject of assignment.subjects) {
      const requestedSubjectDuration = Number(subject.durationMinutes);
      const subjectDuration = Number.isFinite(requestedSubjectDuration) && requestedSubjectDuration > 0 ? requestedSubjectDuration : durationMinutes;
      for (const selectedSection of normalizeSections(subject)) {
        const candidates = [];
        for (const window of windowsByFaculty.get(assignment.facultyId) || []) {
          for (let start = window.start; start + subjectDuration <= window.end; start += 30) {
            const end = start + subjectDuration;
            if (hasFacultyTimeConflict(facultyBookings.get(assignment.facultyId) || [], window.day, start, end)) continue;
            if (!isOnlineRoom(selectedRoom.name) && Number(selectedRoom.capacity) < requestedClassSize) continue;
            if (!isOnlineRoom(selectedRoom.name) && roomBookings.some((booking) => booking.roomId === String(selectedRoom.id) && booking.day === window.day && overlaps(start, end, booking.start, booking.end))) continue;
            if (sectionBookings.some((booking) => booking.day === window.day && booking.sections.includes(selectedSection) && overlaps(start, end, booking.start, booking.end))) continue;
            candidates.push({ room: selectedRoom, day: window.day, start, end, score: scoreCandidate({ roomBookings: roomBookings.filter((booking) => booking.roomId === String(selectedRoom.id)), sectionBookings, sections: [selectedSection], day: window.day, start, end, subjectDuration }) });
          }
        }

        const placement = candidates.sort((left, right) => right.score - left.score || left.day.localeCompare(right.day) || left.start - right.start)[0] || null;

        if (!placement) {
          unplaced.push({ subjectId: subject.subjectId ?? null, facultyId: assignment.facultyId, facultyName, code: String(subject.code).trim(), name: String(subject.name).trim(), section: selectedSection, reason: "No open slot found for this section in the faculty's availability for the selected room without a conflict." });
          continue;
        }

        facultyBookings.get(assignment.facultyId).push({ day: placement.day, start: placement.start, end: placement.end });
        roomBookings.push({ roomId: String(placement.room.id), day: placement.day, start: placement.start, end: placement.end, sections: [selectedSection] });
        sectionBookings.push({ day: placement.day, start: placement.start, end: placement.end, sections: [selectedSection] });
        const units = Number((subjectDuration / 60).toFixed(2));
        generated.push({ subjectId: subject.subjectId ?? null, facultyId: assignment.facultyId, facultyName, code: String(subject.code).trim(), name: String(subject.name).trim(), day: placement.day, startTime: toTime(placement.start), endTime: toTime(placement.end), section: selectedSection, roomId: placement.room.id, roomName: placement.room.name, units, lectureContactHours: subject.classType === "lab" ? 0 : units, labContactHours: subject.classType === "lab" ? units : 0, classSize: requestedClassSize, loadType });
      }
      }
    }

    return NextResponse.json({ generated, unplaced, unavailable });
  } catch (error) {
    console.error("[AI SCHEDULING GENERATE ERROR]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}