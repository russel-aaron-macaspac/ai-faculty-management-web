import type { Metadata } from 'next';
import ChangePasswordClientPage from './ChangePasswordClientPage';

export const metadata = {
  title: 'Change Password | DomStaX',
};

export default function Page() {
  return <ChangePasswordClientPage />;
}