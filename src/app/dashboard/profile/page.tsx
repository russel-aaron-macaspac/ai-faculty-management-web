import type { Metadata } from 'next';
import ProfileClientPage from './ProfileClientPage';

export const metadata = {
  title: 'Profile | DomStaX',
};

export default function Page() {
  return <ProfileClientPage />;
}