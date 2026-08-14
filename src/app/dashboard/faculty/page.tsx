'use client';

import { RouteGuard } from '@/components/RouteGuard';
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

type InsightsMeta = {
  latenessSeries?: Array<{ date: string; lateCount: number }>;
} | null;

type DashboardAlert = {
  id: string;
  type: 'warning' | 'insight' | 'info' | 'success';
  title: string;
  message: string;
  recommendation?: string;
};

export default function FacultyDashboardPage() {
  return (
    <RouteGuard requiredRoles={['faculty', 'program_chair', 'admin']} fallbackPath="/login">
      <FacultyDashboardContent />
    </RouteGuard>
  );
}

function FacultyDashboardContent() {
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
    const accountName = user?.full_name ?? user?.name ?? '';
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
    const alerts: DashboardAlert[] = [];

    // upcoming class reminder
    const nextClass = todayStats.ownClassesToday[0];
    if (nextClass) {
      alerts.push({ id: 'upcoming-class', type: 'info', title: 'Upcoming Class Reminder', message: `${nextClass.subjectOrRole ?? nextClass.subject?.name} begins at ${formatTimeToTwelveHour(nextClass.startTime)} in ${nextClass.room?.name ?? 'TBD'}.` });
    }

    // attendance alert for late / anomaly
    if (myAttendance?.status === 'late') {
      alerts.push({ id: 'late-arrival', type: 'warning', title: 'Late Arrival Detected', message: `You clocked in at ${myAttendance.timeIn}.` });
    }

    return alerts;
  };

  const [insights, setInsights] = useState<DashboardAlert[] | null>(null);
  const [insightsMeta, setInsightsMeta] = useState<InsightsMeta>(null);

  const facultyClearanceProgress = useMemo(() => {
    const progressAlert = (insights ?? []).find(
      (alert) => alert.id === 'faculty-clearance-progress' || alert.title === 'Clearance Progress'
    ) as DashboardAlert & { progress?: { completion: number; approved: number; total: number } } | undefined;

    return progressAlert?.progress ?? null;
  }, [insights]);

  useEffect(() => {
    let isMounted = true;

    const fetchInsights = async () => {
      try {
        const stored = localStorage.getItem('user');
        const userObj = stored ? JSON.parse(stored) : null;
        const userId = userObj?.supabase_id ? String(userObj.supabase_id) : undefined;
        const numericUserId = userObj?.id ? String(userObj.id) : undefined;
        const params = new URLSearchParams();
        if (userId) params.set('user_id', userId);
        if (numericUserId) params.set('user_id_numeric', numericUserId);
        const url = params.toString() ? `/api/ai/insights?${params.toString()}` : '/api/ai/insights';
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return;
        const payload = await res.json();
        if (!isMounted) return;
        if (Array.isArray(payload.alerts)) setInsights(payload.alerts as DashboardAlert[]);
        if (payload.meta) setInsightsMeta(payload.meta as InsightsMeta);
      } catch (error) {
        if (isMounted) {
          console.warn('[FacultyDashboard] failed to load AI insights', error);
        }
      }
    };

    void fetchInsights();
    const intervalId = window.setInterval(() => {
      void fetchInsights();
    }, 15000);

    const handleFocus = () => {
      void fetchInsights();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D4A017]">Academic overview</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{isProgramChair ? 'Program Chair Dashboard' : 'Faculty Dashboard'}</h1>
        <p className="text-slate-500">Hello, {user?.full_name ?? user?.name}. Here is your schedule and status for today.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Classes Today" value={todayStats.classCount} icon={GraduationCap} href="/schedules" />
        <StatCard title="Total Hours" value={todayStats.totalHoursLabel} icon={Clock} href="/schedules" />
        <StatCard title="Next Class" value={todayStats.nextClassTime} description={todayStats.nextClassRoom} icon={CalendarDays} href="/schedules" />
        <StatCard
          title="Clearance Status"
          value={facultyClearanceProgress ? `${facultyClearanceProgress.completion}%` : 'Loading...'}
          description={facultyClearanceProgress ? `${facultyClearanceProgress.approved} of ${facultyClearanceProgress.total} approved` : 'Loading clearance data...'}
          icon={FileCheck2}
          trend={facultyClearanceProgress && facultyClearanceProgress.completion >= 100 ? 'up' : 'neutral'}
          trendValue={facultyClearanceProgress ? `${facultyClearanceProgress.completion}%` : undefined}
          accent={facultyClearanceProgress && facultyClearanceProgress.completion >= 100 ? 'success' : facultyClearanceProgress && facultyClearanceProgress.completion >= 50 ? 'warning' : 'neutral'}
          href="/clearance"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <div className="md:col-span-4 lg:col-span-5 space-y-6">
          <AIAlerts alerts={insights ?? computedAlerts()} />
          
          <div className="surface-panel rounded-[12px] p-6">
            <h3 className="mb-4 font-semibold text-slate-900">My Schedule Today</h3>
            {todayStats.ownClassesToday.length === 0 ? (
              <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                <p className="text-sm text-slate-600">No classes scheduled for today</p>
              </div>
            ) : (
              <div className="space-y-4">
                {todayStats.ownClassesToday.map((schedule) => {
                  const status = getTimeStatus(schedule.startTime, schedule.endTime);
                  return (
                    <div key={schedule.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 transition-colors hover:bg-slate-50">
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
        <div className="surface-panel rounded-[12px] p-6 text-center">
          <h3 className="mb-2 font-semibold text-slate-900">My Attendance</h3>
          <div className="my-4 text-3xl font-bold text-[#16A34A]">{myAttendance ? myAttendance.status : 'No record'}</div>
          <div className="text-sm text-slate-500">{myAttendance ? `Clocked in at ${myAttendance.timeIn || '—'}` : 'No attendance found for today'}</div>
        </div>
        {insightsMeta?.latenessSeries && (
          <div className="surface-panel rounded-[12px] p-6">
            <h3 className="mb-2 font-semibold text-slate-900">Lateness (14d)</h3>
            <div className="mb-2 text-sm text-slate-600">Recent late arrivals per day</div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-700">
              {insightsMeta.latenessSeries.map((s: { date: string; lateCount: number }) => (
                <div key={s.date} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                  <div className="font-medium">{s.lateCount}</div>
                  <div className="text-[10px] text-slate-500">{s.date.slice(5)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}