import type { Metadata } from 'next';
import AdminDashboardClientPage from './AdminDashboardClientPage';

export const metadata = {
  title: 'Admin Dashboard | DomStaX',
};

export default function Page() {
  return <AdminDashboardClientPage />;
}