import type { Metadata } from 'next';
import ApprovalClientPage from './ApprovalClientPage';

export const metadata = {
  title: 'Approval | DomStaX',
};

export default function Page() {
  return <ApprovalClientPage />;
}