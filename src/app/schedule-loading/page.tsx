'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, Loader2, XCircle, ChevronDown, ChevronUp, Pencil, Trash2, Plus } from 'lucide-react';
import { scheduleService } from '@/services/scheduleService';
import { Schedule } from '@/types/schedule';
import { formatTimeToTwelveHour, parseTimeToMinutes } from '@/lib/timeUtils';
import { isFacultyLikeRole } from '@/lib/roleConfig';
import { toast } from '@/lib/toast';
import { FacultyLoadGrid } from '@/components/Facultyloadgrid';
import { AIScheduleGenerator } from '@/components/AIScheduleGenerator';
import { getScheduleStatusClasses, getScheduleStatusLabel, isApprovedSchedule } from '@/lib/scheduleStatus';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const APPROVAL_ROLES = new Set(['dean', 'ovpaa', 'registrar', 'hro']);
const MASTER_BOARD_START = 7 * 60;
const MASTER_BOARD_END = 20 * 60;
const MASTER_BOARD_SLOTS = Array.from(
  { length: (MASTER_BOARD_END - MASTER_BOARD_START) / 30 },
  (_, index) => MASTER_BOARD_START + index * 30
);

const getRoomDisplayName = (roomName?: string | null) => {
  if (/\b(tbd|tba)\b/i.test(roomName || '')) return 'TBA';
  return /\b(online|virtual|remote)\b/i.test(roomName || '') ? 'Online' : roomName || '-';
};

const getContactHours = (startTime: string, endTime: string) => {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  const start = startHours * 60 + startMinutes;
  const end = endHours * 60 + endMinutes;
  const hours = (end - start) / 60;

  return Number.isFinite(hours) && hours > 0 ? hours : null;
};

const formatTotal = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

const getScheduleUnits = (schedule: Schedule) => Number(schedule.units) || 0;

const getScheduleHours = (schedule: Schedule) => getContactHours(schedule.startTime, schedule.endTime) ?? 0;

const getLoadType = (schedule: Schedule) => {
  const candidate = schedule as Schedule & { loadType?: string; isOverload?: boolean };
  return candidate.isOverload || candidate.loadType?.toLowerCase() === 'overload' ? 'overload' : 'regular';
};

const getClassType = (schedule: Schedule) => {
  const description = schedule.subject?.name?.toLowerCase() || '';
  return description.includes('(lab') || description.includes('laboratory') ? 'lab' : 'lec';
};

const formatBoardTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
};

const calculateEndTime = (startTime: string, hours: number | null | undefined, fallbackEndTime = '') => {
  if (!startTime) return fallbackEndTime;
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const durationMinutes = Number(hours) * 60;
  if (!Number.isFinite(startHours) || !Number.isFinite(startMinutes) || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return fallbackEndTime;
  }

  const totalMinutes = startHours * 60 + startMinutes + durationMinutes;
  if (totalMinutes >= 24 * 60) return fallbackEndTime;

  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
};

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
};

const formatAvailabilityWindow = (row: { startTime: string; endTime: string }) =>
  `${formatTimeToTwelveHour(row.startTime)} - ${formatTimeToTwelveHour(row.endTime)}`;

type LocalUser = {
  id: string;
  role: string;
  full_name?: string;
  name?: string;
};

enum AppointmentStatus {
  FullTime = 'full-time',
  PartTime = 'part-time',
}

type FacultyMeta = {
  id: string;
  name: string;
  role: string;
  statusOfAppointment?: AppointmentStatus | null;
};

type ConsultationRow = {
  day: string;
  startTime: string;
  endTime: string;
};

interface SchedulingMeta {
  faculties: FacultyMeta[];
  subjects: Array<{ id: string; code: string; name: string; year_level?: string | number | null; units?: number | null; hours?: number | null; lecture_units?: number | null; lab_units?: number | null }>;
  rooms: Array<{ id: string; name: string; capacity: number }>;
  sections: Array<{ id: string; name: string; year_level?: string | number | null }>;
}

interface EditScheduleFormState {
  id: string;
  facultyId: string;
  section: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  roomId: string;
  roomName: string;
  day: string;
  startTime: string;
  endTime: string;
  loadType: 'regular' | 'overload';
  units: string;
  lectureContactHours: string;
  labContactHours: string;
  classSize: string;
}

export function getSelectedLabel<T extends { id?: string | number }>(
  items: T[] | undefined,
  id: string | number | null | undefined,
  labelFn: (item: T) => string
): string {
  if (!items || id == null || id === '') return '';
  const found = items.find((item) => String((item as { id?: string | number }).id) === String(id));
  return found ? labelFn(found) : '';
}

export default function ScheduleLoadingPage() {
  return (
    <RouteGuard requiredRoles={['program_chair', 'admin']} fallbackPath="/dashboard/faculty">
      <ScheduleLoadingContent />
    </RouteGuard>
  );
}

function ScheduleLoadingContent() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Schedule[]>([]);
  const [meta, setMeta] = useState<SchedulingMeta>({ faculties: [], subjects: [], rooms: [], sections: [] });
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [facultySearch, setFacultySearch] = useState('');
  const [isFacultyListMinimized, setIsFacultyListMinimized] = useState(true);
  const [isOfficialTimeMinimized, setIsOfficialTimeMinimized] = useState(false);
  const [isApprovalDashboardMinimized, setIsApprovalDashboardMinimized] = useState(false);
  const [isMasterScheduleMinimized, setIsMasterScheduleMinimized] = useState(false);
  const [selectedFacultyLoading, setSelectedFacultyLoading] = useState(false);
  const [selectedFacultyAvailability, setSelectedFacultyAvailability] = useState<Array<{ day: string; startTime: string; endTime: string }>>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<EditScheduleFormState | null>(null);
  const [editFacultyAvailability, setEditFacultyAvailability] = useState<Array<{ day: string; startTime: string; endTime: string }>>([]);
  const [editAvailabilityLoading, setEditAvailabilityLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const canApprove = APPROVAL_ROLES.has(user?.role || '');

  const loadData = async (currentUser?: LocalUser | null) => {
    setLoading(true);
    try {
      const actor = currentUser ? { id: String(currentUser.id), role: currentUser.role } : undefined;
      const [metaData, scheduleData] = await Promise.all([scheduleService.getMetadata(actor), scheduleService.getSchedules(undefined, actor)]);
      setMeta(metaData);
      setSchedules(scheduleData);

      if (currentUser && APPROVAL_ROLES.has(currentUser.role)) {
        const pending = await scheduleService.getPendingApprovals(currentUser.role);
        setPendingApprovals(pending);
      } else {
        setPendingApprovals([]);
      }

      if (currentUser?.id && isFacultyLikeRole(currentUser.role)) {
        try {
          const entries = await scheduleService.getFacultyAvailability(String(currentUser.id));
          setSelectedFacultyAvailability(entries.map((entry) => ({ day: entry.day, startTime: entry.startTime, endTime: entry.endTime })));
        } catch {
          setSelectedFacultyAvailability([]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const raw = localStorage.getItem('user');
    const parsed = raw ? (JSON.parse(raw) as LocalUser) : null;
    setUser(parsed);
    void loadData(parsed);
  }, []);

  useEffect(() => {
    if (!meta.faculties.length) return;

    const nextSelectedFacultyId = meta.faculties.find((faculty) => faculty.id === selectedFacultyId)?.id || meta.faculties[0]?.id || '';
    if (nextSelectedFacultyId && nextSelectedFacultyId !== selectedFacultyId) {
      setSelectedFacultyId(nextSelectedFacultyId);
    }
  }, [meta.faculties, selectedFacultyId]);

  useEffect(() => {
    if (!editSchedule?.facultyId) {
      setEditFacultyAvailability([]);
      return;
    }

    let cancelled = false;
    setEditAvailabilityLoading(true);
    void scheduleService.getFacultyAvailability(editSchedule.facultyId)
      .then((entries) => {
        if (!cancelled) {
          const availability = entries.map((entry) => ({
            day: entry.day,
            startTime: entry.startTime,
            endTime: entry.endTime,
          }));
          setEditFacultyAvailability(availability);
          if (availability.length > 0) {
            setEditSchedule((previous) => {
              if (!previous || availability.some((window) => window.day === previous.day)) return previous;
              const firstWindow = availability[0];
              return {
                ...previous,
                day: firstWindow.day,
                startTime: firstWindow.startTime,
                endTime: calculateEndTime(firstWindow.startTime, getContactHours(previous.startTime, previous.endTime), firstWindow.endTime),
              };
            });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setEditFacultyAvailability([]);
      })
      .finally(() => {
        if (!cancelled) setEditAvailabilityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editSchedule?.facultyId]);

  useEffect(() => {
    if (!selectedFacultyId) return;

    let cancelled = false;
    const loadSelectedFacultyAvailability = async () => {
      setSelectedFacultyLoading(true);
      try {
        const entries = await scheduleService.getFacultyAvailability(selectedFacultyId);
        if (cancelled) return;

        setSelectedFacultyAvailability(entries.map((entry) => ({ day: entry.day, startTime: entry.startTime, endTime: entry.endTime })));
      } catch {
        if (!cancelled) setSelectedFacultyAvailability([]);
      } finally {
        if (!cancelled) setSelectedFacultyLoading(false);
      }
    };

    void loadSelectedFacultyAvailability();
    return () => {
      cancelled = true;
    };
  }, [selectedFacultyId]);

  const visibleSchedules = useMemo(() => schedules, [schedules]);
  const filteredFaculties = useMemo(() => {
    const query = facultySearch.trim().toLowerCase();
    if (!query) return meta.faculties;

    return meta.faculties.filter((faculty) => faculty.name.toLowerCase().includes(query));
  }, [facultySearch, meta.faculties]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [consultationByFaculty, setConsultationByFaculty] = useState<Record<string, ConsultationRow[]>>({});

  // Consultation hours edit dialog state
  const [isConsultationDialogOpen, setIsConsultationDialogOpen] = useState(false);
  const [consultationEditFacultyId, setConsultationEditFacultyId] = useState<string | null>(null);
  const [consultationEditRows, setConsultationEditRows] = useState<ConsultationRow[]>([]);

  const toggleFaculty = (facultyId: string) => {
    setExpanded((prev) => ({ ...prev, [facultyId]: !prev[facultyId] }));
  };

  // Build a list of faculties from meta and schedules to display in master schedule
  const facultiesList = useMemo(() => buildFacultiesList(meta.faculties, visibleSchedules), [meta.faculties, visibleSchedules]);

  useEffect(() => {
    const savedConsultationByFaculty: Record<string, ConsultationRow[]> = {};

    facultiesList.forEach((faculty) => {
      const stored = localStorage.getItem(`faculty-load-times-${faculty.id}`);
      if (!stored) return;

      try {
        const parsed = JSON.parse(stored) as { consultation?: ConsultationRow[] };
        const rows = parsed.consultation?.filter((row) => row.startTime && row.endTime) ?? [];
        if (rows.length > 0) savedConsultationByFaculty[faculty.id] = rows;
      } catch {
        // Ignore malformed legacy browser data for this faculty.
      }
    });

    setConsultationByFaculty(savedConsultationByFaculty);
  }, [facultiesList]);

  // --- Consultation hours edit handlers ---

  const openConsultationDialog = (facultyId: string) => {
    const existing = consultationByFaculty[facultyId] ?? [];
    setConsultationEditFacultyId(facultyId);
    setConsultationEditRows(
      existing.length > 0 ? existing.map((row) => ({ ...row })) : [{ day: 'Monday', startTime: '', endTime: '' }]
    );
    setIsConsultationDialogOpen(true);
  };

  const addConsultationRow = () => {
    setConsultationEditRows((rows) => [...rows, { day: 'Monday', startTime: '', endTime: '' }]);
  };

  const updateConsultationRow = (index: number, next: Partial<ConsultationRow>) => {
    setConsultationEditRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row)));
  };

  const removeConsultationRow = (index: number) => {
    setConsultationEditRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const handleSaveConsultationHours = () => {
    if (!consultationEditFacultyId) return;

    const invalidRow = consultationEditRows.find(
      (row) => row.day && row.startTime && row.endTime && row.startTime >= row.endTime
    );
    if (invalidRow) {
      toast({
        title: 'Invalid time range',
        description: 'End time must be after start time for each consultation row.',
        type: 'warning',
      });
      return;
    }

    const validRows = consultationEditRows.filter((row) => row.day && row.startTime && row.endTime);

    const storageKey = `faculty-load-times-${consultationEditFacultyId}`;
    let existingStored: Record<string, unknown> = {};
    const rawStored = localStorage.getItem(storageKey);
    if (rawStored) {
      try {
        existingStored = JSON.parse(rawStored) as Record<string, unknown>;
      } catch {
        existingStored = {};
      }
    }

    const nextStored = { ...existingStored, consultation: validRows };
    localStorage.setItem(storageKey, JSON.stringify(nextStored));

    setConsultationByFaculty((prev) => ({ ...prev, [consultationEditFacultyId]: validRows }));
    setIsConsultationDialogOpen(false);
    setConsultationEditFacultyId(null);
    toast({ title: 'Saved', description: 'Consultation hours updated.', type: 'success' });
  };

  // Extract selected faculty availability rendering to avoid nested ternary in JSX
  let selectedFacultyAvailabilityContent: ReactNode = null;
  if (selectedFacultyLoading) {
    selectedFacultyAvailabilityContent = (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading availability...
      </div>
    );
  } else if (selectedFacultyAvailability.length === 0) {
    selectedFacultyAvailabilityContent = (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">No saved availability for this faculty member.</div>
    );
  } else {
    selectedFacultyAvailabilityContent = (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {selectedFacultyAvailability.map((row, index) => (
          <div key={`${row.day}-${row.startTime}-${index}`} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="font-medium text-slate-900">{row.day}</div>
            <div className="text-sm text-slate-500">
              {formatTimeToTwelveHour(row.startTime)} - {formatTimeToTwelveHour(row.endTime)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Extract master schedule content to avoid nested ternary in JSX
  const renderLoadMatrix = (title: string, loadSchedules: Schedule[]) => (
    <div className="px-4 pb-4">
      <div className="mb-2 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      {loadSchedules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
          No schedules in this load.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-sm">
          <table className="w-full min-w-[960px] table-fixed border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-800">
                <th className="w-32 border border-slate-300 px-2 py-3 text-center font-bold uppercase">Time</th>
                {DAYS.slice(0, 6).map((day) => (
                  <th key={day} className="border border-slate-300 px-2 py-3 text-center font-bold uppercase">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MASTER_BOARD_SLOTS.map((slot) => (
                <tr key={slot} className="h-10">
                  <th className="border border-slate-300 bg-slate-50 px-2 text-center font-semibold text-slate-600">
                    {formatBoardTime(slot)}
                  </th>
                  {DAYS.slice(0, 6).map((day) => {
                    const schedule = loadSchedules.find(
                      (candidate) => candidate.day === day && parseTimeToMinutes(candidate.startTime) === slot
                    );
                    const active = loadSchedules.some(
                      (candidate) =>
                        candidate.day === day &&
                        (parseTimeToMinutes(candidate.startTime) ?? 0) < slot &&
                        (parseTimeToMinutes(candidate.endTime) ?? 0) > slot
                    );

                    if (active && !schedule) return null;
                    if (!schedule) {
                      return <td key={`${day}-${slot}`} className="border border-slate-300 bg-white" />;
                    }

                    const classType = getClassType(schedule);
                    const contactHours = getContactHours(schedule.startTime, schedule.endTime) ?? '-';
                    const start = parseTimeToMinutes(schedule.startTime) ?? slot;
                    const end = parseTimeToMinutes(schedule.endTime) ?? start + 30;
                    const span = Math.max(1, Math.ceil((end - start) / 30));

                    return (
                      <td
                        key={`${day}-${slot}`}
                        rowSpan={span}
                        style={{ height: `${span * 40}px` }}
                        className="border border-slate-300 px-2 py-0 align-top text-slate-900"
                      >
                        <div
                          style={{ minHeight: `${span * 40}px` }}
                          className={`flex h-full flex-col gap-1 rounded-lg border p-2.5 text-left shadow-sm ${getScheduleStatusClasses(schedule.status)}`}
                        >
                          <div className="break-words font-semibold leading-tight">{schedule.subject?.code || '-'}</div>
                          <div className="break-words leading-tight">{schedule.subject?.name || '-'}</div>
                          <div className="break-words font-medium">{schedule.section || 'No section'}</div>
                          <div className="break-words text-[11px] text-slate-700">
                            {getRoomDisplayName(schedule.room?.name)} · {formatTimeToTwelveHour(schedule.startTime)} - {formatTimeToTwelveHour(schedule.endTime)}
                          </div>
                          <div className="break-words text-[10px]">
                            {schedule.units ?? '-'} units · {classType === 'lec' ? 'Lec' : 'Lab'} {schedule.lectureContactHours ?? (classType === 'lec' ? contactHours : '-')} hrs · Class size {schedule.classSize ?? '-'}
                          </div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide">{getScheduleStatusLabel(schedule.status)}</div>
                          <div className="mt-auto flex flex-wrap gap-1 pt-1">
                            <Button type="button" size="sm" variant="outline" className="h-7 bg-white px-2 text-[11px]" onClick={() => openEditScheduleDialog(schedule)} disabled={saving || isApprovedSchedule(schedule.status)}>
                              <Pencil className="mr-1 h-3 w-3" /> Edit
                            </Button>
                            <Button type="button" size="sm" variant="destructive" className="h-7 px-2 text-[11px]" onClick={() => handleDeleteSchedule(schedule)} disabled={saving || isApprovedSchedule(schedule.status)}>
                              <Trash2 className="mr-1 h-3 w-3" /> Delete
                            </Button>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderConsultationMatrix = (facultyId: string, rows: ConsultationRow[]) => (
    <div className="overflow-x-auto px-4 pb-4">
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Consultation Hours Schedule
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => openConsultationDialog(facultyId)}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Day</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2} className="text-slate-500">No consultation hours scheduled.</TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={`${row.day}-${row.startTime}-${index}`}>
                <TableCell className="font-medium">{row.day}</TableCell>
                <TableCell>{formatTimeToTwelveHour(row.startTime)} - {formatTimeToTwelveHour(row.endTime)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  const renderFacultyTotals = (facultySchedules: Schedule[]) => {
    const overloadSchedules = facultySchedules.filter((schedule) => getLoadType(schedule) === 'overload');
    const totalUnits = facultySchedules.reduce((total, schedule) => total + getScheduleUnits(schedule), 0);
    const totalHours = facultySchedules.reduce((total, schedule) => total + getScheduleHours(schedule), 0);
    const totalOverload = overloadSchedules.reduce((total, schedule) => total + getScheduleUnits(schedule), 0);
    const overloadHours = overloadSchedules.reduce((total, schedule) => total + getScheduleHours(schedule), 0);

    return (
      <div className="overflow-x-auto px-4 pb-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Total No. of Units</TableHead>
              <TableHead>Total No. of Hours</TableHead>
              <TableHead>Total Overload</TableHead>
              <TableHead>Overload Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-slate-50 font-semibold">
              <TableCell>{formatTotal(totalUnits)}</TableCell>
              <TableCell>{formatTotal(totalHours)}</TableCell>
              <TableCell>{totalOverload > 0 ? formatTotal(totalOverload) : '-'}</TableCell>
              <TableCell>{overloadHours > 0 ? `${formatTotal(overloadHours)} hrs` : '-'}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  };

  let masterScheduleContent: ReactNode = null;
  if (loading) {
    masterScheduleContent = (
      <div className="py-8 text-center text-slate-500">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading schedules...
      </div>
    );
  } else if (visibleSchedules.length === 0) {
    masterScheduleContent = <div className="py-8 text-center text-slate-500">No schedules found.</div>;
  } else {
    masterScheduleContent = (
      <div className="space-y-3">
              {facultiesList.map((faculty) => {
                const normalize = (v?: string | null) => (v ? v.trim().toLowerCase() : '');
                const facultySchedules = visibleSchedules.filter((s) => {
                  // If the faculty list key is name-based, match by normalized name; otherwise match by id
                  if (String(faculty.id).startsWith('name:')) {
                    return (
                      normalize(s.facultyName ?? s.employeeName ?? '') === normalize(faculty.name)
                    );
                  }
                  return String(s.facultyId ?? s.employeeId ?? '') === String(faculty.id);
                });
                const regularSchedules = facultySchedules.filter((schedule) => getLoadType(schedule) === 'regular');
                const overloadSchedules = facultySchedules.filter((schedule) => getLoadType(schedule) === 'overload');
                const facultyMeta = meta.faculties.find((item) => String(item.id) === String(faculty.id));
                const isOpen = Boolean(expanded[faculty.id]);
          return (
            <div key={faculty.id} className="rounded-md border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => toggleFaculty(faculty.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium text-slate-900">{faculty.name}</div>
                  <div className="text-xs text-slate-500">{facultySchedules.length} schedule(s)</div>
                </div>
                <div className="text-slate-500">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {isOpen && (
                <div>
                  <div className="grid gap-1 border-y border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 sm:grid-cols-3">
                    <div><span className="font-semibold">Name of Faculty:</span> {faculty.name}</div>
                    <div><span className="font-semibold">Status of Appointment:</span> {(facultyMeta?.statusOfAppointment || faculty.statusOfAppointment || 'Not set').replace(/^\w/, (letter) => letter.toUpperCase())}</div>
                    <div><span className="font-semibold">Designation:</span> {facultyMeta?.role === 'program_chair' ? 'Program Chair' : facultyMeta?.role === 'dean' ? 'Dean' : 'Faculty'}</div>
                  </div>
                  {renderLoadMatrix('Regular Load', regularSchedules)}
                  {renderConsultationMatrix(faculty.id, consultationByFaculty[faculty.id] ?? [])}
                  {overloadSchedules.length > 0 && renderLoadMatrix('Overload', overloadSchedules)}
                  {renderFacultyTotals(facultySchedules)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  const selectedFacultyName = meta.faculties.find((faculty) => faculty.id === selectedFacultyId)?.name ?? 'Select a faculty member';

  const consultationEditFacultyName =
    meta.faculties.find((faculty) => faculty.id === consultationEditFacultyId)?.name ??
    facultiesList.find((faculty) => faculty.id === consultationEditFacultyId)?.name ??
    '';

  const handleApprovalDecision = async (scheduleId: string, action: 'approve' | 'reject') => {
    if (!user) return;
    const remarks = action === 'reject' ? prompt('Please provide rejection remarks:', '') || '' : '';

    setSaving(true);
    try {
      await scheduleService.submitApprovalDecision({ scheduleId, role: user.role, action, remarks, actorId: String(user.id) });
      await loadData(user);
      toast({ title: 'Done', description: `Schedule ${action}d.`, type: 'success' });
    } catch (error) {
      toast({ title: 'Action Failed', description: error instanceof Error ? error.message : 'Could not process the decision.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const openEditScheduleDialog = (item: Schedule) => {
    if (isApprovedSchedule(item.status)) {
      toast({ title: 'Approved schedule is locked', description: 'Approved schedules cannot be edited.', type: 'warning' });
      return;
    }
    const facultyId = String(item.facultyId ?? item.employeeId ?? '');
    const subjectId = String(item.subjectId ?? item.subject?.id ?? '');
    const roomId = String(item.roomId ?? item.room?.id ?? '');
    const allocatedHours = meta.subjects.find((subject) => String(subject.id) === subjectId)?.hours;
    const currentDurationHours = getContactHours(item.startTime, item.endTime);
    const initialEndTime = calculateEndTime(item.startTime, allocatedHours ?? currentDurationHours, item.endTime || '');

    setEditSchedule({
      id: item.id,
      facultyId,
      section: item.section || '',
      subjectId,
      subjectCode: item.subject?.code || '',
      subjectName: item.subject?.name || '',
      roomId,
      roomName: item.room?.name || '',
      day: item.day || 'Monday',
      startTime: item.startTime || '',
      endTime: initialEndTime,
      loadType: item.loadType === 'overload' ? 'overload' : 'regular',
      units: item.units == null ? '' : String(item.units),
      lectureContactHours: item.lectureContactHours == null ? '' : String(item.lectureContactHours),
      labContactHours: item.labContactHours == null ? '' : String(item.labContactHours),
      classSize: item.classSize == null ? '' : String(item.classSize),
    });
    setEditError('');
    setIsEditDialogOpen(true);
  };

  const handleUpdateSchedule = async () => {
    if (!user || !editSchedule) return;

    if (!editSchedule.facultyId || !editSchedule.subjectId || !editSchedule.roomId || !editSchedule.day || !editSchedule.startTime || !editSchedule.endTime) {
      setEditError('Choose a day and start time.');
      return;
    }

    if (editSchedule.startTime >= editSchedule.endTime) {
      setEditError('End time must be after start time.');
      return;
    }

    const matchingWindows = editFacultyAvailability.filter((window) => window.day === editSchedule.day);
    const fitsAvailability = matchingWindows.some((window) => {
      const start = timeToMinutes(editSchedule.startTime);
      const end = timeToMinutes(editSchedule.endTime);
      const windowStart = timeToMinutes(window.startTime);
      const windowEnd = timeToMinutes(window.endTime);
      return start !== null && end !== null && windowStart !== null && windowEnd !== null && start >= windowStart && end <= windowEnd;
    });
    if (editFacultyAvailability.length === 0) {
      setEditError('This faculty member has no saved availability. Save availability before editing this schedule.');
      return;
    }
    if (!fitsAvailability) {
      const windows = matchingWindows.map(formatAvailabilityWindow).join(', ');
      setEditError(windows
        ? `Choose a time within the faculty availability: ${windows}.`
        : `Choose one of the available days: ${[...new Set(editFacultyAvailability.map((window) => window.day))].join(', ')}.`);
      return;
    }

    setEditError('');
    setSaving(true);
    try {
      await scheduleService.updateSchedule(editSchedule.id, {
        actorId: String(user.id),
        actorRole: user.role,
        facultyId: editSchedule.facultyId,
        section: editSchedule.section || undefined,
        subjectId: editSchedule.subjectId,
        roomId: editSchedule.roomId,
        day: editSchedule.day,
        startTime: editSchedule.startTime,
        endTime: editSchedule.endTime,
        units: editSchedule.units === '' ? undefined : Number(editSchedule.units),
        lectureContactHours: editSchedule.lectureContactHours === '' ? undefined : Number(editSchedule.lectureContactHours),
        labContactHours: editSchedule.labContactHours === '' ? undefined : Number(editSchedule.labContactHours),
        classSize: editSchedule.classSize === '' ? undefined : Number(editSchedule.classSize),
        loadType: editSchedule.loadType,
      });

      setIsEditDialogOpen(false);
      setEditSchedule(null);
      await loadData(user);
      toast({ title: 'Done', description: 'Schedule updated.', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update schedule.';
      const suggestions = error instanceof Error
        ? (error as Error & { suggestions?: { suggested_time_slots?: Array<{ day: string; startTime: string; endTime: string }> } }).suggestions
        : undefined;
      const suggestedTimes = suggestions?.suggested_time_slots ?? [];
      setEditError(suggestedTimes.length > 0
        ? `${message} Try: ${suggestedTimes.slice(0, 3).map((slot) => `${slot.day} ${formatTimeToTwelveHour(slot.startTime)}-${formatTimeToTwelveHour(slot.endTime)}`).join('; ')}.`
        : message);
      toast({ title: 'Update Failed', description: message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (item: Schedule) => {
    if (!user) return;
    if (isApprovedSchedule(item.status)) {
      toast({ title: 'Approved schedule is locked', description: 'Approved schedules cannot be deleted.', type: 'warning' });
      return;
    }

    const confirmed = globalThis.confirm(`Delete this schedule for ${item.facultyName} on ${item.day}?`);
    if (!confirmed) return;

    setSaving(true);
    try {
      await scheduleService.deleteSchedule(item.id, {
        actorId: String(user.id),
        actorRole: user.role,
      });
      await loadData(user);
      toast({ title: 'Done', description: 'Schedule deleted.', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete schedule.';
      toast({ title: 'Delete Failed', description: message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Schedule Loading</h1>
        <p className="mt-1 text-slate-500">Assign faculty schedules with automatic conflict detection and AI suggestions.</p>
      </div>

      {isFacultyLikeRole(user?.role) && (
        <div className="space-y-6">
          <AIScheduleGenerator
            key="ai-batch-generator"
            faculties={meta.faculties}
            subjects={meta.subjects}
            rooms={meta.rooms}
            sections={meta.sections}
            createdBy={user?.id || ''}
            creatorRole={user?.role || ''}
            onSaved={() => loadData(user)}
          />

          <Card className={isFacultyListMinimized ? 'cursor-pointer' : undefined} onClick={isFacultyListMinimized ? () => setIsFacultyListMinimized(false) : undefined}>
            <CardHeader className="flex cursor-pointer flex-row items-center justify-between gap-3" onClick={() => setIsFacultyListMinimized((current) => !current)}>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Faculty List</CardTitle>
                <span className="text-xs font-medium text-slate-500">
                  {meta.faculties.length} {meta.faculties.length === 1 ? 'faculty' : 'faculties'}
                </span>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={isFacultyListMinimized ? 'Restore faculty list' : 'Minimize faculty list'}
                title={isFacultyListMinimized ? 'Restore faculty list' : 'Minimize faculty list'}
              >
                {isFacultyListMinimized ? <ChevronDown /> : <ChevronUp />}
              </Button>
            </CardHeader>
            {!isFacultyListMinimized && <CardContent className="space-y-3">
              {meta.faculties.length === 0 ? (
                <div className="text-sm text-slate-500">No faculty records available.</div>
              ) : (
                <>
                  <Input
                    value={facultySearch}
                    onChange={(event) => setFacultySearch(event.target.value)}
                    placeholder="Search faculty..."
                    aria-label="Search faculty"
                  />
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{filteredFaculties.length} matching</span>
                    {facultySearch && <button type="button" className="font-medium text-red-700 hover:text-red-900" onClick={() => setFacultySearch('')}>Clear</button>}
                  </div>
                  <div className="max-h-[min(60vh,30rem)] space-y-2 overflow-y-auto pr-1">
                    {filteredFaculties.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
                        No faculty matches your search.
                      </div>
                    ) : (
                      filteredFaculties.map((faculty) => {
                        const isSelected = faculty.id === selectedFacultyId;
                        return (
                          <button
                            key={faculty.id}
                            type="button"
                            onClick={() => setSelectedFacultyId(faculty.id)}
                            className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                              isSelected ? 'border-red-300 bg-red-50 text-red-900' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="font-medium">{faculty.name}</div>
                            <div className="text-xs text-slate-500">Click to view saved availability</div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </CardContent>}
          </Card>

          <div className="space-y-6">
            <FacultyLoadGrid
              key={selectedFacultyId}
              facultyId={selectedFacultyId}
              facultyName={selectedFacultyName}
              rooms={meta.rooms}
              subjects={meta.subjects}
              sections={meta.sections}
              createdBy={user?.id || ''}
              creatorRole={user?.role || ''}
              onSaved={() => loadData(user)}
            />

            <Card className={isOfficialTimeMinimized ? 'cursor-pointer' : undefined} onClick={isOfficialTimeMinimized ? () => setIsOfficialTimeMinimized(false) : undefined}>
              <CardHeader className="cursor-pointer" onClick={() => setIsOfficialTimeMinimized((current) => !current)}>
                <CardTitle>Official Time — {selectedFacultyName}</CardTitle>
              </CardHeader>
              {!isOfficialTimeMinimized && <CardContent className="space-y-4">
                {selectedFacultyAvailabilityContent}
              </CardContent>}
            </Card>

          </div>
        </div>
      )}

      {canApprove && (
        <Card className={isApprovalDashboardMinimized ? 'cursor-pointer' : undefined} onClick={isApprovalDashboardMinimized ? () => setIsApprovalDashboardMinimized(false) : undefined}>
          <CardHeader className="cursor-pointer" onClick={() => setIsApprovalDashboardMinimized((current) => !current)}>
            <CardTitle>Approval Dashboard</CardTitle>
          </CardHeader>
          {!isApprovalDashboardMinimized && <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Faculty</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingApprovals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                      No pending schedules for your role.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingApprovals.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.facultyName}</TableCell>
                      <TableCell>
                        {item.subject?.code} - {item.subject?.name}
                        {item.section ? <span className="ml-2 text-xs text-slate-500">Section {item.section}</span> : null}
                      </TableCell>
                      <TableCell>
                        {item.day} {formatTimeToTwelveHour(item.startTime)} - {formatTimeToTwelveHour(item.endTime)}
                      </TableCell>
                      <TableCell>{item.status}</TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprovalDecision(item.id, 'approve')} disabled={saving}>
                          <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleApprovalDecision(item.id, 'reject')} disabled={saving}>
                          <XCircle className="mr-1 h-4 w-4" /> Reject
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>}
        </Card>
      )}

      <Card className={isMasterScheduleMinimized ? 'cursor-pointer' : undefined} onClick={isMasterScheduleMinimized ? () => setIsMasterScheduleMinimized(false) : undefined}>
        <CardHeader className="cursor-pointer" onClick={() => setIsMasterScheduleMinimized((current) => !current)}>
          <CardTitle>Master Schedule</CardTitle>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600" aria-label="Schedule status legend">
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-emerald-700/40 bg-emerald-200" /> Approved</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-orange-700/40 bg-orange-200" /> Pending</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-rose-700/40 bg-rose-200" /> Rejected</span>
          </div>
        </CardHeader>
        {!isMasterScheduleMinimized && <CardContent>{masterScheduleContent}</CardContent>}
      </Card>

      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setEditSchedule(null);
            setEditError('');
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Schedule</DialogTitle>
          </DialogHeader>

          {editSchedule && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                <div className="space-y-1 md:col-span-2">
                  <div className="text-sm font-medium text-slate-700">Faculty</div>
                  <Input className="h-10 bg-slate-50" value={meta.faculties.find((faculty) => faculty.id === editSchedule.facultyId)?.name || 'Selected faculty'} readOnly />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <div className="text-sm font-medium text-slate-700">Section</div>
                  <Input className="h-10 bg-slate-50" value={editSchedule.section || 'No section'} readOnly />
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-700">Subject code</div>
                  <Input className="h-10 bg-slate-50" value={editSchedule.subjectCode || '-'} readOnly />
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-700">Room</div>
                  <Input
                    placeholder="e.g. ComLab 1"
                    value={editSchedule.roomName || '-'}
                    readOnly
                    aria-readonly="true"
                    className="h-10 bg-slate-50"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <div className="text-sm font-medium text-slate-700">Subject name</div>
                  <Input className="h-10 bg-slate-50" value={editSchedule.subjectName || '-'} readOnly />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <div className="text-sm font-medium">Day</div>
                  <Select value={editSchedule.day} onValueChange={(value) => setEditSchedule((prev) => (prev ? { ...prev, day: value || '' } : prev))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((day) => (
                        <SelectItem
                          key={day}
                          value={day}
                          disabled={!editFacultyAvailability.some((window) => window.day === day)}
                        >
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-slate-500">
                    {editAvailabilityLoading
                      ? 'Loading faculty availability...'
                      : editFacultyAvailability.length > 0
                        ? `Available days: ${[...new Set(editFacultyAvailability.map((window) => window.day))].join(', ')}`
                        : 'No saved availability found for this faculty member.'}
                  </p>
                </div>
                <div>
                  <div className="text-sm font-medium">Start Time</div>
                  <Input
                    type="time"
                    value={editSchedule.startTime}
                    onChange={(event) =>
                      setEditSchedule((prev) => {
                        if (!prev) return prev;
                        const subjectHours = meta.subjects.find((subject) => String(subject.id) === prev.subjectId)?.hours;
                        const currentDurationHours = getContactHours(prev.startTime, prev.endTime);
                        return {
                          ...prev,
                          startTime: event.target.value,
                          endTime: calculateEndTime(event.target.value, subjectHours ?? currentDurationHours, prev.endTime),
                        };
                      })
                    }
                  />
                </div>

                {editFacultyAvailability.length > 0 && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                    <div className="font-semibold">Suggested valid placement windows</div>
                    <div className="mt-1 grid gap-1 sm:grid-cols-2">
                      {editFacultyAvailability.map((window) => (
                        <button
                          key={`${window.day}-${window.startTime}-${window.endTime}`}
                          type="button"
                          className="rounded border border-sky-200 bg-white px-2 py-1 text-left text-xs hover:border-sky-400"
                          onClick={() => setEditSchedule((prev) => prev ? {
                            ...prev,
                            day: window.day,
                            startTime: window.startTime,
                            endTime: calculateEndTime(window.startTime, getContactHours(prev.startTime, prev.endTime), window.endTime),
                          } : prev)}
                        >
                          {window.day}: {formatAvailabilityWindow(window)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium">End Time</div>
                  <Input type="time" value={editSchedule.endTime} readOnly className="bg-slate-50" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                {[
                  ['units', 'Units'],
                  ['lectureContactHours', 'Contact Hrs. Lec'],
                  ['labContactHours', 'Contact Hrs. Lab'],
                  ['classSize', 'Class Size'],
                ].map(([field, label]) => (
                  <div key={field}>
                    <div className="text-sm font-medium">{label}</div>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={editSchedule[field as keyof EditScheduleFormState]}
                      readOnly
                      className="bg-slate-50"
                    />
                  </div>
                ))}
              </div>

              {editError && <p className="text-sm text-rose-600">{editError}</p>}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleUpdateSchedule} disabled={saving || !editSchedule}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isConsultationDialogOpen}
        onOpenChange={(open) => {
          setIsConsultationDialogOpen(open);
          if (!open) {
            setConsultationEditFacultyId(null);
            setConsultationEditRows([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Edit Consultation Hours
              {consultationEditFacultyName && (
                <span className="mt-1 block text-sm font-normal text-slate-500">{consultationEditFacultyName}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {consultationEditRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No consultation hours added yet.
              </div>
            ) : (
              <div className="space-y-3">
                {consultationEditRows.map((row, index) => (
                  <div key={`consultation-row-${index}`} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3">
                    <div className="min-w-[140px]">
                      <div className="mb-1 text-xs font-medium text-slate-600">Day</div>
                      <Select value={row.day} onValueChange={(value) => updateConsultationRow(index, { day: value || 'Monday' })}>
                        <SelectTrigger className="h-10">
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
                      <div className="mb-1 text-xs font-medium text-slate-600">Start Time</div>
                      <Input
                        type="time"
                        className="h-10"
                        value={row.startTime}
                        onChange={(event) => updateConsultationRow(index, { startTime: event.target.value })}
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium text-slate-600">End Time</div>
                      <Input
                        type="time"
                        className="h-10"
                        value={row.endTime}
                        onChange={(event) => updateConsultationRow(index, { endTime: event.target.value })}
                      />
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="ml-auto text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => removeConsultationRow(index)}
                      aria-label="Remove consultation row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button type="button" variant="outline" size="sm" onClick={addConsultationRow}>
              <Plus className="mr-1 h-4 w-4" /> Add Row
            </Button>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsConsultationDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveConsultationHours}>
              Save Consultation Hours
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function buildFacultiesList(
  metaFaculties: FacultyMeta[],
  schedules: Schedule[]
) {
  const normalize = (s?: string | null) => (s ? s.trim().toLowerCase() : '');

  const nm = new Map<string, { ids: Set<string>; name: string; statusOfAppointment?: AppointmentStatus | null }>();

  metaFaculties.forEach((f) => {
    const name = f?.name ?? '';
    const id = f?.id ? String(f.id) : '';
    const n = normalize(name);
    if (!n) return;
    if (!nm.has(n)) nm.set(n, { ids: new Set(), name, statusOfAppointment: f.statusOfAppointment });
    if (id) {
      const bucket = nm.get(n);
      if (bucket) bucket.ids.add(id);
    }
  });

  schedules.forEach((s) => {
    const fid = s.facultyId ?? s.employeeId ?? '';
    const fname = s.facultyName ?? s.employeeName ?? '';
    const n = normalize(fname);
    if (!n) return;
    if (!nm.has(n)) nm.set(n, { ids: new Set(), name: fname });
    if (fid) {
      const bucket = nm.get(n);
      if (bucket) bucket.ids.add(String(fid));
    }
  });

  const result: Array<{ id: string; name: string; statusOfAppointment?: AppointmentStatus | null }> = [];
  nm.forEach(({ ids, name, statusOfAppointment }) => {
    if (ids.size > 0) {
      result.push({ id: Array.from(ids.values())[0], name, statusOfAppointment });
    } else {
      result.push({ id: `name:${name}`, name, statusOfAppointment });
    }
  });

  return result;
}