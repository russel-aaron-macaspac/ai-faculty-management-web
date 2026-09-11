'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { scheduleService } from '@/services/scheduleService';
import { toast } from '@/lib/toast';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
type LoadType = 'regular' | 'overload';
type RowStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';
type Subject = { id: string; code: string; name: string };
type DeliveryMode = 'on-campus' | 'online';
type SubjectAssignment = Subject & { deliveryMode: DeliveryMode };
type Room = { id: string; name: string; capacity: number };
type Faculty = { id: string; name: string; role: string };
type GeneratedRow = { localId: string; subjectId: string | null; facultyId: string; facultyName: string; code: string; name: string; day: string; startTime: string; endTime: string; section: string; roomId: string; roomName: string; units: string; lectureContactHours: string; labContactHours: string; classSize: string; loadType: LoadType; status: RowStatus; statusMessage?: string; isSaved?: boolean };

interface AIScheduleGeneratorProps {
  faculties: Faculty[];
  subjects: Subject[];
  rooms: Room[];
  createdBy: string;
  creatorRole: string;
  onSaved?: () => void | Promise<void>;
}

const makeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `generated_${Date.now()}`;

function RowStatusBadge({ status, message }: Readonly<{ status: RowStatus; message?: string }>) {
  if (status === 'saving') return <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Saving</span>;
  if (status === 'saved') return <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Saved</span>;
  if (status === 'conflict' || status === 'error') return <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600" title={message}><AlertTriangle className="h-3 w-3 shrink-0" /> {message || (status === 'conflict' ? 'Conflict' : 'Error')}</span>;
  return <span className="text-xs text-slate-400">-</span>;
}

function conflictMessage(conflictType: string) {
  if (conflictType === 'availability') return 'Faculty availability does not include this day and time.';
  if (conflictType === 'faculty') return 'Faculty already has an overlapping schedule.';
  if (conflictType === 'room') return 'This physical room is already occupied during this time.';
  return 'Schedule conflict detected.';
}

function isValidTimeRange(row: GeneratedRow) {
  return Boolean(row.startTime && row.endTime && row.startTime < row.endTime);
}

const BOARD_START = 7 * 60;
const BOARD_END = 20 * 60;
const BOARD_SLOTS = Array.from({ length: (BOARD_END - BOARD_START) / 30 }, (_, index) => BOARD_START + index * 30);

function formatBoardTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes % 60).padStart(2, '0')} ${suffix}`;
}

function boardMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function ScheduleBoard({ rows, onUpdate, onDelete }: Readonly<{ rows: GeneratedRow[]; onUpdate: (localId: string, field: keyof GeneratedRow, value: string) => void; onDelete: (localId: string) => void }>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-sm">
      <table className="w-full min-w-245 table-fixed border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100 text-slate-800">
            <th className="w-32 border border-slate-300 px-2 py-3 text-center font-bold uppercase">Time</th>
            {DAYS.slice(0, 6).map((day) => <th key={day} className="border border-slate-300 px-2 py-3 text-center font-bold uppercase">{day}</th>)}
        </tr>
        </thead>
        <tbody>
          {BOARD_SLOTS.map((slot) => (
            <tr key={slot} className="h-9">
              <th className="border border-slate-300 bg-slate-50 px-2 text-center font-semibold text-slate-600">{formatBoardTime(slot)}</th>
              {DAYS.slice(0, 6).map((day) => {
                const row = rows.find((candidate) => candidate.day === day && boardMinutes(candidate.startTime) === slot);
                const active = rows.some((candidate) => candidate.day === day && boardMinutes(candidate.startTime) < slot && boardMinutes(candidate.endTime) > slot);
                if (active) return null;
                if (!row) return <td key={`${day}-${slot}`} className="border border-slate-300 bg-white" />;
                const span = Math.max(1, Math.ceil((boardMinutes(row.endTime) - boardMinutes(row.startTime)) / 30));
                return <td key={`${day}-${slot}`} rowSpan={span} className="border border-slate-500 bg-[#ffc000] p-1 align-middle text-slate-900">
                  <div className="flex h-full min-h-24 flex-col gap-1 text-left">
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 font-semibold leading-tight"><div className="text-[10px] font-medium uppercase tracking-wide">{row.facultyName}</div>{row.name}<div className="font-normal">{row.code}</div></div>
                      {!row.isSaved && <button type="button" onClick={() => onDelete(row.localId)} className="shrink-0 p-1 text-slate-700 hover:text-rose-700" title="Delete generated row"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                    <Select value={row.day} onValueChange={(value) => onUpdate(row.localId, 'day', value || 'Monday')} disabled={row.isSaved}>
                      <SelectTrigger className="h-7 rounded border-slate-700 bg-white/70 px-1.5 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{DAYS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="grid grid-cols-2 gap-1">
                      <Input className="h-7 rounded border-slate-700 bg-white/70 px-1 text-[11px]" type="time" step="1800" value={row.startTime} onChange={(event) => onUpdate(row.localId, 'startTime', event.target.value)} disabled={row.isSaved} />
                      <Input className="h-7 rounded border-slate-700 bg-white/70 px-1 text-[11px]" type="time" step="1800" value={row.endTime} onChange={(event) => onUpdate(row.localId, 'endTime', event.target.value)} disabled={row.isSaved} />
                    </div>
                    <Input className="h-7 rounded border-slate-700 bg-white/70 px-1.5 text-[11px]" value={row.section} onChange={(event) => onUpdate(row.localId, 'section', event.target.value)} placeholder="Section" disabled={row.isSaved} />
                  </div>
                </td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpandableGeneratorCard({ isMinimized, onExpand, children }: Readonly<{ isMinimized: boolean; onExpand: () => void; children: ReactNode }>) {
  return <Card className={isMinimized ? 'cursor-pointer' : undefined} onClick={isMinimized ? onExpand : undefined}>{children}</Card>;
}

export function AIScheduleGenerator({ faculties, subjects, rooms, createdBy, creatorRole, onSaved }: Readonly<AIScheduleGeneratorProps>) {
  const [rows, setRows] = useState<GeneratedRow[]>([]);
  const [savedRows, setSavedRows] = useState<GeneratedRow[]>([]);
  const [unplaced, setUnplaced] = useState<Array<{ code: string; name: string; reason: string }>>([]);
  const [unavailable, setUnavailable] = useState<Array<{ code: string; name: string; reason: string }>>([]);
  const [suggestions, setSuggestions] = useState<Array<{ label: string; value: string }>>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [roomScheduleRefresh, setRoomScheduleRefresh] = useState(0);
  const [selectedFacultyIds, setSelectedFacultyIds] = useState<string[]>([]);
  const [subjectsByFaculty, setSubjectsByFaculty] = useState<Record<string, SubjectAssignment[]>>({});
  const [activeFacultyId, setActiveFacultyId] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [isMinimized, setIsMinimized] = useState(true);

  const filteredSubjects = useMemo(() => {
    const query = subjectCode.trim().toLowerCase();
    if (!query) return [];
    return subjects.filter((subject) => subject.code.toLowerCase().includes(query)).slice(0, 8);
  }, [subjectCode, subjects]);

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId);
  const onlineAssignments = selectedFacultyIds.flatMap((facultyId) => {
    const faculty = faculties.find((item) => item.id === facultyId);
    return (subjectsByFaculty[facultyId] || [])
      .filter((assignment) => assignment.deliveryMode === 'online')
      .map((assignment) => ({ ...assignment, facultyName: faculty?.name || facultyId }));
  });

  useEffect(() => {
    let cancelled = false;
    if (!selectedRoomId) {
      setSavedRows([]);
      return () => { cancelled = true; };
    }

    const loadRoomSchedules = async () => {
      try {
        const schedules = await scheduleService.getSchedules(undefined, createdBy ? { id: createdBy, role: creatorRole } : undefined);
        if (cancelled) return;
        setSavedRows(schedules.filter((schedule) => String(schedule.roomId) === String(selectedRoomId) && schedule.status !== 'rejected').map((schedule) => ({
          localId: `saved-${schedule.id}`,
          subjectId: schedule.subjectId,
          facultyId: schedule.facultyId,
          facultyName: schedule.facultyName,
          code: schedule.subject?.code || 'Subject',
          name: schedule.subject?.name || 'Saved schedule',
          day: schedule.day,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          section: schedule.section || '',
          roomId: schedule.roomId,
          roomName: schedule.room?.name || selectedRoom?.name || 'Selected room',
          units: String(schedule.units ?? ''),
          lectureContactHours: String(schedule.lectureContactHours ?? ''),
          labContactHours: String(schedule.labContactHours ?? ''),
          classSize: String(schedule.classSize ?? ''),
          loadType: schedule.loadType || 'regular',
          status: 'saved',
          isSaved: true,
        })));
      } catch {
        if (!cancelled) setSavedRows([]);
      }
    };

    void loadRoomSchedules();
    return () => { cancelled = true; };
  }, [createdBy, creatorRole, roomScheduleRefresh, selectedRoom, selectedRoomId]);

  const toggleMinimized = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setIsMinimized((current) => !current);
  };

  const handleRoomChange = (roomId: string | null) => {
    setSelectedRoomId(roomId || '');
    setRows([]);
    setUnplaced([]);
    setUnavailable([]);
    setSuggestions([]);
  };

  const updateRow = (localId: string, field: keyof GeneratedRow, value: string) => setRows((current) => current.map((row) => row.localId === localId ? { ...row, [field]: value, status: 'idle', statusMessage: undefined } : row));

  const toggleFaculty = (facultyId: string) => {
    setSelectedFacultyIds((current) => current.includes(facultyId) ? current.filter((id) => id !== facultyId) : [...current, facultyId]);
    setActiveFacultyId(facultyId);
    setSubjectCode('');
  };

  const toggleSubject = (facultyId: string, subject: Subject) => setSubjectsByFaculty((current) => {
    const selected = current[facultyId] || [];
    return { ...current, [facultyId]: selected.some((item) => item.id === subject.id) ? selected.filter((item) => item.id !== subject.id) : [...selected, { ...subject, deliveryMode: 'on-campus' }] };
  });

  const changeSubjectDeliveryMode = (facultyId: string, subjectId: string, deliveryMode: DeliveryMode | null) => {
    if (!deliveryMode) return;
    setSubjectsByFaculty((current) => ({
      ...current,
      [facultyId]: (current[facultyId] || []).map((assignment) => assignment.id === subjectId ? { ...assignment, deliveryMode } : assignment),
    }));
  };

  const generate = async () => {
    const selectedAssignments = selectedFacultyIds.map((facultyId) => ({ facultyId, subjects: subjectsByFaculty[facultyId] || [] }));
    const assignments = selectedAssignments.map(({ facultyId, subjects: facultySubjects }) => ({ facultyId, subjects: facultySubjects.filter((subject) => subject.deliveryMode === 'on-campus').map((subject) => ({ subjectId: subject.id, code: subject.code, name: subject.name })) })).filter((assignment) => assignment.subjects.length > 0);
    if (!selectedRoomId || selectedAssignments.some((assignment) => assignment.subjects.length === 0)) {
      toast({ title: 'Complete the generator setup', description: 'Select a room, multiple faculties, and at least one subject for each selected faculty.', type: 'warning' });
      return;
    }
    if (assignments.length === 0) {
      setRows([]);
      setUnplaced([]);
      setUnavailable([]);
      setSuggestions([]);
      toast({ title: 'Online subjects noted', description: 'All selected subjects are online and were excluded from the room matrix.', type: 'success' });
      return;
    }
    setGenerating(true);
    setSuggestions([]);
    try {
      const response = await fetch('/api/scheduling/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: selectedRoomId,
          assignments,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not generate schedule.');
      setRows((data.generated || []).map((row: Omit<GeneratedRow, 'localId' | 'status'>) => ({ ...row, localId: makeId(), units: String(row.units ?? ''), lectureContactHours: String(row.lectureContactHours ?? ''), labContactHours: String(row.labContactHours ?? ''), classSize: String(row.classSize ?? ''), status: 'idle' })));
      setUnplaced(data.unplaced || []);
      setUnavailable(data.unavailable || []);
      toast({ title: 'Schedule generated', description: `${data.generated?.length || 0} on-campus subject(s) placed${onlineAssignments.length > 0 ? `; ${onlineAssignments.length} online subject(s) excluded from the matrix` : ''}.`, type: 'success' });
    } catch (error) {
      toast({ title: 'Generation failed', description: error instanceof Error ? error.message : 'Could not generate schedule.', type: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  const saveRow = async (row: GeneratedRow) => {
    setRows((current) => current.map((item) => item.localId === row.localId ? { ...item, status: 'saving', statusMessage: undefined } : item));
    try {
      if (!isValidTimeRange(row)) throw new Error('End time must be after start time.');
      const room = rooms.find((item) => item.id === row.roomId);
      if (!room) throw new Error(`Room "${row.roomName}" not found.`);
      let subjectId = row.subjectId;
      if (!subjectId) subjectId = (await scheduleService.createSubject({ code: row.code.trim(), name: row.name.trim() })).data?.id;
      if (!subjectId) throw new Error('Could not resolve subject.');
      const result = await scheduleService.createSchedule({ facultyId: row.facultyId, subjectId, roomId: room.id, section: row.section.trim(), day: row.day, startTime: row.startTime, endTime: row.endTime, units: row.units === '' ? undefined : Number(row.units), lectureContactHours: row.lectureContactHours === '' ? undefined : Number(row.lectureContactHours), labContactHours: row.labContactHours === '' ? undefined : Number(row.labContactHours), classSize: row.classSize === '' ? undefined : Number(row.classSize), loadType: row.loadType, createdBy: createdBy || creatorRole, creatorRole });
      if (!result.success) {
        const message = conflictMessage(result.conflict.conflict_type);
        setSuggestions((current) => [...current, ...(result.conflict.suggestions?.suggested_time_slots || []).map((slot) => ({ label: 'Alternative time', value: `${slot.day}, ${slot.start_time}-${slot.end_time}` })), ...(result.conflict.suggestions?.suggested_rooms || []).map((room) => ({ label: 'Alternative room', value: room.name }))]);
        setRows((current) => current.map((item) => item.localId === row.localId ? { ...item, status: 'conflict', statusMessage: message } : item));
        return false;
      }
      setRows((current) => current.map((item) => item.localId === row.localId ? { ...item, status: 'saved' } : item));
      return true;
    } catch (error) {
      setRows((current) => current.map((item) => item.localId === row.localId ? { ...item, status: 'error', statusMessage: error instanceof Error ? error.message : 'Could not save this row.' } : item));
      return false;
    }
  };

  const saveAll = async () => {
    if (rows.length === 0) return;
    setSaving(true);
    let savedCount = 0;
    for (const row of rows) if (await saveRow(row)) savedCount += 1;
    setRows((current) => current.filter((row) => row.status !== 'saved'));
    setSaving(false);
    if (savedCount > 0) {
      toast({ title: 'Schedule saved', description: `${savedCount} class${savedCount === 1 ? '' : 'es'} saved.`, type: 'success' });
      setRoomScheduleRefresh((current) => current + 1);
      await onSaved?.();
    } else toast({ title: 'Save failed', description: 'No classes were saved. Check the row errors below.', type: 'error' });
  };

  return <ExpandableGeneratorCard isMinimized={isMinimized} onExpand={() => setIsMinimized(false)}><CardHeader className="flex cursor-pointer flex-row items-center justify-between gap-3" onClick={toggleMinimized}><CardTitle>Automatic Schedule Generator</CardTitle><Button type="button" size="icon-sm" variant="ghost" onClick={toggleMinimized} aria-label={isMinimized ? 'Restore automatic schedule generator' : 'Minimize automatic schedule generator'} title={isMinimized ? 'Restore automatic schedule generator' : 'Minimize automatic schedule generator'}>{isMinimized ? <ChevronDown /> : <ChevronUp />}</Button></CardHeader>{!isMinimized && <CardContent className="space-y-5">
    <p className="text-sm text-slate-500">Choose the room first, select the faculty members to load, then assign saved subjects to each faculty member. The generator uses each faculty member&apos;s availability and checks the selected room for overlaps.</p>
    <div className="space-y-2">
      <label htmlFor="ai-room" className="text-sm font-medium text-slate-700">1. Room</label>
      <Select value={selectedRoomId} onValueChange={handleRoomChange}><SelectTrigger id="ai-room"><SelectValue placeholder="Select a room first">{selectedRoom ? `${selectedRoom.name} (${selectedRoom.capacity} seats)` : undefined}</SelectValue></SelectTrigger><SelectContent>{rooms.map((room) => <SelectItem key={room.id} value={room.id}>{room.name} ({room.capacity} seats)</SelectItem>)}</SelectContent></Select>
    </div>
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-700">2. Faculty members</div>
      <div className="grid gap-2 md:grid-cols-2">{faculties.map((faculty) => <button key={faculty.id} type="button" onClick={() => toggleFaculty(faculty.id)} className={`rounded-lg border px-3 py-2 text-left text-sm ${selectedFacultyIds.includes(faculty.id) ? 'border-red-300 bg-red-50 text-red-900' : 'border-slate-200 hover:bg-slate-50'}`}><span className="font-medium">{faculty.name}</span><span className="block text-xs text-slate-500">{(subjectsByFaculty[faculty.id] || []).length} subject(s) assigned</span></button>)}</div>
    </div>
    {selectedFacultyIds.length > 0 && <div className="space-y-3">
      <div className="text-sm font-medium text-slate-700">3. Assign subjects by faculty</div>
      <div className="flex flex-wrap gap-2">{selectedFacultyIds.map((facultyId) => { const faculty = faculties.find((item) => item.id === facultyId); return <Button key={facultyId} type="button" size="sm" variant={activeFacultyId === facultyId ? 'default' : 'outline'} onClick={() => { setActiveFacultyId(facultyId); setSubjectCode(''); }}>{faculty?.name || facultyId}</Button>; })}</div>
      {activeFacultyId && <div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><label htmlFor="ai-subject-code" className="text-sm font-medium text-slate-700">Subject code</label><Input id="ai-subject-code" value={subjectCode} onChange={(event) => setSubjectCode(event.target.value)} placeholder="Search saved subjects" autoComplete="off" />{subjectCode.trim() && <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-sm">{filteredSubjects.length === 0 ? <div className="px-3 py-2 text-sm text-slate-500">No saved subjects match this code.</div> : filteredSubjects.map((subject) => <button key={subject.id} type="button" className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50 ${(subjectsByFaculty[activeFacultyId] || []).some((selected) => selected.id === subject.id) ? 'bg-red-50 text-red-900' : 'text-slate-800'}`} onClick={() => toggleSubject(activeFacultyId, subject)}><span className="font-medium">{subject.code}</span><span className="ml-2 text-slate-500">{subject.name}</span></button>)}</div>}</div><div className="space-y-2"><div className="text-sm font-medium text-slate-700">Assigned to {faculties.find((item) => item.id === activeFacultyId)?.name}</div><div className="space-y-2 rounded-lg border border-slate-200 p-2">{(subjectsByFaculty[activeFacultyId] || []).length === 0 ? <span className="text-sm text-slate-400">No subjects assigned yet.</span> : (subjectsByFaculty[activeFacultyId] || []).map((assignment) => <div key={assignment.id} className="flex items-center gap-2 rounded-md bg-slate-50 p-2"><div className="min-w-0 flex-1 text-xs"><span className="font-medium text-slate-900">{assignment.code}</span><span className="ml-2 text-slate-500">{assignment.name}</span></div><Select value={assignment.deliveryMode} onValueChange={(value) => changeSubjectDeliveryMode(activeFacultyId, assignment.id, value as DeliveryMode)}><SelectTrigger className="h-8 w-32 rounded-md px-2 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="on-campus">On campus</SelectItem><SelectItem value="online">Online</SelectItem></SelectContent></Select><button type="button" className="px-1 text-xs font-medium text-slate-500 hover:text-rose-700" onClick={() => toggleSubject(activeFacultyId, assignment)} aria-label={`Remove ${assignment.code}`}>x</button></div>)}</div></div></div>}
    </div>}
    {onlineAssignments.length > 0 && <div className="space-y-1 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900"><div className="font-semibold">Online subjects excluded from the matrix</div>{onlineAssignments.map((assignment) => <div key={`${assignment.facultyName}-${assignment.id}`}>{assignment.code} - {assignment.name} ({assignment.facultyName}) is online and will not use the selected room.</div>)}</div>}
    <Button type="button" onClick={generate} disabled={generating || saving || !selectedRoomId || selectedFacultyIds.length === 0}>{generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Generate Schedule Matrix</Button>
    {unplaced.length > 0 && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4"><div className="text-sm font-semibold text-amber-900">Could not place</div>{unplaced.map((item) => <div key={`${item.code}-${item.name}`} className="flex gap-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>{item.code} - {item.name}:</strong> {item.reason}</span></div>)}</div>}
    {unavailable.length > 0 && <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="text-sm font-semibold text-slate-700">Already assigned and excluded</div>{unavailable.map((item) => <div key={`${item.code}-${item.name}`} className="text-sm text-slate-600"><strong>{item.code} - {item.name}</strong> is already assigned to another faculty member.</div>)}</div>}
    {suggestions.length > 0 && <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-4"><div className="text-sm font-semibold text-blue-900">Conflict suggestions</div>{suggestions.map((suggestion, index) => <div key={`${suggestion.label}-${suggestion.value}-${index}`} className="text-sm text-blue-900"><strong>{suggestion.label}:</strong> {suggestion.value}</div>)}</div>}
    <div className="space-y-2"><div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Schedule Matrix</div>{selectedRoomId && savedRows.length > 0 && <div className="text-xs text-slate-500">Showing {savedRows.length} existing schedule{savedRows.length === 1 ? '' : 's'} already assigned to {selectedRoom?.name}.</div>}<ScheduleBoard rows={[...savedRows, ...rows]} onUpdate={updateRow} onDelete={(localId) => setRows((current) => current.filter((item) => item.localId !== localId))} />{rows.length > 0 && <div className="flex items-center gap-3"><Button type="button" onClick={saveAll} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save All to Master Schedule</Button><div className="flex items-center gap-3 text-xs text-slate-500">{rows.map((row) => <RowStatusBadge key={row.localId} status={row.status} message={row.statusMessage} />)}</div></div>}</div>
  </CardContent>}</ExpandableGeneratorCard>;
}