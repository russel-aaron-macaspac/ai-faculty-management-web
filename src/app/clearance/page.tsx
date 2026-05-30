import type { Metadata } from 'next';
import ClearanceClientPage from './ClearanceClientPage';

export const metadata = {
  title: 'Clearance | DomStaX',
};

export default function Page() {
  return <ClearanceClientPage />;
}