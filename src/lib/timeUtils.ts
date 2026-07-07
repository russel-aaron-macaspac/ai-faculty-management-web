/**
 * Utility functions for consistent 12-hour time formatting throughout the application
 * All times are stored as 24-hour HH:MM format, but displayed as 12-hour h:MM AM/PM format
 */

const ATTENDANCE_TIME_ZONE = 'Asia/Manila';

function toDateInAttendanceTimeZone(value: string): Date | null {
  if (!value) {
    return null;
  }

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = new Date(hasTimezone ? value : `${value}Z`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

/**
 * Formats a timestamp for attendance display using the application timezone.
 * Naive timestamps are treated as UTC so stored attendance rows and live scan
 * timestamps resolve to the same wall-clock time for users.
 */
export const formatAttendanceTimestampToTime = (value?: string | null): string => {
  if (!value) {
    return '';
  }

  const compactTime = /^(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value);
  if (compactTime) {
    return compactTime[1];
  }

  const parsed = toDateInAttendanceTimeZone(value);
  if (!parsed) {
    return value.length >= 16 ? value.slice(11, 16) : value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ATTENDANCE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
};

/**
 * Converts a time string from 24-hour format to total minutes
 * @param time - Time string in HH:MM format (e.g., "14:30")
 * @returns Total minutes from midnight, or null if invalid
 */
export const parseTimeToMinutes = (time: string): number | null => {
  const [hour, minute] = time.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }
  return hour * 60 + minute;
};

/**
 * Converts 24-hour time format to 12-hour civil time format with AM/PM
 * @param time - Time string in 24-hour HH:MM format (e.g., "14:30" becomes "2:30 PM")
 * @returns Formatted time string in 12-hour format (e.g., "2:30 PM"), or "N/A" if invalid
 */
export const formatTimeToTwelveHour = (time: string): string => {
  const minutes = parseTimeToMinutes(time);
  if (minutes === null) {
    return 'N/A';
  }

  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  
  return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
};

/**
 * Subtracts minutes from a time string
 * Useful for calculating prep times (e.g., 5 minutes before class start)
 * @param time - Time string in HH:MM format
 * @param minutesToSubtract - Number of minutes to subtract
 * @returns Time string in HH:MM format, or original time if invalid
 */
export const subtractMinutesFromTime = (time: string, minutesToSubtract: number): string => {
  const parsed = parseTimeToMinutes(time);
  if (parsed === null) {
    return time;
  }
  
  const adjusted = Math.max(0, parsed - minutesToSubtract);
  const hours = Math.floor(adjusted / 60);
  const mins = adjusted % 60;
  
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

/**
 * Gets the status of a time slot based on current time
 * @param startTime - Start time in HH:MM format
 * @param endTime - End time in HH:MM format
 * @returns Object with status label and color classes
 */
export const getTimeStatus = (
  startTime: string,
  endTime: string
): { label: string; color: string } => {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (startMinutes === null || endMinutes === null) {
    return { label: 'Scheduled', color: 'bg-slate-100 text-slate-700' };
  }

  if (nowMinutes < startMinutes) {
    return { label: 'Upcoming', color: 'bg-red-100 text-red-700' };
  }

  if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
    return { label: 'In Progress', color: 'bg-[#0F172A]/5 text-[#0F172A]' };
  }

  return { label: 'Completed', color: 'bg-emerald-100 text-emerald-700' };
};

/**
 * Calculates total hours between two times
 * @param startTime - Start time in HH:MM format
 * @param endTime - End time in HH:MM format
 * @returns Total hours formatted as string (e.g., "8h" or "8.5h")
 */
export const calculateDuration = (startTime: string, endTime: string): string => {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);

  if (start === null || end === null || end <= start) {
    return '0h';
  }

  const totalMinutes = end - start;
  const hours = totalMinutes / 60;
  
  return Number.isInteger(hours) ? `${hours.toFixed(0)}h` : `${hours.toFixed(1)}h`;
};
