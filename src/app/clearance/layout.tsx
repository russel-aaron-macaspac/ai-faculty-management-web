'use client';

import { useEffect, useMemo } from 'react';
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
  const user = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    const raw = localStorage.getItem('user');
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as StoredUser;
    } catch {
      return null;
    }
  }, []);

  const hasAccess = user ? user.role === 'admin' || isFacultyLikeRole(user.role) || isApprovalOfficer(user.role) : false;

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }

    if (!hasAccess) {
      router.replace('/dashboard/staff');
    }
  }, [hasAccess, router, user]);

  if (!user || !hasAccess) {
    return null;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
