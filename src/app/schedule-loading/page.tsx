'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle2, Loader2, XCircle, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { scheduleService } from '@/services/scheduleService';
import { useRouter } from 'next/navigation';
import { Schedule } from '@/types/schedule';
import { formatTimeToTwelveHour } from '@/lib/timeUtils';
import { isFacultyLikeRole } from '@/lib/roleConfig';
import { toast } from '@/lib/toast';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const APPROVAL_ROLES = new Set(['dean', 'ovpaa', 'registrar', 'hro']);

const getContactHours = (startTime: string, endTime: string) => {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  const start = startHours * 60 + startMinutes;
  const end = endHours * 60 + endMinutes;
  const hours = (end - start) / 60;

  return Number.isFinite(hours) && hours > 0 ? hours : null;
};

const getLoadType = (schedule: Schedule) => {
  const candidate = schedule as Schedule & { loadType?: string; isOverload?: boolean };
  return candidate.isOverload || candidate.loadType?.toLowerCase() === 'overload' ? 'overload' : 'regular';
};

const getClassType = (schedule: Schedule) => {
  const description = schedule.subject?.name?.toLowerCase() || '';
  return description.includes('(lab') || description.includes('laboratory') ? 'lab' : 'lec';
};

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

interface SchedulingMeta {
  faculties: FacultyMeta[];
  subjects: Array<{ id: string; code: string; name: string }>;
  rooms: Array<{ id: string; name: string; capacity: number }>;
  sections: Array<{ id: string; name: string }>;
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
  const [assignmentError, setAssignmentError] = useState('');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Schedule[]>([]);
  const [meta, setMeta] = useState<SchedulingMeta>({ faculties: [], subjects: [], rooms: [], sections: [] });
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [selectedFacultyLoading, setSelectedFacultyLoading] = useState(false);
  const [selectedFacultyAvailability, setSelectedFacultyAvailability] = useState<Array<{ day: string; startTime: string; endTime: string }>>([]);
  const [conflictResult, setConflictResult] = useState<null | {
    conflict_type: 'faculty' | 'room' | 'availability';
    conflicts: Array<{ conflict_type: string; details: unknown[] }>;
    suggestions: {
      suggested_rooms: Array<{ id: string; name: string; capacity: number }>;
      suggested_time_slots: Array<{ day: string; start_time: string; end_time: string }>;
    };
  }>(null);
  const [assignment, setAssignment] = useState({
    facultyId: '',
    section: '',
    subjectId: '',
    roomId: '',
    day: 'Monday',
    startTime: '',
    endTime: '',
  });
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [loadType, setLoadType] = useState<'regular' | 'overload'>('regular');
  const [loadDetails, setLoadDetails] = useState({ units: '', lectureContactHours: '', labContactHours: '', classSize: '' });
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<EditScheduleFormState | null>(null);
  const [editError, setEditError] = useState('');

  const currentUserName = user?.full_name || user?.name || '';
  const canApprove = APPROVAL_ROLES.has(user?.role || '');

  const loadData = async (currentUser?: LocalUser | null) => {
    setLoading(true);
    try {
      const [metaData, scheduleData] = await Promise.all([scheduleService.getMetadata(), scheduleService.getSchedules()]);
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

  const router = useRouter();

  useEffect(() => {
    const raw = localStorage.getItem('user');
    const parsed = raw ? (JSON.parse(raw) as LocalUser) : null;
    setUser(parsed);
    void loadData(parsed);
  }, []);

  // Restrict this feature to the program chair Imelda Tolentino only
  useEffect(() => {
    if (!user) return;
    const name = (user.full_name || user.name || '').trim().toLowerCase();
    const role = (user.role || '').toString().toLowerCase();
    const isImelda = name === 'imelda tolentino' && role === 'program_chair';
    if (!isImelda) {
      // Redirect other users away from this page
      router.push('/dashboard/faculty');
    }
  }, [user, router]);

  useEffect(() => {
    if (!meta.faculties.length) return;

    const nextSelectedFacultyId = meta.faculties.find((faculty) => faculty.id === selectedFacultyId)?.id || meta.faculties[0]?.id || '';
    if (nextSelectedFacultyId && nextSelectedFacultyId !== selectedFacultyId) {
      setSelectedFacultyId(nextSelectedFacultyId);
      setAssignment((prev) => ({ ...prev, facultyId: nextSelectedFacultyId }));
    }
  }, [meta.faculties, selectedFacultyId]);

  useEffect(() => {
    if (!selectedFacultyId) return;

    let cancelled = false;
    const loadSelectedFacultyAvailability = async () => {
      setSelectedFacultyLoading(true);
      try {
        const entries = await scheduleService.getFacultyAvailability(selectedFacultyId);
        if (cancelled) return;

        setSelectedFacultyAvailability(entries.map((entry) => ({ day: entry.day, startTime: entry.startTime, endTime: entry.endTime })));
        setAssignment((prev) => ({ ...prev, facultyId: selectedFacultyId }));
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleFaculty = (facultyId: string) => {
    setExpanded((prev) => ({ ...prev, [facultyId]: !prev[facultyId] }));
  };

  // Build a list of faculties from meta and schedules to display in master schedule
  const facultiesList = useMemo(() => buildFacultiesList(meta.faculties, visibleSchedules), [meta.faculties, visibleSchedules]);

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
    <div className="overflow-x-auto px-4 pb-4">
      <div className="mb-2 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Day/s</TableHead>
            <TableHead>Section</TableHead>
            <TableHead>Room</TableHead>
            <TableHead>Units</TableHead>
            <TableHead>Contact Hrs. Lec</TableHead>
            <TableHead>Contact Hrs. Lab</TableHead>
            <TableHead>Class Size</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loadSchedules.map((item) => {
            const classType = getClassType(item);
            const contactHours = getContactHours(item.startTime, item.endTime) ?? '-';
            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.subject?.code || '-'}</TableCell>
                <TableCell>{item.subject?.name || '-'}</TableCell>
                <TableCell>{formatTimeToTwelveHour(item.startTime)} - {formatTimeToTwelveHour(item.endTime)}</TableCell>
                <TableCell>{item.day || '-'}</TableCell>
                <TableCell>{item.section || '-'}</TableCell>
                <TableCell>{item.room?.name || '-'}</TableCell>
                <TableCell>{item.units ?? '-'}</TableCell>
                <TableCell>{item.lectureContactHours ?? (classType === 'lec' ? contactHours : '-')}</TableCell>
                <TableCell>{item.labContactHours ?? (classType === 'lab' ? contactHours : '-')}</TableCell>
                <TableCell>{item.classSize ?? '-'}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button type="button" size="sm" variant="outline" onClick={() => openEditScheduleDialog(item)} disabled={saving}>
                    <Pencil className="mr-1 h-4 w-4" /> Edit
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => handleDeleteSchedule(item)} disabled={saving}>
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

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
                    <div><span className="font-semibold">Designation:</span> {facultyMeta?.role === 'program_chair' ? 'Program Chair' : 'Faculty'}</div>
                  </div>
                  {renderLoadMatrix('Regular Load', regularSchedules)}
                  {overloadSchedules.length > 0 && renderLoadMatrix('Overload', overloadSchedules)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  const selectedFacultyName = meta.faculties.find((faculty) => faculty.id === selectedFacultyId)?.name ?? 'Select a faculty member';

  const handleCreateSchedule = async () => {
    if (!user) return;

    if (!assignment.facultyId || !subjectCode.trim() || !subjectName.trim() || !assignment.section.trim() || !roomName.trim() || !assignment.startTime || !assignment.endTime) {
      setAssignmentError('Enter a subject code, subject name, section, room, day, start time, and end time before creating the schedule.');
      return;
    }

    if (assignment.startTime >= assignment.endTime) {
      setAssignmentError('End time must be later than the start time.');
      return;
    }

    const numericLoadDetails = Object.fromEntries(
      Object.entries(loadDetails).map(([key, value]) => [key, value === '' ? undefined : Number(value)])
    ) as { units?: number; lectureContactHours?: number; labContactHours?: number; classSize?: number };
    if (Object.values(numericLoadDetails).some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) {
      setAssignmentError('Units, contact hours, and class size must be zero or greater.');
      return;
    }

    setAssignmentError('');
    setSaving(true);
    try {
      const matchingRoom = meta.rooms.find((room) => room.name.trim().toLowerCase() === roomName.trim().toLowerCase());
      if (!matchingRoom) {
        throw new Error(`Room "${roomName.trim()}" was not found. Enter an existing room name.`);
      }

      const existingSubject = meta.subjects.find(
        (subject) => subject.code.toLowerCase() === subjectCode.trim().toLowerCase() && subject.name.toLowerCase() === subjectName.trim().toLowerCase()
      );
      const subjectId = existingSubject?.id ?? (await scheduleService.createSubject({ code: subjectCode.trim(), name: subjectName.trim() })).data?.id;

      if (!subjectId) {
        throw new Error('Unable to resolve the subject. Please try again.');
      }

      const result = await scheduleService.createSchedule({
        ...assignment,
        subjectId,
        roomId: matchingRoom.id,
        section: assignment.section.trim(),
        ...numericLoadDetails,
        loadType,
        createdBy: currentUserName || user.role,
        creatorRole: user.role,
      });

      if (!result.success) {
        setConflictResult(result.conflict);
        toast({ title: 'Schedule Conflict', description: 'Unable to create schedule due to conflicts.', type: 'warning' });
        return;
      }

      setConflictResult(null);
      setAssignment({ facultyId: '', section: '', subjectId: '', roomId: '', day: 'Monday', startTime: '', endTime: '' });
      setSubjectCode('');
      setSubjectName('');
      setRoomName('');
      setLoadDetails({ units: '', lectureContactHours: '', labContactHours: '', classSize: '' });
      setLoadType('regular');
      await loadData(user);
      toast({ title: 'Done', description: 'Schedule created.', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create the schedule. Please review the selected values and try again.';
      setAssignmentError(message);
      toast({ title: 'Create Failed', description: message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleApprovalDecision = async (scheduleId: string, action: 'approve' | 'reject') => {
    if (!user) return;
    const remarks = action === 'reject' ? prompt('Please provide rejection remarks:', '') || '' : '';

    setSaving(true);
    try {
      await scheduleService.submitApprovalDecision({ scheduleId, role: user.role, action, remarks, actorId: String(user.id) });
      await loadData(user);
      toast({ title: 'Done', description: `Schedule ${action}d.`, type: 'success' });
    } catch (error) {
      toast({ title: 'Action Failed', description: error instanceof Error ? error.message : 'Failed to process approval decision', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const openEditScheduleDialog = (item: Schedule) => {
    const facultyId = String(item.facultyId ?? item.employeeId ?? '');
    const subjectId = String(item.subjectId ?? item.subject?.id ?? '');
    const roomId = String(item.roomId ?? item.room?.id ?? '');

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
      endTime: item.endTime || '',
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

    if (!editSchedule.facultyId || !editSchedule.subjectCode.trim() || !editSchedule.subjectName.trim() || !editSchedule.roomName.trim() || !editSchedule.day || !editSchedule.startTime || !editSchedule.endTime) {
      setEditError('Choose a faculty member, subject, room, day, start time, and end time before saving.');
      return;
    }

    if (editSchedule.startTime >= editSchedule.endTime) {
      setEditError('End time must be later than the start time.');
      return;
    }

    setEditError('');
    setSaving(true);
    try {
      const existingSubject = meta.subjects.find(
        (subject) => subject.code.toLowerCase() === editSchedule.subjectCode.trim().toLowerCase() && subject.name.toLowerCase() === editSchedule.subjectName.trim().toLowerCase()
      );
      const subjectId = existingSubject?.id ?? (await scheduleService.createSubject({
        code: editSchedule.subjectCode.trim(),
        name: editSchedule.subjectName.trim(),
      })).data?.id;
      const matchingRoom = meta.rooms.find((room) => room.name.trim().toLowerCase() === editSchedule.roomName.trim().toLowerCase());
      if (!subjectId) {
        throw new Error('Unable to resolve the subject. Please try again.');
      }
      if (!matchingRoom) {
        throw new Error(`Room "${editSchedule.roomName.trim()}" was not found. Enter an existing room name.`);
      }

      await scheduleService.updateSchedule(editSchedule.id, {
        actorId: String(user.id),
        actorRole: user.role,
        facultyId: editSchedule.facultyId,
        section: editSchedule.section || undefined,
        subjectId,
        roomId: matchingRoom.id,
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
      const message = error instanceof Error ? error.message : 'Unable to update schedule.';
      setEditError(message);
      toast({ title: 'Update Failed', description: message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (item: Schedule) => {
    if (!user) return;

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
      const message = error instanceof Error ? error.message : 'Unable to delete schedule.';
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
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Faculty List</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {meta.faculties.length === 0 ? (
                <div className="text-sm text-slate-500">No faculty records available.</div>
              ) : (
                meta.faculties.map((faculty) => {
                  const isSelected = faculty.id === selectedFacultyId;
                  return (
                    <button
                      key={faculty.id}
                      type="button"
                      onClick={() => {
                        setSelectedFacultyId(faculty.id);
                        setAssignment((prev) => ({ ...prev, facultyId: faculty.id }));
                      }}
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
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Program Chair Scheduling</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2 xl:col-span-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Selected Faculty</div>
                    <div className="text-sm font-medium text-slate-900">{selectedFacultyName}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-700">Subject code</div>
                    <Input
                      className="h-10"
                      placeholder="e.g. CS101"
                      value={subjectCode}
                      onChange={(event) => setSubjectCode(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-700">Subject name</div>
                    <Input
                      className="h-10"
                      placeholder="Subject name"
                      value={subjectName}
                      onChange={(event) => setSubjectName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-700">Room</div>
                    <Input
                      className="h-10"
                      placeholder="e.g. ComLab 1"
                      value={roomName}
                      onChange={(event) => setRoomName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-700">Section</div>
                    <Input
                      className="h-10"
                      placeholder="e.g. 1A"
                      value={assignment.section}
                      onChange={(event) => setAssignment((prev) => ({ ...prev, section: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-700">Day</div>
                    <Select value={assignment.day} onValueChange={(value) => setAssignment((prev) => ({ ...prev, day: value || 'Monday' }))}>
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
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-700">Start Time</div>
                    <Input className="h-10" type="time" value={assignment.startTime} onChange={(event) => setAssignment((prev) => ({ ...prev, startTime: event.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-700">End Time</div>
                    <Input className="h-10" type="time" value={assignment.endTime} onChange={(event) => setAssignment((prev) => ({ ...prev, endTime: event.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-700">Load Type</div>
                    <Select value={loadType} onValueChange={(value) => setLoadType(value as 'regular' | 'overload')}>
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Regular Load</SelectItem>
                        <SelectItem value="overload">Overload</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['units', 'Units'],
                    ['lectureContactHours', 'Contact Hrs. Lec'],
                    ['labContactHours', 'Contact Hrs. Lab'],
                    ['classSize', 'Class Size'],
                  ].map(([field, label]) => (
                    <div key={field} className="space-y-1">
                      <div className="text-sm font-medium text-slate-700">{label}</div>
                      <Input
                        className="h-10"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={loadDetails[field as keyof typeof loadDetails]}
                        onChange={(event) => setLoadDetails((current) => ({ ...current, [field]: event.target.value.replace(/\D/g, '') }))}
                      />
                    </div>
                  ))}
                </div>
                <Button onClick={handleCreateSchedule} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Schedule
                </Button>
                {assignmentError && <p className="text-sm text-rose-600">{assignmentError}</p>}
                {conflictResult && (
                  <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <div className="flex items-center gap-2 font-medium text-amber-900">
                      <AlertTriangle className="h-4 w-4" />
                      Conflict detected: {conflictResult.conflict_type}
                    </div>
                    <div className="text-sm text-amber-800">Found {conflictResult.conflicts.length} conflict group(s). Adjust room/time before retrying.</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">Suggested Rooms</h3>
                        <ul className="list-disc pl-5 text-sm text-slate-700">
                          {conflictResult.suggestions.suggested_rooms.length === 0 ? (
                            <li>No available room suggestions for this time slot.</li>
                          ) : (
                            conflictResult.suggestions.suggested_rooms.map((room) => <li key={room.id}>{room.name} (cap {room.capacity})</li>)
                          )}
                        </ul>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">Suggested Time Slots</h3>
                        <ul className="list-disc pl-5 text-sm text-slate-700">
                          {conflictResult.suggestions.suggested_time_slots.length === 0 ? (
                            <li>No available time suggestions within faculty availability.</li>
                          ) : (
                            conflictResult.suggestions.suggested_time_slots.map((slot, index) => (
                              <li key={`${slot.day}-${slot.start_time}-${index}`}>
                                {slot.day}: {formatTimeToTwelveHour(slot.start_time)} - {formatTimeToTwelveHour(slot.end_time)}
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{selectedFacultyName} Availability</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedFacultyAvailabilityContent}
              </CardContent>
            </Card>

          </div>
        </div>
      )}

      {canApprove && (
        <Card>
          <CardHeader>
            <CardTitle>Approval Dashboard</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Master Schedule</CardTitle>
        </CardHeader>
        <CardContent>{masterScheduleContent}</CardContent>
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
                  <Input className="h-10" value={editSchedule.section} onChange={(event) => setEditSchedule((prev) => (prev ? { ...prev, section: event.target.value } : prev))} />
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-700">Subject code</div>
                  <Input className="h-10" value={editSchedule.subjectCode} onChange={(event) => setEditSchedule((prev) => (prev ? { ...prev, subjectCode: event.target.value } : prev))} />
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-700">Room</div>
                  <Input
                    className="h-10"
                    placeholder="e.g. ComLab 1"
                    value={editSchedule.roomName}
                    onChange={(event) => setEditSchedule((prev) => (prev ? { ...prev, roomName: event.target.value } : prev))}
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <div className="text-sm font-medium text-slate-700">Subject name</div>
                  <Input className="h-10" value={editSchedule.subjectName} onChange={(event) => setEditSchedule((prev) => (prev ? { ...prev, subjectName: event.target.value } : prev))} />
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
                        <SelectItem key={day} value={day}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="text-sm font-medium">Start Time</div>
                  <Input type="time" value={editSchedule.startTime} onChange={(event) => setEditSchedule((prev) => (prev ? { ...prev, startTime: event.target.value } : prev))} />
                </div>
                <div>
                  <div className="text-sm font-medium">End Time</div>
                  <Input type="time" value={editSchedule.endTime} onChange={(event) => setEditSchedule((prev) => (prev ? { ...prev, endTime: event.target.value } : prev))} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <div className="text-sm font-medium">Load Type</div>
                  <Select value={editSchedule.loadType} onValueChange={(value) => setEditSchedule((prev) => (prev ? { ...prev, loadType: value as 'regular' | 'overload' } : prev))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular Load</SelectItem>
                      <SelectItem value="overload">Overload</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                      onChange={(event) => setEditSchedule((prev) => (prev ? { ...prev, [field]: event.target.value.replace(/\D/g, '') } : prev))}
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