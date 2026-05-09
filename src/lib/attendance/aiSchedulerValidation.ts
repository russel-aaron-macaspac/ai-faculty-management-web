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

type DetectionFlag =
  | 'duplicate_scan'
  | 'late'
  | 'early'
  | 'anomaly'
  | 'no_schedule'
  | 'outside_schedule'
  | 'wrong_room'
  | 'unauthorized_access';

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
    roomName: string | null;
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

const normalizeText = (v?: string | null) => (v || '').trim().toLowerCase();
const normalizeRoomLabel = (v?: string | null) =>
  normalizeText(v).replace(/[^a-z0-9]/g, '');

const toMinutesFromClock = (value?: string | null) => {
  if (!value) return null;
  const [h, m] = value.split(':');
  const hours = parseInt(h || '', 10);
  const mins = parseInt(m || '', 10);
  if (isNaN(hours) || isNaN(mins)) return null;
  return hours * 60 + mins;
};

const toMinutesFromTimestamp = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
};

const plusMinutes = (iso: string, mins: number) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return new Date().toISOString();
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
};

export function calculateAverages(
  logs: AttendanceLogRecord[]
): AveragesResult {
  const mins = logs
    .map((l: AttendanceLogRecord) =>
      toMinutesFromTimestamp(l.time_in ?? null)
    )
    .filter((v): v is number => v !== null);

  if (!mins.length) {
    return {
      averageTimeInMinutes: null,
      averageTimeIn: null,
      standardDeviationMinutes: 0,
      sampleCount: 0,
    };
  }

  const avg = mins.reduce((a, b) => a + b, 0) / mins.length;

  const variance =
    mins.reduce((s, v) => s + (v - avg) ** 2, 0) / mins.length;

  return {
    averageTimeInMinutes: avg,
    averageTimeIn: `${Math.floor(avg / 60)
      .toString()
      .padStart(2, '0')}:${Math.round(avg % 60)
      .toString()
      .padStart(2, '0')}:00`,
    standardDeviationMinutes: Math.sqrt(variance),
    sampleCount: mins.length,
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

  const { data: facultyRecord } = await supabase
    .from('users')
    .select('supabase_id')
    .eq('user_id', userId)
    .maybeSingle();

  const facultyUuid =
    facultyRecord &&
    typeof (facultyRecord as { supabase_id?: unknown }).supabase_id === 'string' &&
    (facultyRecord as { supabase_id?: string }).supabase_id
      ? (facultyRecord as { supabase_id?: string }).supabase_id
      : null;

  let modernQuery = supabase
    .from('schedules')
    .select(
      `
      faculty_id,
      faculty_id_uuid,
      day,
      start_time,
      end_time,
      status,
      room_id,
      room:rooms!schedules_room_id_fkey (
        id,
        name
      )
    `
    )
    .eq('day', dayName)
    .neq('status', 'rejected')
    .order('start_time', { ascending: true });

  if (facultyUuid) {
    modernQuery = modernQuery.or(`faculty_id.eq.${userId},faculty_id_uuid.eq.${facultyUuid}`);
  } else {
    modernQuery = modernQuery.eq('faculty_id', userId);
  }

  // modernResponse may have different shapes depending on whether the `status` column exists in the DB.
  // Use `any` here to accept both variants and handle shape normalization below.
  let modernResponse: any = await modernQuery;

  if (modernResponse.error && isMissingColumnError(modernResponse.error, 'status')) {
    let fallbackModernQuery = supabase
      .from('schedules')
      .select(
        `
        faculty_id,
        faculty_id_uuid,
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
      .eq('day', dayName)
      .order('start_time', { ascending: true });

    if (facultyUuid) {
      fallbackModernQuery = fallbackModernQuery.or(`faculty_id.eq.${userId},faculty_id_uuid.eq.${facultyUuid}`);
    } else {
      fallbackModernQuery = fallbackModernQuery.eq('faculty_id', userId);
    }

    modernResponse = await fallbackModernQuery;
  }

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
  const { data } = await supabase
    .from('rfid_devices')
    .select('room_id, location')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (!data) {
    return {
      roomId: null,
      roomName: null,
      location: null,
      display: 'Unknown room',
    };
  }

  const roomId = data.room_id ? String(data.room_id) : null;

  if (roomId) {
    const { data: room } = await supabase
      .from('rooms')
      .select('id,name')
      .eq('id', roomId)
      .maybeSingle();

    return {
      roomId,
      roomName: room?.name ?? null,
      location: data.location ?? null,
      display: room?.name || data.location || `Room ${roomId}`,
    };
  }

  return {
    roomId: null,
    roomName: null,
    location: data.location ?? null,
    display: data.location || 'Unknown room',
  };
}

export function detectBehaviorPatterns(params: {
  scanTimestamp: string;
  recentScans: UserScanRecord[];
  averages: AveragesResult;
}) {
  const { scanTimestamp, recentScans, averages } = params;
  const flags = new Set<DetectionFlag>();
  const insights: string[] = [];

  const now = new Date(scanTimestamp);

  const prev = recentScans
    .map((s: UserScanRecord) => new Date(s.timestamp))
    .filter((d) => d < now)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (prev) {
    const diff = Math.abs((now.getTime() - prev.getTime()) / 60000);
    if (diff <= DUPLICATE_SCAN_WINDOW_MINUTES) {
      flags.add('duplicate_scan');
      insights.push(`Duplicate scan within ${diff.toFixed(1)} mins`);
    }
  }

  const currentMin = toMinutesFromTimestamp(scanTimestamp);

  if (currentMin !== null && averages.averageTimeInMinutes !== null) {
    const delta = currentMin - averages.averageTimeInMinutes;

    if (delta >= LATE_THRESHOLD_MINUTES) {
      flags.add('late');
    }

    if (delta <= -EARLY_THRESHOLD_MINUTES) {
      flags.add('early');
    }

    if (Math.abs(delta) >= MIN_ANOMALY_DEVIATION_MINUTES) {
      flags.add('anomaly');
    }
  }

  return { flags, insights };
}

export function generateAIResponse(
  status: string,
  scanTimestamp: string
): AIResponse {
  return {
    status,
    message: 'Processed',
    recommendation: 'Proceed',
    insights: [],
    suggestedNextScan: plusMinutes(scanTimestamp, 30),
    schedule: {
      startTime: null,
      endTime: null,
      roomName: null,
      roomId: null,
    },
    deviceRoom: 'Unknown',
  };
}

export async function analyzeScanWithSchedule({
  supabase,
  userId,
  deviceId,
  scanTimestamp,
}: AnalyzeScanParams): Promise<AIResponse> {
  const deviceRoom = await getDeviceRoom(supabase, deviceId);

  const averages = calculateAverages([]);

  const pattern = detectBehaviorPatterns({
    scanTimestamp,
    recentScans: [],
    averages,
  });

  const status = pattern.flags.size ? 'flagged' : 'on_time';

  return generateAIResponse(status, scanTimestamp);
}

export async function logValidationAlert(
  supabase: SupabaseClient,
  userId: number,
  deviceId: string,
  ai: AIResponse
) {
  if (ai.status === 'on_time') return;

  await supabase.from('alerts').insert({
    user_id: userId,
    device_id: deviceId,
    alert_type: ai.status,
    message: ai.message,
    recommendation: ai.recommendation,
    metadata: {
      insights: ai.insights,
      schedule: ai.schedule,
      deviceRoom: ai.deviceRoom,
    },
  });
}