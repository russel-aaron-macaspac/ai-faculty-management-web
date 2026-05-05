'use client';

import { useEffect, useMemo, useState } from 'react';
import { StatCard } from '@/components/dashboard/StatCards';
import { AIAlerts } from '@/components/dashboard/AIAlerts';
import { User } from '@/types/user';
import { CalendarDays, Clock, FileCheck2, GraduationCap } from 'lucide-react';
import { scheduleService } from '@/services/scheduleService';
import { Schedule } from '@/types/schedule';
import { parseTimeToMinutes, formatTimeToTwelveHour, getTimeStatus } from '@/lib/timeUtils';
import { attendanceService } from '@/services/attendanceService';
import { Attendance } from '@/types/attendance';

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
    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const accountName = (user as User & { full_name?: string } | null)?.full_name ?? '';
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const ownClassesToday = schedules
      .filter((schedule) => {
        const scheduleType = schedule.type ?? 'class';
        if (scheduleType !== 'class') {
          return false;
        }

        const scheduleDay = schedule.dayOfWeek ?? schedule.day;
        if (scheduleDay !== currentDay) {
          return false;
        }

        return !!accountName && (schedule.employeeName ?? schedule.facultyName) === accountName;
      })
      .sort((a, b) => (parseTimeToMinutes(a.startTime) ?? 0) - (parseTimeToMinutes(b.startTime) ?? 0));

    const totalMinutes = ownClassesToday.reduce((total, schedule) => {
      const start = parseTimeToMinutes(schedule.startTime);
      const end = parseTimeToMinutes(schedule.endTime);

      if (start === null || end === null || end <= start) {
        return total;
      }

      return total + (end - start);
    }, 0);

    const nextClass = ownClassesToday.find((schedule) => {
      const end = parseTimeToMinutes(schedule.endTime);
      return end !== null && end > nowMinutes;
    });

    const totalHours = totalMinutes / 60;
    const totalHoursLabel = Number.isInteger(totalHours) ? `${totalHours.toFixed(0)}h` : `${totalHours.toFixed(1)}h`;

    return {
      classCount: ownClassesToday.length,
      totalHoursLabel,
      nextClassTime: nextClass ? formatTimeToTwelveHour(nextClass.startTime) : 'No more today',
      nextClassRoom: nextClass?.room?.name || nextClass?.subjectOrRole || nextClass?.subject?.name || 'No upcoming class',
      ownClassesToday,
    };
  }, [schedules, user]);

  const isProgramChair = user?.role === 'program_chair';

  const [myAttendance, setMyAttendance] = useState<Attendance | null>(null);

  useEffect(() => {
    const loadAttendance = async () => {
      if (!user) return;
      try {
        const today = new Date().toISOString().slice(0, 10);
        const records = await attendanceService.getAttendance(today, String(user.id));
        setMyAttendance(records.length > 0 ? records[0] : null);
      } catch {
        setMyAttendance(null);
      }
    };

    void loadAttendance();
  }, [user]);

  const computedAlerts = () => {
    const alerts: any[] = [];

    // upcoming class reminder
    const nextClass = todayStats.ownClassesToday[0];
    if (nextClass) {
      alerts.push({ id: 'upcoming-class', type: 'info' as const, title: 'Upcoming Class Reminder', message: `${nextClass.subjectOrRole ?? nextClass.subject?.name} begins at ${formatTimeToTwelveHour(nextClass.startTime)} in ${nextClass.room?.name ?? 'TBD'}.` });
    }

    // attendance alert for late / anomaly
    if (myAttendance && myAttendance.status === 'late') {
      alerts.push({ id: 'late-arrival', type: 'warning' as const, title: 'Late Arrival Detected', message: `You clocked in at ${myAttendance.timeIn}.` });
    }

    return alerts;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{isProgramChair ? 'Program Chair Dashboard' : 'Faculty Dashboard'}</h1>
        <p className="text-slate-500 mt-1">Hello, {(user as User & { full_name?: string } | null)?.full_name}. Here is your schedule and status for today.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Classes Today" value={todayStats.classCount} icon={GraduationCap} href="/schedules" />
        <StatCard title="Total Hours" value={todayStats.totalHoursLabel} icon={Clock} href="/schedules" />
        <StatCard title="Next Class" value={todayStats.nextClassTime} description={todayStats.nextClassRoom} icon={CalendarDays} href="/schedules" />
        <StatCard title="Clearance Status" value="Cleared" icon={FileCheck2} trend="up" trendValue="100%" href="/clearance" />
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <div className="md:col-span-4 lg:col-span-5 space-y-6">
          <AIAlerts alerts={computedAlerts()} />
          
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4">My Schedule Today</h3>
            {todayStats.ownClassesToday.length === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200 text-center justify-center">
                <p className="text-sm text-slate-600">No classes scheduled for today</p>
              </div>
            ) : (
              <div className="space-y-4">
                {todayStats.ownClassesToday.map((schedule) => {
                  const status = getTimeStatus(schedule.startTime, schedule.endTime);
                  return (
                    <div key={schedule.id} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg border border-slate-100 transition-colors">
                      <div className="flex-1">
                        <div className="font-medium text-slate-800">
                          {formatTimeToTwelveHour(schedule.startTime)} - {formatTimeToTwelveHour(schedule.endTime)} {schedule.subjectOrRole ?? schedule.subject?.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {schedule.room?.name ? `Room ${schedule.room.name}` : 'Location TBD'}
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-3 lg:col-span-2 space-y-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
          <h3 className="font-semibold text-slate-800 mb-2">My Attendance</h3>
          <div className="text-3xl font-bold text-emerald-500 my-4">{myAttendance ? myAttendance.status : 'No record'}</div>
          <div className="text-sm text-slate-500">{myAttendance ? `Clocked in at ${myAttendance.timeIn || '—'}` : 'No attendance found for today'}</div>
        </div>
        </div>
      </div>
    </div>
  );
}