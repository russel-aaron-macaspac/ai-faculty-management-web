import { Attendance } from '@/types/attendance';
import { delay } from './api';
import { format } from 'date-fns';

const today = format(new Date(), 'yyyy-MM-dd');

const mockAttendanceData: Attendance[] = [
  { id: 'a1', employeeId: 'f1', employeeName: 'Dr. Alice Brown', date: today, timeIn: '08:45', status: 'present' },
  { id: 'a2', employeeId: 'f3', employeeName: 'Dr. Charlie Davis', date: today, timeIn: '10:15', status: 'late', anomalyDetected: true }, // AI Alert: Unusual late arrival
  { id: 'a3', employeeId: 's1', employeeName: 'Emily Davis', date: today, timeIn: '07:55', status: 'present' },
  { id: 'a4', employeeId: 'f2', employeeName: 'Prof. Bob Wilson', date: today, timeIn: '', status: 'on_leave' },
];

export const attendanceService = {
  getAttendance: async (date?: string): Promise<Attendance[]> => {
    await delay(500);
    if(date) {
      return mockAttendanceData.filter(a => a.date === date);
    }
    return [...mockAttendanceData];
  },
};
