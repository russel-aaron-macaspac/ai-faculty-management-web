'use client';

import { useState, useEffect, useMemo } from 'react';
import { RouteGuard } from '@/components/RouteGuard';
import { clearanceService } from '@/services/clearanceService';
import { Clearance } from '@/types/clearance';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, AlertTriangle, FileText, Loader2, Search, Check, X, Clock, MessageSquare, Trash2 } from 'lucide-react';
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
  const [remarkRecord, setRemarkRecord] = useState<Clearance | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [remarkSaving, setRemarkSaving] = useState(false);

  const loadData = async (actor?: StoredUser | null) => {
    setLoading(true);
    try {
      const offices = await clearanceService.getOffices();
      const matched = (offices || []).find(
        (o: any) => (o.name || '').toLowerCase() === PROGRAM_CHAIR_OFFICE_NAME.toLowerCase()
      );

      if (matched?.id) {
        const scopedActor = actor ?? currentUser;
        const data = await clearanceService.getClearances(undefined, matched.id, {
          actorId: scopedActor?.supabase_id || String(scopedActor?.id || ''),
          actorRole: scopedActor?.role,
        });
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
    if (!raw) {
      void loadData();
      return;
    }
    try {
      const parsed = JSON.parse(raw) as StoredUser;
      setCurrentUser(parsed);
      void loadData(parsed);
    } catch {
      void loadData();
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      await clearanceService.updateStatus(record.id, decision, reason, reviewerId, currentUser.full_name, currentUser.role);
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

  const handleAddRemark = async () => {
    if (!currentUser || !remarkRecord?.id || !remarkText.trim()) return;

    setRemarkSaving(true);
    try {
      await clearanceService.addClearanceNote(
        remarkRecord.id,
        remarkText.trim(),
        String(currentUser.id),
        currentUser.full_name || currentUser.name || 'Program Chair',
        'remark'
      );
      setRemarkRecord(null);
      setRemarkText('');
      await loadData(currentUser);
      toast({ title: 'Remark sent', description: 'The faculty member was notified of the requirement reminder.', type: 'success' });
    } catch (err) {
      toast({ title: 'Remark failed', description: err instanceof Error ? err.message : 'Could not send the remark.', type: 'error' });
    } finally {
      setRemarkSaving(false);
    }
  };

  const handleDeleteRemark = async (record: Clearance, noteId: string) => {
    if (!window.confirm('Delete this requirement reminder?')) return;

    try {
      await clearanceService.deleteClearanceNote(record.id, noteId);
      await loadData(currentUser);
      toast({ title: 'Remark deleted', description: 'The requirement reminder was removed.', type: 'success' });
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Could not delete the remark.', type: 'error' });
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
          {record.notes?.map((note) => (
            <div key={note.id} className="mt-2 flex items-start justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
              <span><span className="font-semibold">Requirement reminder:</span> {note.content}</span>
              <Button type="button" size="icon-sm" variant="ghost" className="shrink-0 text-amber-800 hover:bg-amber-100" onClick={() => void handleDeleteRemark(record, note.id)} aria-label="Delete requirement reminder">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
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
              variant="outline"
              disabled={actionLoadingId === record.id}
              onClick={() => {
                setRemarkRecord(record);
                setRemarkText('');
              }}
            >
              <MessageSquare className="mr-1 h-3.5 w-3.5" />
              Add remark
            </Button>
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

      <Dialog open={Boolean(remarkRecord)} onOpenChange={(open) => !open && setRemarkRecord(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Requirement reminder for {remarkRecord?.employeeName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-slate-500">Add the specific requirement this faculty member must submit before approval.</p>
            <textarea
              className="min-h-28 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D4A017]/40"
              value={remarkText}
              onChange={(event) => setRemarkText(event.target.value)}
              placeholder="Example: Submit the updated program chair clearance document."
              aria-label="Requirement reminder"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRemarkRecord(null)}>Cancel</Button>
              <Button type="button" onClick={() => void handleAddRemark()} disabled={remarkSaving || !remarkText.trim()}>
                {remarkSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send reminder
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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