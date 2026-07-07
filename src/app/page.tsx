'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getDashboardPathForRole } from '@/lib/roleConfig';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        router.push(getDashboardPathForRole(user.role));
      } catch {
        router.push('/login');
      }
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 university-shell">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,160,23,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(15,23,42,0.08),transparent_28%),linear-gradient(180deg,#f8fafc,#eef4fb)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-[#D4A017]/40" />
      <div className="surface-panel relative z-10 flex flex-col items-center gap-4 rounded-[12px] px-8 py-10 text-center">
        <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-[#0F172A]/10 ring-1 ring-[#0F172A]/10">
          <div className="h-5 w-5 rounded-full bg-[#0F172A]" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-[0.24em] text-[#0F172A] uppercase">DomStaX</p>
          <p className="mt-2 text-sm text-slate-600">Initializing workspace...</p>
        </div>
      </div>
    </div>
  );
}
