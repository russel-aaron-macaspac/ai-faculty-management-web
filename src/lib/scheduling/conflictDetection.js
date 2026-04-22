const DAY_VALUES = new Set([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

function overlaps(startTime, endTime, existingStartTime, existingEndTime) {
  return startTime < existingEndTime && endTime > existingStartTime;
}

function toMinutes(time) {
  if (!time?.includes(":")) return null;
  const [hour, minute] = time.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

function toHHMM(minutes) {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function findFreeSlots({ availabilityRows, occupiedRows, durationMinutes }) {
  const slots = [];

  for (const availability of availabilityRows) {
    const start = toMinutes(String(availability.start_time).slice(0, 5));
    const end = toMinutes(String(availability.end_time).slice(0, 5));

    if (start === null || end === null || end <= start || end - start < durationMinutes) {
      continue;
    }

    for (let candidateStart = start; candidateStart + durationMinutes <= end; candidateStart += 30) {
      const candidateEnd = candidateStart + durationMinutes;
      const candidateStartHHMM = toHHMM(candidateStart);
      const candidateEndHHMM = toHHMM(candidateEnd);

      const intersects = occupiedRows.some((row) =>
        overlaps(
          candidateStartHHMM,
          candidateEndHHMM,
          String(row.start_time).slice(0, 5),
          String(row.end_time).slice(0, 5)
        )
      );

      if (!intersects) {
        slots.push({
          day: availability.day,
          start_time: candidateStartHHMM,
          end_time: candidateEndHHMM,
        });
      }
    }
  }

  return slots.slice(0, 10);
}

/**
 * Helper: if caller provided numeric userId but we need the user's supabase_id (uuid),
 * fetch it from users table. Returns null if not found.
 */
async function resolveUserUuidIfNeeded(supabase, { userId, userUuid }) {
  if (userUuid) return userUuid;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("users")
    .select("supabase_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.supabase_id ?? null;
}

export async function detectScheduleConflicts(supabase, payload) {
  const { userId = null, userUuid = null, roomId, day, startTime, endTime, excludeScheduleId } = payload;

  if (!DAY_VALUES.has(day)) {
    return {
      hasConflict: true,
      conflict_type: "availability",
      conflicts: [{ reason: "Invalid day value" }],
    };
  }

  // Fetch all schedules for the day (exclude rejected)
  const baseQuery = supabase
    .from("schedules")
    .select("id, faculty_id, faculty_id_uuid, subject_id, room_id, day, start_time, end_time, status")
    .eq("day", day)
    .neq("status", "rejected");

  const scopedQuery = excludeScheduleId ? baseQuery.neq("id", excludeScheduleId) : baseQuery;
  const { data: daySchedules, error: schedulesError } = await scopedQuery;

  if (schedulesError) {
    throw schedulesError;
  }

  const overlappingRows = (daySchedules || []).filter((row) =>
    overlaps(startTime, endTime, String(row.start_time).slice(0, 5), String(row.end_time).slice(0, 5))
  );

  const facultyConflicts = overlappingRows.filter((row) => {
    if (userId != null && String(row.faculty_id) === String(userId)) return true;
    if (userUuid != null && row.faculty_id_uuid && String(row.faculty_id_uuid) === String(userUuid)) return true;
    return false;
  });
  const roomConflicts = overlappingRows.filter((row) => String(row.room_id) === String(roomId));

  let availabilityRows = [];
  try {
    const resolvedUuid = await resolveUserUuidIfNeeded(supabase, { userId, userUuid });
    if (resolvedUuid) {
      const { data: availData, error: availabilityError } = await supabase
        .from("faculty_availability")
        .select("id, day, start_time, end_time")
        .eq("faculty_id", resolvedUuid)
        .eq("day", day);

      if (availabilityError) throw availabilityError;
      availabilityRows = availData || [];
    } else {
      // No uuid available: treat as no availability rows (will mark as conflict)
      availabilityRows = [];
    }
  } catch (err) {
    throw err;
  }

  const withinAvailability = availabilityRows.some(
    (row) =>
      startTime >= String(row.start_time).slice(0, 5) &&
      endTime <= String(row.end_time).slice(0, 5)
  );

  const conflicts = [];
  if (facultyConflicts.length > 0) {
    conflicts.push({
      conflict_type: "faculty",
      details: facultyConflicts,
    });
  }

  if (roomConflicts.length > 0) {
    conflicts.push({
      conflict_type: "room",
      details: roomConflicts,
    });
  }

  if (!withinAvailability) {
    conflicts.push({
      conflict_type: "availability",
      details: availabilityRows,
    });
  }

  return {
    hasConflict: conflicts.length > 0,
    conflict_type: conflicts[0]?.conflict_type ?? null,
    conflicts,
  };
}

export async function generateConflictSuggestions(supabase, payload) {
  const { userId = null, userUuid = null, day, startTime, endTime } = payload;

  const { data: overlappingSchedules, error: overlapError } = await supabase
    .from("schedules")
    .select("room_id, start_time, end_time")
    .eq("day", day)
    .neq("status", "rejected");

  if (overlapError) {
    throw overlapError;
  }

  const occupiedRoomIds = new Set(
    (overlappingSchedules || [])
      .filter((row) => overlaps(startTime, endTime, String(row.start_time).slice(0, 5), String(row.end_time).slice(0, 5)))
      .map((row) => row.room_id)
  );

  const { data: allRooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id, name, capacity")
    .order("name", { ascending: true });

  if (roomsError) {
    throw roomsError;
  }

  const suggestedRooms = (allRooms || []).filter((room) => !occupiedRoomIds.has(room.id));

  const resolvedUuid = await resolveUserUuidIfNeeded(supabase, { userId, userUuid });

  let facultyAvailability = [];
  let facultyDaySchedules = [];
  try {
    if (resolvedUuid) {
      const { data: availabilityData, error: availabilityError } = await supabase
        .from("faculty_availability")
        .select("id, day, start_time, end_time")
        .eq("faculty_id", resolvedUuid)
        .eq("day", day)
        .order("start_time", { ascending: true });

      if (availabilityError) throw availabilityError;
      facultyAvailability = availabilityData || [];

      const { data: facultySchedulesData, error: facultySchedulesError } = await supabase
        .from("schedules")
        .select("start_time, end_time")
        .eq("faculty_id_uuid", resolvedUuid)
        .eq("day", day)
        .neq("status", "rejected");

      if (facultySchedulesError) throw facultySchedulesError;
      facultyDaySchedules = facultySchedulesData || [];
    } else if (userId) {
      // If no uuid but we have userId, try integer-based availability/schedules as fallback
      const { data: availabilityData, error: availabilityError } = await supabase
        .from("faculty_availability")
        .select("id, day, start_time, end_time")
        .eq("faculty_id", null) // intentionally no-op; schema expects uuid so skip
        .limit(0);

      facultyAvailability = [];
      const { data: facultySchedulesData, error: facultySchedulesError } = await supabase
        .from("schedules")
        .select("start_time, end_time")
        .eq("faculty_id", userId)
        .eq("day", day)
        .neq("status", "rejected");

      if (facultySchedulesError) throw facultySchedulesError;
      facultyDaySchedules = facultySchedulesData || [];
    }
  } catch (err) {
    console.error("[GENERATE SUGGESTIONS ERROR]", err);
    return { suggested_rooms: [], suggested_time_slots: [] };
  }

  const duration = toMinutes(endTime) - toMinutes(startTime);
  const suggestedTimeSlots = findFreeSlots({
    availabilityRows: facultyAvailability || [],
    occupiedRows: facultyDaySchedules || [],
    durationMinutes: duration > 0 ? duration : 60,
  });

  return {
    suggested_rooms: suggestedRooms.slice(0, 10),
    suggested_time_slots: suggestedTimeSlots,
  };
}
