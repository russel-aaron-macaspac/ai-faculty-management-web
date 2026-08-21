'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/dashboard/StatCards';
import { scheduleService } from '@/services/scheduleService';
import { Schedule } from '@/types/schedule';
import { formatTimeToTwelveHour } from '@/lib/timeUtils';
import { toast } from '@/lib/toast';
import { CheckCircle2, Clock, Loader2, XCircle, CalendarCheck2 } from 'lucide-react';

type LocalUser = {
  id: string;
  role: string;
  full_name?: string;
  name?: string;
};


export default function ScheduleApprovalsPage() {
  // Allow dean, ovpaa, registrar, and admin to access
  return (
    <RouteGuard requiredRoles={['dean', 'ovpaa', 'registrar', 'admin']} fallbackPath="/dashboard/faculty">
      <ScheduleApprovalsContent />
    </RouteGuard>
  );
}


function ScheduleApprovalsContent() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingSchedules, setPendingSchedules] = useState<Schedule[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Determine role for this approval step
  let approvalRole: 'dean' | 'ovpaa' | 'registrar' = 'dean';
  let approvalLabel = 'Dean';
  if (user?.role === 'ovpaa') {
    approvalRole = 'ovpaa';
    approvalLabel = 'OVPAA';
  } else if (user?.role === 'registrar') {
    approvalRole = 'registrar';
    approvalLabel = 'Registrar';
  }

  useEffect(() => {
    const raw = localStorage.getItem('user');
    const parsed = raw ? (JSON.parse(raw) as LocalUser) : null;
    setUser(parsed);
  }, []);

  const loadSchedules = async () => {
    setLoading(true);
    try {
      // Fetch pending approvals for the correct role
      const data = await scheduleService.getPendingApprovals(approvalRole);
      setPendingSchedules(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const stats = useMemo(() => {
    const total = pendingSchedules.length;
    const facultyCount = new Set(pendingSchedules.map((item) => item.facultyId || item.facultyName)).size;
    const approvedReady = pendingSchedules.length;

    return { total, facultyCount, approvedReady };
  }, [pendingSchedules]);

  const groupedSchedules = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        name: string;
        schedules: Schedule[];
      }
    >();

    pendingSchedules.forEach((item) => {
      const key = String(item.facultyId || item.facultyName || item.id);
      const name = item.facultyName || 'Unknown Faculty';
      const existing = groups.get(key);

      if (existing) {
        existing.schedules.push(item);
        return;
      }

      groups.set(key, {
        key,
        name,
        schedules: [item],
      });
    });

    return Array.from(groups.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [pendingSchedules]);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const handleDecision = async (item: Schedule, action: 'approve' | 'reject') => {
    if (!user) return;

    const remarks = action === 'reject' ? globalThis.prompt('Enter rejection remarks (optional):', '') || '' : '';

    setSaving(true);
    try {
      await scheduleService.submitApprovalDecision({
        scheduleId: item.id,
        role: approvalRole,
        action,
        remarks,
        actorId: String(user.id),
      });

      await loadSchedules();
      toast({
        title: 'Done',
        description: action === 'approve' ? `Schedule approved by ${approvalLabel}.` : `Schedule rejected by ${approvalLabel}.`,
        type: 'success',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update approval.';
      toast({ title: 'Approval Failed', description: message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleGroupDecision = async (groupSchedules: Schedule[], action: 'approve' | 'reject') => {
    if (!user || groupSchedules.length === 0) return;

    const remarks = action === 'reject' ? globalThis.prompt(`Enter rejection remarks for this faculty group (optional):`, '') || '' : '';

    setSaving(true);
    try {
      const results = await Promise.allSettled(
        groupSchedules.map((item) =>
          scheduleService.submitApprovalDecision({
            scheduleId: item.id,
            role: approvalRole,
            action,
            remarks,
            actorId: String(user.id),
          })
        )
      );

      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length > 0) {
        throw new Error('Some schedules could not be processed.');
      }

      await loadSchedules();
      toast({
        title: 'Done',
        description:
          action === 'approve'
            ? `Faculty schedule group approved by ${approvalLabel}.`
            : `Faculty schedule group rejected by ${approvalLabel}.`,
        type: 'success',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update approvals.';
      toast({ title: 'Approval Failed', description: message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  let queueContent: React.ReactElement;
  if (loading) {
    queueContent = (
      <div className="py-10 text-center text-slate-500">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading pending schedules...
      </div>
    );
  } else if (pendingSchedules.length === 0) {
    queueContent = <div className="py-10 text-center text-slate-500">No schedules are waiting for dean approval.</div>;
  } else {
    queueContent = (
      <div className="space-y-4">
        {groupedSchedules.map((group) => (
          <Card key={group.key} className="overflow-hidden border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-200 bg-slate-50/70">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <button type="button" onClick={() => toggleGroup(group.key)} className="text-left">
                  <CardTitle>{group.name}</CardTitle>
                  <CardDescription>
                    {group.schedules.length} schedule{group.schedules.length === 1 ? '' : 's'} awaiting {approvalLabel} approval
                  </CardDescription>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => void handleGroupDecision(group.schedules, 'approve')}
                    disabled={saving}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Approve All
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => void handleGroupDecision(group.schedules, 'reject')} disabled={saving}>
                    <XCircle className="mr-1 h-4 w-4" /> Reject All
                  </Button>
                  <button type="button" onClick={() => toggleGroup(group.key)} className="text-sm font-medium text-slate-500">
                    {expandedGroups[group.key] ? 'Collapse section' : 'Expand section'}
                  </button>
                </div>
              </div>
            </CardHeader>
            {expandedGroups[group.key] && (
              <CardContent className="pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Remarks</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.schedules.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.subject?.code} - {item.subject?.name}
                        </TableCell>
                        <TableCell>{item.section || '—'}</TableCell>
                        <TableCell>
                          {item.day} {formatTimeToTwelveHour(item.startTime)} - {formatTimeToTwelveHour(item.endTime)}
                        </TableCell>
                        <TableCell>{item.status}</TableCell>
                        <TableCell>
                          {item.status === 'rejected' && item.remarks ? (
                            <span className="text-red-600">{item.remarks}</span>
                          ) : (
                            <span className="text-slate-400">{item.remarks ? item.remarks : '-'} </span>
                          )}
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          <Button
                            type="button"
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => handleDecision(item, 'approve')}
                            disabled={saving}
                          >
                            <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
                          </Button>
                          <Button type="button" size="sm" variant="destructive" onClick={() => handleDecision(item, 'reject')} disabled={saving}>
                            <XCircle className="mr-1 h-4 w-4" /> Reject
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{approvalLabel} Schedule Approvals</h1>
        <p className="mt-1 text-slate-500">
          Review the overall schedules created by Imelda Tolentino before they move to the next approval step.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Pending Schedules" value={stats.total} icon={Clock} description={`Waiting for ${approvalLabel.toLowerCase()} approval`} />
        <StatCard title="Faculty Affected" value={stats.facultyCount} icon={CalendarCheck2} description="Unique faculty members" />
        <StatCard title="Ready for Next Step" value={stats.approvedReady} icon={CheckCircle2} description="Can move forward after approval" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending Schedule Queue</CardTitle>
          <CardDescription>Approve or reject each created schedule individually. Rejected schedules stop the workflow.</CardDescription>
        </CardHeader>
        <CardContent>
          {queueContent}
        </CardContent>
      </Card>
    </div>
  );
}