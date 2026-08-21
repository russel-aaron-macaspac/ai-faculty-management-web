import { Attendance } from '@/types/attendance';
import { delay } from './api';
import { format } from 'date-fns';
import { formatAttendanceTimestampToTime } from '@/lib/timeUtils';

const today = format(new Date(), 'yyyy-MM-dd');

const mockAttendanceData: Attendance[] = [
  { id: 'a0', employeeId: '11', employeeName: 'John Doe', date: today, timeIn: '08:50', timeOut: '17:05', status: 'present' },
  { id: 'a1', employeeId: 'f1', employeeName: 'Dr. Alice Brown', date: today, timeIn: '08:45', status: 'present' },
  { id: 'a2', employeeId: 'f3', employeeName: 'Dr. Charlie Davis', date: today, timeIn: '10:15', status: 'late', anomalyDetected: true }, // AI Alert: Unusual late arrival
  { id: 'a3', employeeId: 's1', employeeName: 'Emily Davis', date: today, timeIn: '07:55', status: 'present' },
  { id: 'a4', employeeId: 'f2', employeeName: 'Prof. Bob Wilson', date: today, timeIn: '', status: 'on_leave' },
];

type AttendanceApiUser = {
  user_id?: number;
  employee_no?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
};

type AttendanceApiRecord = {
  log_id: number;
  log_date: string;
  time_in?: string | null;
  time_out?: string | null;
  status?: Attendance['status'] | null;
  users?: AttendanceApiUser | null;
};

function toDisplayTime(value?: string | null): string {
  return formatAttendanceTimestampToTime(value);
}

function normalizeStatus(status?: string | null): Attendance['status'] {
  if (status === 'present' || status === 'late' || status === 'absent' || status === 'on_leave') {
    return status;
  }

  return 'present';
}

function mapAttendanceRecord(record: AttendanceApiRecord): Attendance {
  const user = Array.isArray(record.users) ? record.users[0] : record.users;

  const names = [user?.first_name, user?.middle_name, user?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    id: String(record.log_id),
    employeeId: String(user?.user_id ?? ''),
    employeeName: names || String(user?.employee_no ?? 'Unknown Employee'),
    date: record.log_date,
    timeIn: toDisplayTime(record.time_in),
    timeOut: toDisplayTime(record.time_out),
    status: normalizeStatus(record.status),
  };
}

export const attendanceService = {
  getAttendance: async (date?: string, userId?: string): Promise<Attendance[]> => {
    const params = new URLSearchParams();
    if (date) {
      params.set('date', date);
    }
    if (userId) {
      params.set('user_id', userId);
    }

    const query = params.toString() ? `?${params.toString()}` : '';

    try {
      const response = await fetch(`/api/attendance${query}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Could not load attendance.');
      }

      const payload = await response.json();
      const records = Array.isArray(payload.records) ? payload.records : [];
      return records.map((record: AttendanceApiRecord) => mapAttendanceRecord(record));
    } catch {
      // Keep pages usable if the API is temporarily unavailable.
      await delay(250);
      if (date) {
        return mockAttendanceData.filter((a) => a.date === date);
      }

      return [...mockAttendanceData];
    }
  },
};
