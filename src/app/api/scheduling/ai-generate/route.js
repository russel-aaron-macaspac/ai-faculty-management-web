import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ONLINE_ROOM_PATTERN = /online|virtual|remote|tbd|tba/i;

export const maxDuration = 60;

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

function getMessageContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((part) => typeof part === "string" || part?.type === "text")
      .map((part) => (typeof part === "string" ? part : part.text))
      .filter((part) => typeof part === "string")
      .join("")
      .trim();
  }
  return "";
}

function getAiProvider() {
  const requestedProvider = String(process.env.AI_PROVIDER || "").toLowerCase();
  const providerName = requestedProvider || (process.env.GROQ_API_KEY ? "groq" : process.env.MISTRAL_API_KEY ? "mistral" : "none");
  if (!["groq", "mistral"].includes(providerName)) return null;
  const defaults = providerName === "groq"
    ? { baseUrl: "https://api.groq.com/openai/v1", key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || "openai/gpt-oss-20b" }
    : { baseUrl: "https://api.mistral.ai/v1", key: process.env.MISTRAL_API_KEY, model: process.env.MISTRAL_MODEL || "mistral-small-2603" };
  return {
    name: providerName,
    baseUrl: process.env.AI_BASE_URL || defaults.baseUrl,
    key: process.env.AI_API_KEY || defaults.key,
    model: process.env.AI_MODEL || defaults.model,
  };
}

function getReasoningEffort(provider, model) {
  return provider === "groq" && String(model).startsWith("openai/gpt-oss")
    ? process.env.AI_REASONING_EFFORT || "low"
    : undefined;
}

function normalizeRoomName(value) {
  const name = String(value || "").trim();
  return /^(tba|tbd)(\s*[-: ].*)?$/i.test(name) ? "TBA" : name;
}

function normalizeEquipmentType(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function roomSupportsRequirement(room, requirement) {
  const requiredEquipment = normalizeEquipmentType(requirement);
  if (!requiredEquipment) return true;
  return normalizeEquipmentType(room?.equipment_type || room?.equipmentType) === requiredEquipment;
}

function isPartTimeStatus(value) {
  return /part[\s-]*time/i.test(String(value || ""));
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

function orderRequestedClasses(requestedClasses, windowsByFaculty) {
  return [...requestedClasses].sort((left, right) => (
    Number(right.isPartTime) - Number(left.isPartTime)
    || (windowsByFaculty.get(left.facultyId) || []).length - (windowsByFaculty.get(right.facultyId) || []).length
    || Number(Boolean(right.requiredEquipmentType)) - Number(Boolean(left.requiredEquipmentType))
    || right.durationMinutes - left.durationMinutes
  ));
}

function getEligibleRooms(requested, rooms, requestedClassSize) {
  return rooms
    .filter((room) => !isOnlineRoom(room.name))
    .filter((room) => roomSupportsRequirement(room, requested.requiredEquipmentType))
    .filter((room) => requestedClassSize == null || Number(room.capacity) >= requestedClassSize)
    .sort((left, right) => requested.requiredEquipmentType
      ? Number(right.capacity) - Number(left.capacity)
      : Number(normalizeEquipmentType(left.equipment_type) === "computer") - Number(normalizeEquipmentType(right.equipment_type) === "computer") || Number(left.capacity) - Number(right.capacity));
}

function findPlacement({ requested, rooms, facultyWindows, facultyBookings, roomBookings, sectionBookings, requestedClassSize, strategy = "earliest", dayLoad }) {
  const roomCandidates = getEligibleRooms(requested, rooms, requestedClassSize);
  const orderedWindows = facultyWindows.map((window, index) => ({ window, index }));
  if (strategy === "balanced") {
    orderedWindows.sort((left, right) => (
      (dayLoad.get(`${requested.facultyId}::${left.window.day}`) || 0)
      - (dayLoad.get(`${requested.facultyId}::${right.window.day}`) || 0)
      || DAYS.indexOf(left.window.day) - DAYS.indexOf(right.window.day)
      || left.window.start - right.window.start
      || left.index - right.index
    ));
  } else if (strategy === "latest") {
    orderedWindows.reverse();
  }
  for (const { window } of orderedWindows) {
    const firstStart = strategy === "latest"
      ? window.end - requested.durationMinutes
      : window.start;
    const lastStart = strategy === "latest" ? window.start : window.end - requested.durationMinutes;
    const increment = strategy === "latest" ? -30 : 30;
    for (let start = firstStart; strategy === "latest" ? start >= lastStart : start <= lastStart; start += increment) {
      const end = start + requested.durationMinutes;
      if (!hasFacultyTimeConflict(facultyBookings.get(requested.facultyId) || [], window.day, start, end)) {
        if (!sectionBookings.some((booking) => booking.day === window.day && booking.sections.includes(requested.section) && overlaps(start, end, booking.start, booking.end))) {
          const room = roomCandidates.find((candidate) => !roomBookings.some((booking) => booking.roomId === String(candidate.id) && booking.day === window.day && overlaps(start, end, booking.start, booking.end)));
          if (room) return { room, day: window.day, start, end };
        }
      }
  }
  }
  return null;
}

function findCandidatePlacements({ requested, rooms, facultyWindows, facultyBookings, roomBookings, sectionBookings, requestedClassSize, maxOptions = 8 }) {
  const roomCandidates = getEligibleRooms(requested, rooms, requestedClassSize);
  const allCandidates = [];
  for (const window of facultyWindows) {
    for (let start = window.start; start + requested.durationMinutes <= window.end; start += 30) {
      const end = start + requested.durationMinutes;
      if (hasFacultyTimeConflict(facultyBookings.get(requested.facultyId) || [], window.day, start, end)) continue;
      if (sectionBookings.some((booking) => booking.day === window.day && booking.sections.includes(requested.section) && overlaps(start, end, booking.start, booking.end))) continue;
      const room = roomCandidates.find((candidate) => !roomBookings.some((booking) => booking.roomId === String(candidate.id) && booking.day === window.day && overlaps(start, end, booking.start, booking.end)));
      if (room) allCandidates.push({ day: window.day, start, end, room });
    }
  }
  if (allCandidates.length <= maxOptions) {
    return allCandidates.map((candidate, index) => ({ id: `o${index + 1}`, ...candidate }));
  }
  const selected = [];
  const selectedKeys = new Set();
  const addCandidate = (candidate) => {
    const key = `${candidate.day}:${candidate.start}:${candidate.room.id}`;
    if (selected.length < maxOptions && !selectedKeys.has(key)) {
      selected.push(candidate);
      selectedKeys.add(key);
    }
  };
  addCandidate(allCandidates[0]);
  addCandidate(allCandidates[allCandidates.length - 1]);
  const candidatesByDay = new Map();
  for (const candidate of allCandidates) {
    if (!candidatesByDay.has(candidate.day)) candidatesByDay.set(candidate.day, []);
    candidatesByDay.get(candidate.day).push(candidate);
  }
  const dayQueues = [...candidatesByDay.values()];
  const dayIndexes = new Map(dayQueues.map((candidates, index) => [index, 0]));
  while (selected.length < maxOptions && dayQueues.some((candidates, index) => dayIndexes.get(index) < candidates.length)) {
    for (let index = 0; index < dayQueues.length && selected.length < maxOptions; index += 1) {
      const candidates = dayQueues[index];
      let candidateIndex = dayIndexes.get(index);
      while (candidateIndex < candidates.length && selectedKeys.has(`${candidates[candidateIndex].day}:${candidates[candidateIndex].start}:${candidates[candidateIndex].room.id}`)) candidateIndex += 1;
      if (candidateIndex < candidates.length) {
        addCandidate(candidates[candidateIndex]);
        dayIndexes.set(index, candidateIndex + 1);
      }
    }
  }
  return selected.map((candidate, index) => ({ id: `o${index + 1}`, ...candidate }));
}

function buildRequestedClasses({ assignments, facultyById, durationMinutes }) {
  return assignments.flatMap((assignment) => assignment.subjects.flatMap((subject) => normalizeSections(subject).map((section) => {
    const faculty = facultyById.get(String(assignment.facultyId));
    const requiredEquipmentType = subject.requiredEquipmentType || subject.required_equipment_type || null;
    return {
      facultyId: String(assignment.facultyId),
      facultyName: [faculty?.first_name, faculty?.middle_name, faculty?.last_name].filter(Boolean).join(" ") || String(assignment.facultyId),
      isPartTime: isPartTimeStatus(faculty?.status_of_appointment),
      subjectId: subject.subjectId ?? null,
      code: String(subject.code).trim(),
      name: String(subject.name).trim(),
      section,
      classType: subject.classType,
      requiredEquipmentType,
      needsComputerLab: normalizeEquipmentType(requiredEquipmentType) === "computer",
      durationMinutes: Number(subject.durationMinutes) > 0 ? Number(subject.durationMinutes) : durationMinutes,
    };
  })));
}

function generateDeterministic({ requestedClasses, rooms, windowsByFaculty, existingSchedules, facultyBookingsInit, requestedClassSize, loadType, strategy }) {
  const facultyBookings = new Map([...facultyBookingsInit.entries()].map(([facultyId, bookings]) => [
    facultyId,
    bookings.map((booking) => ({ ...booking })),
  ]));
  const roomBookings = existingSchedules.map((schedule) => ({ roomId: String(schedule.room_id), day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time), sections: scheduleSections(schedule) }));
  const sectionBookings = existingSchedules.map((schedule) => ({ day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time), sections: scheduleSections(schedule) }));
  const dayLoad = new Map();
  for (const schedule of existingSchedules) {
    const facultyId = String(schedule.faculty_id);
    const key = `${facultyId}::${schedule.day}`;
    dayLoad.set(key, (dayLoad.get(key) || 0) + 1);
  }
  const orderedClasses = orderRequestedClasses(requestedClasses, windowsByFaculty);
  const generated = [];
  const unplaced = [];
  for (const requested of orderedClasses) {
    const facultyWindows = windowsByFaculty.get(requested.facultyId) || [];
    const placement = findPlacement({ requested, rooms, facultyWindows, facultyBookings, roomBookings, sectionBookings, requestedClassSize, strategy, dayLoad });
    if (!placement) {
      unplaced.push(makeUnplacedClass({
        requested,
        facultyWindows,
        rooms,
        facultyBookings,
        roomBookings,
        sectionBookings,
        requestedClassSize,
      }));
      continue;
    }
    const { room, day, start, end } = placement;
    const bookings = facultyBookings.get(requested.facultyId) || [];
    bookings.push({ day, start, end });
    facultyBookings.set(requested.facultyId, bookings);
    roomBookings.push({ roomId: String(room.id), day, start, end, sections: [requested.section] });
    sectionBookings.push({ day, start, end, sections: [requested.section] });
    const dayKey = `${requested.facultyId}::${day}`;
    dayLoad.set(dayKey, (dayLoad.get(dayKey) || 0) + 1);
    const units = Number((requested.durationMinutes / 60).toFixed(2));
    generated.push({
      subjectId: requested.subjectId,
      facultyId: requested.facultyId,
      facultyName: requested.facultyName,
      code: requested.code,
      name: requested.name,
      day,
      startTime: toTime(start),
      endTime: toTime(end),
      section: requested.section,
      roomId: room.id,
      roomName: room.name,
      units,
      lectureContactHours: requested.classType === "lab" ? 0 : units,
      labContactHours: requested.classType === "lab" ? units : 0,
      classSize: requestedClassSize,
      loadType,
    });
  }
  return { generated, unplaced };
}

function cloneFacultyBookings(facultyBookingsInit) {
  return new Map([...facultyBookingsInit.entries()].map(([facultyId, bookings]) => [
    facultyId,
    bookings.map((booking) => ({ ...booking })),
  ]));
}

function createBookingState(existingSchedules, facultyBookingsInit) {
  const facultyBookings = cloneFacultyBookings(facultyBookingsInit);
  const roomBookings = existingSchedules.map((schedule) => ({ roomId: String(schedule.room_id), day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time), sections: scheduleSections(schedule) }));
  const sectionBookings = existingSchedules.map((schedule) => ({ day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time), sections: scheduleSections(schedule) }));
  const dayLoad = new Map();
  for (const schedule of existingSchedules) {
    const key = `${String(schedule.faculty_id)}::${schedule.day}`;
    dayLoad.set(key, (dayLoad.get(key) || 0) + 1);
  }
  return { facultyBookings, roomBookings, sectionBookings, dayLoad };
}

function bookPlacement({ requested, placement, facultyBookings, roomBookings, sectionBookings, dayLoad }) {
  const { room, day, start, end } = placement;
  const bookings = facultyBookings.get(requested.facultyId) || [];
  bookings.push({ day, start, end });
  facultyBookings.set(requested.facultyId, bookings);
  roomBookings.push({ roomId: String(room.id), day, start, end, sections: [requested.section] });
  sectionBookings.push({ day, start, end, sections: [requested.section] });
  const dayKey = `${requested.facultyId}::${day}`;
  dayLoad.set(dayKey, (dayLoad.get(dayKey) || 0) + 1);
}

function makeGeneratedRow(requested, placement, requestedClassSize, loadType, placementSource) {
  const { room, day, start, end } = placement;
  const units = Number((requested.durationMinutes / 60).toFixed(2));
  return {
    subjectId: requested.subjectId,
    facultyId: requested.facultyId,
    facultyName: requested.facultyName,
    code: requested.code,
    name: requested.name,
    day,
    startTime: toTime(start),
    endTime: toTime(end),
    section: requested.section,
    roomId: room.id,
    roomName: room.name,
    units,
    lectureContactHours: requested.classType === "lab" ? 0 : units,
    labContactHours: requested.classType === "lab" ? units : 0,
    classSize: requestedClassSize,
    loadType,
    ...(placementSource ? { placementSource } : {}),
  };
}

function formatSlot(day, start, end) {
  return `${String(day).slice(0, 3)} ${toTime(start)}-${toTime(end)}`;
}

function diagnoseUnplaced({ requested, rooms, facultyWindows, facultyBookings, roomBookings, sectionBookings, requestedClassSize }) {
  const physicalRooms = rooms.filter((room) => !isOnlineRoom(room.name));
  const eligibleRooms = getEligibleRooms(requested, rooms, requestedClassSize);
  const roomCapacities = physicalRooms.map((room) => Number(room.capacity)).filter(Number.isFinite);
  const availabilityByDay = {};
  let totalAvailableMinutes = 0;
  const windowsTooShort = [];
  for (const window of facultyWindows) {
    const duration = window.end - window.start;
    const display = `${toTime(window.start)}-${toTime(window.end)}`;
    if (!availabilityByDay[window.day]) availabilityByDay[window.day] = [];
    availabilityByDay[window.day].push(display);
    totalAvailableMinutes += duration;
    if (duration < requested.durationMinutes) windowsTooShort.push(`${String(window.day).slice(0, 3)} ${display}`);
  }
  const blockedCounts = { facultyConflict: 0, sectionConflict: 0, allEligibleRoomsBusy: 0 };
  const blockedExamples = [];
  const nearMisses = [];
  const seenSlots = new Set();
  const inspectSlot = (day, start, end, insideAvailability) => {
    const key = `${day}:${start}`;
    if (seenSlots.has(key)) return;
    seenSlots.add(key);
    const facultyConflictBookings = (facultyBookings.get(requested.facultyId) || []).filter((booking) => booking.day === day && overlaps(start, end, booking.start, booking.end));
    const sectionConflictBookings = sectionBookings.filter((booking) => booking.day === day && booking.sections.includes(requested.section) && overlaps(start, end, booking.start, booking.end));
    const busyRooms = eligibleRooms.map((room) => ({
      room,
      bookings: roomBookings.filter((booking) => booking.roomId === String(room.id) && booking.day === day && overlaps(start, end, booking.start, booking.end)),
    })).filter((entry) => entry.bookings.length > 0);
    const allRoomsBusy = eligibleRooms.length > 0 && busyRooms.length === eligibleRooms.length;
    const reasons = [
      facultyConflictBookings.length > 0 ? "facultyConflict" : null,
      sectionConflictBookings.length > 0 ? "sectionConflict" : null,
      allRoomsBusy ? "allEligibleRoomsBusy" : null,
    ].filter(Boolean);
    if (insideAvailability && reasons.length > 0) {
      const primaryReason = reasons[0];
      blockedCounts[primaryReason] += 1;
      if (blockedExamples.length < 3) {
        blockedExamples.push({
          slot: formatSlot(day, start, end),
          blocker: primaryReason,
          details: primaryReason === "allEligibleRoomsBusy"
            ? busyRooms.map((entry) => `${entry.room.name} by ${entry.bookings.flatMap((booking) => booking.sections).join(", ") || "another class"}`)
            : primaryReason === "sectionConflict"
              ? sectionConflictBookings.flatMap((booking) => booking.sections)
              : facultyConflictBookings.map((booking) => `${toTime(booking.start)}-${toTime(booking.end)}`),
        });
      }
      if (reasons.length === 1 && nearMisses.length < 3) {
        const detail = primaryReason === "allEligibleRoomsBusy"
          ? `all ${eligibleRooms.length} eligible rooms are occupied: ${busyRooms.map((entry) => `${entry.room.name} by ${entry.bookings.flatMap((booking) => booking.sections).join(", ") || "another class"}`).join(", ")}`
          : primaryReason === "sectionConflict"
            ? `section ${requested.section} is occupied by ${sectionConflictBookings.flatMap((booking) => booking.sections).join(", ")}`
            : `the faculty has a conflicting booking at ${facultyConflictBookings.map((booking) => `${toTime(booking.start)}-${toTime(booking.end)}`).join(", ")}`;
        nearMisses.push({
          slot: formatSlot(day, start, end),
          reason: primaryReason,
          detail,
          fix: primaryReason === "allEligibleRoomsBusy"
            ? `Free an eligible room during ${formatSlot(day, start, end)}: ${busyRooms.map((entry) => entry.room.name).join(", ")}.`
            : primaryReason === "sectionConflict"
              ? `Move the section conflict for ${requested.section} during ${formatSlot(day, start, end)}.`
              : `Move the faculty conflict during ${formatSlot(day, start, end)}.`,
        });
      }
    }
    return { facultyConflictBookings, sectionConflictBookings, busyRooms, allRoomsBusy, reasons };
  };
  for (const window of facultyWindows) {
    for (let start = window.start; start + requested.durationMinutes <= window.end; start += 30) {
      inspectSlot(window.day, start, start + requested.durationMinutes, true);
    }
  }
  const dayStart = toMinutes(process.env.AI_DAY_START || "07:00");
  const dayEnd = toMinutes(process.env.AI_DAY_END || "20:00");
  const availabilityGaps = [];
  for (const day of DAYS) {
    for (let start = dayStart; start + requested.durationMinutes <= dayEnd; start += 30) {
      if (availabilityGaps.length >= 3) break;
      const end = start + requested.durationMinutes;
      const inAvailability = facultyWindows.some((window) => window.day === day && start >= window.start && end <= window.end);
      if (inAvailability) continue;
      const result = inspectSlot(day, start, end, false);
      if (result.reasons.length === 0 && result.busyRooms.length === 0 && eligibleRooms.length > 0) {
        const room = eligibleRooms.find((candidate) => !roomBookings.some((booking) => booking.roomId === String(candidate.id) && booking.day === day && overlaps(start, end, booking.start, booking.end)));
        if (room) {
          availabilityGaps.push({
            slot: formatSlot(day, start, end),
            room: room.name,
            suggestion: `Add ${day} ${toTime(start)}-${toTime(end)} to the faculty's availability.`,
          });
        }
      }
    }
  }
  const eligibleRoomNames = eligibleRooms.map((room) => room.name);
  return {
    classInfo: {
      durationMinutes: requested.durationMinutes,
      requiredEquipmentType: requested.requiredEquipmentType || null,
      requestedClassSize: requestedClassSize ?? null,
    },
    availability: {
      byDay: availabilityByDay,
      totalAvailableMinutes,
      windowsTooShort,
    },
    rooms: {
      physicalCount: physicalRooms.length,
      eligibleCount: eligibleRooms.length,
      eligible: eligibleRoomNames,
      tooSmallCount: requestedClassSize == null ? 0 : physicalRooms.filter((room) => Number(room.capacity) < requestedClassSize).length,
      lackingEquipmentCount: physicalRooms.filter((room) => !roomSupportsRequirement(room, requested.requiredEquipmentType)).length,
      largestCapacity: roomCapacities.length > 0 ? Math.max(...roomCapacities) : 0,
      capacityRequired: requestedClassSize ?? null,
    },
    blockedSlots: {
      counts: blockedCounts,
      examples: blockedExamples,
    },
    nearMisses,
    availabilityGaps,
  };
}

function explainUnplaced({ requested, diagnostics }) {
  const fixes = [];
  let explanation;
  if (diagnostics.rooms.eligibleCount === 0) {
    const capacityText = diagnostics.classInfo.requestedClassSize == null
      ? `${diagnostics.rooms.largestCapacity} largest available seats`
      : `${diagnostics.classInfo.requestedClassSize} seats required; largest available room has ${diagnostics.rooms.largestCapacity} seats`;
    explanation = `No eligible physical room meets the class requirements: ${capacityText}. ${diagnostics.rooms.lackingEquipmentCount} physical room(s) lack the required equipment.`;
    if (diagnostics.classInfo.requestedClassSize != null) fixes.push(`Use a room with at least ${diagnostics.classInfo.requestedClassSize} seats and the required equipment.`);
  } else if (diagnostics.availability.totalAvailableMinutes === 0) {
    explanation = `The faculty has no saved availability for this ${requested.durationMinutes}-minute class.`;
  } else {
    const counts = diagnostics.blockedSlots.counts;
    const mainCause = Object.entries(counts).sort((left, right) => right[1] - left[1])[0];
    explanation = `All available faculty windows are blocked for this ${requested.durationMinutes}-minute class: ${counts.facultyConflict} faculty conflict(s), ${counts.sectionConflict} section conflict(s), and ${counts.allEligibleRoomsBusy} slot(s) with all eligible rooms busy.`;
    if (mainCause && mainCause[1] === 0 && diagnostics.availability.windowsTooShort.length > 0) {
      explanation += ` Some windows are shorter than ${requested.durationMinutes} minutes.`;
    }
  }
  for (const nearMiss of diagnostics.nearMisses) {
    if (fixes.length >= 2) break;
    fixes.push(nearMiss.fix);
  }
  for (const gap of diagnostics.availabilityGaps) {
    if (fixes.length >= 3) break;
    fixes.push(gap.suggestion);
  }
  if (fixes.length === 0 && diagnostics.availability.windowsTooShort.length > 0) {
    fixes.push(`Add a faculty availability window at least ${requested.durationMinutes} minutes long.`);
  }
  if (fixes.length === 0) fixes.push("Adjust the faculty availability, section schedule, or eligible room assignments.");
  return { explanation, howToFix: fixes.slice(0, 3) };
}

function makeUnplacedClass({ requested, facultyWindows, rooms, facultyBookings, roomBookings, sectionBookings, requestedClassSize }) {
  const eligibleRooms = getEligibleRooms(requested, rooms, requestedClassSize);
  const diagnostics = diagnoseUnplaced({ requested, rooms, facultyWindows, facultyBookings, roomBookings, sectionBookings, requestedClassSize });
  const { explanation, howToFix } = explainUnplaced({ requested, diagnostics });
  return {
    subjectId: requested.subjectId,
    facultyId: requested.facultyId,
    facultyName: requested.facultyName,
    code: requested.code,
    name: requested.name,
    section: requested.section,
    durationMinutes: requested.durationMinutes,
    availabilityWindowCount: facultyWindows.length,
    roomTooSmall: eligibleRooms.length === 0,
    roomConflictCount: 0,
    sectionConflictCount: 0,
    validationReason: explanation,
    reason: explanation,
    requiredEquipmentType: requested.requiredEquipmentType,
    explanation,
    howToFix,
    diagnostics,
    suggestion: howToFix.join(" "),
    explanationSource: "rule-based",
  };
}

function stripJsonFences(text) {
  return String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function chunkClassesByFaculty(requestedClasses) {
  const chunks = [];
  const classesByFaculty = new Map();
  for (const requested of requestedClasses) {
    if (!classesByFaculty.has(requested.facultyId)) classesByFaculty.set(requested.facultyId, []);
    classesByFaculty.get(requested.facultyId).push(requested);
  }
  for (const classes of classesByFaculty.values()) {
    const chunkSize = Math.min(6, Math.max(1, Number(process.env.AI_CHUNK_SIZE) || 6));
    for (let index = 0; index < classes.length; index += chunkSize) chunks.push(classes.slice(index, index + chunkSize));
  }
  return chunks;
}

let aiStartupLogged = false;
let aiKeyRejectedLogged = false;
let aiModelDiscoveryLogged = false;

async function logAvailableModels(provider, timeoutMs) {
  if (aiModelDiscoveryLogged) return;
  aiModelDiscoveryLogged = true;
  try {
    const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${provider.key}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return;
    const payload = await response.json();
    const ids = Array.isArray(payload?.data)
      ? payload.data.map((model) => model?.id).filter((id) => typeof id === "string").slice(0, 40)
      : [];
    console.warn(`[AI SCHEDULING] Available models: ${ids.join(", ")}`);
  } catch (error) {
    console.warn(`[AI SCHEDULING] Model discovery failed (${error?.name || "Error"}).`);
  }
}

async function generateAiProposals({ requestedClasses, rooms, windowsByFaculty, existingSchedules, facultyBookingsInit, requestedClassSize, loadType, preference = "earliest available time slots" }) {
  const provider = getAiProvider();
  if (!aiStartupLogged) {
    console.log(`[AI SCHEDULING] AI startup: provider=${provider?.name || "none"}, model=${provider?.model || ""}, apiKeySet=${Boolean(provider?.key)}.`);
    aiStartupLogged = true;
  }
  if (!provider?.key) return { proposals: [], attempted: 0, available: false, provider: provider?.name || "none", model: provider?.model || "" };
  const AI_MAX_TOKENS_BASE = Number(process.env.AI_MAX_TOKENS_BASE) || 1500;
  const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS) || 12000;
  const AI_DEADLINE_MS = Number(process.env.AI_DEADLINE_MS) || 18000;
  const AI_MIN_GAP_MS = Number(process.env.AI_MIN_GAP_MS) || 600;
  const state = createBookingState(existingSchedules, facultyBookingsInit);
  const aiStatusByClass = new Map(requestedClasses.map((requested) => [`${requested.facultyId}::${requested.code}::${requested.section}`, "not-sent"]));
  const optionsByClass = new Map();
  const generated = [];
  const unplaced = [];
  let aiPlaced = 0;
  let repaired = 0;
  let alternateRepaired = 0;
  let ruleRepaired = 0;
  let sentToAi = 0;
  let succeeded = 0;
  let failed = 0;
  let lastRequestStartedAt = 0;
  let fatalProviderError = false;
  const aiStartedAt = Date.now();
  const deadlineTimer = setTimeout(() => {}, AI_DEADLINE_MS);
  const chunks = chunkClassesByFaculty(requestedClasses);
  const waitForRequestStart = async () => {
    const waitMs = Math.max(0, AI_MIN_GAP_MS - (Date.now() - lastRequestStartedAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    if (Date.now() - aiStartedAt >= AI_DEADLINE_MS) return false;
    lastRequestStartedAt = Date.now();
    return true;
  };
  const validateChunk = (chunk, proposals, chunkOptions) => {
    const result = validateAndRepairAiSchedule({
      requestedClasses: chunk,
      proposals,
      rooms,
      windowsByFaculty,
      existingSchedules,
      facultyBookingsInit,
      requestedClassSize,
      loadType,
      optionsByClass: chunkOptions,
      aiStatusByClass,
      bookingState: state,
    });
    generated.push(...result.generated);
    unplaced.push(...result.unplaced);
    aiPlaced += result.aiPlaced || 0;
    repaired += result.repaired || 0;
    alternateRepaired += result.alternateRepaired || 0;
    ruleRepaired += result.ruleRepaired || 0;
  };
  try {
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      const compactClasses = chunk.map((requested, index) => ({
        classId: `c${index + 1}`,
        requested,
        options: findCandidatePlacements({
          requested,
          rooms,
          facultyWindows: windowsByFaculty.get(requested.facultyId) || [],
          facultyBookings: state.facultyBookings,
          roomBookings: state.roomBookings,
          sectionBookings: state.sectionBookings,
          requestedClassSize,
        }),
      }));
      const chunkOptions = new Map(compactClasses.map((item) => [`${item.requested.facultyId}::${item.requested.code}::${item.requested.section}`, item.options]));
      for (const [key, options] of chunkOptions) optionsByClass.set(key, options);
      const aiClasses = compactClasses.filter((item) => item.options.length > 0);
      const optionCount = aiClasses.reduce((total, item) => total + item.options.length, 0);
      const prompt = [
        "Do not think out loud; respond immediately with only the JSON object.",
        "Choose ONE option per class. Do not choose options that overlap each other for the same faculty, the same section, or the same room. Spread one faculty's classes across different days when possible. Follow the preference. Respond immediately with only the JSON object.",
        `Preference: ${preference}.`,
        "Output JSON only: {\"choices\":[{\"class\":\"c1\",\"option\":\"o3\"}]}",
        ...aiClasses.map(({ classId, requested, options }) => `${classId} | ${requested.code} ${requested.section} | ${requested.durationMinutes}min | ${options.map((option) => `${option.id} ${String(option.day).slice(0, 3)} ${toTime(option.start)}-${toTime(option.end)} ${option.room.name}`).join(" | ")}`),
      ].join("\n");
      const reasoningEffort = getReasoningEffort(provider.name, provider.model);
      if (aiClasses.length === 0 || fatalProviderError || AI_DEADLINE_MS - (Date.now() - aiStartedAt) < 8000) {
        validateChunk(chunk, [], chunkOptions);
        console.log(`[AI SCHEDULING] Chunk ${chunkIndex + 1}/${chunks.length} provider=${provider.name}, model=${provider.model}, reasoning_effort=${reasoningEffort || "none"}, classes=${chunk.length}, options=${optionCount}, prompt chars=${prompt.length}, elapsed=0ms, finish_reason=skipped, completion_tokens=0, accepted=0, sent_to_repair=${chunk.length}.`);
        continue;
      }
      const started = Date.now();
      const maxTokens = AI_MAX_TOKENS_BASE + chunk.length * 120;
      let payload = null;
      let response = null;
      let finishReason = "failed";
      let sent = false;
      let includeResponseFormat = true;
      let responseFormatRetried = false;
      let selectedCount = 0;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0 && AI_DEADLINE_MS - (Date.now() - aiStartedAt) < 5000) break;
        if (!(await waitForRequestStart())) break;
        if (!sent) sentToAi += aiClasses.length;
        sent = true;
        const remaining = () => AI_DEADLINE_MS - (Date.now() - aiStartedAt);
        try {
          response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.key}` },
            body: JSON.stringify({
              model: provider.model,
              messages: [{ role: "user", content: prompt }],
              temperature: 0.2,
              max_tokens: maxTokens,
              ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
              ...(includeResponseFormat ? { response_format: { type: "json_object" } } : {}),
            }),
            signal: AbortSignal.any([AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS), AbortSignal.timeout(Math.max(1, remaining()))]),
          });
          if (response.ok) {
            payload = await response.json();
            finishReason = payload?.choices?.[0]?.finish_reason || "unknown";
            break;
          }
          const errorText = (await response.text()).slice(0, 300);
          const responseHeaders = [];
          response.headers?.forEach?.((value, name) => {
            if (/ratelimit|retry/i.test(name)) responseHeaders.push(`${name}: ${value}`);
          });
          console.warn(`[AI SCHEDULING] ${provider.name} HTTP ${response.status} (model=${provider.model}, attempt=${attempt + 1}): ${errorText}`);
          console.warn(`[AI SCHEDULING] ${provider.name} response headers: ${responseHeaders.join("; ") || "none"}`);
          if ([401, 403].includes(response.status)) {
            if (!aiKeyRejectedLogged) {
              console.warn("[AI SCHEDULING] AI provider rejected the key.");
              aiKeyRejectedLogged = true;
            }
            fatalProviderError = true;
            break;
          }
          if (response.status === 404 && /model_not_found/i.test(errorText)) {
            await logAvailableModels(provider, AI_REQUEST_TIMEOUT_MS);
            fatalProviderError = true;
            break;
          }
          if (response.status === 400 && /response[_ ]?format/i.test(errorText) && !responseFormatRetried) {
            includeResponseFormat = false;
            responseFormatRetried = true;
            attempt -= 1;
            continue;
          }
          if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 1 || remaining() < 5000) break;
          const retryAfter = Number(response.headers?.get?.("Retry-After"));
          const retryDelay = Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(Math.max(retryAfter * 1000, 1000), 5000) : 1000;
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } catch (error) {
          console.warn(`[AI SCHEDULING] ${provider.name} request error (${error?.name || "Error"}): ${error?.message || String(error)}`);
          break;
        }
      }
      if (payload) {
        const text = stripJsonFences(getMessageContent(payload));
        const reasoning = payload?.choices?.[0]?.message?.reasoning;
        if (!text && reasoning != null) {
          console.log(`[AI SCHEDULING] Empty message content; reasoning length=${String(reasoning).length}.`);
        }
        finishReason = payload?.choices?.[0]?.finish_reason || "unknown";
        if (finishReason === "length" && !text) {
          console.warn(`[AI SCHEDULING] ${provider.name} output was truncated; completion_tokens=${payload.usage?.completion_tokens ?? 0}, reasoning_tokens=${payload.usage?.completion_tokens_details?.reasoning_tokens ?? 0}.`);
          console.warn("[AI SCHEDULING] Increase AI_MAX_TOKENS_BASE or lower AI_REASONING_EFFORT.");
          validateChunk(chunk, [], chunkOptions);
        } else {
          try {
            const parsed = JSON.parse(text);
            let choices = Array.isArray(parsed) ? parsed : parsed?.choices;
            if (!Array.isArray(choices) && parsed && typeof parsed === "object") choices = Object.values(parsed).find(Array.isArray);
            if (Array.isArray(choices)) {
              for (const item of aiClasses) aiStatusByClass.set(`${item.requested.facultyId}::${item.requested.code}::${item.requested.section}`, "succeeded");
              const byId = new Map(aiClasses.map((item) => [item.classId, item]));
              const proposals = choices.flatMap((choice) => {
                const item = byId.get(String(choice?.class));
                const option = item?.options.find((candidate) => candidate.id === String(choice?.option));
                return item && option ? [{ facultyId: item.requested.facultyId, subjectId: item.requested.subjectId, code: item.requested.code, name: item.requested.name, section: item.requested.section, day: option.day, startTime: toTime(option.start), endTime: toTime(option.end), roomId: option.room.id }] : [];
              });
              selectedCount = proposals.length;
              validateChunk(chunk, proposals, chunkOptions);
              succeeded += 1;
            } else {
              validateChunk(chunk, [], chunkOptions);
            }
          } catch {
            console.warn(`[AI SCHEDULING] Invalid ${provider.name} JSON: ${text.slice(0, 300)}`);
            validateChunk(chunk, [], chunkOptions);
          }
        }
      } else {
        validateChunk(chunk, [], chunkOptions);
      }
      if (!payload) failed += 1;
      const reasoningTokens = payload?.usage?.completion_tokens_details?.reasoning_tokens;
      const reasoningTokensLog = reasoningTokens == null ? "" : `, reasoning_tokens=${reasoningTokens}`;
      console.log(`[AI SCHEDULING] Chunk ${chunkIndex + 1}/${chunks.length} provider=${provider.name}, model=${provider.model}, reasoning_effort=${reasoningEffort || "none"}, classes=${chunk.length}, options=${optionCount}, prompt chars=${prompt.length}, elapsed=${Date.now() - started}ms, finish_reason=${finishReason}, completion_tokens=${payload?.usage?.completion_tokens ?? 0}${reasoningTokensLog}, accepted=${selectedCount}, sent_to_repair=${chunk.length - selectedCount}.`);
      if (!sent) console.log(`[AI SCHEDULING] Chunk ${chunkIndex + 1}/${chunks.length} was skipped before request.`);
    }
  } finally {
    clearTimeout(deadlineTimer);
  }
  return {
    proposals: [],
    schedule: { generated, unplaced, aiPlaced, repaired, alternateRepaired, ruleRepaired },
    attempted: sentToAi,
    available: !fatalProviderError,
    provider: provider.name,
    model: provider.model,
    chunks: chunks.length,
    succeeded,
    failed,
    optionsByClass,
    aiStatusByClass,
  };
}

function validateAndRepairAiSchedule({ requestedClasses, proposals, rooms, windowsByFaculty, existingSchedules, facultyBookingsInit, requestedClassSize, loadType, optionsByClass = new Map(), aiStatusByClass = new Map(), bookingState }) {
  const { facultyBookings, roomBookings, sectionBookings, dayLoad } = bookingState || createBookingState(existingSchedules, facultyBookingsInit);
  const roomById = new Map(rooms.map((room) => [String(room.id), room]));
  const orderedClasses = orderRequestedClasses(requestedClasses, windowsByFaculty);
  const usedProposals = new Set();
  const generated = [];
  const unplaced = [];
  let aiPlaced = 0;
  let repaired = 0;
  let alternateRepaired = 0;
  let ruleRepaired = 0;
  const rejectionCounts = {
    roomNotFound: 0,
    onlineRoom: 0,
    equipmentMismatch: 0,
    roomTooSmall: 0,
    invalidDay: 0,
    invalidTime: 0,
    wrongDuration: 0,
    outsideAvailability: 0,
    facultyConflict: 0,
    roomConflict: 0,
    sectionConflict: 0,
  };
  for (const requested of orderedClasses) {
    const proposalIndex = proposals.findIndex((proposal, index) => (
      !usedProposals.has(index)
      && String(proposal?.facultyId) === requested.facultyId
      && String(proposal?.code || "").trim() === requested.code
      && String(proposal?.section || "").trim() === requested.section
    ));
    const proposal = proposalIndex >= 0 ? proposals[proposalIndex] : null;
    if (proposal) usedProposals.add(proposalIndex);
    if (proposal) console.log(`[AI SCHEDULING] Proposal match found=true for ${JSON.stringify({ facultyId: requested.facultyId, code: requested.code, section: requested.section })}.`);
    if (!proposal) {
      const classKey = `${requested.facultyId}::${requested.code}::${requested.section}`;
      if (aiStatusByClass.get(classKey) === "succeeded") {
        const proposalKeys = proposals.map((candidate) => ({
          facultyId: candidate?.facultyId,
          facultyIdType: typeof candidate?.facultyId,
          code: candidate?.code,
          codeType: typeof candidate?.code,
          section: candidate?.section,
          sectionType: typeof candidate?.section,
        }));
        console.warn(`[AI SCHEDULING] No matching proposal for ${JSON.stringify({ facultyId: requested.facultyId, facultyIdType: typeof requested.facultyId, code: requested.code, codeType: typeof requested.code, section: requested.section, sectionType: typeof requested.section })}; proposals=${JSON.stringify(proposalKeys)}.`);
      } else {
        console.log(`[AI SCHEDULING] class ${requested.code} ${requested.section} not sent to AI (chunk skipped/failed).`);
      }
    }
    const room = proposal ? roomById.get(String(proposal.roomId)) : null;
    const start = proposal ? toMinutes(proposal.startTime) : Number.NaN;
    const end = proposal ? toMinutes(proposal.endTime) : Number.NaN;
    const facultyWindows = windowsByFaculty.get(requested.facultyId) || [];
    const validWindow = facultyWindows.some((window) => proposal?.day === window.day && start >= window.start && end <= window.end);
    const failedChecks = [];
    const roomNotFound = Boolean(proposal && !room);
    const onlineRoom = Boolean(room && isOnlineRoom(room.name));
    const equipmentMismatch = Boolean(room && !roomSupportsRequirement(room, requested.requiredEquipmentType));
    const roomTooSmall = Boolean(room && requestedClassSize != null && !(Number(room.capacity) >= requestedClassSize));
    const invalidDay = Boolean(proposal && !DAYS.includes(proposal.day));
    const invalidTime = Boolean(proposal && (!Number.isFinite(start) || !Number.isFinite(end) || start >= end));
    const actualDuration = Number.isFinite(start) && Number.isFinite(end) ? end - start : null;
    const wrongDuration = Boolean(proposal && Number.isFinite(start) && Number.isFinite(end) && actualDuration !== requested.durationMinutes);
    const outsideAvailability = Boolean(proposal && !validWindow);
    const facultyConflict = Boolean(proposal && hasFacultyTimeConflict(facultyBookings.get(requested.facultyId) || [], proposal.day, start, end));
    const roomConflict = Boolean(proposal && room && roomBookings.some((booking) => booking.roomId === String(room.id) && booking.day === proposal.day && overlaps(start, end, booking.start, booking.end)));
    const sectionConflict = Boolean(proposal && sectionBookings.some((booking) => booking.day === proposal.day && booking.sections.includes(requested.section) && overlaps(start, end, booking.start, booking.end)));
    if (roomNotFound) failedChecks.push("roomNotFound");
    if (onlineRoom) failedChecks.push("onlineRoom");
    if (equipmentMismatch) failedChecks.push("equipmentMismatch");
    if (roomTooSmall) failedChecks.push("roomTooSmall");
    if (invalidDay) failedChecks.push("invalidDay");
    if (invalidTime) failedChecks.push("invalidTime");
    if (wrongDuration) failedChecks.push(`wrongDuration(expected=${requested.durationMinutes}, actual=${actualDuration})`);
    if (outsideAvailability) failedChecks.push("outsideAvailability");
    if (facultyConflict) failedChecks.push("facultyConflict");
    if (roomConflict) failedChecks.push("roomConflict");
    if (sectionConflict) failedChecks.push("sectionConflict");
    const valid = Boolean(
      proposal
      && !roomNotFound
      && !onlineRoom
      && !equipmentMismatch
      && !roomTooSmall
      && !invalidDay
      && !invalidTime
      && !wrongDuration
      && !outsideAvailability
      && !facultyConflict
      && !roomConflict
      && !sectionConflict
    );
    if (proposal && failedChecks.length > 0) {
      for (const check of failedChecks) rejectionCounts[check.split("(")[0]] += 1;
      console.warn(`[AI SCHEDULING] Rejected proposal ${JSON.stringify({ day: proposal.day, startTime: proposal.startTime, endTime: proposal.endTime, roomId: proposal.roomId })}; failedChecks=${JSON.stringify(failedChecks)}.`);
    }
    if (valid) {
      const placement = { room, day: proposal.day, start, end };
      bookPlacement({ requested, placement, facultyBookings, roomBookings, sectionBookings, dayLoad });
      generated.push(makeGeneratedRow(requested, placement, requestedClassSize, loadType, "ai"));
      aiPlaced += 1;
      continue;
    }
    const conflictChecks = new Set(["facultyConflict", "roomConflict", "sectionConflict"]);
    const conflictOnly = Boolean(proposal && failedChecks.length > 0 && failedChecks.every((check) => conflictChecks.has(check.split("(")[0])));
    let alternatePlacement = null;
    if (conflictOnly) {
      const optionKey = `${requested.facultyId}::${requested.code}::${requested.section}`;
      for (const option of optionsByClass.get(optionKey) || []) {
        const optionStart = option.start;
        const optionEnd = option.end;
        const optionRoom = roomById.get(String(option.room.id));
        const conflicts = hasFacultyTimeConflict(facultyBookings.get(requested.facultyId) || [], option.day, optionStart, optionEnd)
          || roomBookings.some((booking) => booking.roomId === String(optionRoom?.id) && booking.day === option.day && overlaps(optionStart, optionEnd, booking.start, booking.end))
          || sectionBookings.some((booking) => booking.day === option.day && booking.sections.includes(requested.section) && overlaps(optionStart, optionEnd, booking.start, booking.end));
        if (!conflicts) {
          alternatePlacement = { room: optionRoom, day: option.day, start: optionStart, end: optionEnd };
          break;
        }
      }
    }
    if (alternatePlacement) {
      bookPlacement({ requested, placement: alternatePlacement, facultyBookings, roomBookings, sectionBookings, dayLoad });
      generated.push(makeGeneratedRow(requested, alternatePlacement, requestedClassSize, loadType, "repaired"));
      repaired += 1;
      alternateRepaired += 1;
      continue;
    }
    const repairedPlacement = findPlacement({
      requested,
      rooms,
      facultyWindows,
      facultyBookings,
      roomBookings,
      sectionBookings,
      requestedClassSize,
      strategy: "earliest",
      dayLoad,
    });
    if (repairedPlacement) {
      bookPlacement({ requested, placement: repairedPlacement, facultyBookings, roomBookings, sectionBookings, dayLoad });
      generated.push(makeGeneratedRow(requested, repairedPlacement, requestedClassSize, loadType, "repaired"));
      repaired += 1;
      ruleRepaired += 1;
      continue;
    }
    unplaced.push(makeUnplacedClass({
      requested,
      facultyWindows,
      rooms,
      facultyBookings,
      roomBookings,
      sectionBookings,
      requestedClassSize,
    }));
  }
  const sentToAi = requestedClasses.filter((requested) => aiStatusByClass.get(`${requested.facultyId}::${requested.code}::${requested.section}`) === "succeeded").length;
  const neverSent = requestedClasses.length - sentToAi;
  console.log(`[AI SCHEDULING] AI validation rejection summary: ${JSON.stringify(rejectionCounts)}.`);
  console.log(`[AI SCHEDULING] AI placement summary: total=${requestedClasses.length}, sentToAi=${sentToAi}, acceptedAsIs=${aiPlaced}, alternateOption=${alternateRepaired}, ruleBased=${ruleRepaired}, neverSent=${neverSent}.`);
  return { generated, unplaced, aiPlaced, repaired, alternateRepaired, ruleRepaired, sentToAi, neverSent };
}

async function rewriteUnplacedExplanations(unplaced) {
  if (unplaced.length === 0) return { items: unplaced, available: true };
  const provider = getAiProvider();
  if (!provider?.key) return { items: unplaced, available: false };

  try {
    const model = process.env.AI_EXPLAIN_MODEL || provider.model;
    const reasoningEffort = getReasoningEffort(provider.name, model);
    const itemsToRewrite = unplaced.slice(0, 10);
    const prompt = [
      "You are helping a university scheduler recover classes that could not be placed.",
      "For each item write an explanation and 1-3 ordered fixes using only facts in its diagnostics.",
      "Name specific days, times, rooms, sections, and numbers. Never invent facts or claim a slot is workable unless it appears in nearMisses or availabilityGaps.",
      "Keep each explanation under 60 words and each fix under 30 words.",
      "Return JSON only: {\"explanations\":[{\"index\":number,\"explanation\":string,\"howToFix\":[string]}]}",
      `Unplaced classes: ${JSON.stringify(itemsToRewrite.map((item, index) => ({ index, code: item.code, name: item.name, faculty: item.facultyName, diagnostics: item.diagnostics })))} `,
    ].join("\n");
    let response;
    let includeResponseFormat = true;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.key}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: 2000 + itemsToRewrite.length * 300, ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}), ...(includeResponseFormat ? { response_format: { type: "json_object" } } : {}) }),
        signal: AbortSignal.timeout(12000),
      });
      if (response.ok) break;
      const errorText = await response.text();
      if (response.status === 400 && /response[_ ]?format/i.test(errorText) && includeResponseFormat) {
        includeResponseFormat = false;
        attempt -= 1;
        continue;
      }
      if (attempt === 1 || ![429, 500, 502, 503, 504].includes(response.status)) return { items: unplaced, available: false };
      await new Promise((resolve) => setTimeout(resolve, response.status === 429 ? 1500 : 500));
    }
    if (!response?.ok) return { items: unplaced, available: false };
    const payload = await response.json();
    const parsed = JSON.parse(stripJsonFences(getMessageContent(payload) || "{}"));
    const explanations = Array.isArray(parsed) ? parsed : parsed.explanations;
    if (!Array.isArray(explanations)) return { items: unplaced, available: false };
    const items = unplaced.map((item, index) => {
      const candidate = explanations.find((entry) => Number(entry?.index) === index);
      const explanation = typeof candidate?.explanation === "string" ? candidate.explanation.trim() : "";
      const howToFix = Array.isArray(candidate?.howToFix)
        ? candidate.howToFix.filter((fix) => typeof fix === "string" && fix.trim()).map((fix) => fix.trim()).slice(0, 3)
        : [];
      return explanation && explanation.length <= 600
        ? { ...item, explanation, reason: explanation, validationReason: explanation, howToFix: howToFix.length > 0 ? howToFix : item.howToFix, suggestion: (howToFix.length > 0 ? howToFix : item.howToFix).join(" "), explanationSource: "ai" }
        : item;
    });
    return { items, available: items.some((item) => item.suggestion) };
  } catch {
    return { items: unplaced, available: false };
  }
}

export async function POST(request) {
  const routeStart = Date.now();
  try {
    const body = await request.json();
    let assignments = [];
    if (Array.isArray(body.assignments)) {
      assignments = body.assignments;
    } else if (body.facultyId && Array.isArray(body.subjects)) {
      assignments = [{ facultyId: body.facultyId, subjects: body.subjects }];
    }
    const durationMinutes = Number(body.durationMinutes) || 90;
    const parsedClassSize = Number(body.classSize);
    const requestedClassSize = Number.isFinite(parsedClassSize) && parsedClassSize > 0 ? parsedClassSize : null;
    const loadType = body.loadType || "regular";

    if (assignments.length === 0) {
      return NextResponse.json({ error: "At least one faculty assignment is required" }, { status: 400 });
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      return NextResponse.json({ error: "durationMinutes must be a positive integer" }, { status: 400 });
    }
    if (requestedClassSize !== null && (!Number.isFinite(requestedClassSize) || requestedClassSize < 0)) {
      return NextResponse.json({ error: "classSize must be a non-negative number" }, { status: 400 });
    }
    if (!["regular", "overload"].includes(loadType)) {
      return NextResponse.json({ error: "loadType must be regular or overload" }, { status: 400 });
    }
    if (assignments.some((assignment) => !assignment?.facultyId || !Array.isArray(assignment.subjects) || assignment.subjects.length === 0 || assignment.subjects.some((subject) => !subject || !String(subject.code || "").trim() || !String(subject.name || "").trim()))) {
      return NextResponse.json({ error: "Each faculty assignment requires a faculty and at least one subject with a code and name" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const dbStart = Date.now();
    const facultyIds = [...new Set(assignments.map((assignment) => String(assignment.facultyId)))];
    const { data: faculties, error: facultyError } = await supabase.from("users").select("user_id, supabase_id, first_name, middle_name, last_name, status_of_appointment").in("user_id", facultyIds);
    if (facultyError) throw facultyError;
    if (faculties?.length !== facultyIds.length) return NextResponse.json({ error: "One or more faculty members were not found or have no Supabase UUID" }, { status: 400 });

    const facultyById = new Map(faculties.map((faculty) => [String(faculty.user_id), faculty]));
    const facultyUuidById = new Map(faculties.map((faculty) => [String(faculty.user_id), faculty.supabase_id]));
    const { data: availability, error: availabilityError } = await supabase.from("faculty_availability").select("faculty_id, day, start_time, end_time, delivery_mode").in("faculty_id", faculties.map((faculty) => faculty.supabase_id));
    if (availabilityError) throw availabilityError;

    const { data: assignedSchedules, error: assignedSchedulesError } = await supabase
      .from("schedules")
      .select("subject_id, faculty_id, section, room_id, day, start_time, end_time, room:rooms!schedules_room_id_fkey(name)")
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
            const assignedRoomName = normalizeRoomName(assignedSchedule.room?.name);
            unavailable.push({ subjectId: subject.subjectId ?? null, facultyId: String(assignment.facultyId), assignedFacultyName: facultyName, code: String(subject.code).trim(), name: String(subject.name).trim(), section, roomId: assignedSchedule.room_id, roomName: assignedRoomName, hasPhysicalRoom: !isOnlineRoom(assignedRoomName), day: assignedSchedule.day || "Unknown day", startTime: assignedSchedule.start_time ? String(assignedSchedule.start_time).slice(0, 5) : "", endTime: assignedSchedule.end_time ? String(assignedSchedule.end_time).slice(0, 5) : "", reason: "This section is already assigned to another faculty member." });
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

    const { data: roomsData, error: roomsError } = await supabase.from("rooms").select("id, name, capacity, equipment_type");
    if (roomsError) throw roomsError;
    const rooms = (roomsData || [])
      .map((room) => ({ ...room, name: normalizeRoomName(room.name) }))
      .filter((room) => !isOnlineRoom(room.name));
    if (!rooms || rooms.length === 0) return NextResponse.json({ error: "No physical rooms are available for scheduling" }, { status: 400 });

    const facultyBookings = new Map(facultyIds.map((id) => [id, existingSchedules.filter((schedule) => String(schedule.faculty_id) === id).map((schedule) => ({ day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time) }))]));
    const windowsByFaculty = new Map(facultyIds.map((id) => [id, campusAvailability.filter((row) => String(row.faculty_id) === String(facultyUuidById.get(id))).map((row) => ({ day: row.day, start: toMinutes(row.start_time), end: toMinutes(row.end_time) })).filter((window) => DAYS.includes(window.day) && Number.isFinite(window.start) && Number.isFinite(window.end) && window.start < window.end).sort((left, right) => DAYS.indexOf(left.day) - DAYS.indexOf(right.day) || left.start - right.start)]));
    const requestedSectionKeys = new Set();
    const deduplicatedAssignments = [...availableAssignments].sort((left, right) => (isPartTimeStatus(facultyById.get(left.facultyId)?.status_of_appointment) ? 0 : 1) - (isPartTimeStatus(facultyById.get(right.facultyId)?.status_of_appointment) ? 0 : 1)).map((assignment) => ({
      ...assignment,
      appointmentStatus: facultyById.get(assignment.facultyId)?.status_of_appointment || "full-time",
      subjects: assignment.subjects.map((subject) => ({
        ...subject,
        sections: normalizeSections(subject).filter((section) => {
          const key = `${subject.subjectId || subject.code}::${section.toLowerCase()}`;
          if (requestedSectionKeys.has(key)) return false;
          requestedSectionKeys.add(key);
          return true;
        }),
        durationMinutes: Number(subject.durationMinutes) > 0 ? Number(subject.durationMinutes) : durationMinutes,
      })).filter((subject) => subject.sections.length > 0),
    }));
    const aiAssignments = deduplicatedAssignments.filter((assignment) => assignment.subjects.length > 0);
    console.log(`[AI SCHEDULING] DB fetch completed in ${Date.now() - dbStart}ms.`);
    const requestedClasses = buildRequestedClasses({ assignments: aiAssignments, facultyById, durationMinutes });
    const aiRecommendationCount = Math.min(3, Math.max(1, Number(process.env.AI_RECOMMENDATION_COUNT) || 1));
    const generationStart = Date.now();
    const strategies = ["earliest", "balanced", "latest"];
    const preferences = ["earliest available time slots", "balanced workload across available days", "later available time slots"];
    const generatedRecommendations = [];
    for (let recommendationIndex = 0; recommendationIndex < 3; recommendationIndex += 1) {
      const strategy = strategies[recommendationIndex];
      let schedule;
      let metadata = { source: "rule-based", aiPlaced: 0, repaired: 0, aiAvailable: false, aiMs: 0, aiProvider: "none", aiModel: "" };
      if (recommendationIndex < aiRecommendationCount) {
        const aiStart = Date.now();
        const aiResult = await generateAiProposals({
          requestedClasses,
          rooms,
          windowsByFaculty,
          existingSchedules,
          facultyBookingsInit: facultyBookings,
          requestedClassSize,
          loadType,
          preference: preferences[recommendationIndex],
        });
        const aiMs = Date.now() - aiStart;
        const fallbackUsed = !aiResult.schedule;
        if (fallbackUsed) {
          schedule = generateDeterministic({
            requestedClasses,
            rooms,
            windowsByFaculty,
            existingSchedules,
            facultyBookingsInit: facultyBookings,
            requestedClassSize,
            loadType,
            strategy,
          });
        } else {
          schedule = aiResult.schedule;
        }
        const aiPlaced = schedule.aiPlaced || 0;
        const repaired = schedule.repaired || 0;
        const source = aiPlaced > 0 && repaired > 0 ? "ai+repair" : aiPlaced > 0 ? "ai" : "rule-based";
        metadata = {
          source,
          aiPlaced,
          repaired,
          aiAvailable: !fallbackUsed && aiResult.available,
          aiMs,
          aiProvider: aiResult.provider || "none",
          aiModel: aiResult.model || "",
        };
        console.log(`[AI SCHEDULING] AI time=${aiMs}ms, provider=${aiResult.provider || "none"}, model=${aiResult.model || ""}, chunks=${aiResult.chunks || 0}, succeeded=${aiResult.succeeded || 0}, failed=${aiResult.failed || 0}, aiPlaced=${aiPlaced}, repaired=${repaired}, fallback used=${fallbackUsed}.`);
      } else {
        schedule = generateDeterministic({
          requestedClasses,
          rooms,
          windowsByFaculty,
          existingSchedules,
          facultyBookingsInit: facultyBookings,
          requestedClassSize,
          loadType,
          strategy,
        });
      }
      generatedRecommendations.push({ schedule, metadata });
    }
    console.log(`[AI SCHEDULING] Generation completed in ${Date.now() - generationStart}ms.`);
    const recommendations = generatedRecommendations.map(({ schedule, metadata }, recommendationIndex) => {
      const workloadByFaculty = schedule.generated.reduce((workload, row) => {
        const facultyName = row.facultyName || row.facultyId;
        const current = workload.get(facultyName) || { classes: 0, contactHours: 0 };
        current.classes += 1;
        current.contactHours += Number(row.lectureContactHours || 0) + Number(row.labContactHours || 0);
        workload.set(facultyName, current);
        return workload;
      }, new Map());
      const workloadSummary = [...workloadByFaculty.entries()]
        .map(([facultyName, workload]) => `${facultyName}: ${workload.classes} class${workload.classes === 1 ? "" : "es"} / ${workload.contactHours} contact hour${workload.contactHours === 1 ? "" : "s"}`)
        .join("; ") || "No faculty workload was scheduled.";
      const sourceNote = metadata.source === "ai+repair"
        ? `AI placed ${metadata.aiPlaced} of ${requestedClasses.length} classes; ${metadata.repaired} were corrected by the constraint checker.`
        : metadata.source === "ai"
          ? `AI placed ${metadata.aiPlaced} of ${requestedClasses.length} classes and all passed the constraint checker.`
          : "";
      return {
        id: `recommendation-${recommendationIndex + 1}`,
        generated: schedule.generated,
        unplaced: schedule.unplaced,
        summary: {
          conflicts: schedule.unplaced.length,
          scheduled: schedule.generated.length,
          total: requestedClasses.length,
          workload: workloadSummary,
          notes: [sourceNote, schedule.unplaced.length > 0 ? "Some classes need attention before this schedule can be finalized." : ""].filter(Boolean).join(" "),
          ...metadata,
        },
      };
    });
    const seenSchedules = new Set();
    const deduplicatedRecommendations = recommendations.filter((recommendation) => {
      const signature = [...recommendation.generated]
        .sort((left, right) => `${left.facultyId}::${left.code}::${left.section}`.localeCompare(`${right.facultyId}::${right.code}::${right.section}`))
        .map((row) => `${row.facultyId}|${row.code}|${row.section}|${row.day}|${row.startTime}|${row.roomId}`)
        .join(";");
      if (seenSchedules.has(signature)) return false;
      seenSchedules.add(signature);
      return true;
    });
    let recommendationsToReturn = deduplicatedRecommendations.length > 0 ? deduplicatedRecommendations : recommendations;
    const conflictFreeRecommendations = recommendationsToReturn.filter((recommendation) => recommendation.unplaced.length === 0);
    if (conflictFreeRecommendations.length === 0) {
      const suggestionStart = Date.now();
      const seenUnplaced = new Set();
      const uniqueUnplaced = [];
      for (const recommendation of recommendationsToReturn) {
        for (const item of recommendation.unplaced) {
          const key = `${item.facultyId}::${item.code}::${item.section}`;
          if (!seenUnplaced.has(key)) {
            seenUnplaced.add(key);
            uniqueUnplaced.push({ ...item, _rewriteKey: key });
          }
        }
      }
      const rewritten = Date.now() - routeStart <= 40000
        ? await rewriteUnplacedExplanations(uniqueUnplaced)
        : { items: uniqueUnplaced, available: false };
      const rewrittenByKey = new Map(rewritten.items.map((item) => [item._rewriteKey, item]));
      const appliedKeys = new Set();
      recommendationsToReturn = recommendationsToReturn.map((recommendation) => ({
        ...recommendation,
        unplaced: recommendation.unplaced.map((item) => {
          const key = `${item.facultyId}::${item.code}::${item.section}`;
          if (appliedKeys.has(key)) return item;
          appliedKeys.add(key);
          const rewrittenItem = rewrittenByKey.get(key);
          if (!rewrittenItem) return item;
          const cleanItem = { ...rewrittenItem };
          delete cleanItem._rewriteKey;
          return cleanItem;
        }),
      }));
      console.log(`[AI SCHEDULING] Optional suggestions completed in ${Date.now() - suggestionStart}ms.`);
      const totalRouteTime = Date.now() - routeStart;
      if (totalRouteTime > 25000) console.warn(`[AI SCHEDULING] Total route time exceeded 25 seconds: ${totalRouteTime}ms.`);
      console.log(`[AI SCHEDULING] Total route time: ${totalRouteTime}ms.`);
      const unplacedItems = recommendationsToReturn.flatMap((recommendation) => recommendation.unplaced);
      const mainCause = unplacedItems
        .flatMap((item) => Object.entries(item.diagnostics?.blockedSlots?.counts || {}))
        .sort((left, right) => right[1] - left[1])[0];
      const errorMessage = mainCause && mainCause[1] > 0
        ? `${unplacedItems.length} classes could not be placed. Main cause: ${mainCause[0]} (${mainCause[1]} blocked slot${mainCause[1] === 1 ? "" : "s"}).`
        : `${unplacedItems.length} classes could not be placed. Main cause: no legal placement matched the faculty availability, room, and section constraints.`;
      return NextResponse.json(
        {
          error: errorMessage,
          unavailable: recommendationsToReturn.flatMap((recommendation) => recommendation.unplaced),
        },
        { status: 422 }
      );
    }

    const totalRouteTime = Date.now() - routeStart;
    if (totalRouteTime > 25000) console.warn(`[AI SCHEDULING] Total route time exceeded 25 seconds: ${totalRouteTime}ms.`);
    console.log(`[AI SCHEDULING] Total route time: ${totalRouteTime}ms.`);
    return NextResponse.json({ recommendations: conflictFreeRecommendations, unavailable });
  } catch (error) {
    console.error("[AI SCHEDULING GENERATE ERROR]", error);
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI schedule generation failed" }, { status });
  }
}