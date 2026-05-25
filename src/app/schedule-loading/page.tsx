'use client';

import { useEffect, useMemo, useState } from 'react';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { scheduleService } from '@/services/scheduleService';
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

  const currentUserName = user?.full_name || user?.name || '';
  const facultyLike = isFacultyLikeRole(user?.role);
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
                {selectedFacultyLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading availability...
                  </div>
                ) : selectedFacultyAvailability.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">No saved availability for this faculty member.</div>
                ) : (
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
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Manage Subjects and Rooms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
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
                  <div className="space-y-2">
                    {meta.subjects.length === 0 ? (
                      <div className="text-sm text-slate-500">No subjects yet.</div>
                    ) : (
                      meta.subjects.map((subject) => (
                        <div key={subject.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                          <div className="text-sm text-slate-800">
                            <span className="font-medium">{subject.code}</span> - {subject.name}
                          </div>
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
                  <div className="space-y-2">
                    {meta.rooms.length === 0 ? (
                      <div className="text-sm text-slate-500">No rooms yet.</div>
                    ) : (
                      meta.rooms.map((room) => (
                        <div key={room.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                          <div className="text-sm text-slate-800">
                            <span className="font-medium">{room.name}</span> (cap {room.capacity})
                          </div>
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
                  <div className="space-y-2">
                    {meta.sections.length === 0 ? (
                      <div className="text-sm text-slate-500">No sections yet.</div>
                    ) : (
                      meta.sections.map((section) => (
                        <div key={section.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                          <div className="text-sm text-slate-800">
                            <span className="font-medium">{section.name}</span>
                          </div>
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
        <CardContent>
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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading schedules...
                  </TableCell>
                </TableRow>
              ) : visibleSchedules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                    No schedules found.
                  </TableCell>
                </TableRow>
              ) : (
                visibleSchedules.map((item) => (
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
                    <TableCell>{item.status}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}