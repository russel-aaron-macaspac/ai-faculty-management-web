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

async function addUnplacedSuggestions(unplaced, selectedRoom, requestedClassSize) {
  if (unplaced.length === 0) return { items: unplaced, available: true };
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return { items: unplaced, available: false };

  try {
    const model = process.env.MISTRAL_MODEL || "mistral-large-latest";
    const prompt = [
      "You are helping a university scheduler recover classes that could not be placed.",
      "For each item, give one specific, actionable recommendation based only on its diagnostics.",
      "Do not claim that a specific room or time is conflict-free. Do not say to schedule a class in a room unless the diagnostics explicitly confirm that placement.",
      "Return JSON only as an array of objects with this shape: [{\"index\": number, \"suggestion\": string}].",
      `Selected room: ${selectedRoom.name}; capacity: ${selectedRoom.capacity}; requested class size: ${requestedClassSize}.`,
      `Unplaced classes: ${JSON.stringify(unplaced.map((item, index) => ({ index, code: item.code, name: item.name, faculty: item.facultyName, durationMinutes: item.durationMinutes, validationReason: item.validationReason, availabilityWindowCount: item.availabilityWindowCount, roomTooSmall: item.roomTooSmall, roomConflictCount: item.roomConflictCount, sectionConflictCount: item.sectionConflictCount })))} `,
    ].join("\n");
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.2, response_format: { type: "json_object" } }),
    });
    if (!response.ok) return { items: unplaced, available: false };
    const payload = await response.json();
    const text = payload.choices?.[0]?.message?.content?.trim();
    const parsed = JSON.parse(text || "{}");
    const suggestions = Array.isArray(parsed) ? parsed : parsed.suggestions;
    if (!Array.isArray(suggestions)) return { items: unplaced, available: false };
    const items = unplaced.map((item, index) => {
      const suggestion = suggestions.find((candidate) => Number(candidate.index) === index)?.suggestion;
      return typeof suggestion === "string" && suggestion.trim() ? { ...item, suggestion: suggestion.trim() } : item;
    });
    return { items, available: items.some((item) => item.suggestion) };
  } catch (error) {
    console.warn("[AI SCHEDULING SUGGESTIONS UNAVAILABLE] Mistral could not provide placement advice.", error);
    return { items: unplaced, available: false };
  }
}

async function generateFullScheduleWithMistral({ assignments, facultyById, windowsByFaculty, rooms, selectedRoom, existingSchedules, requestedClassSize, loadType }) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not configured. Add it to .env.local and restart the server.");

  const model = process.env.MISTRAL_MODEL || "mistral-large-latest";
  const facultyAvailability = assignments.map((assignment) => ({
    facultyId: String(assignment.facultyId),
    facultyName: [facultyById.get(String(assignment.facultyId))?.first_name, facultyById.get(String(assignment.facultyId))?.middle_name, facultyById.get(String(assignment.facultyId))?.last_name].filter(Boolean).join(" "),
    windows: (windowsByFaculty.get(String(assignment.facultyId)) || []).map((window) => ({ day: window.day, startTime: toTime(window.start), endTime: toTime(window.end) })),
  }));
  const requestedClasses = assignments.flatMap((assignment) => assignment.subjects.flatMap((subject) => normalizeSections(subject).map((section) => ({ facultyId: String(assignment.facultyId), subjectId: subject.subjectId ?? null, code: subject.code, name: subject.name, section, classType: subject.classType, durationMinutes: Number(subject.durationMinutes) > 0 ? Number(subject.durationMinutes) : 90 }))));
  const prompt = [
    "You are the primary university schedule generator. Generate the complete schedule for every requested class in one plan.",
    "Choose rooms, days, and times yourself. Prefer the selected room when feasible, but use other rooms when that produces a valid complete schedule.",
    "Never schedule outside the assigned faculty availability. Never overlap a faculty member, room, or section. Respect room capacity and existing schedules.",
    "A faculty member may teach multiple sections. Schedule every section as its own class at a different, non-overlapping time; do not omit a section just because its faculty member is already assigned another section.",
    "Return JSON only in exactly this shape: {\"schedule\":[{\"facultyId\":string,\"subjectId\":string|null,\"code\":string,\"name\":string,\"section\":string,\"day\":string,\"startTime\":\"HH:mm\",\"endTime\":\"HH:mm\",\"roomId\":string}]}. You must return exactly one row for every requested class. Never return fewer rows.",
    `Selected room preference: ${JSON.stringify({ id: selectedRoom.id, name: selectedRoom.name, capacity: selectedRoom.capacity })}`,
    `Requested class size: ${requestedClassSize}; load type: ${loadType}`,
    `Faculty availability: ${JSON.stringify(facultyAvailability)}`,
    `Rooms: ${JSON.stringify(rooms.filter((room) => !isOnlineRoom(room.name)))}`,
    `Existing schedules: ${JSON.stringify(existingSchedules)}`,
    `Requested classes: ${JSON.stringify(requestedClasses)}`,
  ].join("\n");
  const requestBody = JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.2, response_format: { type: "json_object" } });
  const maxAttempts = 4;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: requestBody,
      });

      if (response.ok) {
        const payload = await response.json();
        const text = payload.choices?.[0]?.message?.content?.trim();
        const result = JSON.parse(text || "{}");
        if (!Array.isArray(result.schedule) || result.schedule.length < requestedClasses.length) throw new Error(`Mistral returned an incomplete schedule (${result.schedule?.length || 0}/${requestedClasses.length} classes).`);
        return { requestedClasses, proposals: result.schedule };
      }

      const details = await response.text();
      const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
      if (!retryable || attempt === maxAttempts - 1) {
        const error = new Error(`Mistral schedule generation failed (${response.status}): ${details.slice(0, 300)}`);
        error.status = response.status;
        throw error;
      }

      const delayMs = 1000 * (2 ** attempt);
      console.warn(`[AI SCHEDULING RETRY] Mistral returned ${response.status}; retrying in ${delayMs}ms.`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      if (error?.status || attempt === maxAttempts - 1) throw error;
      const delayMs = 1000 * (2 ** attempt);
      console.warn(`[AI SCHEDULING RETRY] Mistral request failed; retrying in ${delayMs}ms.`, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error("Mistral schedule generation failed after all retry attempts.");
}

function validateMistralSchedule({ requestedClasses, proposals, rooms, windowsByFaculty, existingSchedules, requestedClassSize, loadType }) {
  const roomById = new Map(rooms.map((room) => [String(room.id), room]));
  const facultyBookings = new Map();
  const roomBookings = existingSchedules.map((schedule) => ({ roomId: String(schedule.room_id), day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time), sections: scheduleSections(schedule) }));
  const sectionBookings = existingSchedules.map((schedule) => ({ day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time), sections: scheduleSections(schedule) }));
  const generated = [];
  const unplaced = [];
  const used = new Set();
  const normalizedProposals = Array.isArray(proposals) ? proposals : [];

  for (const requested of requestedClasses) {
    const proposalIndex = normalizedProposals.findIndex((proposal, index) => !used.has(index) && String(proposal.facultyId) === requested.facultyId && String(proposal.code).trim() === String(requested.code).trim() && String(proposal.section).trim() === requested.section);
    const proposal = proposalIndex >= 0 ? normalizedProposals[proposalIndex] : null;
    if (proposalIndex >= 0) used.add(proposalIndex);
    const room = proposal ? roomById.get(String(proposal.roomId)) : null;
    const start = proposal ? toMinutes(proposal.startTime) : Number.NaN;
    const end = proposal ? toMinutes(proposal.endTime) : Number.NaN;
    const facultyId = requested.facultyId;
    const facultyWindows = windowsByFaculty.get(facultyId) || [];
    const validWindow = facultyWindows.some((window) => window.day === proposal?.day && start >= window.start && end <= window.end);
    const facultyConflict = Boolean(proposal && hasFacultyTimeConflict(facultyBookings.get(facultyId) || [], proposal.day, start, end));
    const roomConflict = Boolean(proposal && room && roomBookings.some((booking) => booking.roomId === String(room.id) && booking.day === proposal.day && overlaps(start, end, booking.start, booking.end)));
    const sectionConflict = Boolean(proposal && sectionBookings.some((booking) => booking.day === proposal.day && booking.sections.includes(requested.section) && overlaps(start, end, booking.start, booking.end)));
    const validationReasons = [];
    if (!proposal) validationReasons.push("the AI did not return a matching placement");
    if (proposal && !room) validationReasons.push("the selected room was not found");
    if (room && isOnlineRoom(room.name)) validationReasons.push("the selected room is not a physical classroom");
    if (room && Number(room.capacity) < requestedClassSize) validationReasons.push(`room capacity is ${room.capacity}, but ${requestedClassSize} seats are required`);
    if (proposal && !DAYS.includes(proposal.day)) validationReasons.push("the returned day is invalid");
    if (proposal && (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)) validationReasons.push("the returned time range is invalid");
    if (proposal && Number.isFinite(start) && Number.isFinite(end) && end - start !== requested.durationMinutes) validationReasons.push(`the class duration must be ${requested.durationMinutes} minutes`);
    if (proposal && !validWindow) validationReasons.push("the time is outside the faculty member's availability");
    if (facultyConflict) validationReasons.push("the faculty member has another class at that time");
    if (roomConflict) validationReasons.push("the room is already occupied at that time");
    if (sectionConflict) validationReasons.push("the section already has a class at that time");
    const valid = validationReasons.length === 0;
    if (!valid) {
      unplaced.push({ subjectId: requested.subjectId, facultyId, facultyName: requested.facultyName, code: requested.code, name: requested.name, section: requested.section, durationMinutes: requested.durationMinutes, availabilityWindowCount: facultyWindows.length, roomTooSmall: Boolean(room && Number(room.capacity) < requestedClassSize), roomConflictCount: roomConflict ? 1 : 0, sectionConflictCount: sectionConflict ? 1 : 0, validationReason: validationReasons.join("; "), reason: `The AI's proposed placement was not accepted because ${validationReasons.join("; ")}.` });
      continue;
    }
    facultyBookings.get(facultyId)?.push({ day: proposal.day, start, end });
    if (!facultyBookings.has(facultyId)) facultyBookings.set(facultyId, [{ day: proposal.day, start, end }]);
    roomBookings.push({ roomId: String(room.id), day: proposal.day, start, end, sections: [requested.section] });
    sectionBookings.push({ day: proposal.day, start, end, sections: [requested.section] });
    const units = Number((requested.durationMinutes / 60).toFixed(2));
    generated.push({ subjectId: requested.subjectId, facultyId, facultyName: requested.facultyName, code: requested.code, name: requested.name, day: proposal.day, startTime: toTime(start), endTime: toTime(end), section: requested.section, roomId: room.id, roomName: room.name, units, lectureContactHours: requested.classType === "lab" ? 0 : units, labContactHours: requested.classType === "lab" ? units : 0, classSize: requestedClassSize, loadType });
  }
  return { generated, unplaced };
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
      .select("subject_id, faculty_id, section")
      .neq("status", "rejected");
    if (assignedSchedulesError) throw assignedSchedulesError;

    const assignedFacultyIds = [...new Set((assignedSchedules || []).map((schedule) => String(schedule.faculty_id)).filter(Boolean))];
    let assignedFacultyById = new Map();
    if (assignedFacultyIds.length > 0) {
      const { data: assignedFaculty, error: assignedFacultyError } = await supabase
        .from("users")
        .select("user_id, first_name, middle_name, last_name")
        .in("user_id", assignedFacultyIds);
      if (assignedFacultyError) throw assignedFacultyError;
      assignedFacultyById = new Map((assignedFaculty || []).map((faculty) => [String(faculty.user_id), faculty]));
    }

    const unavailable = [];
    const availableAssignments = assignments.map((assignment) => ({
      ...assignment,
      facultyId: String(assignment.facultyId),
      subjects: assignment.subjects.map((subject) => {
        const remainingSections = normalizeSections(subject).filter((section) => {
          const assignedSchedule = (assignedSchedules || []).find((schedule) => (
            String(schedule.subject_id) === String(subject.subjectId)
            && scheduleSections(schedule).some((assignedSection) => assignedSection.toLowerCase() === section.toLowerCase())
          ));
          if (assignedSchedule) {
            const faculty = assignedFacultyById.get(String(assignedSchedule.faculty_id));
            const facultyName = [faculty?.first_name, faculty?.middle_name, faculty?.last_name].filter(Boolean).join(" ") || `Faculty ID ${assignedSchedule.faculty_id}`;
            unavailable.push({ subjectId: subject.subjectId ?? null, facultyId: String(assignment.facultyId), assignedFacultyName: facultyName, code: String(subject.code).trim(), name: String(subject.name).trim(), section, reason: "This section is already assigned to another faculty member." });
            return false;
          }
          return true;
        });
        return { ...subject, sections: remainingSections };
      }).filter((subject) => subject.sections.length > 0),
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
    const { data: rooms, error: roomsError } = await supabase.from("rooms").select("id, name, capacity");
    if (roomsError) throw roomsError;

    const facultyBookings = new Map(facultyIds.map((id) => [id, existingSchedules.filter((schedule) => String(schedule.faculty_id) === id).map((schedule) => ({ day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time) }))]));
    const roomBookings = existingSchedules.map((schedule) => ({ roomId: String(schedule.room_id), day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time), sections: scheduleSections(schedule) }));
    const sectionBookings = existingSchedules.map((schedule) => ({ day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time), sections: scheduleSections(schedule) }));
    const windowsByFaculty = new Map(facultyIds.map((id) => [id, campusAvailability.filter((row) => String(row.faculty_id) === String(facultyUuidById.get(id))).map((row) => ({ day: row.day, start: toMinutes(row.start_time), end: toMinutes(row.end_time) })).filter((window) => DAYS.includes(window.day) && Number.isFinite(window.start) && Number.isFinite(window.end) && window.start < window.end).sort((left, right) => DAYS.indexOf(left.day) - DAYS.indexOf(right.day) || left.start - right.start)]));
    const aiAssignments = availableAssignments.map((assignment) => ({
      ...assignment,
      subjects: assignment.subjects.map((subject) => ({ ...subject, durationMinutes: Number(subject.durationMinutes) > 0 ? Number(subject.durationMinutes) : durationMinutes })),
    }));
    const aiSchedule = await generateFullScheduleWithMistral({ assignments: aiAssignments, facultyById, windowsByFaculty, rooms: rooms || [], selectedRoom, existingSchedules, requestedClassSize, loadType });
    const requestedWithNames = aiSchedule.requestedClasses.map((item) => ({ ...item, facultyName: [facultyById.get(item.facultyId)?.first_name, facultyById.get(item.facultyId)?.middle_name, facultyById.get(item.facultyId)?.last_name].filter(Boolean).join(" ") || item.facultyId }));
    const validatedSchedule = validateMistralSchedule({ requestedClasses: requestedWithNames, proposals: aiSchedule.proposals, rooms: rooms || [], windowsByFaculty, existingSchedules, requestedClassSize, loadType });
    const generated = validatedSchedule.generated;
    const unplaced = validatedSchedule.unplaced;
    const alternativePlacements = [];
    const aiSuggestionResult = await addUnplacedSuggestions(unplaced, selectedRoom, requestedClassSize);
    return NextResponse.json({ generated, unplaced: aiSuggestionResult.items, alternativePlacements, aiSuggestionsAvailable: aiSuggestionResult.available, unavailable });
  } catch (error) {
    console.error("[AI SCHEDULING GENERATE ERROR]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI schedule generation failed" }, { status: error?.status || 500 });
  }
}