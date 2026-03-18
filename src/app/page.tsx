'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role === 'admin') router.push('/dashboard/admin');
        else if (user.role === 'faculty') router.push('/dashboard/faculty');
        else if (user.role === 'staff') router.push('/dashboard/staff');
        else router.push('/login');
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
