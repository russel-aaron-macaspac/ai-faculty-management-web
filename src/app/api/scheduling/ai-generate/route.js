import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ONLINE_ROOM_PATTERN = /online|virtual|remote|tbd|tba/i;

function toMinutes(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : NaN;
}

function toTime(value) {
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}

function overlaps(start, end, otherStart, otherEnd) {
  return start < otherEnd && end > otherStart;
}

function isOnlineRoom(name) {
  return ONLINE_ROOM_PATTERN.test(String(name || ""));
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { facultyId, subjects } = body;
    const durationMinutes = Number(body.durationMinutes) || 90;
    const requestedClassSize = Number(body.classSize) || 0;
    const section = String(body.section || "").trim();
    const loadType = body.loadType || "regular";

    if (!facultyId || !Array.isArray(subjects) || subjects.length === 0) {
      return NextResponse.json({ error: "facultyId and subjects are required" }, { status: 400 });
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
    if (subjects.some((subject) => !subject || !String(subject.code || "").trim() || !String(subject.name || "").trim())) {
      return NextResponse.json({ error: "Each subject requires a code and name" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: faculty, error: facultyError } = await supabase.from("users").select("user_id, supabase_id").eq("user_id", facultyId).maybeSingle();
    if (facultyError) throw facultyError;
    if (!faculty?.user_id || !faculty.supabase_id) return NextResponse.json({ error: "Faculty not found or has no Supabase UUID" }, { status: 400 });

    const { data: availability, error: availabilityError } = await supabase.from("faculty_availability").select("day, start_time, end_time").eq("faculty_id", faculty.supabase_id);
    if (availabilityError) throw availabilityError;

    const { data: assignedSchedules, error: assignedSchedulesError } = await supabase
      .from("schedules")
      .select("subject_id, faculty_id")
      .neq("status", "rejected");
    if (assignedSchedulesError) throw assignedSchedulesError;

    const assignedToOtherFaculty = new Set(
      (assignedSchedules || [])
        .filter((schedule) => String(schedule.faculty_id) !== String(faculty.user_id))
        .map((schedule) => String(schedule.subject_id))
    );
    const unavailable = subjects
      .filter((subject) => assignedToOtherFaculty.has(String(subject.subjectId)))
      .map((subject) => ({
        subjectId: subject.subjectId ?? null,
        code: String(subject.code).trim(),
        name: String(subject.name).trim(),
        reason: "This subject is already assigned to another faculty member.",
      }));
    const availableSubjects = subjects.filter((subject) => !assignedToOtherFaculty.has(String(subject.subjectId)));

    const availableDays = [...new Set((availability || []).map((row) => row.day))];
    let existingSchedules = [];
    if (availableDays.length > 0) {
      const { data, error } = await supabase.from("schedules").select("faculty_id, room_id, day, start_time, end_time, status").in("day", availableDays).neq("status", "rejected");
      if (error) throw error;
      existingSchedules = data || [];
    }

    const { data: rooms, error: roomsError } = await supabase.from("rooms").select("id, name, capacity").order("capacity", { ascending: true });
    if (roomsError) throw roomsError;

    const facultyBookings = existingSchedules.filter((schedule) => String(schedule.faculty_id) === String(faculty.user_id)).map((schedule) => ({ day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time) }));
    const roomBookings = existingSchedules.map((schedule) => ({ roomId: String(schedule.room_id), day: schedule.day, start: toMinutes(schedule.start_time), end: toMinutes(schedule.end_time) }));
    const windows = (availability || []).map((row) => ({ day: row.day, start: toMinutes(row.start_time), end: toMinutes(row.end_time) })).filter((window) => DAYS.includes(window.day) && Number.isFinite(window.start) && Number.isFinite(window.end) && window.start < window.end).sort((left, right) => DAYS.indexOf(left.day) - DAYS.indexOf(right.day) || left.start - right.start);
    const generated = [];
    const unplaced = [];

    for (const subject of availableSubjects) {
      const subjectDuration = Number(subject.durationMinutes) || durationMinutes;
      let placement = null;
      for (const window of windows) {
        for (let start = window.start; start + subjectDuration <= window.end; start += 30) {
          const end = start + subjectDuration;
          if (facultyBookings.some((booking) => booking.day === window.day && overlaps(start, end, booking.start, booking.end))) continue;
          const room = (rooms || []).find((candidate) => {
            if (!isOnlineRoom(candidate.name) && Number(candidate.capacity) < requestedClassSize) return false;
            return !roomBookings.some((booking) => booking.roomId === String(candidate.id) && booking.day === window.day && overlaps(start, end, booking.start, booking.end));
          });
          if (room) {
            placement = { room, day: window.day, start, end };
            break;
          }
        }
        if (placement) break;
      }

      if (!placement) {
        unplaced.push({ subjectId: subject.subjectId ?? null, code: String(subject.code).trim(), name: String(subject.name).trim(), reason: "No open slot found within saved availability that avoids conflicts." });
        continue;
      }

      facultyBookings.push({ day: placement.day, start: placement.start, end: placement.end });
      roomBookings.push({ roomId: String(placement.room.id), day: placement.day, start: placement.start, end: placement.end });
      const units = Number((subjectDuration / 60).toFixed(2));
      generated.push({ subjectId: subject.subjectId ?? null, code: String(subject.code).trim(), name: String(subject.name).trim(), day: placement.day, startTime: toTime(placement.start), endTime: toTime(placement.end), section: String(section).trim(), roomId: placement.room.id, roomName: placement.room.name, units, lectureContactHours: units, labContactHours: 0, classSize: requestedClassSize, loadType });
    }

    return NextResponse.json({ generated, unplaced, unavailable });
  } catch (error) {
    console.error("[AI SCHEDULING GENERATE ERROR]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}