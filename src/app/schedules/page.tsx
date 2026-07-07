'use client';

import { useEffect, useMemo, useState } from 'react';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { scheduleService } from '@/services/scheduleService';
import { Schedule } from '@/types/schedule';
import { formatTimeToTwelveHour } from '@/lib/timeUtils';
import { isFacultyLikeRole } from '@/lib/roleConfig';
import { toast } from '@/lib/toast';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type LocalUser = {
  id: string;
  role: string;
  full_name?: string;
  name?: string;
};

export default function SchedulesPage() {
  return (
    <RouteGuard requiredRoles={['faculty', 'program_chair']} fallbackPath="/login">
      <SchedulesContent />
    </RouteGuard>
  );
}

function SchedulesContent() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [availabilityRows, setAvailabilityRows] = useState<Array<{ day: string; startTime: string; endTime: string }>>([]);
  const [availabilityError, setAvailabilityError] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem('user');
    const parsed = raw ? (JSON.parse(raw) as LocalUser) : null;
    setUser(parsed);

    const loadData = async () => {
      try {
        const scheduleData = await scheduleService.getSchedules(parsed?.id);
        setSchedules(scheduleData);

        if (parsed?.id && isFacultyLikeRole(parsed.role)) {
          const entries = await scheduleService.getFacultyAvailability(String(parsed.id));
          setAvailabilityRows(entries.map((entry) => ({ day: entry.day, startTime: entry.startTime, endTime: entry.endTime })));
        } else {
          setAvailabilityRows([]);
        }
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  const visibleSchedules = useMemo(() => {
    if (!user || !isFacultyLikeRole(user.role)) {
      return schedules;
    }

    const currentName = (user.full_name || user.name || '').toLowerCase();
    return schedules.filter((row) => String(row.facultyId) === String(user.id) || (row.facultyName || '').toLowerCase() === currentName);
  }, [schedules, user]);

  let scheduleContent: React.ReactNode;
  if (loading) {
    scheduleContent = (
      <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading schedule...
      </div>
    );
  } else if (visibleSchedules.length === 0) {
    scheduleContent = <div className="py-8 text-center text-slate-500">No schedules found.</div>;
  } else {
    scheduleContent = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Faculty</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Room</TableHead>
            <TableHead>Day</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleSchedules.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.facultyName}</TableCell>
              <TableCell>
                {item.subject?.code} - {item.subject?.name}
                {item.section ? <span className="ml-2 text-xs text-slate-500">Section {item.section}</span> : null}
              </TableCell>
              <TableCell>{item.room?.name}</TableCell>
              <TableCell>{item.day}</TableCell>
              <TableCell>
                {formatTimeToTwelveHour(item.startTime)} - {formatTimeToTwelveHour(item.endTime)}
              </TableCell>
              <TableCell>
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {item.status}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  const addAvailabilityRow = () => {
    setAvailabilityRows((rows) => [...rows, { day: 'Monday', startTime: '08:00', endTime: '10:00' }]);
  };

  const updateAvailabilityRow = (index: number, next: Partial<{ day: string; startTime: string; endTime: string }>) => {
    setAvailabilityRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row)));
  };

  const removeAvailabilityRow = (index: number) => {
    setAvailabilityRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const handleSaveAvailability = async () => {
    if (!user?.id) {
      setAvailabilityError('Sign in again before saving availability.');
      return;
    }

    const invalidRow = availabilityRows.find((row) => !row.day || !row.startTime || !row.endTime || row.startTime >= row.endTime);
    if (invalidRow) {
      setAvailabilityError('Each availability row needs a day, a start time, and an end time that is later than the start time.');
      return;
    }

    setSaving(true);
    setAvailabilityError('');
    try {
      await scheduleService.saveFacultyAvailability(String(user.id), availabilityRows);
      toast({ title: 'Availability Saved', description: 'Your availability was saved successfully.', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save availability.';
      setAvailabilityError(message);
      toast({ title: 'Save Failed', description: message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D4A017]">Schedule management</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">My Schedule</h1>
        <p className="text-slate-500">Review your assigned classes and manage availability windows.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isFacultyLikeRole(user?.role) ? 'Faculty Availability' : 'Schedule Overview'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {scheduleContent}
        </CardContent>
      </Card>

      {isFacultyLikeRole(user?.role) && (
        <Card>
          <CardHeader>
            <CardTitle>Availability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {availabilityRows.map((row, index) => (
              <div key={`${row.day}-${index}`} className="grid items-end gap-3 md:grid-cols-4">
                <div>
                  <div className="text-sm font-medium text-slate-700">Day</div>
                  <Select value={row.day} onValueChange={(value) => updateAvailabilityRow(index, { day: value || 'Monday' })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((day) => (
                        <SelectItem key={day} value={day}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-700">Start</div>
                  <Input type="time" value={row.startTime} onChange={(event) => updateAvailabilityRow(index, { startTime: event.target.value })} />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-700">End</div>
                  <Input type="time" value={row.endTime} onChange={(event) => updateAvailabilityRow(index, { endTime: event.target.value })} />
                </div>
                <Button variant="outline" onClick={() => removeAvailabilityRow(index)}>
                  Remove
                </Button>
              </div>
            ))}

            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={addAvailabilityRow}>
                Add Availability
              </Button>
              <Button type="button" onClick={handleSaveAvailability} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Availability
              </Button>
            </div>
            {availabilityError && <p className="text-sm text-rose-600">{availabilityError}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}