import type { Metadata } from 'next';
import SchedulesClientPage from './SchedulesClientPage';

export const metadata = {
  title: 'Schedules | DomStaX',
};

export default function Page() {
  return <SchedulesClientPage />;
}