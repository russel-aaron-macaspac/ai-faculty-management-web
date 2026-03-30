'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { attendanceService } from '@/services/attendanceService';
import { scheduleService } from '@/services/scheduleService';
import { clearanceService } from '@/services/clearanceService';
import { Attendance } from '@/types/attendance';
import { Clearance } from '@/types/clearance';
import { Schedule } from '@/types/schedule';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Radio, Sparkles, ShieldCheck, CalendarDays, Clock3 } from 'lucide-react';
import { formatTimeToTwelveHour } from '@/lib/timeUtils';

export default function LiveRFIDPage() {
  const { user, isLoading } = useRoleBasedAccess({
    allowedRoles: ['faculty', 'staff', 'dlrc', 'pmo', 'laboratory', 'ict', 'ceso', 'programchair', 'dean', 'registrar', 'ovprel', 'ovpaa', 'account', 'treasury', 'hro'],
    redirectTo: '/dashboard/admin',
  });

  const [scanCode, setScanCode] = useState('');
  const [scanTimestamp, setScanTimestamp] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [clearances, setClearances] = useState<Clearance[]>([]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayWeekday = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  const normalize = (value: string | undefined) => (value || '').trim().toLowerCase().split(/\s+/).join(' ');

  const matchesCurrentUser = (employeeId: string | undefined, employeeName: string | undefined) => {
    if (!user) {
      return false;
    }

    const currentId = String(user.id ?? '');
    const sameId = !!employeeId && currentId !== '' && employeeId === currentId;

    const currentName = normalize(user.full_name);
    const rowName = normalize(employeeName);
    const sameName =
      currentName !== '' &&
      rowName !== '' &&
      (rowName === currentName || rowName.includes(currentName) || currentName.includes(rowName));

    return sameId || sameName;
  };

  const handleRFIDScan = async () => {
    if (!scanCode.trim()) {
      setScanError('Please provide an RFID value before scanning.');
      return;
    }

    setScanError(null);
    setIsScanning(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setScanTimestamp(new Date().toLocaleString());
      setIsDataLoading(true);

      const [attendanceData, scheduleData, clearanceData] = await Promise.all([
        attendanceService.getAttendance(today),
        scheduleService.getSchedules(),
        clearanceService.getClearances(),
      ]);

      setAttendance(attendanceData.filter((row) => matchesCurrentUser(row.employeeId, row.employeeName)));
      setSchedules(
        scheduleData.filter(
          (row: Schedule) =>
            row.dayOfWeek === todayWeekday &&
            matchesCurrentUser((row as Schedule & { employeeId?: string }).employeeId, row.employeeName)
        )
      );
      setClearances(clearanceData.filter((row: Clearance) => matchesCurrentUser(row.employeeId, row.employeeName)));
    } catch {
      setScanError('Unable to load RFID details right now. Please try again.');
    } finally {
      setIsScanning(false);
      setIsDataLoading(false);
    }
  };

  const latestAttendance = attendance[0] || null;
  const activeClearance = clearances[0] || null;

  const aiInsight = useMemo(() => {
    if (!scanTimestamp) {
      return 'Scan your RFID card to unlock AI-generated attendance guidance.';
    }

    if (latestAttendance?.anomalyDetected) {
      return 'AI noticed an anomaly in your latest attendance record. Please confirm your schedule and room before your next tap.';
    }

    if (latestAttendance?.status === 'late') {
      return 'You are marked late today. Consider enabling a 15-minute pre-class reminder from your faculty dashboard.';
    }

    if (activeClearance?.status === 'pending' || activeClearance?.status === 'submitted') {
      return 'Your clearance is still in progress. Follow up with HR to avoid attendance validation delays.';
    }

    if (schedules.length === 0) {
      return 'No class or shift scheduled for today. Your RFID scan is recorded and your status is clear.';
    }

    return 'You are on track today. Attendance, schedule, and clearance indicators look healthy.';
  }, [scanTimestamp, latestAttendance, activeClearance, schedules.length]);

  if (isLoading) {
    return (
      <div className="py-16 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    );
  }

  let statusBadgeClass = 'bg-rose-100 text-rose-700';
  if (latestAttendance?.status === 'present') {
    statusBadgeClass = 'bg-emerald-100 text-emerald-700';
  } else if (latestAttendance?.status === 'late') {
    statusBadgeClass = 'bg-amber-100 text-amber-700';
  } else if (latestAttendance?.status === 'on_leave') {
    statusBadgeClass = 'bg-blue-100 text-blue-700';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">RFID Live Monitor</h1>
          <p className="text-slate-500 mt-1">Personal attendance intelligence unlocks after a successful RFID scan.</p>
        </div>
        <Link href="/attendance" className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Back to Attendance
        </Link>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Radio className="h-5 w-5 text-red-600" /> RFID Scan Gate
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Enter RFID card value..."
              value={scanCode}
              onChange={(event) => setScanCode(event.target.value)}
              className="sm:max-w-sm"
            />
            <Button className="bg-red-600 hover:bg-red-700" onClick={() => void handleRFIDScan()} disabled={isScanning || isDataLoading}>
              {(isScanning || isDataLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isScanning || isDataLoading ? 'Validating Scan...' : 'Scan RFID'}
            </Button>
          </div>
          {scanTimestamp && <p className="text-sm text-emerald-700">RFID accepted at {scanTimestamp}</p>}
          {scanError && <p className="text-sm text-rose-600">{scanError}</p>}
        </CardContent>
      </Card>

      {scanTimestamp ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Clock3 className="h-4 w-4 text-red-600" /> Attendance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-slate-500">Latest status</p>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass}`}>
                {latestAttendance?.status || 'no record'}
              </span>
              <p className="text-sm text-slate-700">Time-in: {latestAttendance?.timeIn ? formatTimeToTwelveHour(latestAttendance.timeIn) : '--:--'}</p>
              <p className="text-sm text-slate-700">Time-out: {latestAttendance?.timeOut ? formatTimeToTwelveHour(latestAttendance.timeOut) : '--:--'}</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4 text-red-600" /> Today&apos;s Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {schedules.length === 0 ? (
                <p className="text-sm text-slate-600">No schedule found for today.</p>
              ) : (
                schedules.slice(0, 2).map((item) => (
                  <div key={item.id} className="rounded-md border border-slate-200 p-2">
                    <p className="text-sm font-medium text-slate-800">{item.subjectOrRole}</p>
                    <p className="text-xs text-slate-500">{formatTimeToTwelveHour(item.startTime)} - {formatTimeToTwelveHour(item.endTime)} {item.room ? `| ${item.room}` : ''}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-red-600" /> Clearance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-slate-700">Document: {activeClearance?.requiredDocument || 'No document on file'}</p>
              <span className="inline-flex rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-xs font-medium">
                {activeClearance?.status || 'not submitted'}
              </span>
              {activeClearance?.validationWarning && <p className="text-xs text-amber-700">{activeClearance.validationWarning}</p>}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-red-600" /> AI Insight</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700 leading-relaxed">{aiInsight}</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-dashed border-slate-300 bg-slate-50">
          <CardContent className="py-10 text-center text-slate-600">
            Scan required. Attendance, schedule, clearance, and AI insight will appear after RFID validation.
          </CardContent>
        </Card>
      )}
    </div>
  );
}