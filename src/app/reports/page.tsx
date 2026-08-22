'use client';

import { useEffect, useMemo, useState } from 'react';
import { RouteGuard } from '@/components/RouteGuard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Loader2, ClipboardList, FileCheck2, CalendarCheck2 } from 'lucide-react';
import { format } from 'date-fns';

type AuditEntry = {
  id: string;
  timestamp: string | null;
  actorName: string | null;
  actorRole: string | null;
  category: 'Clearance' | 'Schedule';
  action: string;
  target: string;
  details: string | null;
};

const ACTION_BADGE_CLASS: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-800',
  approve: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  reject: 'bg-rose-100 text-rose-800',
  note_added: 'bg-slate-100 text-slate-700',
  status_changed: 'bg-amber-100 text-amber-800',
  submitted: 'bg-amber-100 text-amber-800',
};

const CATEGORY_BADGE_CLASS: Record<AuditEntry['category'], string> = {
  Clearance: 'bg-[#0F172A]/5 text-[#0F172A]',
  Schedule: 'bg-[#D4A017]/10 text-[#8A6510]',
};

function formatTimestamp(value: string | null) {
  if (!value) return 'Unknown time';
  try {
    return format(new Date(value), 'MMM d, yyyy h:mm a');
  } catch {
    return value;
  }
}

export default function ReportsPage() {
  return (
    <RouteGuard requiredRoles={['admin']} fallbackPath="/dashboard/faculty">
      <AuditTrailContent />
    </RouteGuard>
  );
}

function AuditTrailContent() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | AuditEntry['category']>('all');

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/audit-log', { cache: 'no-store' });
        const json = await res.json();
        if (!mounted) return;
        setEntries(Array.isArray(json.data) ? json.data : []);
      } catch (err) {
        console.error('[ReportsPage] failed to load audit log', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return entries.filter((entry) => {
      const matchesCategory = categoryFilter === 'all' || entry.category === categoryFilter;
      if (!matchesCategory) return false;

      if (!term) return true;
      return (
        (entry.actorName ?? '').toLowerCase().includes(term) ||
        (entry.actorRole ?? '').toLowerCase().includes(term) ||
        entry.action.toLowerCase().includes(term) ||
        entry.target.toLowerCase().includes(term) ||
        (entry.details ?? '').toLowerCase().includes(term)
      );
    });
  }, [entries, searchTerm, categoryFilter]);

  const stats = useMemo(() => {
    const clearanceCount = entries.filter((e) => e.category === 'Clearance').length;
    const scheduleCount = entries.filter((e) => e.category === 'Schedule').length;
    return { total: entries.length, clearanceCount, scheduleCount };
  }, [entries]);

  const getActionBadgeClass = (action: string) =>
    ACTION_BADGE_CLASS[action.toLowerCase()] ?? 'bg-slate-100 text-slate-700';

  let tableRows: React.ReactNode;
  if (loading) {
    tableRows = (
      <TableRow>
        <TableCell colSpan={5} className="text-center py-10 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-slate-400" />
          Loading audit trail...
        </TableCell>
      </TableRow>
    );
  } else if (filtered.length === 0) {
    tableRows = (
      <TableRow>
        <TableCell colSpan={5} className="text-center py-10 text-slate-500">
          No audit entries found.
        </TableCell>
      </TableRow>
    );
  } else {
    tableRows = filtered.map((entry) => (
      <TableRow key={entry.id}>
        <TableCell className="text-sm text-slate-600 whitespace-nowrap">
          {formatTimestamp(entry.timestamp)}
        </TableCell>
        <TableCell>
          <div className="text-sm font-medium text-slate-900">{entry.actorName ?? 'System'}</div>
          {entry.actorRole && (
            <div className="text-xs capitalize text-slate-500">{entry.actorRole.replaceAll('_', ' ')}</div>
          )}
        </TableCell>
        <TableCell>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CATEGORY_BADGE_CLASS[entry.category]}`}>
            {entry.category}
          </span>
        </TableCell>
        <TableCell>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getActionBadgeClass(entry.action)}`}>
            {entry.action.replaceAll('_', ' ')}
          </span>
        </TableCell>
        <TableCell>
          <div className="text-sm text-slate-800">{entry.target}</div>
          {entry.details && <div className="mt-0.5 text-xs text-slate-500">{entry.details}</div>}
        </TableCell>
      </TableRow>
    ));
  }

  return (
    <RouteGuardless>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D4A017]">Institutional reporting</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Audit Trail Report</h1>
            <p className="text-slate-500">A record of clearance and schedule approval actions performed by all users.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Actions</p>
                <p className="text-2xl font-semibold text-slate-900">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F172A]/5 text-[#0F172A]">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Clearance Actions</p>
                <p className="text-2xl font-semibold text-slate-900">{stats.clearanceCount}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#D4A017]/10 text-[#8A6510]">
                <CalendarCheck2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Schedule Actions</p>
                <p className="text-2xl font-semibold text-slate-900">{stats.scheduleCount}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-50">
              <Search className="h-5 w-5 text-slate-400" />
              <Input
                placeholder="Search by user, action, or target..."
                className="max-w-sm border-0 focus-visible:ring-0 px-0"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={categoryFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setCategoryFilter('all')}
              >
                All
              </Button>
              <Button
                type="button"
                size="sm"
                variant={categoryFilter === 'Clearance' ? 'default' : 'outline'}
                onClick={() => setCategoryFilter('Clearance')}
              >
                Clearance
              </Button>
              <Button
                type="button"
                size="sm"
                variant={categoryFilter === 'Schedule' ? 'default' : 'outline'}
                onClick={() => setCategoryFilter('Schedule')}
              >
                Schedule
              </Button>
            </div>
          </div>

          <div className="max-h-128 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Performed By</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{tableRows}</TableBody>
            </Table>
          </div>
        </div>
      </div>
    </RouteGuardless>
  );
}

// no-op wrapper kept for structural symmetry with RouteGuard usage patterns elsewhere;
// RouteGuard is already applied one level up in ReportsPage.
function RouteGuardless({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}