'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { attendanceService } from '@/services/attendanceService';
import { Attendance } from '@/types/attendance';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Loader2, Search, AlertTriangle, Filter, Sparkles, CheckCircle2, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { StoredUser, normalize } from '@/lib/stringUtils';
import { formatTimeToTwelveHour, formatAttendanceTimestampToTime } from '@/lib/timeUtils';
import { useRFID } from '@/hooks/useRFID';

type LatestScanSummary = {
  id: string;
  uid: string;
  user_id?: number | null;
  status: 'success' | 'failed' | 'not_registered';
  timestamp: string;
  reason?: string | null;
  analysis?: ScanAnalysis | null;
  user?: {
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
  } | null;
};

type ScanAnalysis = {
  status?: string;
  message?: string;
  recommendation?: string;
  deviceRoom?: string;
  schedule?: {
    startTime?: string | null;
    endTime?: string | null;
    roomName?: string | null;
    roomId?: string | null;
  };
};

type ScanValidationTone = 'emerald' | 'amber' | 'rose' | 'slate';

type ScanValidationSummary = {
  title: string;
  tone: ScanValidationTone;
  details: string[];
};

const VALIDATION_TONE_CLASSES: Record<ScanValidationTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  rose: 'bg-rose-50 text-rose-800 border-rose-200',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
};

function toScheduleTimeLabel(value?: string | null): string {
  if (!value) {
    return 'N/A';
  }

  if (value.includes('T')) {
    return formatTimeToTwelveHour(formatAttendanceTimestampToTime(value));
  }

  const clock = value.slice(0, 5);
  return formatTimeToTwelveHour(clock);
}

function buildScanValidationSummary(scan: {
  status: 'success' | 'failed' | 'not_registered';
  reason?: string;
  analysis?: ScanAnalysis | null;
}): ScanValidationSummary {
  const analysis = scan.analysis ?? null;
  const status = analysis?.status ?? null;
  const reason = scan.reason?.trim();

  if (scan.status === 'not_registered') {
    return {
      title: 'Validation unavailable: unregistered card',
      tone: 'slate',
      details: [reason || 'Card is not linked to an active user account.'],
    };
  }

  if (status === 'wrong_room') {
    const expectedRoom =
      analysis?.schedule?.roomName || analysis?.schedule?.roomId || 'assigned room';
    const scheduleWindow = `${toScheduleTimeLabel(analysis?.schedule?.startTime)} - ${toScheduleTimeLabel(analysis?.schedule?.endTime)}`;

    return {
      title: 'Room validation failed',
      tone: 'rose',
      details: [
        analysis?.message || reason || 'Scanned device room does not match scheduled room.',
        `Expected room: ${expectedRoom} | Device room: ${analysis?.deviceRoom || 'Unknown'}`,
        `Scheduled time window: ${scheduleWindow}`,
        analysis?.recommendation || 'Proceed to your assigned room and rescan.',
      ],
    };
  }

  if (status === 'no_schedule') {
    return {
      title: 'No schedule detected',
      tone: 'amber',
      details: [
        analysis?.message || reason || 'No schedule found for this user at scan time.',
        analysis?.recommendation || 'Verify schedule assignment before finalizing this attendance.',
      ],
    };
  }

  if (status === 'unauthorized_access' || status === 'outside_schedule') {
    return {
      title: 'Schedule validation warning',
      tone: 'amber',
      details: [
        analysis?.message || reason || 'Scan has schedule constraints to review.',
        analysis?.recommendation || 'Review schedule assignment before finalizing this attendance.',
      ],
    };
  }

  if (scan.status === 'failed') {
    return {
      title: 'Scan failed',
      tone: 'rose',
      details: [reason || analysis?.message || 'Scan could not be validated.'],
    };
  }

  return {
    title: 'Room validation passed',
    tone: 'emerald',
    details: [
      analysis?.message || 'Scan is aligned with the scheduled room constraints.',
      analysis?.deviceRoom ? `Validated device room: ${analysis.deviceRoom}` : 'Device room validated from configured RFID device mapping.',
    ],
  };
}

function fullNameFromScan(scan?: LatestScanSummary | null): string {
  const value = [scan?.user?.first_name, scan?.user?.middle_name, scan?.user?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return value || '';
}

function parseTimeToMinutes(value?: string): number | null {
  if (!value) {
    return null;
  }

  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatMinutesToTime(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatMinutesToTwelveHour(value: number): string {
  return formatTimeToTwelveHour(formatMinutesToTime(value));
}

const LOOKBACK_DAYS = 7;
const DUPLICATE_SCAN_THRESHOLD_MINUTES = 5;
const CHECK_IN_VARIANCE_MINUTES = 15;

type SchedulerInsight = {
  label: 'Pattern' | 'Recommendation' | 'Alert';
  text: string;
  tone: 'emerald' | 'blue' | 'amber' | 'rose' | 'slate';
};

const INSIGHT_TONE_CLASSES: Record<SchedulerInsight['tone'], string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  slate: 'bg-slate-50 text-slate-700 ring-slate-200',
};

function shiftDate(dateValue: string, offsetDays: number): string {
  const [year, month, day] = dateValue.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return shifted.toISOString().split('T')[0];
}

function getLookbackDates(dateValue: string, lookbackDays: number): string[] {
  return Array.from({ length: lookbackDays }, (_, index) => shiftDate(dateValue, -(lookbackDays - 1 - index)));
}

function getTimeValues(records: Attendance[]): number[] {
  return records
    .map((record) => parseTimeToMinutes(record.timeIn))
    .filter((value): value is number => value !== null);
}

function getAverageMinutes(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function getFirstCheckInMinutes(records: Attendance[]): number | null {
  const values = getTimeValues(records);
  return values.length > 0 ? Math.min(...values) : null;
}

function getDuplicateScanCount(records: Attendance[]): number {
  const duplicates = new Set<string>();
  const groupedByEmployee = new Map<string, { minutes: number; id: string }>();

  [...records]
    .filter((record) => record.timeIn)
    .sort((left, right) => {
      const leftMinutes = parseTimeToMinutes(left.timeIn) ?? 0;
      const rightMinutes = parseTimeToMinutes(right.timeIn) ?? 0;
      return leftMinutes - rightMinutes;
    })
    .forEach((record) => {
      const timeInMinutes = parseTimeToMinutes(record.timeIn);
      const timeOutMinutes = parseTimeToMinutes(record.timeOut);

      if (timeInMinutes === null) {
        return;
      }

      if (
        timeOutMinutes !== null &&
        timeOutMinutes > timeInMinutes &&
        timeOutMinutes - timeInMinutes <= DUPLICATE_SCAN_THRESHOLD_MINUTES
      ) {
        duplicates.add(record.id);
      }

      const previous = groupedByEmployee.get(record.employeeId);
      if (previous && timeInMinutes - previous.minutes <= DUPLICATE_SCAN_THRESHOLD_MINUTES) {
        duplicates.add(previous.id);
        duplicates.add(record.id);
      }

      groupedByEmployee.set(record.employeeId, { minutes: timeInMinutes, id: record.id });
    });

  return duplicates.size;
}

function buildAverageInsights(averageMinutes: number, trendCount: number): SchedulerInsight[] {
  const recommendedStart = Math.max(0, averageMinutes - 10);
  const recommendedEnd = Math.min(23 * 60 + 59, averageMinutes + 10);

  return [
    {
      label: 'Pattern',
      tone: 'emerald',
      text: `Average check-in is ${formatMinutesToTwelveHour(averageMinutes)} based on the last ${LOOKBACK_DAYS} days (${trendCount} scans).`,
    },
    {
      label: 'Recommendation',
      tone: 'blue',
      text: `Use ${formatMinutesToTwelveHour(recommendedStart)}-${formatMinutesToTwelveHour(recommendedEnd)} as the check-in window for the next scans.`,
    },
  ];
}

function buildVarianceInsight(firstCheckInMinutes: number | null, averageMinutes: number | null): SchedulerInsight[] {
  if (firstCheckInMinutes === null || averageMinutes === null) {
    return [];
  }

  const difference = firstCheckInMinutes - averageMinutes;
  if (Math.abs(difference) < CHECK_IN_VARIANCE_MINUTES) {
    return [];
  }

  return [
    {
      label: 'Pattern',
      tone: difference > 0 ? 'amber' : 'emerald',
      text: `Today's first check-in is ${Math.abs(difference)} minute${Math.abs(difference) === 1 ? '' : 's'} ${difference > 0 ? 'later' : 'earlier'} than the usual check-in time.`,
    },
  ];
}

function buildDuplicateInsight(duplicateCount: number): SchedulerInsight[] {
  if (duplicateCount === 0) {
    return [];
  }

  return [
    {
      label: 'Alert',
      tone: 'amber',
      text: `${duplicateCount} duplicate scan${duplicateCount === 1 ? '' : 's'} found within ${DUPLICATE_SCAN_THRESHOLD_MINUTES} minutes. Fix: keep one scan per entry and increase reader debounce if needed.`,
    },
  ];
}

function buildMissingInsights(openEntries: number, missingCheckIns: number): SchedulerInsight[] {
  const openEntryInsight: SchedulerInsight[] =
    openEntries > 0
      ? [
          {
            label: 'Alert',
            tone: 'rose',
            text: `${openEntries} open attendance entr${openEntries === 1 ? 'y is' : 'ies are'} missing a time out. Fix: scan out, or close the row if the exit scan was missed.`,
          },
        ]
      : [];

  const missingCheckInInsight: SchedulerInsight[] =
    missingCheckIns > 0
      ? [
          {
            label: 'Alert',
            tone: 'rose',
            text: `${missingCheckIns} row${missingCheckIns === 1 ? '' : 's'} is missing a time in. Fix: re-scan the card or backfill the entry if the first scan failed.`,
          },
        ]
      : [];

  return [...openEntryInsight, ...missingCheckInInsight];
}

function buildFallbackInsight(hasVisibleRecords: boolean): SchedulerInsight[] {
  if (hasVisibleRecords) {
    return [];
  }

  return [
    {
      label: 'Pattern',
      tone: 'slate',
      text: `No attendance records for the selected date. Scan a card or switch date to build the ${LOOKBACK_DAYS}-day baseline.`,
    },
  ];
}

function buildSchedulerInsights(recentRecords: Attendance[], visibleRecords: Attendance[]): SchedulerInsight[] {
  const trendSource = recentRecords.length > 0 ? recentRecords : visibleRecords;
  const trendMinutes = getTimeValues(trendSource);
  const averageMinutes = getAverageMinutes(trendMinutes);
  const firstCheckInMinutes = getFirstCheckInMinutes(visibleRecords);
  const duplicateCount = getDuplicateScanCount(trendSource);
  const openEntries = visibleRecords.filter((record) => record.timeIn && !record.timeOut).length;
  const missingCheckIns = visibleRecords.filter((record) => !record.timeIn).length;

  const insights = [
    ...(averageMinutes === null ? [] : buildAverageInsights(averageMinutes, trendMinutes.length)),
    ...buildVarianceInsight(firstCheckInMinutes, averageMinutes),
    ...buildDuplicateInsight(duplicateCount),
    ...buildMissingInsights(openEntries, missingCheckIns),
    ...buildFallbackInsight(visibleRecords.length > 0),
  ];

  if (insights.length > 0) {
    return insights.slice(0, 4);
  }

  return [
    {
      label: 'Pattern',
      tone: 'emerald',
      text: 'Attendance trend looks steady. Keep the same schedule cadence for this user or date.',
    },
  ];
}

export default function AttendancePage() {
  const [records, setRecords] = useState<Attendance[]>([]);
  const [recentRecords, setRecentRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingFromScan, setRefreshingFromScan] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [lastScanMessage, setLastScanMessage] = useState<string | null>(null);
  const [lastScanValidation, setLastScanValidation] = useState<ScanValidationSummary | null>(null);
  const [activeScannedUserId, setActiveScannedUserId] = useState<string | null>(null);
  const lastSeenScanId = useRef<string | null>(null);
  const [currentUser] = useState<StoredUser | null>(() => {
    if (globalThis.window === undefined) {
      return null;
    }

    const raw = globalThis.window.localStorage.getItem('user');
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
  const isAdminUser = currentUser?.role === 'admin';
  const currentUserId = currentUser?.id ? String(currentUser.id) : '';
  const scopeUserId = activeScannedUserId || (!isAdminUser && currentUserId ? currentUserId : null);

  const loadAttendance = useCallback(async (showLoading = true, userId?: string | null) => {
    if (showLoading) {
      setLoading(true);
    }

    const data = await attendanceService.getAttendance(filterDate, userId || undefined);
    setRecords(data);

    if (showLoading) {
      setLoading(false);
    }
  }, [filterDate]);

  const loadRecentRecords = useCallback(async (userId?: string | null) => {
    const dates = getLookbackDates(filterDate, LOOKBACK_DAYS);
    const results = await Promise.all(
      dates.map((date) => attendanceService.getAttendance(date, userId || undefined))
    );

    setRecentRecords(results.flat());
  }, [filterDate]);

  useEffect(() => {
    const timerId = globalThis.setTimeout(() => {
      void loadAttendance(true, activeScannedUserId);
    }, 0);

    return () => {
      globalThis.clearTimeout(timerId);
    };
  }, [activeScannedUserId, loadAttendance]);

  useEffect(() => {
    void loadRecentRecords(scopeUserId);
  }, [loadRecentRecords, scopeUserId]);

  const refreshFromScan = useCallback((scan: {
    uid: string;
    status: 'success' | 'failed' | 'not_registered';
    timestamp: string;
    userId?: number;
    reason?: string;
    fullName?: string;
    analysis?: ScanAnalysis | null;
  }) => {
    const scannedUserId = scan.userId ? String(scan.userId) : null;
    const isOwnScan = scannedUserId !== null && currentUserId !== '' && scannedUserId === currentUserId;

    if (!isAdminUser && !isOwnScan) {
      return;
    }

    const cardOwner = scan.fullName || (scannedUserId ? `User ${scannedUserId}` : 'Unknown user');
    let detailsSuffix = '';
    if (scan.status === 'success') {
      detailsSuffix = ` | ${cardOwner}`;
    } else if (scan.reason) {
      detailsSuffix = ` | ${scan.reason}`;
    }

    setLastScanMessage(
      `Card ${scan.uid} scanned (${scan.status}) at ${formatTimeToTwelveHour(formatAttendanceTimestampToTime(scan.timestamp))}${detailsSuffix}`
    );
    setLastScanValidation(buildScanValidationSummary(scan));
    setActiveScannedUserId(scannedUserId);
    setRefreshingFromScan(true);

    void loadAttendance(false, scannedUserId).finally(() => {
      setRefreshingFromScan(false);
    });

    void loadRecentRecords(scannedUserId);
  }, [currentUserId, isAdminUser, loadAttendance, loadRecentRecords]);

  const fetchLatestScan = useCallback(async (): Promise<LatestScanSummary | null> => {
    const response = await fetch('/api/iot/scans?limit=1&includeAnalysis=1', { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!payload.success || !Array.isArray(payload.scans) || payload.scans.length === 0) {
      return null;
    }

    return payload.scans[0] as LatestScanSummary;
  }, []);

  useRFID({
    autoConnect: true,
    onScan: (scan) => {
      refreshFromScan({
        uid: scan.uid,
        status: scan.status,
        timestamp: scan.timestamp,
        userId: scan.userId,
        reason: scan.reason,
        fullName: scan.userName,
        analysis: scan.analysis,
      });
    },
  });

  useEffect(() => {
    let isMounted = true;

    const syncLatestHttpScan = async () => {
      const latest = await fetchLatestScan();
      if (!isMounted || !latest) {
        return;
      }

      if (lastSeenScanId.current === latest.id) {
        return;
      }

      lastSeenScanId.current = latest.id;
      refreshFromScan({
        uid: latest.uid,
        status: latest.status,
        timestamp: latest.timestamp,
        userId: latest.user_id ?? undefined,
        reason: latest.reason ?? undefined,
        fullName: fullNameFromScan(latest),
        analysis: latest.analysis ?? null,
      });
    };

    const intervalId = globalThis.setInterval(() => {
      void syncLatestHttpScan();
    }, 3000);

    void syncLatestHttpScan();

    return () => {
      isMounted = false;
      globalThis.clearInterval(intervalId);
    };
  }, [fetchLatestScan, refreshFromScan]);

  const accountRecords = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    const accountId = currentUser.id ? String(currentUser.id) : '';
    const accountName = normalize(currentUser.full_name || currentUser.name || '');

    return records.filter((record) => {
      const sameId = accountId !== '' && record.employeeId === accountId;
      const recordName = normalize(record.employeeName);
      const sameName = accountName !== '' && (recordName === accountName || recordName.includes(accountName) || accountName.includes(recordName));
      return sameId || sameName;
    });
  }, [currentUser, records]);

  const getStatusClass = (status: Attendance['status']) => {
    if (status === 'present') return 'bg-emerald-100 text-emerald-800';
    if (status === 'late') return 'bg-amber-100 text-amber-800';
    if (status === 'on_leave') return 'bg-red-100 text-red-800';
    return 'bg-rose-100 text-rose-800';
  };

  let visibleRecords = accountRecords;
  if (isAdminUser || activeScannedUserId) {
    visibleRecords = records;
  }

  const filtered = isAdminUser
    ? visibleRecords.filter((record) =>
      record.employeeName.toLowerCase().includes(searchTerm.toLowerCase())
    )
    : visibleRecords;

  const schedulerInsights = useMemo(
    () => buildSchedulerInsights(recentRecords, visibleRecords),
    [recentRecords, visibleRecords]
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Attendance Log</h1>
          <p className="text-slate-500 mt-1">Live RFID + attendance in one page.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="border-slate-200">
            <Filter className="mr-2 h-4 w-4 text-slate-500" /> Filter
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-slate-900 font-semibold">
              <Sparkles className="h-4 w-4 text-sky-600" />
              AI Scheduler & Recommendations
            </div>
            <p className="text-xs text-slate-500 mt-1">Rule-based insights from attendance logs and recent scans.</p>
          </div>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            {scopeUserId ? 'Scoped view' : 'All logs'}
          </span>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          {schedulerInsights.map((insight) => (
            <div key={`${insight.label}-${insight.text}`} className={`rounded-lg border px-3 py-2 ring-1 ${INSIGHT_TONE_CLASSES[insight.tone]}`}>
              <div className="text-[11px] font-semibold uppercase tracking-wide mb-1">{insight.label}</div>
              <p className="text-sm leading-5">{insight.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          {isAdminUser ? (
            <div className="flex items-center gap-2 flex-1 min-w-50">
              <Search className="h-5 w-5 text-slate-400" />
              <Input
                placeholder="Search by employee name..."
                className="max-w-sm border-0 focus-visible:ring-0 px-0"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          ) : (
            <div className="text-sm text-slate-500">Showing your attendance records only.</div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Date:</span>
            <Input
              type="date"
              className="w-auto h-9"
              value={filterDate}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => {
                const selected = e.target.value;
                const today = format(new Date(), 'yyyy-MM-dd');

              if (selected > today) return;
              setFilterDate(selected);
              }}
            />
            {activeScannedUserId && (
              <Button
                variant="outline"
                className="h-9"
                onClick={() => {
                  setActiveScannedUserId(null);
                  setLastScanMessage(null);
                  setRefreshingFromScan(true);
                  void loadAttendance(false, null).finally(() => {
                    setRefreshingFromScan(false);
                  });
                }}
              >
                Clear Scan Filter
              </Button>
            )}
          </div>
        </div>

        {(lastScanMessage || refreshingFromScan) && (
          <div className="px-4 py-3 border-b border-slate-100 bg-emerald-50/70 flex items-center justify-between gap-3">
            <p className="text-sm text-emerald-800">{lastScanMessage ?? 'Refreshing attendance from live RFID scan...'}</p>
            {refreshingFromScan && <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />}
          </div>
        )}

        {lastScanValidation && (
          <div className={`px-4 py-3 border-b ${VALIDATION_TONE_CLASSES[lastScanValidation.tone]}`}>
            <div className="flex items-center gap-2 font-semibold text-sm">
              {lastScanValidation.tone === 'emerald' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )}
              {lastScanValidation.title}
            </div>
            <div className="mt-1 space-y-1 text-xs leading-5">
              {lastScanValidation.details.map((detail) => (
                <p key={detail}>{detail}</p>
              ))}
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Employee</TableHead>
              <TableHead>Time In</TableHead>
              <TableHead>Time Out</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-emerald-500" />
                  Loading attendance records...
                </TableCell>
              </TableRow>
            )}

            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-slate-500">
                  No records found for this date.
                </TableCell>
              </TableRow>
            )}

            {!loading && filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium text-slate-900">{r.employeeName}</div>
                  <div className="text-xs text-slate-500">ID: {r.employeeId}</div>
                  {r.anomalyDetected && (
                    <div className="flex items-center gap-1 text-[10px] text-amber-600 font-medium mt-1">
                      <AlertTriangle className="h-3 w-3" /> AI Alert: Flagged for review
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{r.timeIn ? formatTimeToTwelveHour(r.timeIn) : '--:--'}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{r.timeOut ? formatTimeToTwelveHour(r.timeOut) : '--:--'}</div>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusClass(r.status)}`}>
                    {r.status.replace('_', ' ')}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
