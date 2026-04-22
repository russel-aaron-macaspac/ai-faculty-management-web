import type { SupabaseClient } from '@supabase/supabase-js';

type AttendanceLogRecord = {
  time_in?: string | null;
  time_out?: string | null;
  log_date?: string | null;
};

type UserScanRecord = {
  timestamp: string;
};

type ScheduleInfo = {
  startTime: string | null;
  endTime: string | null;
  roomId: string | null;
  roomName: string | null;
};

type DeviceRoomInfo = {
  roomId: string | null;
  roomName: string | null;
  location: string | null;
  display: string;
};

type ScheduleValidationResult = {
  hasSchedule: boolean;
  withinScheduledTime: boolean;
  roomMatches: boolean;
  flags: Set<DetectionFlag>;
};

type AveragesResult = {
  averageTimeInMinutes: number | null;
  averageTimeIn: string | null;
  standardDeviationMinutes: number;
  sampleCount: number;
};

type DetectionFlag =
  | 'duplicate_scan'
  | 'late'
  | 'early'
  | 'anomaly'
  | 'no_schedule'
  | 'outside_schedule'
  | 'wrong_room'
  | 'unauthorized_access';

type PatternDetectionResult = {
  flags: Set<DetectionFlag>;
  insights: string[];
};

type AnalyzeScanParams = {
  supabase: SupabaseClient;
  userId: number;
  deviceId: string;
  scanTimestamp: string;
};

type AIResponse = {
  status: string;
  message: string;
  recommendation: string;
  insights: string[];
  suggestedNextScan: string;
  schedule: {
    startTime: string | null;
    endTime: string | null;
    roomId: string | null;
  };
  deviceRoom: string;
};

const DUPLICATE_SCAN_WINDOW_MINUTES = 5;
const LATE_THRESHOLD_MINUTES = 10;
const EARLY_THRESHOLD_MINUTES = 20;
const MIN_ANOMALY_DEVIATION_MINUTES = 45;
const HISTORY_WINDOW_DAYS = 30;
const RECENT_SCAN_WINDOW_DAYS = 7;

function normalizeText(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

function toStringValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  return null;
}

function toMinutesFromClock(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const [hoursRaw, minutesRaw] = value.split(':');
  const hours = Number.parseInt(hoursRaw || '', 10);
  const minutes = Number.parseInt(minutesRaw || '', 10);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function toMinutesFromTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.getHours() * 60 + parsed.getMinutes();
}

function toTimeDisplay(value: string | null | undefined): string {
  if (!value) {
    return 'N/A';
  }

  const asClock = value.includes('T') ? value.split('T')[1]?.slice(0, 5) : value.slice(0, 5);
  const [hoursRaw, minutesRaw] = (asClock || value).split(':');
  const hours = Number.parseInt(hoursRaw || '', 10);
  const minutes = Number.parseInt(minutesRaw || '', 10);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return value;
  }

  const hour12 = hours % 12 || 12;
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  return `${hour12}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}

function plusMinutes(isoTimestamp: string, minutes: number): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function pickScheduleForScan(scheduleRows: ScheduleInfo[], scanMinutes: number): ScheduleInfo | null {
  if (!scheduleRows.length) {
    return null;
  }

  const activeNow = scheduleRows.find((schedule) => {
    const start = toMinutesFromClock(schedule.startTime);
    const end = toMinutesFromClock(schedule.endTime);
    return start !== null && end !== null && scanMinutes >= start && scanMinutes <= end;
  });

  if (activeNow) {
    return activeNow;
  }

  const upcoming = scheduleRows
    .map((schedule) => ({ schedule, start: toMinutesFromClock(schedule.startTime) }))
    .filter((entry): entry is { schedule: ScheduleInfo; start: number } => entry.start !== null)
    .filter((entry) => entry.start >= scanMinutes)
    .sort((a, b) => a.start - b.start)[0];

  if (upcoming) {
    return upcoming.schedule;
  }

  return scheduleRows[0];
}

function formatAverageClock(averageMinutes: number | null): string | null {
  if (averageMinutes === null) {
    return null;
  }

  const hours = Math.floor(averageMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = Math.round(averageMinutes % 60)
    .toString()
    .padStart(2, '0');
  return `${hours}:${minutes}:00`;
}

export function calculateAverages(attendanceLogs: AttendanceLogRecord[]): AveragesResult {
  const timeInMinutes = attendanceLogs
    .map((log) => toMinutesFromTimestamp(log.time_in ?? null))
    .filter((value): value is number => value !== null);

  if (!timeInMinutes.length) {
    return {
      averageTimeInMinutes: null,
      averageTimeIn: null,
      standardDeviationMinutes: 0,
      sampleCount: 0,
    };
  }

  const averageTimeInMinutes =
    timeInMinutes.reduce((sum, value) => sum + value, 0) / timeInMinutes.length;

  const variance =
    timeInMinutes.reduce((sum, value) => sum + (value - averageTimeInMinutes) ** 2, 0) /
    timeInMinutes.length;

  return {
    averageTimeInMinutes,
    averageTimeIn: formatAverageClock(averageTimeInMinutes),
    standardDeviationMinutes: Math.sqrt(variance),
    sampleCount: timeInMinutes.length,
  };
}

async function getRecentAttendanceLogs(
  supabase: SupabaseClient,
  userId: number,
  fromDate: string
): Promise<AttendanceLogRecord[]> {
  const logsResponse = await supabase
    .from('attendance_logs')
    .select('time_in, time_out, log_date')
    .eq('user_id', userId)
    .gte('log_date', fromDate)
    .not('time_in', 'is', null)
    .order('log_date', { ascending: false })
    .limit(120);

  if (!logsResponse.error && logsResponse.data) {
    return logsResponse.data as AttendanceLogRecord[];
  }

  const attendanceFallback = await supabase
    .from('attendance')
    .select('time_in, time_out, date')
    .eq('user_id', userId)
    .gte('date', fromDate)
    .not('time_in', 'is', null)
    .order('date', { ascending: false })
    .limit(120);

  if (attendanceFallback.error || !attendanceFallback.data) {
    return [];
  }

  return (attendanceFallback.data as Array<{ time_in?: string; time_out?: string; date?: string }>).map(
    (row) => ({
      time_in: row.time_in ?? null,
      time_out: row.time_out ?? null,
      log_date: row.date ?? null,
    })
  );
}

async function getRecentUserScans(
  supabase: SupabaseClient,
  userId: number,
  fromTimestamp: string
): Promise<UserScanRecord[]> {
  const { data, error } = await supabase
    .from('rfid_scans')
    .select('timestamp')
    .eq('user_id', userId)
    .gte('timestamp', fromTimestamp)
    .order('timestamp', { ascending: false })
    .limit(20);

  if (error || !data) {
    return [];
  }

  return data as UserScanRecord[];
}

export async function getTodaySchedule(
  supabase: SupabaseClient,
  userId: number,
  scanTimestamp: string
): Promise<ScheduleInfo | null> {
  const scanDate = new Date(scanTimestamp);
  const dayName = scanDate.toLocaleDateString('en-US', { weekday: 'long' });
  const scanMinutes = toMinutesFromTimestamp(scanTimestamp) ?? 0;

  const modernResponse = await supabase
    .from('schedules')
    .select(
      `
      faculty_id,
      day,
      start_time,
      end_time,
      room_id,
      room:rooms!schedules_room_id_fkey (
        id,
        name
      )
    `
    )
    .eq('faculty_id', userId)
    .eq('day', dayName)
    .order('start_time', { ascending: true });

  if (!modernResponse.error && modernResponse.data) {
    const schedules = (modernResponse.data as Array<Record<string, unknown>>).map((row) => {
      const roomValue = Array.isArray(row.room) ? row.room[0] : row.room;
      const roomRecord = roomValue as { id?: string | number; name?: string } | null;

      return {
        startTime: (row.start_time as string | null) ?? null,
        endTime: (row.end_time as string | null) ?? null,
        roomId:
          toStringValue(row.room_id) ??
          (roomRecord?.id !== undefined && roomRecord?.id !== null ? String(roomRecord.id) : null),
        roomName: roomRecord?.name ?? null,
      } as ScheduleInfo;
    });

    return pickScheduleForScan(schedules, scanMinutes);
  }

  const legacyResponse = await supabase
    .from('schedules')
    .select(
      `
      user_id,
      day_of_week,
      room,
      shift:shifts!schedules_shift_id_fkey (
        start_time,
        end_time
      )
    `
    )
    .eq('user_id', userId)
    .eq('day_of_week', dayName);

  if (!legacyResponse.error && legacyResponse.data) {
    const schedules = (legacyResponse.data as Array<Record<string, unknown>>).map((row) => {
      const shiftValue = Array.isArray(row.shift) ? row.shift[0] : row.shift;
      const shift = shiftValue as { start_time?: string | null; end_time?: string | null } | null;

      return {
        startTime: shift?.start_time ?? null,
        endTime: shift?.end_time ?? null,
        roomId: toStringValue(row.room),
        roomName: toStringValue(row.room),
      } as ScheduleInfo;
    });

    return pickScheduleForScan(schedules, scanMinutes);
  }

  return null;
}

export async function getDeviceRoom(
  supabase: SupabaseClient,
  deviceId: string
): Promise<DeviceRoomInfo> {
  const response = await supabase
    .from('rfid_devices')
    .select('device_id, location, room_id')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (response.error || !response.data) {
    return {
      roomId: null,
      roomName: null,
      location: null,
      display: 'Unknown room',
    };
  }

  const device = response.data as { room_id?: string | number | null; location?: string | null };
  const roomId = device.room_id !== undefined && device.room_id !== null ? String(device.room_id) : null;

  if (roomId) {
    const roomResponse = await supabase
      .from('rooms')
      .select('id, name')
      .eq('id', roomId)
      .maybeSingle();

    if (!roomResponse.error && roomResponse.data) {
      const room = roomResponse.data as { id: string | number; name?: string | null };
      return {
        roomId: String(room.id),
        roomName: room.name ?? null,
        location: device.location ?? null,
        display: room.name || device.location || `Room ${room.id}`,
      };
    }
  }

  return {
    roomId,
    roomName: null,
    location: device.location ?? null,
    display: device.location || (roomId ? `Room ${roomId}` : 'Unknown room'),
  };
}

export function validateSchedule(
  scan: { timestamp: string },
  schedule: ScheduleInfo | null,
  deviceRoom: DeviceRoomInfo
): ScheduleValidationResult {
  const flags = new Set<DetectionFlag>();

  const hasSchedule = Boolean(schedule?.startTime && schedule?.endTime);
  const scanMinutes = toMinutesFromTimestamp(scan.timestamp);
  const scheduleStartMinutes = toMinutesFromClock(schedule?.startTime ?? null);
  const scheduleEndMinutes = toMinutesFromClock(schedule?.endTime ?? null);

  const withinScheduledTime =
    hasSchedule &&
    scanMinutes !== null &&
    scheduleStartMinutes !== null &&
    scheduleEndMinutes !== null &&
    scanMinutes >= scheduleStartMinutes &&
    scanMinutes <= scheduleEndMinutes;

  let roomMatches = true;
  if (schedule?.roomId || schedule?.roomName) {
    if (deviceRoom.roomId && schedule?.roomId) {
      roomMatches = normalizeText(deviceRoom.roomId) === normalizeText(schedule.roomId);
    } else if (deviceRoom.display && schedule?.roomName) {
      roomMatches = normalizeText(deviceRoom.display) === normalizeText(schedule.roomName);
    }
  }

  if (!hasSchedule) {
    flags.add('no_schedule');
    flags.add('unauthorized_access');
  }

  if (hasSchedule && !withinScheduledTime) {
    flags.add('outside_schedule');
    flags.add('unauthorized_access');
  }

  if (hasSchedule && !roomMatches) {
    flags.add('wrong_room');
  }

  return {
    hasSchedule,
    withinScheduledTime,
    roomMatches,
    flags,
  };
}

export function detectBehaviorPatterns(params: {
  scanTimestamp: string;
  recentScans: UserScanRecord[];
  averages: AveragesResult;
  schedule: ScheduleInfo | null;
  validation: ScheduleValidationResult;
}): PatternDetectionResult {
  const { scanTimestamp, recentScans, averages, schedule, validation } = params;
  const flags = new Set<DetectionFlag>(validation.flags);
  const insights: string[] = [];

  const currentScanDate = new Date(scanTimestamp);
  const previousScan = recentScans
    .map((scan) => new Date(scan.timestamp))
    .filter((date) => !Number.isNaN(date.getTime()) && date.getTime() < currentScanDate.getTime())
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (previousScan) {
    const minutesGap = Math.abs((currentScanDate.getTime() - previousScan.getTime()) / 60000);
    if (minutesGap <= DUPLICATE_SCAN_WINDOW_MINUTES) {
      flags.add('duplicate_scan');
      insights.push(
        `Multiple scans were detected within ${DUPLICATE_SCAN_WINDOW_MINUTES} minutes (${minutesGap.toFixed(
          1
        )} minute gap).`
      );
    }
  }

  const currentMinutes = toMinutesFromTimestamp(scanTimestamp);
  const scheduleStartMinutes = toMinutesFromClock(schedule?.startTime ?? null);

  if (currentMinutes !== null && averages.averageTimeInMinutes !== null) {
    const deltaFromAverage = currentMinutes - averages.averageTimeInMinutes;
    const anomalyThreshold = Math.max(
      MIN_ANOMALY_DEVIATION_MINUTES,
      Math.round(averages.standardDeviationMinutes * 2)
    );

    const lateByAverage = deltaFromAverage >= LATE_THRESHOLD_MINUTES;
    const lateBySchedule =
      scheduleStartMinutes !== null && currentMinutes - scheduleStartMinutes >= LATE_THRESHOLD_MINUTES;

    if (lateByAverage && lateBySchedule) {
      flags.add('late');
      insights.push(
        `Scan is ${Math.round(deltaFromAverage)} minutes later than average check-in and past scheduled start.`
      );
    }

    if (deltaFromAverage <= -EARLY_THRESHOLD_MINUTES) {
      flags.add('early');
      insights.push(
        `Scan is ${Math.round(Math.abs(deltaFromAverage))} minutes earlier than usual check-in behavior.`
      );
    }

    if (Math.abs(deltaFromAverage) >= anomalyThreshold) {
      flags.add('anomaly');
      insights.push(
        `Current scan deviates by ${Math.round(Math.abs(deltaFromAverage))} minutes from historical average.`
      );
    }
  }

  if (validation.hasSchedule && !validation.withinScheduledTime && schedule?.startTime && schedule?.endTime) {
    insights.push(
      `Scheduled window is ${toTimeDisplay(schedule.startTime)} to ${toTimeDisplay(schedule.endTime)}, but scan happened at ${toTimeDisplay(
        scanTimestamp
      )}.`
    );
  }

  return { flags, insights };
}

function getPrimaryStatus(flags: Set<DetectionFlag>): DetectionFlag | 'on_time' {
  const priority: DetectionFlag[] = [
    'unauthorized_access',
    'wrong_room',
    'outside_schedule',
    'no_schedule',
    'duplicate_scan',
    'late',
    'early',
    'anomaly',
  ];

  const top = priority.find((status) => flags.has(status));
  return top || 'on_time';
}

export function generateAIResponse(params: {
  status: DetectionFlag | 'on_time';
  scanTimestamp: string;
  flags: Set<DetectionFlag>;
  schedule: ScheduleInfo | null;
  deviceRoom: DeviceRoomInfo;
  insights: string[];
  averages: AveragesResult;
}): AIResponse {
  const { status, scanTimestamp, flags, schedule, deviceRoom, insights, averages } = params;
  const scheduleStart = toTimeDisplay(schedule?.startTime ?? null);
  const scheduleEnd = toTimeDisplay(schedule?.endTime ?? null);

  let message = 'Scan recorded and aligned with expected behavior.';
  let recommendation = 'Proceed with normal attendance flow.';

  if (status === 'wrong_room') {
    message = `You are scheduled in ${schedule?.roomName || schedule?.roomId || 'the assigned room'} from ${scheduleStart} to ${scheduleEnd}, but scanned in ${deviceRoom.display}.`;
    recommendation = 'Proceed to the assigned room and rescan on the correct device.';
  } else if (status === 'late') {
    message =
      'You are later than your usual check-in time and also late for your scheduled class.';
    recommendation = 'Notify your coordinator and complete attendance check-in immediately.';
  } else if (status === 'no_schedule') {
    message = 'No schedule found today. This scan may be unauthorized.';
    recommendation = 'Verify schedule assignment before granting access.';
  } else if (status === 'outside_schedule') {
    message = `Scan occurred outside your scheduled time (${scheduleStart} to ${scheduleEnd}).`;
    recommendation = 'Rescan during the assigned time or request schedule correction.';
  } else if (status === 'unauthorized_access') {
    message = 'No valid schedule is active at the current scan time.';
    recommendation = 'Hold access and request manual verification from administration.';
  } else if (status === 'duplicate_scan') {
    message = 'Multiple scans were detected in a short interval.';
    recommendation = 'Avoid repeated scans and wait for device confirmation before rescanning.';
  } else if (status === 'early') {
    message = 'You checked in earlier than your usual attendance pattern.';
    recommendation = 'No action needed unless this conflicts with assigned schedule.';
  } else if (status === 'anomaly') {
    message = 'This scan significantly deviates from historical attendance behavior.';
    recommendation = 'Review attendance logs and validate whether this is expected.';
  }

  const historicalInsight = averages.averageTimeIn
    ? `Historical average check-in time: ${toTimeDisplay(averages.averageTimeIn)} from ${averages.sampleCount} recent logs.`
    : 'Insufficient attendance history to compute average check-in behavior.';

  const mergedInsights = [
    historicalInsight,
    ...insights,
    ...(flags.has('wrong_room')
      ? [
          `Device room ${deviceRoom.display} does not match scheduled room ${
            schedule?.roomName || schedule?.roomId || 'N/A'
          }.`
        ]
      : []),
  ];

  let suggestedNextScan = plusMinutes(scanTimestamp, 30);
  if (flags.has('duplicate_scan')) {
    suggestedNextScan = plusMinutes(scanTimestamp, DUPLICATE_SCAN_WINDOW_MINUTES);
  } else if (schedule?.endTime) {
    suggestedNextScan = new Date(
      `${new Date(scanTimestamp).toISOString().split('T')[0]}T${schedule.endTime}`
    ).toISOString();
  }

  return {
    status,
    message,
    recommendation,
    insights: mergedInsights,
    suggestedNextScan,
    schedule: {
      startTime: schedule?.startTime ?? null,
      endTime: schedule?.endTime ?? null,
      roomId: schedule?.roomId ?? null,
    },
    deviceRoom: deviceRoom.display,
  };
}

export async function analyzeScanWithSchedule({
  supabase,
  userId,
  deviceId,
  scanTimestamp,
}: AnalyzeScanParams): Promise<AIResponse> {
  const historyFromDate = new Date();
  historyFromDate.setDate(historyFromDate.getDate() - HISTORY_WINDOW_DAYS);
  const scansFromDate = new Date();
  scansFromDate.setDate(scansFromDate.getDate() - RECENT_SCAN_WINDOW_DAYS);

  const [attendanceLogs, schedule, deviceRoom, recentScans] = await Promise.all([
    getRecentAttendanceLogs(supabase, userId, historyFromDate.toISOString().split('T')[0]),
    getTodaySchedule(supabase, userId, scanTimestamp),
    getDeviceRoom(supabase, deviceId),
    getRecentUserScans(supabase, userId, scansFromDate.toISOString()),
  ]);

  const averages = calculateAverages(attendanceLogs);
  const validation = validateSchedule({ timestamp: scanTimestamp }, schedule, deviceRoom);
  const patternResult = detectBehaviorPatterns({
    scanTimestamp,
    recentScans,
    averages,
    schedule,
    validation,
  });

  const status = getPrimaryStatus(patternResult.flags);

  return generateAIResponse({
    status,
    scanTimestamp,
    flags: patternResult.flags,
    schedule,
    deviceRoom,
    insights: patternResult.insights,
    averages,
  });
}

export async function logValidationAlert(
  supabase: SupabaseClient,
  params: {
    userId: number;
    deviceId: string;
    aiResponse: AIResponse;
  }
): Promise<void> {
  const { userId, deviceId, aiResponse } = params;

  if (aiResponse.status === 'on_time') {
    return;
  }

  const payload = {
    user_id: userId,
    device_id: deviceId,
    alert_type: aiResponse.status,
    message: aiResponse.message,
    recommendation: aiResponse.recommendation,
    metadata: {
      insights: aiResponse.insights,
      schedule: aiResponse.schedule,
      deviceRoom: aiResponse.deviceRoom,
      suggestedNextScan: aiResponse.suggestedNextScan,
    },
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('alerts').insert(payload);
  if (error) {
    // Alerts logging is optional and should not block scan processing.
    console.warn('Unable to log validation alert:', error.message);
  }

  const notificationType =
    aiResponse.status === 'unauthorized_access' || aiResponse.status === 'no_schedule'
      ? 'unauthorized_access'
      : 'schedule_anomaly';

  const dedupeSince = new Date();
  dedupeSince.setMinutes(dedupeSince.getMinutes() - 10);

  const { data: existingNotification } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', notificationType)
    .eq('is_read', false)
    .gte('created_at', dedupeSince.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingNotification?.id) {
    return;
  }

  const title =
    notificationType === 'unauthorized_access'
      ? 'Unauthorized Access Detected'
      : 'Schedule Validation Alert';

  const { error: notificationError } = await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message: aiResponse.message,
    type: notificationType,
    related_id: String(deviceId),
    is_read: false,
    created_at: new Date().toISOString(),
  });

  if (notificationError) {
    // Notification persistence should be best-effort and non-blocking.
    console.warn('Unable to create schedule validation notification:', notificationError.message);
  }
}
