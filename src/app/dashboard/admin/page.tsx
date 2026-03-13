'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/dashboard/StatCards';
import { AIAlerts } from '@/components/dashboard/AIAlerts';
import { AttendanceSummary } from '@/components/dashboard/AttendanceSummary';
import { Users, UserSquare2, CalendarDays, FileCheck2 } from 'lucide-react';
import { User } from '@/types/user';

export default function AdminDashboardPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(JSON.parse(userStr));
    }
  }, []);

  const mockAlerts = [
    {
      id: '1',
      type: 'warning' as const,
      title: 'Schedule Conflict Detected',
      message: 'Prof. Bob Wilson (MATH201) and Dr. Alice Brown (CS101) are scheduled in Room 302 at overlapping times.',
      recommendation: 'Reassign MATH201 to Room 305 (currently available).'
    },
    {
      id: '2',
      type: 'insight' as const,
      title: 'Workload Optimization',
      message: 'IT Department staff are averaging 12% more overtime than other departments this month.',
    },
    {
      id: '3',
      type: 'info' as const,
      title: 'Clearance Deadline Approaching',
      message: '15 faculty members have pending contract renewal documents due next week.',
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Admin Dashboard</h1>
        <p className="text-slate-500 mt-1">Welcome back, {user?.name}. Here&apos;s what&apos;s happening today.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Faculty" value="124" description="12 on leave" icon={Users} trend="up" trendValue="2%" />
        <StatCard title="Total Staff" value="48" icon={UserSquare2} trend="neutral" trendValue="0%" />
        <StatCard title="Active Classes" value="32" description="Happening right now" icon={CalendarDays} trend="up" trendValue="5%" />
        <StatCard title="Clearance Completion" value="89%" description="Pending: 15" icon={FileCheck2} trend="up" trendValue="4%" />
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* Main Content Area */}
        <div className="md:col-span-4 lg:col-span-5 space-y-6">
          <AIAlerts alerts={mockAlerts} />
          
          <div className="grid gap-6 md:grid-cols-2">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-4">Upcoming Schedule conflicts</h3>
              <div className="text-sm text-slate-500">See AI Alerts for automated resolutions.</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-4">Pending Clearances</h3>
              <div className="text-sm text-slate-500">15 documents require admin review.</div>
            </div>
          </div>
        </div>

        {/* Sidebar Widgets Area */}
        <div className="md:col-span-3 lg:col-span-2 space-y-6">
          <AttendanceSummary />
        </div>
      </div>
    </div>
  );
}
