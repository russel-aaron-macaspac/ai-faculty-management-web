'use client';

import { useState, useEffect, useMemo } from 'react';
import { RouteGuard } from '@/components/RouteGuard';
import { clearanceService } from '@/services/clearanceService';
import { Clearance } from '@/types/clearance';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, FileText, Loader2, Search, Check, X, Clock, MessageSquare, Trash2 } from 'lucide-react';
import { StoredUser } from '@/lib/stringUtils';
import { toast } from '@/lib/toast';
import { PopupDialog } from '@/components/ui/popup-dialog';
import { ClearanceRequirementsPanel } from '@/components/ClearanceRequirementsPanel';

const PROGRAM_CHAIR_OFFICE_NAME = 'Program Chair';
type ClearanceStatusFilter = 'all' | 'approved' | 'rejected' | 'pending';

export default function ProgramChairApprovalsPage() {
  return (
    <RouteGuard requiredRoles={['program_chair', 'admin']} fallbackPath="/dashboard/faculty">
      <ProgramChairApprovalsContent />
    </RouteGuard>
  );
}

function ProgramChairApprovalsContent() {
  const [records, setRecords] = useState<Clearance[]>([]);
  const [offices, setOffices] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<ClearanceStatusFilter>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [remarkRecord, setRemarkRecord] = useState<Clearance | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<Clearance | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [remarkSaving, setRemarkSaving] = useState(false);
  const [rejectionPrompt, setRejectionPrompt] = useState<{ record: Clearance; reason: string } | null>(null);
  const [deleteReminder, setDeleteReminder] = useState<{ record: Clearance; noteId: string } | null>(null);

  const loadData = async (actor?: StoredUser | null) => {
    setLoading(true);
    try {
      const offices = await clearanceService.getOffices();
      setOffices(offices || []);
      const matched = (offices || []).find(
        (o: { name?: string }) => (o.name || '').toLowerCase() === PROGRAM_CHAIR_OFFICE_NAME.toLowerCase()
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
    ).filter((record) => {
      const normalizedStatus = record.status === 'submitted' ? 'pending' : record.status;
      const matchesYear = yearFilter === 'all' || record.submissionDate?.startsWith(yearFilter) === true;
      const matchesStatus = statusFilter === 'all' || normalizedStatus === statusFilter;
      return matchesYear && matchesStatus;
    });
  }, [records, searchTerm, yearFilter, statusFilter]);

  const clearanceYears = useMemo(() => {
    const years = new Set(
      records
        .map((record) => record.submissionDate?.slice(0, 4))
        .filter((year): year is string => Boolean(year && /^\d{4}$/.test(year)))
    );
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [records]);

  const handleDecision = async (record: Clearance, decision: 'approved' | 'rejected' | 'pending') => {
    if (!currentUser) return;
    if (!record.id) return;

    if (decision === 'rejected') {
      setRejectionPrompt({ record, reason: '' });
      return;
    }
    await saveDecision(record, decision);
  };

  const saveDecision = async (record: Clearance, decision: 'approved' | 'rejected' | 'pending', reason?: string) => {
    if (!currentUser) return;

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
    setDeleteReminder({ record, noteId });
  };

  const deleteReminderNote = async () => {
    if (!deleteReminder) return;
    try {
      await clearanceService.deleteClearanceNote(deleteReminder.record.id, deleteReminder.noteId);
      setDeleteReminder(null);
      setSelectedRecord((record) => record
        ? { ...record, notes: record.notes?.filter((note) => note.id !== deleteReminder.noteId) }
        : record);
      await loadData(currentUser);
      toast({ title: 'Remark deleted', description: 'The requirement reminder was removed.', type: 'success' });
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Could not delete the remark.', type: 'error' });
    }
  };

  const handleOpenFile = async (filePath: string, filename: string) => {
    try {
      const url = await clearanceService.getFileUrl(filePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast({
        title: 'Document unavailable',
        description: `${filename}: ${error instanceof Error ? error.message : 'Could not open the document.'}`,
        type: 'error',
      });
    }
  };

  const getStatusClass = (status: Clearance['status']) => {
    if (status === 'approved') return 'bg-emerald-100 text-emerald-800';
    if (status === 'pending' || status === 'submitted') return 'bg-amber-100 text-amber-800';
    if (status === 'rejected') return 'bg-rose-100 text-rose-800';
    return 'bg-slate-100 text-slate-800';
  };

  const getStatusLabel = (status: Clearance['status']) => status === 'submitted' ? 'pending' : status;

  const formatRemarkDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  let tableRows: React.ReactNode;
  if (loading) {
    tableRows = (
      <TableRow>
        <TableCell colSpan={3} className="text-center py-10 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-red-500" />
          Loading clearance data...
        </TableCell>
      </TableRow>
    );
  } else if (filtered.length === 0) {
    tableRows = (
      <TableRow>
        <TableCell colSpan={3} className="text-center py-10 text-slate-500">
          No documents found.
        </TableCell>
      </TableRow>
    );
  } else {
    tableRows = filtered.map((record) => (
      <TableRow
        key={record.id}
        className="cursor-pointer hover:bg-slate-50"
        onClick={() => setSelectedRecord(record)}
      >
        <TableCell>
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <button
                type="button"
                className="text-left font-semibold text-slate-800 underline-offset-4 hover:text-red-700 hover:underline"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedRecord(record);
                }}
              >
                {record.employeeName}
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            {(record.filePath ? 1 : 0) + (record.attachments?.length ?? 0)} document{(record.filePath ? 1 : 0) + (record.attachments?.length ?? 0) === 1 ? '' : 's'} uploaded
          </p>
          {record.notes?.length ? (
            <p className="text-sm text-amber-700">
              {record.notes.length} office remark{record.notes.length === 1 ? '' : 's'}
            </p>
          ) : null}
        </TableCell>
        <TableCell className="text-sm text-slate-600">{record.submissionDate || 'Not submitted'}</TableCell>
        <TableCell>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusClass(record.status)}`}>
            {record.status === 'approved' && <CheckCircle2 className="h-3 w-3" />}
            {record.status}
          </span>
        </TableCell>
      </TableRow>
    ));
  }

  return (
    <div className="space-y-6">
      <ClearanceRequirementsPanel user={currentUser} offices={offices} />

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
              placeholder="Example: Submit the updated Program Chair clearance document."
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
      <PopupDialog
        open={Boolean(rejectionPrompt)}
        onOpenChange={(open) => !open && setRejectionPrompt(null)}
        title="Reject clearance"
        description="Provide the reason this faculty clearance needs to be corrected before approval."
        confirmLabel="Reject clearance"
        destructive
        prompt
        required
        value={rejectionPrompt?.reason ?? ''}
        onValueChange={(reason) => rejectionPrompt && setRejectionPrompt({ ...rejectionPrompt, reason })}
        placeholder="Enter rejection reason"
        onConfirm={() => {
          if (!rejectionPrompt) return;
          const { record, reason } = rejectionPrompt;
          setRejectionPrompt(null);
          void saveDecision(record, 'rejected', reason.trim());
        }}
      />
      <PopupDialog
        open={Boolean(deleteReminder)}
        onOpenChange={(open) => !open && setDeleteReminder(null)}
        title="Delete requirement reminder?"
        description="This reminder will be removed from the clearance record."
        confirmLabel="Delete reminder"
        destructive
        onConfirm={() => void deleteReminderNote()}
      />

      <Dialog open={Boolean(selectedRecord)} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="break-words">{selectedRecord?.requiredDocument}</DialogTitle>
            <DialogDescription>{selectedRecord?.employeeName}</DialogDescription>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-5">
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getStatusClass(selectedRecord.status)}`}>
                    {getStatusLabel(selectedRecord.status)}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Submitted</p>
                  <p className="mt-1 font-medium text-slate-800">{selectedRecord.submissionDate || 'Not submitted'}</p>
                </div>
                {selectedRecord.reviewedBy && (
                  <div>
                    <p className="text-xs text-slate-500">Reviewed by</p>
                    <p className="mt-1 font-medium text-slate-800">{selectedRecord.reviewedBy}</p>
                  </div>
                )}
                {selectedRecord.reviewedAt && (
                  <div>
                    <p className="text-xs text-slate-500">Reviewed at</p>
                    <p className="mt-1 font-medium text-slate-800">{selectedRecord.reviewedAt}</p>
                  </div>
                )}
              </div>

              {(selectedRecord.rejectionReason || selectedRecord.validationWarning) && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  <p className="font-semibold">Follow-up needed</p>
                  <p className="mt-1">{selectedRecord.rejectionReason || selectedRecord.validationWarning}</p>
                </div>
              )}

              <div className="min-w-0 space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">Uploaded files</h3>
                {selectedRecord.filePath || selectedRecord.attachments?.length ? (
                  <div className="min-w-0 space-y-2">
                    {selectedRecord.filePath && (
                      <Button
                        type="button"
                        variant="outline"
                        className="flex w-full max-w-full min-w-0 justify-start overflow-hidden text-left"
                        onClick={() => void handleOpenFile(selectedRecord.filePath!, selectedRecord.originalFilename || 'Submitted document')}
                        title={selectedRecord.originalFilename || 'Submitted document'}
                      >
                        <FileText className="mr-2 h-4 w-4 shrink-0 text-red-600" />
                        <span className="block w-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{selectedRecord.originalFilename || 'Submitted document'}</span>
                      </Button>
                    )}
                    {selectedRecord.attachments?.map((attachment) => (
                      <Button
                        key={attachment.id}
                        type="button"
                        variant="outline"
                        className="flex w-full max-w-full min-w-0 justify-start overflow-hidden text-left"
                        onClick={() => void handleOpenFile(attachment.filePath, attachment.originalFilename)}
                        title={attachment.originalFilename}
                      >
                        <FileText className="mr-2 h-4 w-4 shrink-0 text-red-600" />
                        <span className="block w-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{attachment.originalFilename}</span>
                      </Button>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-500">No files uploaded yet.</p>}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">Remarks</h3>
                {selectedRecord.notes?.length ? selectedRecord.notes.map((note) => (
                  <div key={note.id} className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <div>
                      <p>{note.content}</p>
                      <p className="mt-1 text-xs text-amber-800">{note.author_name} · {formatRemarkDate(note.created_at)}</p>
                    </div>
                    <Button type="button" size="icon-sm" variant="ghost" className="shrink-0 text-amber-800 hover:bg-amber-100" onClick={() => void handleDeleteRemark(selectedRecord, note.id)} aria-label="Delete requirement reminder">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )) : <p className="text-sm text-slate-500">No remarks yet.</p>}
              </div>
            </div>
          )}
          {selectedRecord && (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setRemarkRecord(selectedRecord); setRemarkText(''); setSelectedRecord(null); }}>
                <MessageSquare className="mr-2 h-4 w-4" />Remarks
              </Button>
              <Button type="button" variant="destructive" disabled={selectedRecord.status === 'rejected' || actionLoadingId === selectedRecord.id} onClick={() => { setSelectedRecord(null); void handleDecision(selectedRecord, 'rejected'); }}>
                <X className="mr-2 h-4 w-4" />Reject
              </Button>
              <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" disabled={selectedRecord.status === 'approved' || actionLoadingId === selectedRecord.id} onClick={() => { setSelectedRecord(null); void handleDecision(selectedRecord, 'approved'); }}>
                <Check className="mr-2 h-4 w-4" />Approve
              </Button>
              <Button type="button" variant="outline" disabled={selectedRecord.status === 'pending' || actionLoadingId === selectedRecord.id} onClick={() => { setSelectedRecord(null); void handleDecision(selectedRecord, 'pending'); }}>
                <Clock className="mr-2 h-4 w-4" />Pending
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
          <Search className="h-5 w-5 text-slate-400" />
          <Input
            placeholder="Search by faculty or department"
            className="max-w-sm border-0 px-0 focus-visible:ring-0"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <label className="sr-only" htmlFor="program-chair-year-filter">Filter by year</label>
          <select
            id="program-chair-year-filter"
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
            value={yearFilter}
            onChange={(event) => setYearFilter(event.target.value)}
          >
            <option value="all">All years</option>
            {clearanceYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          <label className="sr-only" htmlFor="program-chair-status-filter">Filter by status</label>
          <select
            id="program-chair-status-filter"
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm capitalize text-slate-700"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ClearanceStatusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <div className="max-h-128 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Faculty / Department</TableHead>
                <TableHead>Submission Date</TableHead>
                <TableHead>Status</TableHead>
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