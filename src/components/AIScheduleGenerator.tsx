'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { scheduleService } from '@/services/scheduleService';
import { toast } from '@/lib/toast';
import { formatTimeToTwelveHour } from '@/lib/timeUtils';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const isPhysicalRoom = (name?: string | null) => !/\b(tba|tbd|online|virtual|remote)\b/i.test(name || '');
type LoadType = 'regular' | 'overload';
type RowStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';
type Subject = { id: string; code: string; name: string; year_level?: string | number | null; hours?: number | null; lecture_units?: number | null; lab_units?: number | null; required_equipment_type?: string | null };
type DeliveryMode = 'on-campus' | 'online';
type SubjectAssignment = Subject & { deliveryMode: DeliveryMode; sectionIds: string[] };
type Room = { id: string; name: string; capacity: number; equipment_type?: string | null };
type Faculty = { id: string; name: string; role: string; statusOfAppointment?: string | null };
type Section = { id: string; name: string; year_level?: string | number | null };
type GeneratedRow = { localId: string; subjectId: string | null; facultyId: string; facultyName: string; code: string; name: string; day: string; startTime: string; endTime: string; section: string; roomId: string; roomName: string; units: string; lectureContactHours: string; labContactHours: string; classSize: string; loadType: LoadType; status: RowStatus; statusMessage?: string; isSaved?: boolean };
type AISuggestedPlacement = Omit<GeneratedRow, 'localId' | 'status'>;
type Recommendation = { id: string; generated: Array<Omit<GeneratedRow, 'localId' | 'status'>>; unplaced: Array<{ code: string; name: string; reason: string; section?: string; facultyId?: string; suggestion?: string }>; summary: { conflicts: number; scheduled: number; total: number; workload: string; notes: string } };

const hasMatchingYearLevel = (subject: Subject, section: Section) => (
  subject.year_level != null
  && section.year_level != null
  && String(subject.year_level).trim().toLowerCase() === String(section.year_level).trim().toLowerCase()
);

interface AIScheduleGeneratorProps {
  faculties: Faculty[];
  subjects: Subject[];
  rooms: Room[];
  sections: Section[];
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

function overlaps(start: number, end: number, otherStart: number, otherEnd: number) {
  return start < otherEnd && end > otherStart;
}

function conflictTypes(row: GeneratedRow, rows: GeneratedRow[]) {
  const types = new Set<string>();
  rows.forEach((other) => {
    if (row.localId === other.localId || row.day !== other.day || !overlaps(boardMinutes(row.startTime), boardMinutes(row.endTime), boardMinutes(other.startTime), boardMinutes(other.endTime))) return;
    if (row.facultyId === other.facultyId) types.add('Faculty');
    if (row.roomId === other.roomId) types.add('Room');
    if (row.section && row.section === other.section) types.add('Section');
  });
  return [...types];
}

type SuggestedSlot = { day: string; startTime: string; endTime: string; label: string };

function findSuggestedSlot(row: GeneratedRow, rows: GeneratedRow[], availability: Array<{ day: string; startTime: string; endTime: string }>): SuggestedSlot | null {
  const duration = boardMinutes(row.endTime) - boardMinutes(row.startTime);
  for (const window of availability) {
    const windowStart = boardMinutes(window.startTime);
    const windowEnd = boardMinutes(window.endTime);
    for (let start = windowStart; start + duration <= windowEnd; start += 30) {
      const end = start + duration;
      const hasConflict = rows.some((other) => other.localId !== row.localId
        && other.day === window.day
        && overlaps(start, end, boardMinutes(other.startTime), boardMinutes(other.endTime))
        && (other.facultyId === row.facultyId || other.roomId === row.roomId || (row.section && row.section === other.section)));
      if (!hasConflict) return { day: window.day, startTime: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`, endTime: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`, label: `${window.day} ${formatBoardTime(start)} - ${formatBoardTime(end)}` };
    }
  }
  return null;
}

function ScheduleRoomBoard({ rows, allRows, onUpdate, onDelete, color, savedColor, readOnly, facultyAvailability }: Readonly<{ rows: GeneratedRow[]; allRows: GeneratedRow[]; onUpdate: (localId: string, field: keyof GeneratedRow, value: string) => void; onDelete: (localId: string) => void; color: string; savedColor: string; readOnly: boolean; facultyAvailability: Record<string, Array<{ day: string; startTime: string; endTime: string }>> }>) {
  const conflictingRows = rows.filter((row) => allRows.some((other) => (
    row.localId !== other.localId
      && row.day === other.day
      && overlaps(boardMinutes(row.startTime), boardMinutes(row.endTime), boardMinutes(other.startTime), boardMinutes(other.endTime))
      && (row.facultyId === other.facultyId || row.roomId === other.roomId || (row.section && row.section === other.section))
  )));

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-sm">
      {conflictingRows.length > 0 && <div className="border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"><div className="font-semibold">Conflict preview</div>{[...new Map(conflictingRows.map((row) => [row.localId, row])).values()].map((row) => { const suggestion = findSuggestedSlot(row, allRows, facultyAvailability[row.facultyId] || []); const types = conflictTypes(row, allRows); return <div key={row.localId} className="py-0.5">{row.code}{row.section ? ` (${row.section})` : ''} on {row.day} {formatBoardTime(boardMinutes(row.startTime))}-{formatBoardTime(boardMinutes(row.endTime))}. <span className="font-semibold">Conflict type:</span> {types.join(', ') || 'Schedule'}{types.length > 0 && '. '}<span className="font-semibold">Suggested open slot:</span> {suggestion ? suggestion.label : 'No open slot found in this faculty availability.'}{suggestion && !readOnly && <Button type="button" size="sm" variant="outline" className="ml-2 h-6 px-2 text-[11px]" onClick={() => { onUpdate(row.localId, 'day', suggestion.day); onUpdate(row.localId, 'startTime', suggestion.startTime); onUpdate(row.localId, 'endTime', suggestion.endTime); }}>Apply slot</Button>}</div>; })}</div>}
      <table className="w-full min-w-260 table-fixed border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100 text-slate-800">
            <th className="w-32 border border-slate-300 px-2 py-3 text-center font-bold uppercase">Time</th>
            {DAYS.slice(0, 6).map((day) => <th key={day} className="border border-slate-300 px-2 py-3 text-center font-bold uppercase">{day}</th>)}
        </tr>
        </thead>
        <tbody>
          {BOARD_SLOTS.map((slot) => (
            <tr key={slot} className="h-10">
              <th className="border border-slate-300 bg-slate-50 px-2 text-center font-semibold text-slate-600">{formatBoardTime(slot)}</th>
              {DAYS.slice(0, 6).map((day) => {
                const row = rows
                  .filter((candidate) => candidate.day === day && boardMinutes(candidate.startTime) === slot)
                  .sort((left, right) => Number(Boolean(left.isSaved)) - Number(Boolean(right.isSaved)))[0];
                const active = rows.some((candidate) => candidate.day === day && boardMinutes(candidate.startTime) < slot && boardMinutes(candidate.endTime) > slot);
                if (active && !row) return null;
                if (!row) return <td key={`${day}-${slot}`} className="border border-slate-300 bg-white" />;
                const span = Math.max(1, Math.ceil((boardMinutes(row.endTime) - boardMinutes(row.startTime)) / 30));
                const slotHeight = 40;
                const hasConflict = conflictingRows.some((candidate) => candidate.localId === row.localId);
                return <td key={`${day}-${slot}`} rowSpan={span} style={{ height: `${span * slotHeight}px` }} className={`border border-slate-300 px-2 py-0 align-top text-slate-900 ${hasConflict ? 'bg-rose-100' : 'bg-slate-50'}`}>
                  <div style={{ minHeight: `${span * slotHeight}px`, backgroundColor: hasConflict ? '#fca5a5' : row.isSaved ? savedColor : color }} className={`flex h-full flex-col gap-2 rounded-lg border p-2.5 text-left shadow-sm ${hasConflict ? 'border-rose-700 ring-2 ring-rose-400' : 'border-slate-700/40'}`}>
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 font-semibold leading-tight"><div className="text-[10px] font-medium uppercase tracking-wide">{row.facultyName}</div>{row.name}<div className="font-normal">{row.code}{row.section ? ` · ${row.section}` : ''}</div></div>
                      {!row.isSaved && !readOnly && <button type="button" onClick={() => onDelete(row.localId)} className="shrink-0 p-1 text-slate-700 hover:text-rose-700" title="Delete generated row"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                    <Select value={row.day} onValueChange={(value) => onUpdate(row.localId, 'day', value || 'Monday')} disabled={row.isSaved || readOnly}>
                      <SelectTrigger className="h-7 rounded border-slate-700 bg-white/70 px-1.5 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{DAYS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="grid grid-cols-2 gap-1">
                      <Input className="h-7 rounded border-slate-700 bg-white/70 px-1 text-[11px]" type="time" step="1800" value={row.startTime} onChange={(event) => onUpdate(row.localId, 'startTime', event.target.value)} disabled={row.isSaved || readOnly} />
                      <Input className="h-7 rounded border-slate-700 bg-white/70 px-1 text-[11px]" type="time" step="1800" value={row.endTime} onChange={(event) => onUpdate(row.localId, 'endTime', event.target.value)} disabled={row.isSaved || readOnly} />
                    </div>
                    <Input className="h-7 rounded border-slate-700 bg-white/70 px-1.5 text-[11px]" value={row.section} onChange={(event) => onUpdate(row.localId, 'section', event.target.value)} placeholder="Section" disabled={row.isSaved || readOnly} />
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

export function AIScheduleGenerator({ faculties, subjects, rooms, sections, createdBy, creatorRole, onSaved }: Readonly<AIScheduleGeneratorProps>) {
  const [rows, setRows] = useState<GeneratedRow[]>([]);
  const [savedRows, setSavedRows] = useState<GeneratedRow[]>([]);
  const [unplaced, setUnplaced] = useState<Array<{ code: string; name: string; reason: string; section?: string; facultyId?: string; suggestion?: string }>>([]);
  const [aiSuggestionsAvailable, setAiSuggestionsAvailable] = useState(true);
  const [aiSuggestedPlacements, setAiSuggestedPlacements] = useState<AISuggestedPlacement[]>([]);
  const [unavailable, setUnavailable] = useState<Array<{ code: string; name: string; section?: string; reason: string; assignedFacultyName?: string; roomName?: string; hasPhysicalRoom?: boolean; roomId?: string; day?: string; startTime?: string; endTime?: string }>>([]);
  const [generationMessage, setGenerationMessage] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ label: string; value: string }>>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roomScheduleRefresh, setRoomScheduleRefresh] = useState(0);
  const [selectedFacultyIds, setSelectedFacultyIds] = useState<string[]>([]);
  const [subjectsByFaculty, setSubjectsByFaculty] = useState<Record<string, SubjectAssignment[]>>({});
  const [activeFacultyId, setActiveFacultyId] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [isMinimized, setIsMinimized] = useState(true);
  const [activeFacultyAvailability, setActiveFacultyAvailability] = useState<Array<{ day: string; startTime: string; endTime: string; deliveryMode: DeliveryMode }>>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [facultyAvailability, setFacultyAvailability] = useState<Record<string, Array<{ day: string; startTime: string; endTime: string }>>>({});
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null);
  const [originalRows, setOriginalRows] = useState<GeneratedRow[]>([]);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [finalizationOpen, setFinalizationOpen] = useState(false);

  const recommendationColors = ['#ffc000', '#7dd3fc', '#86efac'];

  const filteredSubjects = useMemo(() => {
    const query = subjectCode.trim().toLowerCase();
    if (!query) return [];
    return subjects.filter((subject) => subject.code.toLowerCase().includes(query)).slice(0, 8);
  }, [subjectCode, subjects]);

  const onlineAssignments = selectedFacultyIds.flatMap((facultyId) => {
    const faculty = faculties.find((item) => item.id === facultyId);
    return (subjectsByFaculty[facultyId] || [])
      .filter((assignment) => assignment.deliveryMode === 'online')
      .map((assignment) => ({ ...assignment, facultyName: faculty?.name || facultyId }));
  });

  useEffect(() => {
    let cancelled = false;
    const loadRoomSchedules = async () => {
      try {
        const schedules = await scheduleService.getSchedules(undefined, createdBy ? { id: createdBy, role: creatorRole } : undefined);
        if (cancelled) return;
        setSavedRows(schedules.filter((schedule) => schedule.status !== 'rejected' && isPhysicalRoom(schedule.room?.name)).map((schedule) => ({
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
          roomName: schedule.room?.name || 'Assigned room',
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
  }, [createdBy, creatorRole, roomScheduleRefresh]);

  useEffect(() => {
    if (!activeFacultyId) {
      setActiveFacultyAvailability([]);
      return;
    }

    let cancelled = false;
    const loadAvailability = async () => {
      setAvailabilityLoading(true);
      try {
        const entries = await scheduleService.getFacultyAvailability(activeFacultyId);
        if (!cancelled) {
          const sortedAvailability = entries
            .filter((entry) => entry.deliveryMode !== 'online')
            .map((entry) => ({ day: entry.day, startTime: entry.startTime, endTime: entry.endTime, deliveryMode: entry.deliveryMode }))
            .sort((left, right) => {
              const dayDifference = DAYS.indexOf(left.day) - DAYS.indexOf(right.day);
              return dayDifference || left.startTime.localeCompare(right.startTime);
            });
          setActiveFacultyAvailability(sortedAvailability);
        }
      } catch {
        if (!cancelled) setActiveFacultyAvailability([]);
      } finally {
        if (!cancelled) setAvailabilityLoading(false);
      }
    };

    void loadAvailability();
    return () => {
      cancelled = true;
    };
  }, [activeFacultyId]);

  useEffect(() => {
    let cancelled = false;
    if (selectedFacultyIds.length === 0) {
      setFacultyAvailability({});
      return () => { cancelled = true; };
    }
    void Promise.all(selectedFacultyIds.map(async (facultyId) => {
      try {
        const entries = await scheduleService.getFacultyAvailability(facultyId);
        return [facultyId, entries.filter((entry) => entry.deliveryMode !== 'online').map((entry) => ({ day: entry.day, startTime: entry.startTime, endTime: entry.endTime }))] as const;
      } catch {
        return [facultyId, []] as const;
      }
    })).then((entries) => {
      if (!cancelled) setFacultyAvailability(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [selectedFacultyIds]);

  const toggleMinimized = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setIsMinimized((current) => !current);
  };

  const validateRows = (candidateRows: GeneratedRow[]) => {
    const messages: string[] = [];
    const rowsToCheck = [...savedRows, ...candidateRows];
    rowsToCheck.forEach((row, index) => {
      if (!isValidTimeRange(row)) messages.push(`${row.code} has an invalid time range.`);
      const rowStart = boardMinutes(row.startTime);
      const rowEnd = boardMinutes(row.endTime);
      rowsToCheck.slice(index + 1).forEach((other) => {
        if (row.isSaved && other.isSaved) return;
        if (row.day !== other.day || !overlaps(rowStart, rowEnd, boardMinutes(other.startTime), boardMinutes(other.endTime))) return;
        if (row.facultyId === other.facultyId) messages.push(`${row.facultyName} is double-booked on ${row.day}.`);
        if (row.roomId === other.roomId) messages.push(`${row.roomName} is double-booked on ${row.day}.`);
        if (row.section && row.section === other.section) messages.push(`Section ${row.section} has overlapping classes on ${row.day}.`);
      });
      const availability = facultyAvailability[row.facultyId] || [];
      if (availability.length > 0 && !availability.some((window) => window.day === row.day && row.startTime >= window.startTime && row.endTime <= window.endTime)) {
        messages.push(`${row.code} is outside ${row.facultyName}'s availability.`);
      }
    });
    return [...new Set(messages)];
  };

  const updateRow = (localId: string, field: keyof GeneratedRow, value: string) => setRows((current) => {
    const next = current.map((row) => row.localId === localId ? { ...row, [field]: value, status: 'idle' as RowStatus, statusMessage: undefined } : row);
    setValidationMessages(validateRows(next));
    return next;
  });

  const deleteRow = (localId: string) => setRows((current) => {
    const next = current.filter((item) => item.localId !== localId);
    setValidationMessages(validateRows(next));
    return next;
  });

  const toggleFaculty = (facultyId: string) => {
    setSelectedFacultyIds((current) => current.includes(facultyId) ? current.filter((id) => id !== facultyId) : [...current, facultyId]);
    setActiveFacultyId(facultyId);
    setSubjectCode('');
  };

  const toggleSubject = (facultyId: string, subject: Subject) => setSubjectsByFaculty((current) => {
    const selected = current[facultyId] || [];
    return { ...current, [facultyId]: selected.some((item) => item.id === subject.id) ? selected.filter((item) => item.id !== subject.id) : [...selected, { ...subject, deliveryMode: 'on-campus', sectionIds: [] }] };
  });

  const changeSubjectDeliveryMode = (facultyId: string, subjectId: string, deliveryMode: DeliveryMode | null) => {
    if (!deliveryMode) return;
    setSubjectsByFaculty((current) => ({
      ...current,
      [facultyId]: (current[facultyId] || []).map((assignment) => assignment.id === subjectId ? { ...assignment, deliveryMode } : assignment),
    }));
  };

  const toggleSubjectSection = (facultyId: string, subjectId: string, sectionId: string) => {
    setSubjectsByFaculty((current) => ({
      ...current,
      [facultyId]: (current[facultyId] || []).map((assignment) => {
        if (assignment.id !== subjectId) return assignment;
        const sectionIds = assignment.sectionIds.includes(sectionId)
          ? assignment.sectionIds.filter((id) => id !== sectionId)
          : [...assignment.sectionIds, sectionId];
        return { ...assignment, sectionIds };
      }),
    }));
  };

  const generate = async () => {
    const selectedAssignments = selectedFacultyIds.map((facultyId) => ({ facultyId, subjects: subjectsByFaculty[facultyId] || [] }));
    const hasMissingSections = selectedAssignments.some((assignment) => assignment.subjects.some((subject) => subject.sectionIds.length === 0));
    const assignments = selectedAssignments.map(({ facultyId, subjects: facultySubjects }) => ({ facultyId, subjects: facultySubjects.filter((subject) => subject.deliveryMode === 'on-campus').map((subject) => ({ subjectId: subject.id, code: subject.code, name: subject.name, requiredEquipmentType: subject.required_equipment_type || null, sections: subject.sectionIds.map((sectionId) => sections.find((section) => section.id === sectionId)?.name || sectionId), classType: (subject.lab_units ?? 0) > 0 && (subject.lecture_units ?? 0) === 0 ? 'lab' : 'lecture', durationMinutes: Number(subject.hours) > 0 ? Number(subject.hours) * 60 : undefined })) })).filter((assignment) => assignment.subjects.length > 0);
    if (hasMissingSections || selectedAssignments.some((assignment) => assignment.subjects.length === 0)) {
      toast({ title: 'A few details are missing', description: 'Select at least one section for every subject and assign at least one subject to each faculty member.', type: 'warning' });
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
    setGenerationMessage('The AI is preparing your schedule. This may take a moment while it checks availability, rooms, and existing classes.');
    setSuggestions([]);
    try {
      const response = await fetch('/api/scheduling/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignments,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not generate schedule.');
      const nextRecommendations = (data.recommendations || []).map((recommendation: Recommendation) => ({
        ...recommendation,
        generated: recommendation.generated.filter((row) => isPhysicalRoom(row.roomName)),
      }));
      setRecommendations(nextRecommendations);
      setSelectedRecommendationId(null);
      setRows([]);
      setUnplaced([]);
      setAiSuggestionsAvailable(false);
      setAiSuggestedPlacements([]);
      setUnavailable(data.unavailable || []);
      const generatedCount = nextRecommendations[0]?.summary.scheduled || 0;
      setGenerationMessage(nextRecommendations.length > 0
        ? `The AI prepared ${nextRecommendations.length} complete schedule recommendations for review. Choose one to edit before finalizing.`
        : `The AI could not place any classes this time. Review the details below, adjust the room or availability, and try again.`);
      toast({ title: 'AI recommendations are ready', description: `${nextRecommendations.length} complete schedule${nextRecommendations.length === 1 ? '' : 's'} are ready for review${onlineAssignments.length > 0 ? `. ${onlineAssignments.length} online subject${onlineAssignments.length === 1 ? '' : 's'} were left out of the room schedule` : ''}.`, type: generatedCount > 0 ? 'success' : 'warning' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const isServiceError = /MISTRAL|AI schedule generation|temporarily unavailable|failed \(/i.test(message);
      const userMessage = isServiceError
        ? 'The AI service is temporarily unavailable. Please try again in a moment.'
        : message || 'Please review the selected faculty, subjects, sections, and room data, then try again.';
      setGenerationMessage(`We could not finish the schedule. ${userMessage}`);
      toast({ title: 'Schedule could not be prepared', description: userMessage, type: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  const chooseRecommendation = (recommendation: Recommendation) => {
    const chosenRows = recommendation.generated.map((row) => ({
      ...row,
      localId: makeId(),
      units: String(row.units ?? ''),
      lectureContactHours: String(row.lectureContactHours ?? ''),
      labContactHours: String(row.labContactHours ?? ''),
      classSize: String(row.classSize ?? ''),
      status: 'idle' as RowStatus,
    }));
    setSelectedRecommendationId(recommendation.id);
    setRows(chosenRows);
    setOriginalRows(chosenRows.map((row) => ({ ...row })));
    setUnplaced(recommendation.unplaced);
    setValidationMessages(validateRows(chosenRows));
    toast({ title: `${recommendation.id.replace('-', ' ')} selected`, description: 'The schedule is now editable. Review any warnings before finalizing.', type: 'success' });
  };

  const resetRows = () => {
    const reset = originalRows.map((row) => ({ ...row, status: 'idle' as RowStatus, statusMessage: undefined }));
    setRows(reset);
    setValidationMessages(validateRows(reset));
    toast({ title: 'Changes reset', description: 'The selected recommendation has been restored.', type: 'success' });
  };

  const returnToRecommendations = () => {
    setSelectedRecommendationId(null);
    setRows([]);
    setOriginalRows([]);
    setUnplaced([]);
    setValidationMessages([]);
  };

  const applyAISuggestions = () => {
    if (aiSuggestedPlacements.length === 0) return;
    const suggestedRows = aiSuggestedPlacements.map((row) => ({
      ...row,
      localId: makeId(),
      units: String(row.units ?? ''),
      lectureContactHours: String(row.lectureContactHours ?? ''),
      labContactHours: String(row.labContactHours ?? ''),
      classSize: String(row.classSize ?? ''),
      status: 'idle' as RowStatus,
    }));
    setRows((current) => [...current, ...suggestedRows]);
    setUnplaced((current) => current.filter((item) => !aiSuggestedPlacements.some((placement) => placement.code === item.code && placement.section === item.section && placement.facultyId === item.facultyId)));
    setAiSuggestedPlacements([]);
    toast({ title: 'AI suggestions applied', description: `${suggestedRows.length} alternative class${suggestedRows.length === 1 ? '' : 'es'} added to the matrix for review.`, type: 'success' });
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

  const saveAll = () => {
    if (rows.length === 0) return;
    if (validationMessages.length > 0) {
      toast({ title: 'Resolve schedule warnings first', description: 'The selected schedule has conflicts or availability issues.', type: 'warning' });
      return;
    }
    if (unplaced.length > 0) {
      toast({ title: 'Schedule is incomplete', description: 'Resolve the classes needing attention before finalizing.', type: 'warning' });
      return;
    }
    setFinalizationOpen(true);
  };

  const finalizeSchedule = async () => {
    setFinalizationOpen(false);
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

  return <><ExpandableGeneratorCard isMinimized={isMinimized} onExpand={() => setIsMinimized(false)}><CardHeader className="flex cursor-pointer flex-row items-center justify-between gap-3" onClick={toggleMinimized}><CardTitle>Automatic Schedule Generator</CardTitle><Button type="button" size="icon-sm" variant="ghost" onClick={toggleMinimized} aria-label={isMinimized ? 'Restore automatic schedule generator' : 'Minimize automatic schedule generator'} title={isMinimized ? 'Restore automatic schedule generator' : 'Minimize automatic schedule generator'}>{isMinimized ? <ChevronDown /> : <ChevronUp />}</Button></CardHeader>{!isMinimized && <CardContent className="space-y-5">
    <p className="text-sm text-slate-500">Select the faculty members and assign their subjects and sections. The AI will distribute classes across all available rooms, schedule part-time faculty first, and reserve computer laboratories for computer-dependent subjects.</p>
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-700">1. Faculty members</div>
      <div className="grid gap-2 md:grid-cols-2">{faculties.map((faculty) => <button key={faculty.id} type="button" onClick={() => toggleFaculty(faculty.id)} className={`rounded-lg border px-3 py-2 text-left text-sm ${selectedFacultyIds.includes(faculty.id) ? 'border-red-300 bg-red-50 text-red-900' : 'border-slate-200 hover:bg-slate-50'}`}><span className="font-medium">{faculty.name}</span><span className="block text-xs text-slate-500">{(subjectsByFaculty[faculty.id] || []).length} subject(s) assigned</span></button>)}</div>
    </div>
    {selectedFacultyIds.length > 0 && <div className="space-y-3">
      <div className="text-sm font-medium text-slate-700">2. Assign subjects by faculty</div>
      <div className="flex flex-wrap gap-2">{selectedFacultyIds.map((facultyId) => { const faculty = faculties.find((item) => item.id === facultyId); return <Button key={facultyId} type="button" size="sm" variant={activeFacultyId === facultyId ? 'default' : 'outline'} onClick={() => { setActiveFacultyId(facultyId); setSubjectCode(''); }}>{faculty?.name || facultyId}</Button>; })}</div>
      {activeFacultyId && <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 md:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-amber-950">Availability for {faculties.find((item) => item.id === activeFacultyId)?.name}</div>
            {availabilityLoading && <Loader2 className="h-4 w-4 animate-spin text-amber-700" aria-label="Loading availability" />}
          </div>
          {availabilityLoading ? <div className="text-xs text-amber-800">Loading saved availability...</div> : activeFacultyAvailability.length === 0 ? <div className="text-xs text-amber-800">No saved on-campus availability. The generator may flag placements outside this faculty member&apos;s available hours.</div> : <div className="flex flex-wrap gap-2">{activeFacultyAvailability.map((entry, index) => <span key={`${entry.day}-${entry.startTime}-${entry.endTime}-${index}`} className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-amber-950"><span className="font-semibold">{entry.day}</span> {formatTimeToTwelveHour(entry.startTime)} - {formatTimeToTwelveHour(entry.endTime)}</span>)}</div>}
        </div>
        <div className="space-y-2">
          <label htmlFor="ai-subject-code" className="text-sm font-medium text-slate-700">Subject code</label>
          <Input id="ai-subject-code" value={subjectCode} onChange={(event) => setSubjectCode(event.target.value)} placeholder="Search saved subjects" autoComplete="off" />
          {subjectCode.trim() && <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-sm">{filteredSubjects.length === 0 ? <div className="px-3 py-2 text-sm text-slate-500">No saved subjects match this code.</div> : filteredSubjects.map((subject) => <button key={subject.id} type="button" className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50 ${(subjectsByFaculty[activeFacultyId] || []).some((selected) => selected.id === subject.id) ? 'bg-red-50 text-red-900' : 'text-slate-800'}`} onClick={() => toggleSubject(activeFacultyId, subject)}><span className="font-medium">{subject.code}</span><span className="ml-2 text-slate-500">{subject.name}</span></button>)}</div>}
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-700">Assigned to {faculties.find((item) => item.id === activeFacultyId)?.name}</div>
          <div className="space-y-2 rounded-lg border border-slate-200 p-2">
            {(subjectsByFaculty[activeFacultyId] || []).length === 0 ? <span className="text-sm text-slate-400">No subjects assigned yet.</span> : (subjectsByFaculty[activeFacultyId] || []).map((assignment) => <div key={assignment.id} className="rounded-md bg-slate-50 p-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 text-xs"><span className="font-medium text-slate-900">{assignment.code}</span><span className="ml-2 text-slate-500">{assignment.name}</span></div>
                <Select value={assignment.deliveryMode} onValueChange={(value) => changeSubjectDeliveryMode(activeFacultyId, assignment.id, value as DeliveryMode)}><SelectTrigger className="h-8 w-32 rounded-md px-2 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="on-campus">On campus</SelectItem><SelectItem value="online">Online</SelectItem></SelectContent></Select>
                <button type="button" className="px-1 text-xs font-medium text-slate-500 hover:text-rose-700" onClick={() => toggleSubject(activeFacultyId, assignment)} aria-label={`Remove ${assignment.code}`}>x</button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1"><span className="mr-1 text-[10px] font-medium uppercase text-slate-500">Sections</span>{sections.filter((section) => hasMatchingYearLevel(assignment, section)).map((section) => <button key={section.id} type="button" onClick={() => toggleSubjectSection(activeFacultyId, assignment.id, section.id)} className={`rounded border px-1.5 py-0.5 text-[10px] ${assignment.sectionIds.includes(section.id) ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-600'}`}>{section.name}</button>)}</div>
            </div>)}
          </div>
        </div>
      </div>}
    </div>}
    {onlineAssignments.length > 0 && <div className="space-y-1 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900"><div className="font-semibold">Online subjects excluded from the room schedule</div>{onlineAssignments.map((assignment) => <div key={`${assignment.facultyName}-${assignment.id}`}>{assignment.code} - {assignment.name} ({assignment.facultyName}) is online and will not use a physical room.</div>)}</div>}
    <Button type="button" onClick={generate} disabled={generating || saving || selectedFacultyIds.length === 0}>{generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Generate All-Room Schedule</Button>
    {generationMessage && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><div className="font-semibold">Generation result</div><p className="mt-1">{generationMessage}</p></div>}
    {unplaced.length > 0 && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4"><div className="text-sm font-semibold text-amber-900">Classes needing attention</div><p className="text-xs text-amber-800">These classes were not added because the AI could not find a conflict-free placement.</p>{unplaced.map((item, index) => <div key={`unplaced-${item.facultyId || 'faculty'}-${item.code}-${item.section || 'section'}-${index}`} className="flex gap-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>{item.code} - {item.name}:</strong> {item.reason}</span></div>)}</div>}
    {unplaced.length > 0 && <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4"><div className="text-sm font-semibold text-blue-900">AI help</div>{aiSuggestionsAvailable && unplaced.some((item) => item.suggestion) && unplaced.filter((item) => item.suggestion).map((item, index) => <div key={`suggestion-${item.facultyId || 'faculty'}-${item.code}-${item.section || 'section'}-${index}`} className="flex gap-2 text-sm text-blue-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>{item.code} - {item.name}:</strong> {item.suggestion}</span></div>)}{aiSuggestedPlacements.length > 0 ? <><p className="text-sm text-blue-800">The AI found alternative rooms and times that you can review before saving.</p><Button type="button" onClick={applyAISuggestions}>Apply AI alternatives ({aiSuggestedPlacements.length})</Button></> : !aiSuggestionsAvailable && <p className="text-sm text-blue-800">AI help is unavailable right now. Please try generating again later.</p>}</div>}
    {unavailable.length > 0 && <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="text-sm font-semibold text-slate-700">Existing assignments</div><p className="text-xs text-slate-500">These classes are already on the master schedule and are shown here even when they use another room.</p>{unavailable.map((item) => <div key={`${item.code}-${item.name}-${item.section || 'subject'}-${item.assignedFacultyName || 'faculty'}`} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"><div><strong>{item.code} - {item.name}{item.section ? ` (${item.section})` : ''}</strong> is assigned to {item.assignedFacultyName || 'another faculty member'}.</div><div className="mt-1 text-xs text-slate-500">{item.day} {item.startTime && item.endTime ? `${item.startTime} - ${item.endTime}` : ''} · {item.hasPhysicalRoom ? item.roomName : 'No physical room assigned'}{item.roomId ? ` · Room ID: ${item.roomId}` : ''}</div></div>)}</div>}
    {suggestions.length > 0 && <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-4"><div className="text-sm font-semibold text-blue-900">Conflict suggestions</div>{suggestions.map((suggestion, index) => <div key={`${suggestion.label}-${suggestion.value}-${index}`} className="text-sm text-blue-900"><strong>{suggestion.label}:</strong> {suggestion.value}</div>)}</div>}
    {recommendations.length > 0 && !selectedRecommendationId && <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4"><div><div className="text-lg font-semibold text-slate-900">AI Schedule Recommendations</div><p className="mt-1 text-sm text-slate-600">Based on the selected faculty, subjects, and scheduling constraints, here are possible schedule arrangements.</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600"><span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-slate-400 bg-slate-300" /> Saved schedules</span><span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-rose-500 bg-rose-400" /> Conflicts</span><span>Recommendation colors show proposed schedules.</span></div></div>{recommendations.map((recommendation, index) => <div key={recommendation.id} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-base font-semibold text-slate-900">Recommendation {index + 1}</div><p className="text-sm text-slate-600">{recommendation.summary.notes}</p></div><div className="flex gap-3 text-xs text-slate-600"><span>{recommendation.summary.scheduled}/{recommendation.summary.total} subjects scheduled</span><span>{recommendation.summary.conflicts} conflicts</span></div></div><div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-semibold text-slate-700">Faculty workload:</span> {recommendation.summary.workload}</div><ScheduleBoard rows={[...savedRows, ...recommendation.generated.filter((row) => isPhysicalRoom(row.roomName)).map((row) => ({ ...row, localId: `${recommendation.id}-${row.code}-${row.section}`, status: 'idle' as RowStatus, isSaved: false }))]} onUpdate={() => undefined} onDelete={() => undefined} color={recommendationColors[index % recommendationColors.length]} readOnly facultyAvailability={facultyAvailability} /><Button type="button" onClick={() => chooseRecommendation(recommendation)}>Choose This Schedule</Button></div>)}</div>}
    {selectedRecommendationId && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={returnToRecommendations}>Try Another Recommendation</Button><Button type="button" variant="outline" onClick={resetRows} disabled={rows.length === 0}><RotateCcw className="mr-2 h-4 w-4" />Reset Changes</Button></div>}
    {selectedRecommendationId && <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Edit Schedule: {selectedRecommendationId.replace('-', ' ')}</div><p className="text-xs text-slate-500">The selected recommendation is editable and is not finalized until you confirm the finalization action.</p><div className="mt-2 text-xs text-slate-600"><span className="mr-1 inline-block h-3 w-3 rounded-sm border border-slate-400 bg-slate-300 align-[-1px]" /> Saved schedules are shown in gray.</div></div></div>{validationMessages.length > 0 && <div className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><div className="font-semibold">Schedule validation warnings</div>{validationMessages.map((message) => <div key={message}>{message}</div>)}</div>}{savedRows.length > 0 && <div className="text-xs text-slate-500">Showing {savedRows.length} existing schedule{savedRows.length === 1 ? '' : 's'} across all rooms.</div>}<ScheduleBoard rows={[...savedRows, ...rows]} onUpdate={updateRow} onDelete={deleteRow} color={recommendationColors[Math.max(0, recommendations.findIndex((item) => item.id === selectedRecommendationId)) % recommendationColors.length]} facultyAvailability={facultyAvailability} />{rows.length > 0 && <div className="flex flex-wrap items-center gap-3"><Button type="button" onClick={saveAll} disabled={saving || validationMessages.length > 0}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Finalize Schedule</Button><div className="flex items-center gap-3 text-xs text-slate-500">{rows.map((row) => <RowStatusBadge key={row.localId} status={row.status} message={row.statusMessage} />)}</div></div>}</div>}
  </CardContent>}</ExpandableGeneratorCard><Dialog open={finalizationOpen} onOpenChange={setFinalizationOpen}><DialogContent><DialogHeader><DialogTitle>Review Final Schedule</DialogTitle><DialogDescription>Confirm that this schedule is ready to submit to the existing approval workflow.</DialogDescription></DialogHeader><div className="space-y-3 text-sm text-slate-700"><div className="grid grid-cols-2 gap-2"><div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Classes</div><div className="font-semibold">{rows.length}</div></div><div className={`rounded-md p-3 ${validationMessages.length > 0 ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}><div className="text-xs">Warnings</div><div className="font-semibold">{validationMessages.length}</div></div></div><div><span className="font-semibold">Faculty workload:</span> {selectedRecommendationId ? recommendations.find((item) => item.id === selectedRecommendationId)?.summary.workload : 'Not selected'}</div><p className="text-xs text-slate-500">Finalizing will save these classes and submit them to the current schedule approval workflow. You can no longer review other AI recommendations from this selection.</p></div><DialogFooter><DialogClose render={<Button type="button" variant="outline" />} >Cancel</DialogClose><Button type="button" onClick={finalizeSchedule} disabled={saving || validationMessages.length > 0}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm Finalization</Button></DialogFooter></DialogContent></Dialog></>;
}

function ScheduleBoard({ rows, onUpdate, onDelete, color, readOnly = false, facultyAvailability }: Readonly<{ rows: GeneratedRow[]; onUpdate: (localId: string, field: keyof GeneratedRow, value: string) => void; onDelete: (localId: string) => void; color: string; readOnly?: boolean; facultyAvailability: Record<string, Array<{ day: string; startTime: string; endTime: string }>> }>) {
  const physicalRows = rows.filter((row) => isPhysicalRoom(row.roomName));
  const [collapsedRooms, setCollapsedRooms] = useState<Set<string>>(new Set());
  const roomGroups = [...new Set(physicalRows.map((row) => `${row.roomId}::${row.roomName}`))].map((group) => {
    const separator = group.indexOf('::');
    const roomId = group.slice(0, separator);
    const roomName = group.slice(separator + 2);
    return { roomId, roomName, rows: physicalRows.filter((row) => `${row.roomId}::${row.roomName}` === group) };
  });

  const toggleRoom = (roomKey: string) => setCollapsedRooms((current) => {
    const next = new Set(current);
    if (next.has(roomKey)) next.delete(roomKey);
    else next.add(roomKey);
    return next;
  });

  return <div className="space-y-4">{roomGroups.map((group) => {
    const roomKey = group.roomId || group.roomName;
    const collapsed = collapsedRooms.has(roomKey);
    return <div key={roomKey} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <button type="button" onClick={() => toggleRoom(roomKey)} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-white" aria-expanded={!collapsed}>
        <span>{group.roomName} <span className="ml-1 text-xs font-normal text-slate-500">({group.rows.length} schedule{group.rows.length === 1 ? '' : 's'})</span></span>
        {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
          {!collapsed && <div className="mt-2"><ScheduleRoomBoard rows={group.rows} allRows={physicalRows} onUpdate={onUpdate} onDelete={onDelete} color={color} savedColor="#cbd5e1" readOnly={readOnly} facultyAvailability={facultyAvailability} /></div>}
    </div>;
  })}</div>;
}