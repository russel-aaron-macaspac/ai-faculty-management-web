'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { isApprovalOfficer, isFacultyLikeRole } from '@/lib/roleConfig';

type StoredUser = {
  role?: string;
};

type ClearanceLayoutProps = {
  readonly children: React.ReactNode;
};

export default function ClearanceLayout({ children }: ClearanceLayoutProps) {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) {
      setIsHydrated(true);
      return;
    }

    try {
      setUser(JSON.parse(raw) as StoredUser);
    } catch {
      setUser(null);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  const hasAccess = user ? user.role === 'admin' || isFacultyLikeRole(user.role) || isApprovalOfficer(user.role) : false;

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!user) {
      router.replace('/login');
      return;
    }

    if (!hasAccess) {
      router.replace('/dashboard/staff');
    }
  }, [hasAccess, isHydrated, router, user]);

  if (!isHydrated || !user || !hasAccess) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="animate-pulse h-12 w-12 rounded-full bg-red-500" />
      </div>
    );
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
