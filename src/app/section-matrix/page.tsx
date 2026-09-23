'use client';

import { useEffect, useMemo, useState } from 'react';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Printer } from 'lucide-react';
import { scheduleService } from '@/services/scheduleService';
import { Schedule } from '@/types/schedule';
import { formatTimeToTwelveHour } from '@/lib/timeUtils';

const DAY_ABBREVIATIONS: Record<string, string> = {
  Monday: 'M',
  Tuesday: 'T',
  Wednesday: 'W',
  Thursday: 'Th',
  Friday: 'F',
  Saturday: 'S',
  Sunday: 'Su',
};
const SEMESTER = '1st Semester';

type LocalUser = { id: string; role: string };

type MatrixRow = {
  subjectId: string;
  code: string;
  name: string;
  units: number | string;
  meetings: Schedule[];
};

const getRoomDisplayName = (roomName?: string | null) => {
  if (/\b(tbd|tba)\b/i.test(roomName || '')) return 'TBA';
  return /\b(online|virtual|remote)\b/i.test(roomName || '') ? 'Online' : roomName || 'TBA';
};

const formatMeetingTime = (meeting: Schedule) =>
  `${formatTimeToTwelveHour(meeting.startTime)} - ${formatTimeToTwelveHour(meeting.endTime)}`;

function SectionMatrixContent() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [schoolYear, setSchoolYear] = useState('2025-2026');
  const [course, setCourse] = useState('BSIT');
  const [yearLevel, setYearLevel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const rawUser = localStorage.getItem('user');
    const parsedUser = rawUser ? (JSON.parse(rawUser) as LocalUser) : null;
    setUser(parsedUser);

    const loadSchedules = async () => {
      try {
        const actor = parsedUser ? { id: String(parsedUser.id), role: parsedUser.role } : undefined;
        setSchedules(await scheduleService.getSchedules(undefined, actor));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load saved subjects.');
      } finally {
        setLoading(false);
      }
    };

    void loadSchedules();
  }, []);

  const sections = useMemo(
    () => Array.from(new Set(schedules.map((schedule) => schedule.section?.trim()).filter(Boolean))).sort((left, right) => String(left).localeCompare(String(right))),
    [schedules]
  );

  useEffect(() => {
    if (!selectedSection && sections.length > 0) {
      setSelectedSection(String(sections[0]));
    }
  }, [sections, selectedSection]);

  useEffect(() => {
    const sectionMatch = /(?:BSIT)?([1-4])[A-Z]$/i.exec(selectedSection);
    const sectionYear = sectionMatch?.[1];
    const yearSuffixes: Record<string, string> = { '1': 'st', '2': 'nd', '3': 'rd', '4': 'th' };
    if (sectionYear) setYearLevel(`${sectionYear}${yearSuffixes[sectionYear]} Year`);
  }, [selectedSection]);

  const sectionSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.section?.trim() === selectedSection),
    [schedules, selectedSection]
  );

  const matrixRows = useMemo<MatrixRow[]>(() => {
    const grouped = new Map<string, MatrixRow>();

    sectionSchedules.forEach((schedule) => {
      const key = schedule.subjectId || schedule.subject.code;
      const existing = grouped.get(key);
      if (existing) {
        existing.meetings.push(schedule);
        return;
      }

      grouped.set(key, {
        subjectId: key,
        code: schedule.subject.code,
        name: schedule.subject.name,
        units: schedule.units ?? '-',
        meetings: [schedule],
      });
    });

    return Array.from(grouped.values()).sort((left, right) => left.code.localeCompare(right.code));
  }, [sectionSchedules]);

  const handlePrint = () => window.print();
  const emptyMessage = sections.length === 0
    ? 'No saved subjects are assigned to a section yet.'
    : !selectedSection
      ? 'Choose a section to generate its matrix.'
      : 'No subjects found for this section.';
  const compiledLabel = user
    ? `${matrixRows.length} subject${matrixRows.length === 1 ? '' : 's'} compiled`
    : 'Sign in to view saved subjects.';

  return (
    <div className="space-y-6 print:space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D4A017]">Scheduling</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Section Matrix</h1>
          <p className="text-slate-500">Compiled subjects and class meetings from saved schedules.</p>
        </div>
        <Button type="button" variant="outline" onClick={handlePrint} disabled={matrixRows.length === 0}>
          <Printer className="mr-2 h-4 w-4" /> Print matrix
        </Button>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 print:hidden">
          <CardTitle>Saved subjects by section</CardTitle>
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm font-medium text-slate-700">
              <span className="block">School Year</span>
              <input className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700" value={schoolYear} readOnly aria-label="School Year" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="block">Course</span>
              <input className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700" value={course} readOnly aria-label="Course" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="block">Year Level</span>
              <input className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700" value={yearLevel} readOnly aria-label="Year Level" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="block">Semester</span>
              <input className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700" value={SEMESTER} readOnly aria-label="Semester" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="block">Section</span>
              <Select value={selectedSection} onValueChange={(value) => setSelectedSection(value || '')}>
                <SelectTrigger className="mt-1 w-full" aria-label="Choose section">
                  <SelectValue placeholder="Choose section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((section) => (
                    <SelectItem key={section} value={section as string}>
                      {section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        </CardHeader>
        <CardContent className="print:p-0">
          <div className="mb-4 hidden print:block">
            <h1 className="text-xl font-semibold text-slate-900">Section Matrix</h1>
            <div className="mt-2 grid grid-cols-5 gap-3 text-sm text-slate-700">
              <span><strong>School Year:</strong> {schoolYear}</span>
              <span><strong>Course:</strong> {course}</span>
              <span><strong>Year Level:</strong> {yearLevel || '-'}</span>
              <span><strong>Semester:</strong> {SEMESTER}</span>
              <span><strong>Section:</strong> {selectedSection || '-'}</span>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading saved subjects...
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-rose-600">{error}</p>
          ) : matrixRows.length === 0 ? (
            <p className="py-8 text-center text-slate-500">{emptyMessage}</p>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Course Code</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Units</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Room</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrixRows.map((row) => (
                    <TableRow key={row.subjectId}>
                      <TableCell className="font-medium text-slate-900">{row.code}</TableCell>
                      <TableCell className="min-w-[180px]">{row.name}</TableCell>
                      <TableCell>{row.units}</TableCell>
                      <TableCell>
                        {row.meetings.map((meeting) => DAY_ABBREVIATIONS[meeting.day] || meeting.day).join(' , ')}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.meetings.map(formatMeetingTime).join(' , ')}
                      </TableCell>
                      <TableCell>
                        {row.meetings.map((meeting) => getRoomDisplayName(meeting.room?.name)).join(' , ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-slate-500 print:hidden">{compiledLabel}</p>
    </div>
  );
}

export default function SectionMatrixPage() {
  return (
    <RouteGuard requiredRoles={['program_chair', 'dean', 'registrar']} fallbackPath="/login">
      <SectionMatrixContent />
    </RouteGuard>
  );
}
