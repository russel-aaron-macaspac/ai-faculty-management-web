'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { User } from '@/types/user';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check auth on layout load
    const userStr = localStorage.getItem('user');
    if (userStr) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(JSON.parse(userStr));
    } else {
      router.push('/login');
    }
    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="surface-panel flex w-full max-w-md flex-col gap-4 rounded-3xl p-6">
          <Skeleton className="h-12 w-12 rounded-2xl" />
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen overflow-hidden bg-background text-foreground">
      {/* Mobile Sidebar overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar Desktop & Mobile */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <Sidebar user={user} />
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar onMenuClick={() => setSidebarOpen(true)} user={user} />
        <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-2 duration-300">
             {children}
          </div>
        </main>
      </div>
    </div>
  );
}
