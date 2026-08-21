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

const getRoomDisplayName = (roomName?: string | null) => {
  if (/\b(tbd|tba)\b/i.test(roomName || '')) return 'TBA';
  return /\b(online|virtual|remote)\b/i.test(roomName || '') ? 'Online' : roomName || '-';
};
import { isFacultyLikeRole } from '@/lib/roleConfig';
import { toast } from '@/lib/toast';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  const [generatedAvailabilityRows, setGeneratedAvailabilityRows] = useState<Array<{ day: string; startTime: string; endTime: string }>>([]);
  const [availabilityError, setAvailabilityError] = useState('');
  const [matrixInput, setMatrixInput] = useState({
    selectedDays: DAYS,
    startTime: '08:00',
    endTime: '17:00',
  });

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
          const mappedEntries = entries.map((entry) => ({ day: entry.day, startTime: entry.startTime, endTime: entry.endTime }));
          setAvailabilityRows(mappedEntries);
          setGeneratedAvailabilityRows(mappedEntries);
        } else {
          setAvailabilityRows([]);
          setGeneratedAvailabilityRows([]);
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
    return schedules
      .filter((row) => String(row.facultyId) === String(user.id) || (row.facultyName || '').toLowerCase() === currentName)
      .sort((first, second) => {
        const firstDayIndex = DAYS.indexOf(first.day);
        const secondDayIndex = DAYS.indexOf(second.day);
        const dayOrder = (firstDayIndex === -1 ? DAYS.length : firstDayIndex) - (secondDayIndex === -1 ? DAYS.length : secondDayIndex);

        return dayOrder || first.startTime.localeCompare(second.startTime);
      });
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
              <TableCell>{getRoomDisplayName(item.room?.name)}</TableCell>
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

  const toggleMatrixDay = (day: string) => {
    setMatrixInput((current) => {
      const selectedDays = current.selectedDays.includes(day)
        ? current.selectedDays.filter((selectedDay) => selectedDay !== day)
        : [...current.selectedDays, day];

      return { ...current, selectedDays };
    });
  };

  const generateAvailabilityMatrix = () => {
    if (!matrixInput.startTime || !matrixInput.endTime) {
      setAvailabilityError('Choose a start and end time.');
      return;
    }

    if (matrixInput.startTime >= matrixInput.endTime) {
      setAvailabilityError('End time must be after start time.');
      return;
    }

    if (matrixInput.selectedDays.length === 0) {
      setAvailabilityError('Select at least one day.');
      return;
    }

    const rows = matrixInput.selectedDays.map((day) => ({
      day,
      startTime: matrixInput.startTime,
      endTime: matrixInput.endTime,
    }));

    setGeneratedAvailabilityRows(rows);
    setAvailabilityRows(rows);
    setAvailabilityError('');
  };

  const updateGeneratedRow = (index: number, next: Partial<{ day: string; startTime: string; endTime: string }>) => {
    setGeneratedAvailabilityRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row)));
    setAvailabilityRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row)));
  };

  const removeGeneratedRow = (index: number) => {
    const nextRows = generatedAvailabilityRows.filter((_, rowIndex) => rowIndex !== index);
    setGeneratedAvailabilityRows(nextRows);
    setAvailabilityRows(nextRows);
  };

  const handleSaveAvailability = async () => {
    if (!user?.id) {
      setAvailabilityError('Please sign in again.');
      return;
    }

    const rowsToSave = generatedAvailabilityRows.length > 0 ? generatedAvailabilityRows : availabilityRows;
    const invalidRow = rowsToSave.find((row) => !row.day || !row.startTime || !row.endTime || row.startTime >= row.endTime);
    if (invalidRow) {
      setAvailabilityError('Complete each availability row.');
      return;
    }

    setSaving(true);
    setAvailabilityError('');
    try {
      await scheduleService.saveFacultyAvailability(String(user.id), rowsToSave);
      setAvailabilityRows(rowsToSave);
      toast({ title: 'Availability Saved', description: 'Availability saved.', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save availability.';
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
          <CardTitle>{isFacultyLikeRole(user?.role) ? 'Faculty Schedule' : 'Schedule Overview'}</CardTitle>
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
          <CardContent className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 text-sm font-semibold text-slate-800">Build your availability schedule</div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm font-medium text-slate-700">Start time</div>
                  <Input
                    type="time"
                    value={matrixInput.startTime}
                    onChange={(event) => setMatrixInput((current) => ({ ...current, startTime: event.target.value }))}
                  />
                </div>
                <div>
                  <div className="mb-1 text-sm font-medium text-slate-700">End time</div>
                  <Input
                    type="time"
                    value={matrixInput.endTime}
                    onChange={(event) => setMatrixInput((current) => ({ ...current, endTime: event.target.value }))}
                  />
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-sm font-medium text-slate-700">Available days</div>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day) => {
                    const isSelected = matrixInput.selectedDays.includes(day);
                    return (
                      <Button
                        key={day}
                        type="button"
                        size="sm"
                        variant={isSelected ? 'default' : 'outline'}
                        onClick={() => toggleMatrixDay(day)}
                        className={
                          isSelected
                            ? 'rounded-full border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white'
                            : 'rounded-full border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }
                      >
                        {day}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="button" onClick={generateAvailabilityMatrix}>
                  Generate Schedule
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMatrixInput({ selectedDays: DAYS, startTime: '08:00', endTime: '17:00' });
                    setGeneratedAvailabilityRows([]);
                    setAvailabilityRows([]);
                    setAvailabilityError('');
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>

            {generatedAvailabilityRows.length > 0 && (
              <div className="rounded-xl border border-slate-200">
                <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">Generated availability schedule</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead className="w-[120px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {generatedAvailabilityRows.map((row, index) => (
                      <TableRow key={`${row.day}-${index}`}>
                        <TableCell>
                          <Select value={row.day} onValueChange={(value) => updateGeneratedRow(index, { day: value || 'Monday' })}>
                            <SelectTrigger className="w-full">
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
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Input
                              type="time"
                              value={row.startTime}
                              onChange={(event) => updateGeneratedRow(index, { startTime: event.target.value })}
                            />
                            <span className="self-center text-slate-400">-</span>
                            <Input
                              type="time"
                              value={row.endTime}
                              onChange={(event) => updateGeneratedRow(index, { endTime: event.target.value })}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button type="button" variant="outline" onClick={() => removeGeneratedRow(index)}>
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex gap-3">
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