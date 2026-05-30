import type { Metadata } from 'next';
import ScheduleApprovalClientPage from './ScheduleApprovalClientPage';

export const metadata = {
  title: 'Schedule Approvals | DomStaX',
};

export default function Page() {
  return <ScheduleApprovalClientPage />;
}