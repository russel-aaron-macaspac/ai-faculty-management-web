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

export async function detectScheduleConflicts(supabase, payload) {
  const { facultyId, roomId, day, startTime, endTime, excludeScheduleId } = payload;

  if (!DAY_VALUES.has(day)) {
    return {
      hasConflict: true,
      conflict_type: "availability",
      conflicts: [{ reason: "Invalid day value" }],
    };
  }

  const baseQuery = supabase
    .from("schedules")
    .select("id, faculty_id, subject_id, room_id, day, start_time, end_time, status")
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

  const facultyConflicts = overlappingRows.filter((row) => String(row.faculty_id) === String(facultyId));
  const roomConflicts = overlappingRows.filter((row) => row.room_id === roomId);

  const { data: availabilityRows, error: availabilityError } = await supabase
    .from("faculty_availability")
    .select("id, day, start_time, end_time")
    .eq("faculty_id", facultyId)
    .eq("day", day);

  if (availabilityError) {
    throw availabilityError;
  }

  const availabilityList = availabilityRows || [];
  const withinAvailability = availabilityList.some(
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
      details: availabilityList,
    });
  }

  return {
    hasConflict: conflicts.length > 0,
    conflict_type: conflicts[0]?.conflict_type,
    conflicts,
  };
}

export async function generateConflictSuggestions(supabase, payload) {
  const { facultyId, day, startTime, endTime } = payload;

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

  const { data: facultyAvailability, error: availabilityError } = await supabase
    .from("faculty_availability")
    .select("id, day, start_time, end_time")
    .eq("faculty_id", facultyId)
    .eq("day", day)
    .order("start_time", { ascending: true });

  if (availabilityError) {
    throw availabilityError;
  }

  const { data: facultyDaySchedules, error: facultySchedulesError } = await supabase
    .from("schedules")
    .select("start_time, end_time")
    .eq("faculty_id", facultyId)
    .eq("day", day)
    .neq("status", "rejected");

  if (facultySchedulesError) {
    throw facultySchedulesError;
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
