import type { Metadata } from 'next';
import FacultyDashboardClientPage from './FacultyDashboardClientPage';

export const metadata = {
  title: 'Faculty Dashboard | DomStaX',
};

export default function Page() {
  return <FacultyDashboardClientPage />;
}