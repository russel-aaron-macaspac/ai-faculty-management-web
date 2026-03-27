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
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="animate-pulse flex flex-col items-center">
        <div className="h-12 w-12 bg-red-500 rounded-full mb-4"></div>
        <p className="text-slate-500 font-medium tracking-wide">Initializing workspace...</p>
      </div>
    </div>
  );
}
