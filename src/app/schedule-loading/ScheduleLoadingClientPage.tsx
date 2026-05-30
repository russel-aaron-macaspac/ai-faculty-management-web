'use client';

import { useEffect, useMemo, useState } from 'react';
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

type LocalUser = {
  id: string;
  role: string;
  full_name?: string;
  name?: string;
};

interface SchedulingMeta {
  faculties: Array<{ id: string; name: string; role: string }>;
  subjects: Array<{ id: string; code: string; name: string }>;
  rooms: Array<{ id: string; name: string; capacity: number }>;
  sections: Array<{ id: string; name: string }>;
}

interface EditScheduleFormState {
  id: string;
  facultyId: string;
  section: string;
  subjectId: string;
  roomId: string;
  day: string;
  startTime: string;
  endTime: string;
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
  const [subjectError, setSubjectError] = useState('');
  const [roomError, setRoomError] = useState('');
  const [sectionError, setSectionError] = useState('');
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
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState('');
  const [newSectionName, setNewSectionName] = useState('');
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

  const getLinkedScheduleCount = (predicate: (schedule: Schedule) => boolean) => schedules.filter(predicate).length;

  const buildDeletePrompt = (entity: string, label: string, linkedCount: number) => {
    const scheduleText = linkedCount === 1 ? '1 linked schedule will be deleted.' : `${linkedCount} linked schedules will be deleted.`;
    return linkedCount > 0
      ? `Delete ${entity} ${label}? ${scheduleText}`
      : `Delete ${entity} ${label}?`;
  };

  const buildSectionDeletePrompt = (label: string, linkedCount: number) => {
    const scheduleText = linkedCount === 1 ? '1 schedule references this section.' : `${linkedCount} schedules reference this section.`;
    return linkedCount > 0
      ? `Delete section ${label}? ${scheduleText}`
      : `Delete section ${label}?`;
  };

  // Build a list of faculties from meta and schedules to display in master schedule
  const facultiesList = useMemo(() => buildFacultiesList(meta.faculties, visibleSchedules), [meta.faculties, visibleSchedules]);

  // Extract selected faculty availability rendering to avoid nested ternary in JSX
  let selectedFacultyAvailabilityContent: JSX.Element | null = null;
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
  let masterScheduleContent: JSX.Element | null = null;
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
                      normalize(s.facultyName ?? s.faculty?.name ?? s.employeeName ?? '') === normalize(faculty.name)
                    );
                  }
                  return String(s.facultyId ?? s.faculty?.id ?? s.employeeId ?? '') === String(faculty.id);
                });
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
                <div className="px-4 pb-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subject</TableHead>
                        <TableHead>Room</TableHead>
                        <TableHead>Day</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Remarks</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {facultySchedules.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            {item.subject?.code} - {item.subject?.name}
                            {item.section ? <span className="ml-2 text-xs text-slate-500">Section {item.section}</span> : null}
                          </TableCell>
                          <TableCell>{item.room?.name}</TableCell>
                          <TableCell>{item.day}</TableCell>
                          <TableCell>
                            {formatTimeToTwelveHour(item.startTime)} - {formatTimeToTwelveHour(item.endTime)}
                          </TableCell>
                          <TableCell>{item.status}</TableCell>
                          <TableCell>
                            {item.status === 'rejected' && item.remarks ? (
                              <span className="text-red-600">{item.remarks}</span>
                            ) : (
                              <span className="text-slate-400">{item.remarks ? item.remarks : '-'}</span>
                            )}
                          </TableCell>
                          <TableCell className="space-x-2 text-right">
                            <Button type="button" size="sm" variant="outline" onClick={() => openEditScheduleDialog(item)} disabled={saving}>
                              <Pencil className="mr-1 h-4 w-4" /> Edit
                            </Button>
                            <Button type="button" size="sm" variant="destructive" onClick={() => handleDeleteSchedule(item)} disabled={saving}>
                              <Trash2 className="mr-1 h-4 w-4" /> Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  const subjectLabel = getSelectedLabel(meta.subjects, assignment.subjectId, (subject) => `${subject.code} - ${subject.name}`);
  const roomLabel = getSelectedLabel(meta.rooms, assignment.roomId, (room) => `${room.name} (cap ${room.capacity})`);
  const sectionLabel = getSelectedLabel(meta.sections, assignment.section, (section) => section.name);
  const selectedFacultyName = meta.faculties.find((faculty) => faculty.id === selectedFacultyId)?.name ?? 'Select a faculty member';

  const handleCreateSchedule = async () => {
    if (!user) return;

    if (!assignment.facultyId || !assignment.section || !assignment.subjectId || !assignment.roomId || !assignment.startTime || !assignment.endTime) {
      setAssignmentError('Choose a faculty member, subject, room, section, day, start time, and end time before creating the schedule.');
      return;
    }

    if (assignment.startTime >= assignment.endTime) {
      setAssignmentError('End time must be later than the start time.');
      return;
    }

    setAssignmentError('');
    setSaving(true);
    try {
      const result = await scheduleService.createSchedule({
        ...assignment,
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

  const handleCreateSubject = async () => {
    if (!newSubjectCode.trim() || !newSubjectName.trim()) {
      setSubjectError('Enter both a subject code and a subject name.');
      return;
    }

    setSubjectError('');
    setSaving(true);
    try {
      await scheduleService.createSubject({ code: newSubjectCode.trim(), name: newSubjectName.trim() });
      setNewSubjectCode('');
      setNewSubjectName('');
      await loadData(user);
      toast({ title: 'Subject Added', description: 'Subject was created.', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create the subject. Please check the code and name, then try again.';
      setSubjectError(message);
      toast({ title: 'Create Failed', description: message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRoom = async () => {
    const capacity = Number(newRoomCapacity);
    if (!newRoomName.trim() || Number.isNaN(capacity) || capacity <= 0) {
      setRoomError('Enter a room name and a capacity greater than zero.');
      return;
    }

    setRoomError('');
    setSaving(true);
    try {
      await scheduleService.createRoom({ name: newRoomName.trim(), capacity });
      setNewRoomName('');
      setNewRoomCapacity('');
      await loadData(user);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : 'Unable to create the room. Please review the name and capacity and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSection = async () => {
    if (!newSectionName.trim()) {
      setSectionError('Enter a section name before saving.');
      return;
    }

    setSectionError('');
    setSaving(true);
    try {
      await scheduleService.createSection({ name: newSectionName.trim() });
      setNewSectionName('');
      await loadData(user);
    } catch (error) {
      setSectionError(error instanceof Error ? error.message : 'Unable to create the section. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubject = async (subjectId: string, subjectLabel: string) => {
    if (!user) return;

    const linkedCount = getLinkedScheduleCount((schedule) => schedule.subjectId === subjectId);
    const confirmed = globalThis.confirm(buildDeletePrompt('subject', subjectLabel, linkedCount));
    if (!confirmed) return;

    setSaving(true);
    try {
      await scheduleService.deleteSubject(subjectId);
      if (assignment.subjectId === subjectId) {
        setAssignment((prev) => ({ ...prev, subjectId: '' }));
      }
      await loadData(user);
      toast({ title: 'Done', description: 'Subject deleted.', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete subject.';
      toast({ title: 'Delete Failed', description: message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRoom = async (roomId: string, roomLabel: string) => {
    if (!user) return;

    const linkedCount = getLinkedScheduleCount((schedule) => schedule.roomId === roomId);
    const confirmed = globalThis.confirm(buildDeletePrompt('room', roomLabel, linkedCount));
    if (!confirmed) return;

    setSaving(true);
    try {
      await scheduleService.deleteRoom(roomId);
      if (assignment.roomId === roomId) {
        setAssignment((prev) => ({ ...prev, roomId: '' }));
      }
      await loadData(user);
      toast({ title: 'Done', description: 'Room deleted.', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete room.';
      toast({ title: 'Delete Failed', description: message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSection = async (sectionId: string, sectionLabel: string) => {
    if (!user) return;

    const linkedCount = getLinkedScheduleCount((schedule) => schedule.section === sectionLabel || schedule.section === sectionId);
    const confirmed = globalThis.confirm(buildSectionDeletePrompt(sectionLabel, linkedCount));
    if (!confirmed) return;

    setSaving(true);
    try {
      await scheduleService.deleteSection(sectionId);
      if (assignment.section === sectionLabel) {
        setAssignment((prev) => ({ ...prev, section: '' }));
      }
      await loadData(user);
      toast({ title: 'Done', description: 'Section deleted.', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete section.';
      toast({ title: 'Delete Failed', description: message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const openEditScheduleDialog = (item: Schedule) => {
    const facultyId = String(item.facultyId ?? item.faculty?.id ?? item.employeeId ?? '');
    const subjectId = String(item.subjectId ?? item.subject?.id ?? '');
    const roomId = String(item.roomId ?? item.room?.id ?? '');

    setEditSchedule({
      id: item.id,
      facultyId,
      section: item.section || '',
      subjectId,
      roomId,
      day: item.day || 'Monday',
      startTime: item.startTime || '',
      endTime: item.endTime || '',
    });
    setEditError('');
    setIsEditDialogOpen(true);
  };

  const handleUpdateSchedule = async () => {
    if (!user || !editSchedule) return;

    if (!editSchedule.facultyId || !editSchedule.subjectId || !editSchedule.roomId || !editSchedule.day || !editSchedule.startTime || !editSchedule.endTime) {
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
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2 lg:col-span-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Selected Faculty</div>
                    <div className="text-sm font-medium text-slate-900">{selectedFacultyName}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Subject</div>
                    <Select value={assignment.subjectId} onValueChange={(value) => setAssignment((prev) => ({ ...prev, subjectId: value || '' }))}>
                      <SelectTrigger>
                        <SelectValue>{subjectLabel || 'Select subject'}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {meta.subjects.map((subject) => (
                          <SelectItem key={subject.id} value={subject.id}>
                            {subject.code} - {subject.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Room</div>
                    <Select value={assignment.roomId} onValueChange={(value) => setAssignment((prev) => ({ ...prev, roomId: value || '' }))}>
                      <SelectTrigger>
                        <SelectValue>{roomLabel || 'Select room'}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {meta.rooms.map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            {room.name} (cap {room.capacity})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Section</div>
                    <Select value={assignment.section} onValueChange={(value) => setAssignment((prev) => ({ ...prev, section: value || '' }))}>
                      <SelectTrigger>
                        <SelectValue>{sectionLabel || 'Select section'}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {meta.sections.map((section) => (
                          <SelectItem key={section.id} value={section.name}>
                            {section.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <div className="text-sm font-medium">Day</div>
                    <Select value={assignment.day} onValueChange={(value) => setAssignment((prev) => ({ ...prev, day: value || 'Monday' }))}>
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
                    <Input type="time" value={assignment.startTime} onChange={(event) => setAssignment((prev) => ({ ...prev, startTime: event.target.value }))} />
                  </div>
                  <div>
                    <div className="text-sm font-medium">End Time</div>
                    <Input type="time" value={assignment.endTime} onChange={(event) => setAssignment((prev) => ({ ...prev, endTime: event.target.value }))} />
                  </div>
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

            <Card>
              <CardHeader>
                <CardTitle>Manage Subjects and Rooms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Deleting a subject, room, or section will remove it from the schedule-loading lists, and deleting a subject or room also clears schedules that use it.
                </div>
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-800">Add Subject</div>
                  <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_140px]">
                    <Input placeholder="Code (e.g. CS101)" value={newSubjectCode} onChange={(event) => setNewSubjectCode(event.target.value)} />
                    <Input placeholder="Subject name" value={newSubjectName} onChange={(event) => setNewSubjectName(event.target.value)} />
                    <Button type="button" onClick={handleCreateSubject} disabled={saving}>
                      Add Subject
                    </Button>
                  </div>
                  {subjectError && <p className="text-sm text-rose-600">{subjectError}</p>}
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {meta.subjects.length === 0 ? (
                      <div className="text-sm text-slate-500">No subjects yet.</div>
                    ) : (
                      meta.subjects.map((subject) => (
                        <div key={subject.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                          <div className="text-sm text-slate-800">
                            <span className="font-medium">{subject.code}</span> - {subject.name}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteSubject(subject.id, `${subject.code} - ${subject.name}`)}
                            disabled={saving}
                            aria-label={`Delete subject ${subject.code} - ${subject.name}`}
                          >
                            <Trash2 className="h-4 w-4 text-slate-500 hover:text-rose-600" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-800">Add Room</div>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_140px]">
                    <Input placeholder="Room name" value={newRoomName} onChange={(event) => setNewRoomName(event.target.value)} />
                    <Input type="number" min={1} placeholder="Capacity" value={newRoomCapacity} onChange={(event) => setNewRoomCapacity(event.target.value)} />
                    <Button type="button" onClick={handleCreateRoom} disabled={saving}>
                      Add Room
                    </Button>
                  </div>
                  {roomError && <p className="text-sm text-rose-600">{roomError}</p>}
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {meta.rooms.length === 0 ? (
                      <div className="text-sm text-slate-500">No rooms yet.</div>
                    ) : (
                      meta.rooms.map((room) => (
                        <div key={room.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                          <div className="text-sm text-slate-800">
                            <span className="font-medium">{room.name}</span> (cap {room.capacity})
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteRoom(room.id, `${room.name} (cap ${room.capacity})`)}
                            disabled={saving}
                            aria-label={`Delete room ${room.name}`}
                          >
                            <Trash2 className="h-4 w-4 text-slate-500 hover:text-rose-600" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-800">Add Section</div>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
                    <Input placeholder="Section name (e.g. 1A)" value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} />
                    <Button type="button" onClick={handleCreateSection} disabled={saving}>
                      Add Section
                    </Button>
                  </div>
                  {sectionError && <p className="text-sm text-rose-600">{sectionError}</p>}
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {meta.sections.length === 0 ? (
                      <div className="text-sm text-slate-500">No sections yet.</div>
                    ) : (
                      meta.sections.map((section) => (
                        <div key={section.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                          <div className="text-sm text-slate-800">
                            <span className="font-medium">{section.name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteSection(section.id, section.name)}
                            disabled={saving}
                            aria-label={`Delete section ${section.name}`}
                          >
                            <Trash2 className="h-4 w-4 text-slate-500 hover:text-rose-600" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Schedule</DialogTitle>
          </DialogHeader>

          {editSchedule && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm font-medium">Faculty</div>
                  <Select value={editSchedule.facultyId} onValueChange={(value) => setEditSchedule((prev) => (prev ? { ...prev, facultyId: value } : prev))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select faculty" />
                    </SelectTrigger>
                    <SelectContent>
                      {meta.faculties.map((faculty) => (
                        <SelectItem key={faculty.id} value={faculty.id}>
                          {faculty.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="text-sm font-medium">Section</div>
                  <Select value={editSchedule.section} onValueChange={(value) => setEditSchedule((prev) => (prev ? { ...prev, section: value } : prev))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      {meta.sections.map((section) => (
                        <SelectItem key={section.id} value={section.name}>
                          {section.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="text-sm font-medium">Subject</div>
                  <Select value={editSchedule.subjectId} onValueChange={(value) => setEditSchedule((prev) => (prev ? { ...prev, subjectId: value } : prev))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {meta.subjects.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.code} - {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="text-sm font-medium">Room</div>
                  <Select value={editSchedule.roomId} onValueChange={(value) => setEditSchedule((prev) => (prev ? { ...prev, roomId: value } : prev))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select room" />
                    </SelectTrigger>
                    <SelectContent>
                      {meta.rooms.map((room) => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.name} (cap {room.capacity})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <div className="text-sm font-medium">Day</div>
                  <Select value={editSchedule.day} onValueChange={(value) => setEditSchedule((prev) => (prev ? { ...prev, day: value } : prev))}>
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
  metaFaculties: Array<{ id: string; name: string; role: string }>,
  schedules: Schedule[]
) {
  const normalize = (s?: string | null) => (s ? s.trim().toLowerCase() : '');

  const nm = new Map<string, { ids: Set<string>; name: string }>();

  metaFaculties.forEach((f) => {
    const name = f?.name ?? '';
    const id = f?.id ? String(f.id) : '';
    const n = normalize(name);
    if (!n) return;
    if (!nm.has(n)) nm.set(n, { ids: new Set(), name });
    if (id) {
      const bucket = nm.get(n);
      if (bucket) bucket.ids.add(id);
    }
  });

  schedules.forEach((s) => {
    const fid = s.facultyId ?? s.faculty?.id ?? s.employeeId ?? '';
    const fname = s.facultyName ?? s.faculty?.name ?? s.employeeName ?? '';
    const n = normalize(fname);
    if (!n) return;
    if (!nm.has(n)) nm.set(n, { ids: new Set(), name: fname });
    if (fid) {
      const bucket = nm.get(n);
      if (bucket) bucket.ids.add(String(fid));
    }
  });

  const result: Array<{ id: string; name: string }> = [];
  nm.forEach(({ ids, name }) => {
    if (ids.size > 0) {
      result.push({ id: Array.from(ids.values())[0], name });
    } else {
      result.push({ id: `name:${name}`, name });
    }
  });

  return result;
}