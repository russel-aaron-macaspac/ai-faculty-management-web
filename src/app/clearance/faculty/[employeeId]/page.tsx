import type { Metadata } from 'next';
import FacultyClientPage from './FacultyClientPage';

export const metadata = {
  title: 'Faculty Clearance | DomStaX',
};

export default function Page() {
  return <FacultyClientPage />;
}