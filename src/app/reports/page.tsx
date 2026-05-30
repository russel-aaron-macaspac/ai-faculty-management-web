import type { Metadata } from 'next';
import ReportsClientPage from './ReportsClientPage';

export const metadata = {
  title: 'Reports | DomStaX',
};

export default function Page() {
  return <ReportsClientPage />;
}