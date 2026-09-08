'use client';

import { useState } from 'react';
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
type Room = { id: string; name: string; capacity: number };
type GeneratedRow = { localId: string; subjectId: string | null; code: string; name: string; day: string; startTime: string; endTime: string; section: string; roomId: string; roomName: string; units: string; lectureContactHours: string; labContactHours: string; classSize: string; loadType: LoadType; status: RowStatus; statusMessage?: string };

interface AIScheduleGeneratorProps {
  facultyId: string;
  facultyName: string;
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
                      <div className="min-w-0 font-semibold leading-tight">{row.name}<div className="font-normal">{row.code}</div></div>
                      <button type="button" onClick={() => onDelete(row.localId)} className="shrink-0 p-1 text-slate-700 hover:text-rose-700" title="Delete generated row"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <Select value={row.day} onValueChange={(value) => onUpdate(row.localId, 'day', value || 'Monday')}>
                      <SelectTrigger className="h-7 rounded border-slate-700 bg-white/70 px-1.5 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{DAYS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="grid grid-cols-2 gap-1">
                      <Input className="h-7 rounded border-slate-700 bg-white/70 px-1 text-[11px]" type="time" step="1800" value={row.startTime} onChange={(event) => onUpdate(row.localId, 'startTime', event.target.value)} />
                      <Input className="h-7 rounded border-slate-700 bg-white/70 px-1 text-[11px]" type="time" step="1800" value={row.endTime} onChange={(event) => onUpdate(row.localId, 'endTime', event.target.value)} />
                    </div>
                    <Input className="h-7 rounded border-slate-700 bg-white/70 px-1.5 text-[11px]" value={row.section} onChange={(event) => onUpdate(row.localId, 'section', event.target.value)} placeholder="Section" />
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

export function AIScheduleGenerator({ facultyId, facultyName, subjects, rooms, createdBy, creatorRole, onSaved }: Readonly<AIScheduleGeneratorProps>) {
  const [rows, setRows] = useState<GeneratedRow[]>([]);
  const [unplaced, setUnplaced] = useState<Array<{ code: string; name: string; reason: string }>>([]);
  const [unavailable, setUnavailable] = useState<Array<{ code: string; name: string; reason: string }>>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectDescription, setSubjectDescription] = useState('');
  const [isMinimized, setIsMinimized] = useState(true);

  const updateRow = (localId: string, field: keyof GeneratedRow, value: string) => setRows((current) => current.map((row) => row.localId === localId ? { ...row, [field]: value, status: 'idle', statusMessage: undefined } : row));

  const generate = async () => {
    const code = subjectCode.trim();
    const description = subjectDescription.trim();
    if (!facultyId || !code || !description) {
      toast({ title: 'Missing subject details', description: 'Enter a subject code and description before generating.', type: 'warning' });
      return;
    }
    setGenerating(true);
    try {
      const existingSubject = subjects.find(
        (subject) => subject.code.trim().toLowerCase() === code.toLowerCase() && subject.name.trim().toLowerCase() === description.toLowerCase()
      );
      const response = await fetch('/api/scheduling/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facultyId,
          subjects: [{ subjectId: existingSubject?.id ?? null, code, name: description }],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not generate schedule.');
      setRows((data.generated || []).map((row: Omit<GeneratedRow, 'localId' | 'status'>) => ({ ...row, localId: makeId(), units: String(row.units ?? ''), lectureContactHours: String(row.lectureContactHours ?? ''), labContactHours: String(row.labContactHours ?? ''), classSize: String(row.classSize ?? ''), status: 'idle' })));
      setUnplaced(data.unplaced || []);
      setUnavailable(data.unavailable || []);
      toast({ title: 'Schedule generated', description: `${data.generated?.length || 0} subject(s) placed.`, type: 'success' });
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
      const room = rooms.find((item) => item.name.trim().toLowerCase() === row.roomName.trim().toLowerCase());
      if (!room) throw new Error(`Room "${row.roomName}" not found.`);
      let subjectId = row.subjectId;
      if (!subjectId) subjectId = (await scheduleService.createSubject({ code: row.code.trim(), name: row.name.trim() })).data?.id;
      if (!subjectId) throw new Error('Could not resolve subject.');
      const result = await scheduleService.createSchedule({ facultyId, subjectId, roomId: room.id, section: row.section.trim(), day: row.day, startTime: row.startTime, endTime: row.endTime, units: row.units === '' ? undefined : Number(row.units), lectureContactHours: row.lectureContactHours === '' ? undefined : Number(row.lectureContactHours), labContactHours: row.labContactHours === '' ? undefined : Number(row.labContactHours), classSize: row.classSize === '' ? undefined : Number(row.classSize), loadType: row.loadType, createdBy: createdBy || creatorRole, creatorRole });
      if (!result.success) {
        const message = conflictMessage(result.conflict.conflict_type);
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
      await onSaved?.();
    } else toast({ title: 'Save failed', description: 'No classes were saved. Check the row errors below.', type: 'error' });
  };

  return <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><CardTitle>Automatic Schedule Generator - {facultyName || 'Select a faculty member'}</CardTitle><Button type="button" size="icon-sm" variant="ghost" onClick={() => setIsMinimized((current) => !current)} aria-label={isMinimized ? 'Restore automatic schedule generator' : 'Minimize automatic schedule generator'} title={isMinimized ? 'Restore automatic schedule generator' : 'Minimize automatic schedule generator'}>{isMinimized ? <ChevronDown /> : <ChevronUp />}</Button></CardHeader>{!isMinimized && <CardContent className="space-y-5">
    <p className="text-sm text-slate-500">Enter a subject, then generate an available schedule using this faculty member&apos;s saved availability.</p>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <label htmlFor="ai-subject-code" className="text-sm font-medium text-slate-700">Subject Code</label>
        <Input id="ai-subject-code" value={subjectCode} onChange={(event) => setSubjectCode(event.target.value)} placeholder="e.g. IT201" />
      </div>
      <div className="space-y-2">
        <label htmlFor="ai-subject-description" className="text-sm font-medium text-slate-700">Description</label>
        <Input id="ai-subject-description" value={subjectDescription} onChange={(event) => setSubjectDescription(event.target.value)} placeholder="e.g. Database Management" />
      </div>
    </div>
    <Button type="button" onClick={generate} disabled={generating || saving || !facultyId}>{generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Generate Schedule</Button>
    {unplaced.length > 0 && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4">{unplaced.map((item) => <div key={`${item.code}-${item.name}`} className="flex gap-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>{item.code} - {item.name}:</strong> {item.reason}</span></div>)}</div>}
    {unavailable.length > 0 && <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="text-sm font-semibold text-slate-700">Already assigned and excluded</div>{unavailable.map((item) => <div key={`${item.code}-${item.name}`} className="text-sm text-slate-600"><strong>{item.code} - {item.name}</strong> is already assigned to another faculty member.</div>)}</div>}
    <div className="space-y-2"><div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Schedule Matrix</div><ScheduleBoard rows={rows} onUpdate={updateRow} onDelete={(localId) => setRows((current) => current.filter((item) => item.localId !== localId))} />{rows.length > 0 && <div className="flex items-center gap-3"><Button type="button" onClick={saveAll} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save All to Master Schedule</Button><div className="flex items-center gap-3 text-xs text-slate-500">{rows.map((row) => <RowStatusBadge key={row.localId} status={row.status} message={row.statusMessage} />)}</div></div>}</div>
  </CardContent>}</Card>;
}