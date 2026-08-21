'use client';

/**
 * FacultyLoadGrid
 * ----------------
 * An Excel-like editable grid for building out a faculty member's full
 * Regular Load / Overload schedule in one sitting, then saving it all at
 * once — mirroring the paper "FACULTY LOAD & SCHEDULE" form, but backed by
 * your existing scheduleService.createSchedule (so conflict detection still
 * runs per class, exactly like the single-row form on the page already
 * does).
 *
 * Drop this into ScheduleLoadingContent, e.g. as another Card next to
 * "Program Chair Scheduling", passing the selected faculty and metadata:
 *
 *   <FacultyLoadGrid
 *     facultyId={selectedFacultyId}
 *     facultyName={selectedFacultyName}
 *     rooms={meta.rooms}
 *     subjects={meta.subjects}
 *     createdBy={currentUserName || user?.role || ''}
 *     creatorRole={user?.role || ''}
 *     onSaved={() => loadData(user)}
 *   />
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { scheduleService } from '@/services/scheduleService';
import { toast } from '@/lib/toast';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type LoadType = 'regular' | 'overload';
type RowStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

interface LoadRow {
  localId: string;
  code: string;
  description: string;
  day: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  section: string;
  roomName: string;
  units: string;
  lectureContactHours: string;
  labContactHours: string;
  classSize: string;
  status: RowStatus;
  statusMessage?: string;
}

interface RoomOption {
  id: string;
  name: string;
  capacity: number;
}

interface SubjectOption {
  id: string;
  code: string;
  name: string;
}

interface FacultyLoadGridProps {
  facultyId: string;
  facultyName: string;
  rooms: RoomOption[];
  subjects: SubjectOption[];
  createdBy: string;
  creatorRole: string;
  onSaved?: () => void | Promise<void>;
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `row_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function blankRow(): LoadRow {
  return {
    localId: makeId(),
    code: '',
    description: '',
    day: 'Monday',
    startTime: '',
    endTime: '',
    section: '',
    roomName: '',
    units: '',
    lectureContactHours: '',
    labContactHours: '',
    classSize: '',
    status: 'idle',
  };
}

function isRowBlank(row: LoadRow): boolean {
  return (
    !row.code.trim() &&
    !row.description.trim() &&
    !row.section.trim() &&
    !row.roomName.trim() &&
    !row.startTime &&
    !row.endTime
  );
}

function isRowComplete(row: LoadRow): boolean {
  return Boolean(
    row.code.trim() &&
      row.description.trim() &&
      row.day &&
      row.startTime &&
      row.endTime &&
      row.section.trim() &&
      row.roomName.trim()
  );
}

const NUMERIC_FIELDS = ['units', 'lectureContactHours', 'labContactHours', 'classSize'] as const;
const TEXT_INPUT_CLASS = 'h-9 focus:ring-2 focus:ring-blue-300';

export function FacultyLoadGrid({
  facultyId,
  facultyName,
  rooms,
  subjects,
  createdBy,
  creatorRole,
  onSaved,
}: FacultyLoadGridProps) {
  const [regularRows, setRegularRows] = useState<LoadRow[]>([blankRow()]);
  const [overloadRows, setOverloadRows] = useState<LoadRow[]>([blankRow()]);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<{ savedCount: number; failedCount: number } | null>(null);

  const updateRow = (
    loadType: LoadType,
    localId: string,
    field: keyof LoadRow,
    value: string
  ) => {
    const setRows = loadType === 'regular' ? setRegularRows : setOverloadRows;
    setRows((prev) =>
      prev.map((row) =>
        row.localId === localId
          ? {
              ...row,
              [field]: (NUMERIC_FIELDS as readonly string[]).includes(field as string)
                ? value.replace(/\D/g, '')
                : value,
              status: 'idle',
              statusMessage: undefined,
            }
          : row
      )
    );
  };

  const addRow = (loadType: LoadType) => {
    const setRows = loadType === 'regular' ? setRegularRows : setOverloadRows;
    setRows((prev) => [...prev, blankRow()]);
  };

  const removeRow = (loadType: LoadType, localId: string) => {
    const setRows = loadType === 'regular' ? setRegularRows : setOverloadRows;
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.localId !== localId) : prev));
  };

  const setRowStatus = (loadType: LoadType, localId: string, status: RowStatus, statusMessage?: string) => {
    const setRows = loadType === 'regular' ? setRegularRows : setOverloadRows;
    setRows((prev) =>
      prev.map((row) => (row.localId === localId ? { ...row, status, statusMessage } : row))
    );
  };

  const saveRow = async (loadType: LoadType, row: LoadRow): Promise<boolean> => {
    setRowStatus(loadType, row.localId, 'saving');
    try {
      if (row.startTime >= row.endTime) {
        setRowStatus(loadType, row.localId, 'error', 'End time must be after start time.');
        return false;
      }

      const matchingRoom = rooms.find(
        (room) => room.name.trim().toLowerCase() === row.roomName.trim().toLowerCase()
      );
      if (!matchingRoom) {
        setRowStatus(loadType, row.localId, 'error', `Room "${row.roomName}" not found.`);
        return false;
      }

      const existingSubject = subjects.find(
        (subject) =>
          subject.code.toLowerCase() === row.code.trim().toLowerCase() &&
          subject.name.toLowerCase() === row.description.trim().toLowerCase()
      );
      const subjectId =
        existingSubject?.id ??
        (
          await scheduleService.createSubject({
            code: row.code.trim(),
            name: row.description.trim(),
          })
        ).data?.id;

      if (!subjectId) {
        setRowStatus(loadType, row.localId, 'error', 'Could not resolve subject.');
        return false;
      }

      const result = await scheduleService.createSchedule({
        facultyId,
        subjectId,
        roomId: matchingRoom.id,
        section: row.section.trim(),
        day: row.day,
        startTime: row.startTime,
        endTime: row.endTime,
        loadType,
        units: row.units === '' ? undefined : Number(row.units),
        lectureContactHours: row.lectureContactHours === '' ? undefined : Number(row.lectureContactHours),
        labContactHours: row.labContactHours === '' ? undefined : Number(row.labContactHours),
        classSize: row.classSize === '' ? undefined : Number(row.classSize),
        createdBy: createdBy || creatorRole,
        creatorRole,
      });

      if (!result.success) {
        const conflictType = result.conflict.conflict_type;
        const message = conflictType === 'availability'
          ? 'Faculty availability does not include this day and time.'
          : conflictType === 'faculty'
            ? 'Faculty already has an overlapping schedule.'
            : conflictType === 'room'
              ? 'This physical room is already occupied during this time.'
              : 'Schedule conflict detected.';
        setRowStatus(loadType, row.localId, 'conflict', message);
        return false;
      }

      setRowStatus(loadType, row.localId, 'saved');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save this row.';
      setRowStatus(loadType, row.localId, 'error', message);
      return false;
    }
  };

  const handleSaveSchedule = async () => {
    if (!facultyId) {
      toast({ title: 'Select a faculty member first', description: '', type: 'warning' });
      return;
    }

    const regularToSave = regularRows.filter((r) => !isRowBlank(r));
    const overloadToSave = overloadRows.filter((r) => !isRowBlank(r));

    const incomplete = [...regularToSave, ...overloadToSave].filter((r) => !isRowComplete(r));
    if (incomplete.length > 0) {
      toast({
        title: 'Incomplete rows',
        description: `${incomplete.length} row(s) are missing required fields (code, description, day, time, section, room).`,
        type: 'warning',
      });
      return;
    }

    if (regularToSave.length === 0 && overloadToSave.length === 0) {
      toast({ title: 'Nothing to save', description: 'Add at least one class row.', type: 'warning' });
      return;
    }

    setSaving(true);
    setSummary(null);

    let savedCount = 0;
    let failedCount = 0;

    for (const row of regularToSave) {
      const ok = await saveRow('regular', row);
      ok ? savedCount++ : failedCount++;
    }
    for (const row of overloadToSave) {
      const ok = await saveRow('overload', row);
      ok ? savedCount++ : failedCount++;
    }

    // Drop successfully saved rows from the grid; keep failed ones so they can be fixed and retried.
    setRegularRows((prev) => {
      const remaining = prev.filter((r) => isRowBlank(r) || r.status !== 'saved');
      return remaining.length > 0 ? remaining : [blankRow()];
    });
    setOverloadRows((prev) => {
      const remaining = prev.filter((r) => isRowBlank(r) || r.status !== 'saved');
      return remaining.length > 0 ? remaining : [blankRow()];
    });

    setSaving(false);
    setSummary({ savedCount, failedCount });

    if (savedCount > 0) {
      toast({
        title: 'Schedule saved',
        description: `${savedCount} class${savedCount === 1 ? '' : 'es'} saved${failedCount > 0 ? `, ${failedCount} failed` : ''}.`,
        type: failedCount > 0 ? 'warning' : 'success',
      });
      await onSaved?.();
    } else {
      toast({ title: 'Save failed', description: 'No classes were saved. Check the row errors below.', type: 'error' });
    }
  };

  const renderGridTable = (loadType: LoadType, rows: LoadRow[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[130px]">Code</TableHead>
            <TableHead className="min-w-[260px]">Description</TableHead>
            <TableHead className="min-w-[130px]">Day</TableHead>
            <TableHead className="min-w-[110px]">Start</TableHead>
            <TableHead className="min-w-[110px]">End</TableHead>
            <TableHead className="min-w-[150px]">Section</TableHead>
            <TableHead className="min-w-[160px]">Room</TableHead>
            <TableHead className="min-w-[70px]">Units</TableHead>
            <TableHead className="min-w-[70px]">Lec</TableHead>
            <TableHead className="min-w-[70px]">Lab</TableHead>
            <TableHead className="min-w-[90px]">Class Size</TableHead>
            <TableHead className="min-w-[130px]">Status</TableHead>
            <TableHead className="text-right">&nbsp;</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.localId}>
              <TableCell>
                <Input
                  className={TEXT_INPUT_CLASS}
                  value={row.code}
                  placeholder="e.g. IT201"
                  title={row.code}
                  onChange={(e) => updateRow(loadType, row.localId, 'code', e.target.value)}
                />
              </TableCell>
              <TableCell>
                <Input
                  className={TEXT_INPUT_CLASS}
                  value={row.description}
                  placeholder="Course title"
                  title={row.description}
                  onChange={(e) => updateRow(loadType, row.localId, 'description', e.target.value)}
                />
              </TableCell>
              <TableCell>
                <Select value={row.day} onValueChange={(value) => updateRow(loadType, row.localId, 'day', value ?? 'Monday')}>
                  <SelectTrigger className="h-9">
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
                <Input
                  className="h-9"
                  type="time"
                  value={row.startTime}
                  onChange={(e) => updateRow(loadType, row.localId, 'startTime', e.target.value)}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-9"
                  type="time"
                  value={row.endTime}
                  onChange={(e) => updateRow(loadType, row.localId, 'endTime', e.target.value)}
                />
              </TableCell>
              <TableCell>
                <Input
                  className={TEXT_INPUT_CLASS}
                  value={row.section}
                  placeholder="e.g. BSIT2B"
                  title={row.section}
                  onChange={(e) => updateRow(loadType, row.localId, 'section', e.target.value)}
                />
              </TableCell>
              <TableCell>
                <Input
                  className={TEXT_INPUT_CLASS}
                  value={row.roomName}
                  placeholder="e.g. ComLab 1"
                  title={row.roomName}
                  onChange={(e) => updateRow(loadType, row.localId, 'roomName', e.target.value)}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-9"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={row.units}
                  onChange={(e) => updateRow(loadType, row.localId, 'units', e.target.value)}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-9"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={row.lectureContactHours}
                  onChange={(e) => updateRow(loadType, row.localId, 'lectureContactHours', e.target.value)}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-9"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={row.labContactHours}
                  onChange={(e) => updateRow(loadType, row.localId, 'labContactHours', e.target.value)}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-9"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={row.classSize}
                  onChange={(e) => updateRow(loadType, row.localId, 'classSize', e.target.value)}
                />
              </TableCell>
              <TableCell>
                <RowStatusBadge status={row.status} message={row.statusMessage} />
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeRow(loadType, row.localId)}
                  disabled={saving}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2"
        onClick={() => addRow(loadType)}
        disabled={saving}
      >
        <Plus className="mr-1 h-4 w-4" /> Add row
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Build Load — {facultyName || 'Select a faculty member'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Regular Load</div>
          {renderGridTable('regular', regularRows)}
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Overload</div>
          {renderGridTable('overload', overloadRows)}
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" onClick={handleSaveSchedule} disabled={saving || !facultyId}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Schedule
          </Button>
          {summary && (
            <span className="text-sm text-slate-600">
              {summary.savedCount} saved
              {summary.failedCount > 0 ? `, ${summary.failedCount} need fixing (see Status column)` : ''}.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RowStatusBadge({ status, message }: { status: RowStatus; message?: string }) {
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> Saved
      </span>
    );
  }
  if (status === 'conflict' || status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600" title={message}>
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {message ?? (status === 'conflict' ? 'Conflict' : 'Error')}
      </span>
    );
  }
  return <span className="text-xs text-slate-400">—</span>;
}