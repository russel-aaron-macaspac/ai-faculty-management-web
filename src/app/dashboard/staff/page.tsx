'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatCard } from '@/components/dashboard/StatCards';
import { AIAlerts } from '@/components/dashboard/AIAlerts';
import { User } from '@/types/user';
import { Clock, Calendar, Briefcase, Key, AlertCircle } from 'lucide-react';
import { scheduleService } from '@/services/scheduleService';
import { Schedule } from '@/types/schedule';
import { isApprovalOfficer } from '@/lib/roleConfig';

interface RoomAccessTask {
  id: string;
  room: string;
  professor: string;
  prepTime: string;
  classTime: string;
  subject: string;
}

export default function StaffDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const parsedUser = JSON.parse(userStr) as User;
      if (isApprovalOfficer(parsedUser.role)) {
        router.replace('/dashboard/approval');
        return;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(parsedUser);
    }
  }, [router]);

  useEffect(() => {
    const loadSchedules = async () => {
      const data = await scheduleService.getSchedules();
      setSchedules(data);
    };

    void loadSchedules();
  }, []);

  const todayStats = useMemo(() => {
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
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const ownShiftsToday = schedules
      .filter((schedule) => {
        if (schedule.type !== 'shift') {
          return false;
        }

        if (schedule.dayOfWeek !== currentDay) {
          return false;
        }

        return !!user && (user as User & { full_name?: string | null }).full_name === schedule.employeeName;
      })
      .sort((a, b) => (parseMinutes(a.startTime) ?? 0) - (parseMinutes(b.startTime) ?? 0));

    const totalMinutes = ownShiftsToday.reduce((total, schedule) => {
      const start = parseMinutes(schedule.startTime);
      const end = parseMinutes(schedule.endTime);

      if (start === null || end === null || end <= start) {
        return total;
      }

      return total + (end - start);
    }, 0);

    const currentShift = ownShiftsToday.find((schedule) => {
      const start = parseMinutes(schedule.startTime);
      const end = parseMinutes(schedule.endTime);
      return start !== null && end !== null && nowMinutes >= start && nowMinutes < end;
    });

    const nextShift = ownShiftsToday.find((schedule) => {
      const start = parseMinutes(schedule.startTime);
      return start !== null && start > nowMinutes;
    });

    const totalHours = totalMinutes / 60;
    const totalHoursLabel = Number.isInteger(totalHours) ? `${totalHours.toFixed(0)}h` : `${totalHours.toFixed(1)}h`;

    return {
      currentShift: currentShift?.subjectOrRole ?? 'Maintenance Duty',
      totalHoursLabel,
      nextShiftTime: nextShift ? formatHourMinute(nextShift.startTime) : 'No more today',
      nextShiftRole: nextShift?.subjectOrRole || 'No upcoming shift',
    };
  }, [schedules, user]);

  const roomAccessTasks = useMemo(() => {
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

    const subtractMinutes = (time: string, minutes: number) => {
      const parsed = parseMinutes(time);
      if (parsed === null) return time;
      const adjusted = Math.max(0, parsed - minutes);
      const hours = Math.floor(adjusted / 60);
      const mins = adjusted % 60;
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };

    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    // Get all faculty classes for today
    const facultyClassesToday = schedules
      .filter((schedule) => {
        return schedule.type === 'class' && schedule.dayOfWeek === currentDay;
      })
      .sort((a, b) => (parseMinutes(a.startTime) ?? 0) - (parseMinutes(b.startTime) ?? 0));

    // Generate room access tasks (5 minutes before each class)
    const tasks: RoomAccessTask[] = facultyClassesToday.map((classSchedule, index) => {
      const prepTime = subtractMinutes(classSchedule.startTime, 5);
      return {
        id: `room-${index}`,
        room: classSchedule.room || `Room ${index + 1}`,
        professor: classSchedule.employeeName || 'Professor',
        prepTime: formatHourMinute(prepTime),
        classTime: formatHourMinute(classSchedule.startTime),
        subject: classSchedule.subjectOrRole || 'Class',
      };
    });

    return tasks;
  }, [schedules]);

  const mockAlerts = [
    {
      id: '1',
      type: 'insight' as const,
      title: 'Morning Maintenance Check',
      message: 'Remember to check HVAC and lighting systems in all classrooms.',
    },
    {
      id: '2',
      type: 'warning' as const,
      title: 'Room 101 Maintenance Due',
      message: 'Air conditioning filter replacement scheduled for 2:00 PM.',
      recommendation: 'Ensure room is clear before maintenance.'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Staff Dashboard</h1>
        <p className="text-slate-500 mt-1">Welcome, {(user as User & { full_name?: string } | null)?.full_name ?? user?.name}. Here&apos;s your maintenance & room prep schedule.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Current Duty" value={todayStats.currentShift} icon={Clock} href="/schedules" />
        <StatCard title="Shift Hours" value={todayStats.totalHoursLabel} description="Today" icon={Briefcase} href="/schedules" />
        <StatCard title="Next Shift" value={todayStats.nextShiftTime} description={todayStats.nextShiftRole} icon={Calendar} href="/schedules" />
        <StatCard title="Tasks Today" value={roomAccessTasks.length.toString()} icon={Key} href="/schedules" />
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <div className="md:col-span-4 lg:col-span-5 space-y-6">
          <AIAlerts alerts={mockAlerts} />
          
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Key className="h-5 w-5 text-red-600" />
              Room Access & Prep Schedule
            </h3>
            {roomAccessTasks.length === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <AlertCircle className="h-5 w-5 text-slate-400" />
                <p className="text-sm text-slate-600">No classes scheduled for today</p>
              </div>
            ) : (
              <div className="space-y-3">
                {roomAccessTasks.map((task) => (
                  <div key={task.id} className="flex justify-between items-center p-4 hover:bg-slate-50 rounded-lg border border-slate-100 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                          <Key className="h-6 w-6 text-red-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{task.room}</p>
                          <p className="text-sm text-slate-600">{task.subject} - Prof. {task.professor}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-red-600">{task.prepTime}</p>
                      <p className="text-xs text-slate-500">Open (5 min before class)</p>
                      <p className="text-xs text-slate-500 mt-1">Class: {task.classTime}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4">Maintenance Shift Schedule</h3>
            <div className="space-y-3">
              {['Monday: 06:00 - 17:00 (Maintenance & Facilities)', 'Tuesday: 06:00 - 17:00 (Maintenance & Facilities)', 'Wednesday: 06:00 - 17:00 (Maintenance & Facilities)', 'Thursday: 06:00 - 17:00 (Maintenance & Facilities)', 'Friday: 06:00 - 14:00 (Morning Maintenance)'].map((item, i) => (
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