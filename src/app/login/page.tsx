import type { Metadata } from 'next';
import LoginClientPage from './LoginClientPage';

export const metadata = {
  title: 'Login | DomStaX',
};

export default function Page() {
  return <LoginClientPage />;
}