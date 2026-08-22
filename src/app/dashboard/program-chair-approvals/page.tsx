'use client';

import { useState, useEffect, useMemo } from 'react';
import { RouteGuard } from '@/components/RouteGuard';
import { clearanceService } from '@/services/clearanceService';
import { Clearance } from '@/types/clearance';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { CheckCircle2, AlertTriangle, FileText, Loader2, Search, Check, X, Clock } from 'lucide-react';
import { StoredUser } from '@/lib/stringUtils';
import { toast } from '@/lib/toast';

const PROGRAM_CHAIR_OFFICE_NAME = 'Program Chair';

export default function ProgramChairApprovalsPage() {
  return (
    <RouteGuard requiredRoles={['program_chair', 'admin']} fallbackPath="/dashboard/faculty">
      <ProgramChairApprovalsContent />
    </RouteGuard>
  );
}

function ProgramChairApprovalsContent() {
  const [records, setRecords] = useState<Clearance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const offices = await clearanceService.getOffices();
      const matched = (offices || []).find(
        (o: any) => (o.name || '').toLowerCase() === PROGRAM_CHAIR_OFFICE_NAME.toLowerCase()
      );

      if (matched?.id) {
        const data = await clearanceService.getClearances(undefined, matched.id);
        setRecords((data || []) as Clearance[]);
      } else {
        setRecords([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) return;
    try {
      setCurrentUser(JSON.parse(raw) as StoredUser);
    } catch {
      // ignore
    }
    void loadData();
  }, []);

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return records.filter((record) =>
      (record.employeeName ?? '').toLowerCase().includes(term) ||
      (record.requiredDocument ?? '').toLowerCase().includes(term)
    );
  }, [records, searchTerm]);

  const handleDecision = async (record: Clearance, decision: 'approved' | 'rejected' | 'pending') => {
    if (!currentUser) return;
    if (!record.id) return;

    let reason: string | undefined;
    if (decision === 'rejected') {
      reason = prompt('Enter rejection reason:') || undefined;
    }

    setActionLoadingId(record.id);
    try {
      const reviewerId = currentUser.supabase_id || String(currentUser.id || '');
      await clearanceService.updateStatus(record.id, decision, reason, reviewerId);
      await loadData();

      let toastType: 'success' | 'error' | 'info' = 'info';
      if (decision === 'approved') toastType = 'success';
      else if (decision === 'rejected') toastType = 'error';

      toast({ title: 'Decision Saved', description: `Record ${decision}.`, type: toastType });
    } catch (err) {
      toast({
        title: 'Decision Failed',
        description: err instanceof Error ? err.message : 'Could not update status.',
        type: 'error',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusClass = (status: Clearance['status']) => {
    if (status === 'approved') return 'bg-emerald-100 text-emerald-800';
    if (status === 'submitted') return 'bg-red-100 text-red-800';
    if (status === 'rejected') return 'bg-rose-100 text-rose-800';
    return 'bg-slate-100 text-slate-800';
  };

  let tableRows: React.ReactNode;
  if (loading) {
    tableRows = (
      <TableRow>
        <TableCell colSpan={4} className="text-center py-10 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-red-500" />
          Loading clearance data...
        </TableCell>
      </TableRow>
    );
  } else if (filtered.length === 0) {
    tableRows = (
      <TableRow>
        <TableCell colSpan={4} className="text-center py-10 text-slate-500">
          No documents found.
        </TableCell>
      </TableRow>
    );
  } else {
    tableRows = filtered.map((record) => (
      <TableRow key={record.id}>
        <TableCell>
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="text-slate-800 font-semibold">{record.employeeName}</span>
            </div>
          </div>
          {record.validationWarning && (
            <div className="text-xs text-rose-600 mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Reason: {record.validationWarning}
            </div>
          )}
        </TableCell>
        <TableCell className="text-sm text-slate-600">{record.submissionDate || 'Not submitted'}</TableCell>
        <TableCell>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusClass(record.status)}`}>
            {record.status === 'approved' && <CheckCircle2 className="h-3 w-3" />}
            {record.status}
          </span>
        </TableCell>
        <TableCell className="text-right">
          <div className="inline-flex flex-col gap-1 sm:gap-2 sm:flex-row">
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={actionLoadingId === record.id || record.status === 'approved'}
              onClick={() => void handleDecision(record, 'approved')}
            >
              {actionLoadingId === record.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={actionLoadingId === record.id || record.status === 'rejected'}
              onClick={() => void handleDecision(record, 'rejected')}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Reject
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={actionLoadingId === record.id || record.status === 'pending'}
              onClick={() => void handleDecision(record, 'pending')}
            >
              <Clock className="mr-1 h-3.5 w-3.5" />
              Pending
            </Button>
          </div>
        </TableCell>
      </TableRow>
    ));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Program Chair Clearance Approvals</h1>
          <p className="text-slate-500">Review and approve faculty clearance requests for the Program Chair office.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <Search className="h-5 w-5 text-slate-400" />
          <Input
            placeholder="Search by faculty name..."
            className="hidden md:block max-w-sm border-0 focus-visible:ring-0 px-0"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="max-h-128 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Faculty</TableHead>
                <TableHead>Submission Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}