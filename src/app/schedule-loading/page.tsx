import type { Metadata } from 'next';
import ScheduleLoadingClientPage from './ScheduleLoadingClientPage';

export const metadata = {
  title: 'Schedule Loading | DomStaX',
};

export default function Page() {
  return <ScheduleLoadingClientPage />;
}