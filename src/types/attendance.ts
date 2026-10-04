export interface Attendance {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  timeIn: string;
  timeOut?: string;
  status: 'present' | 'late' | 'absent' | 'on_leave';
  anomalyDetected?: boolean;
  role?: string;
}
