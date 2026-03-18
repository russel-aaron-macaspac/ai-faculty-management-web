'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/dashboard/StatCards';
import { AIAlerts } from '@/components/dashboard/AIAlerts';
import { User } from '@/types/user';
import { Clock, Calendar, Briefcase, FileCheck2 } from 'lucide-react';

export default function StaffDashboardPage() {
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
      type: 'insight' as const,
      title: 'Shift Change Request',
      message: 'Sarah Wilson has requested to swap shifts for next Friday.',
    },
    {
      id: '2',
      type: 'warning' as const,
      title: 'Pending HR Compliance',
      message: 'Your safety training module expires in 7 days.',
      recommendation: 'Complete the online module now.'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Staff Dashboard</h1>
        <p className="text-slate-500 mt-1">Welcome, {user?.name}. Here&apos;s your shift overview.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Current Shift" value="Morning" icon={Clock} href="/schedules" />
        <StatCard title="Hours Logged" value="32h" description="This week" icon={Briefcase} href="/schedules" />
        <StatCard title="Next Shift" value="Tomorrow, 08:00 AM" icon={Calendar} href="/schedules" />
        <StatCard title="Compliance Score" value="95%" icon={FileCheck2} trend="down" trendValue="5%" href="/clearance" />
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <div className="md:col-span-4 lg:col-span-5 space-y-6">
          <AIAlerts alerts={mockAlerts} />
          
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4">Work Shift Schedule</h3>
            <div className="space-y-4">
               {['Monday: 08:00 - 17:00 (Office Duty)', 'Tuesday: 08:00 - 17:00 (Office Duty)', 'Wednesday: 08:00 - 17:00 (Office Duty)'].map((item, i) => (
                <div key={i} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-sm font-medium text-slate-700">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="md:col-span-3 lg:col-span-2 space-y-6">
           <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
              <h3 className="font-semibold text-slate-800 mb-2">Today&apos;s Log</h3>
              <div className="text-3xl font-bold text-slate-900 my-4">ON DUTY</div>
              <div className="text-sm text-slate-500">Clocked in at 07:55 AM</div>
           </div>
        </div>
      </div>
    </div>
  );
}
