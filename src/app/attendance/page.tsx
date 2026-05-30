import type { Metadata } from 'next';
import AttendanceClientPage from './AttendanceClientPage';

export const metadata = {
  title: 'Attendance | DomStaX',
};

export default function Page() {
  return <AttendanceClientPage />;
}