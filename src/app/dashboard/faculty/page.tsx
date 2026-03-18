'use client';

import { useEffect, useMemo, useState } from 'react';
import { StatCard } from '@/components/dashboard/StatCards';
import { AIAlerts } from '@/components/dashboard/AIAlerts';
import { User } from '@/types/user';
import { CalendarDays, Clock, FileCheck2, GraduationCap } from 'lucide-react';
import { scheduleService } from '@/services/scheduleService';
import { Schedule } from '@/types/schedule';

export default function FacultyDashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(JSON.parse(userStr));
    }
  }, []);

  useEffect(() => {
    const loadSchedules = async () => {
      const data = await scheduleService.getSchedules();
      setSchedules(data);
    };

    void loadSchedules();
  }, []);

  const todayStats = useMemo(() => {
    const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
    const parseMinutes = (time: string) => {
      const [hour, minute] = time.split(':').map(Number);
      if (Number.isNaN(hour) || Number.isNaN(minute)) {
        return null;
      }
      return hour * 60 + minute;
    };
    const formatHourMinute = (time: string) => {
      const minutes = parseMinutes(time);
      if (minutes === null) {
        return 'N/A';
      }

      const hour24 = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const period = hour24 >= 12 ? 'PM' : 'AM';
      const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
      return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
    };

    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const accountName = normalizeName((user as User & { full_name?: string } | null)?.name ?? (user as User & { full_name?: string } | null)?.full_name ?? '');
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const ownClassesToday = schedules
      .filter((schedule) => {
        if (schedule.type !== 'class') {
          return false;
        }

        if (schedule.dayOfWeek !== currentDay) {
          return false;
        }

        const scheduleName = normalizeName(schedule.employeeName);
        return !!accountName && (scheduleName === accountName || scheduleName.includes(accountName) || accountName.includes(scheduleName));
      })
      .sort((a, b) => (parseMinutes(a.startTime) ?? 0) - (parseMinutes(b.startTime) ?? 0));

    const totalMinutes = ownClassesToday.reduce((total, schedule) => {
      const start = parseMinutes(schedule.startTime);
      const end = parseMinutes(schedule.endTime);

      if (start === null || end === null || end <= start) {
        return total;
      }

      return total + (end - start);
    }, 0);

    const nextClass = ownClassesToday.find((schedule) => {
      const end = parseMinutes(schedule.endTime);
      return end !== null && end > nowMinutes;
    });

    const totalHours = totalMinutes / 60;
    const totalHoursLabel = Number.isInteger(totalHours) ? `${totalHours.toFixed(0)}h` : `${totalHours.toFixed(1)}h`;

    return {
      classCount: ownClassesToday.length,
      totalHoursLabel,
      nextClassTime: nextClass ? formatHourMinute(nextClass.startTime) : 'No more today',
      nextClassRoom: nextClass?.room || nextClass?.subjectOrRole || 'No upcoming class',
    };
  }, [schedules, user]);

  const mockAlerts = [
    {
      id: '1',
      type: 'info' as const,
      title: 'Upcoming Class Reminder',
      message: 'CS101 Intro to Programming begins in 15 minutes at Room 302.',
    },
    {
      id: '2',
      type: 'success' as const,
      title: 'Clearance Approved',
      message: 'Your Annual Medical Certificate has been verified and approved by HR.',
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Faculty Dashboard</h1>
        <p className="text-slate-500 mt-1">Hello, {user?.name}. Here is your schedule and status for today.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Classes Today" value={todayStats.classCount} icon={GraduationCap} href="/schedules" />
        <StatCard title="Total Hours" value={todayStats.totalHoursLabel} icon={Clock} href="/schedules" />
        <StatCard title="Next Class" value={todayStats.nextClassTime} description={todayStats.nextClassRoom} icon={CalendarDays} href="/schedules" />
        <StatCard title="Clearance Status" value="Cleared" icon={FileCheck2} trend="up" trendValue="100%" href="/clearance" />
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <div className="md:col-span-4 lg:col-span-5 space-y-6">
          <AIAlerts alerts={mockAlerts} />
          
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4">My Schedule Today</h3>
            <div className="space-y-4">
              {['09:00 AM - CS101 (Room 302)', '13:00 PM - CS201 (Room 201)', '15:30 PM - Faculty Meeting'].map((item, i) => (
                <div key={i} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-sm font-medium text-slate-700">{item}</span>
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">{i === 0 ? 'Upcoming' : 'Scheduled'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="md:col-span-3 lg:col-span-2 space-y-6">
           <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
              <h3 className="font-semibold text-slate-800 mb-2">My Attendance</h3>
              <div className="text-3xl font-bold text-emerald-500 my-4">Present</div>
              <div className="text-sm text-slate-500">Clocked in at 08:45 AM</div>
           </div>
        </div>
      </div>
    </div>
  );
}
