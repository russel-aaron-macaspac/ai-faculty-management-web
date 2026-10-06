'use client';

import { useEffect, useMemo, useState } from 'react';
import { RouteGuard } from '@/components/RouteGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { scheduleService } from '@/services/scheduleService';
import { Schedule } from '@/types/schedule';
import { getScheduleStatusClasses, getScheduleStatusLabel } from '@/lib/scheduleStatus';

const ROOM_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ROOM_BOARD_START = 7 * 60;
const ROOM_BOARD_END = 20 * 60;
const ROOM_BOARD_SLOTS = Array.from({ length: (ROOM_BOARD_END - ROOM_BOARD_START) / 30 }, (_, index) => ROOM_BOARD_START + index * 30);

type LocalUser = { id: string; role: string };

const getRoomDisplayName = (roomName?: string | null) => {
  if (/\b(tbd|tba)\b/i.test(roomName || '')) return 'TBA';
  return /\b(online|virtual|remote)\b/i.test(roomName || '') ? 'Online' : roomName || 'TBA';
};

const boardMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const formatBoardTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
};

function RoomScheduleBoard({ schedules }: Readonly<{ schedules: Schedule[] }>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-sm">
      <table className="w-full min-w-[960px] table-fixed border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100 text-slate-800">
            <th className="w-32 border border-slate-300 px-2 py-3 text-center font-bold uppercase">Time</th>
            {ROOM_DAYS.map((day) => <th key={day} className="border border-slate-300 px-2 py-3 text-center font-bold uppercase">{day}</th>)}
          </tr>
        </thead>
        <tbody>
          {ROOM_BOARD_SLOTS.map((slot) => (
            <tr key={slot} className="h-10">
              <th className="border border-slate-300 bg-slate-50 px-2 text-center font-semibold text-slate-600">{formatBoardTime(slot)}</th>
              {ROOM_DAYS.map((day) => {
                const schedule = schedules.find((candidate) => candidate.day === day && boardMinutes(candidate.startTime) === slot);
                const active = schedules.some((candidate) => candidate.day === day && boardMinutes(candidate.startTime) < slot && boardMinutes(candidate.endTime) > slot);
                if (active && !schedule) return null;
                if (!schedule) return <td key={`${day}-${slot}`} className="border border-slate-300 bg-white" />;

                const span = Math.max(1, Math.ceil((boardMinutes(schedule.endTime) - boardMinutes(schedule.startTime)) / 30));
                return (
                  <td key={`${day}-${slot}`} rowSpan={span} style={{ height: `${span * 40}px` }} className="border border-slate-300 px-2 py-0 align-top text-slate-900">
                    <div style={{ minHeight: `${span * 40}px` }} className={`flex h-full flex-col gap-1 rounded-lg border p-2.5 text-left shadow-sm ${getScheduleStatusClasses(schedule.status)}`}>
                      <div className="font-semibold leading-tight">{schedule.subject.code}</div>
                      <div className="leading-tight">{schedule.subject.name}</div>
                      <div className="font-medium">{schedule.section || 'No section'}</div>
                      <div className="text-[10px] text-slate-600">{schedule.facultyName || 'Unassigned faculty'}</div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide">{getScheduleStatusLabel(schedule.status)}</div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoomSchedulesContent() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const rawUser = localStorage.getItem('user');
    const user = rawUser ? (JSON.parse(rawUser) as LocalUser) : null;
    const loadSchedules = async () => {
      try {
        const actor = user ? { id: String(user.id), role: user.role } : undefined;
        setSchedules(await scheduleService.getSchedules(undefined, actor));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load room schedules.');
      } finally {
        setLoading(false);
      }
    };
    void loadSchedules();
  }, []);

  const roomSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.status !== 'rejected' && !/\b(tba|tbd|online|virtual|remote)\b/i.test(schedule.room?.name || '')),
    [schedules]
  );
  const roomKeys = [...new Set(roomSchedules.map((schedule) => schedule.room?.id || schedule.room?.name || 'room'))];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D4A017]">Scheduling</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Room Schedules</h1>
        <p className="text-slate-500">All physical-room schedule matrices.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Room Schedule Matrices</CardTitle>
          <p className="text-sm text-slate-500">Saved physical-room schedules shown by room.</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading room schedules...</div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-rose-600">{error}</p>
          ) : roomSchedules.length === 0 ? (
            <p className="py-8 text-center text-slate-500">No saved physical-room schedules are available.</p>
          ) : (
            <div className="space-y-4">
              {roomKeys.map((roomKey) => {
                const roomRows = roomSchedules.filter((schedule) => (schedule.room?.id || schedule.room?.name || 'room') === roomKey);
                return (
                  <div key={roomKey} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <div className="px-2 py-2 text-sm font-semibold text-slate-700">{getRoomDisplayName(roomRows[0]?.room?.name)}</div>
                    <div className="mt-2"><RoomScheduleBoard schedules={roomRows} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function RoomSchedulesPage() {
  return (
    <RouteGuard requiredRoles={['registrar']} fallbackPath="/login">
      <RoomSchedulesContent />
    </RouteGuard>
  );
}
