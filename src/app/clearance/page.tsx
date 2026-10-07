'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { clearanceService } from '@/services/clearanceService';
import { Clearance } from '@/types/clearance';
import { Faculty } from '@/types/faculty';
import { facultyService } from '@/services/facultyService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { UploadCloud, CheckCircle2, AlertTriangle, FileText, Loader2, Search, Check, X, Clock, Users, ClipboardCheck, ShieldCheck, MessageSquare, Trash2, Printer } from 'lucide-react';
import { FACULTY_REQUIRED_OFFICES } from '@/lib/clearanceOffices';
import { isApprovalOfficer, getClearancePageInfo, isFacultyLikeRole } from '@/lib/roleConfig';
import { StoredUser, normalize } from '@/lib/stringUtils';
import { toast } from '@/lib/toast';

const OFFICER_OFFICE_MAP: Record<string, number> = {
  dlrc:         1,
  pmo:          2,
  laboratory:   3,
  ict:          4,
  ceso:         5,
  programchair: 6,
  dean:         7,
  registrar:    8,
  ovprel:       9,
  ovpaa:        10,
  account:      11,
  treasury:     12,
  hro:          13,
};

type FacultyStepRecord = Clearance & {
  _isRequiredPlaceholder?: boolean;
};

type AdminFacultyProgress = {
  id: string;
  name: string;
  department: string;
  records: Clearance[];
  submitted: number;
  approved: number;
  rejected: number;
  completion: number;
};

export default function ClearancePage() {
  const [records, setRecords] = useState<Clearance[]>([]);
  const [offices, setOffices] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submittingOfficeId, setSubmittingOfficeId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [facultyMembers, setFacultyMembers] = useState<Faculty[]>([]);
  const [docName, setDocName] = useState('Safety Training Certificate');
  const [uploadError, setUploadError] = useState('');
  const [remarkRecord, setRemarkRecord] = useState<Clearance | null>(null);
  const [documentRecord, setDocumentRecord] = useState<Clearance | null>(null);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [shouldPrintAfterPreviewClose, setShouldPrintAfterPreviewClose] = useState(false);
  const [academicYear] = useState(() => {
    const today = new Date();
    const startYear = today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1;
    return `${startYear}-${startYear + 1}`;
  });
  const [semester] = useState(() => (new Date().getMonth() >= 5 ? '1st Semester' : '2nd Semester'));
  const [remarkText, setRemarkText] = useState('');
  const [remarkSaving, setRemarkSaving] = useState(false);

  const isFacultyUser = isFacultyLikeRole(currentUser?.role);
  const isApprovalOfficer_ = isApprovalOfficer(currentUser?.role);
  const canReviewFaculty = isApprovalOfficer_;
  const showActionColumn = isApprovalOfficer_;
  const showRemarkColumn = canReviewFaculty;
  const showSubmitColumn = isFacultyUser;

  const officeIdMap = useMemo(() => {
    const map = new Map<string, string>();
    offices.forEach((office) => {
      if (office?.name && office?.id) {
        map.set(normalize(office.name), String(office.id));
      }
    });
    return map;
  }, [offices]);

  const getOfficeId = (role?: string): string | undefined => {
    if (!role) return undefined;
    const id = OFFICER_OFFICE_MAP[role];
    return id === undefined ? undefined : String(id);
  };

  const loadData = async (userOrRole?: StoredUser | string) => {
    setLoading(true);
    let role: string | undefined;
    let user: StoredUser | undefined;

    if (typeof userOrRole === 'string') {
      role = userOrRole;
    } else if (userOrRole && typeof userOrRole === 'object') {
      role = userOrRole.role;
      user = userOrRole;
    }

    const officeId = isApprovalOfficer(role) ? getOfficeId(role) : undefined;
    let userId: string | undefined;

    if (!isApprovalOfficer(role) && role !== 'admin') {
      if (user?.supabase_id) {
        userId = user.supabase_id;
      } else if (user?.id) {
        userId = String(user.id);
      }
    }

    try {
      const data = await clearanceService.getClearances(userId, officeId, {
        actorId: user?.id ? String(user.id) : undefined,
        actorRole: role,
      });
      setRecords(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void clearanceService.getOffices().then((data) => {
      if (Array.isArray(data)) {
        setOffices(data);
      }
    });
  }, []);

  useEffect(() => {
    if (!currentUser || (currentUser.role !== 'admin' && !canReviewFaculty && !isFacultyUser)) return;
    void facultyService.getFaculty().then(setFacultyMembers);
  }, [currentUser, canReviewFaculty, isFacultyUser]);

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) return;
    try {
      const user = JSON.parse(raw) as StoredUser;
      setCurrentUser(user);
      void loadData(user);
    } catch {
      // ignore
    }
  }, []);

  const handleUpload = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setUploadError('');

    if (!currentUser) {
      setUploadError('Please sign in again.');
      return;
    }

    if (!docName.trim()) {
      setUploadError('Document name is required.');
      return;
    }

    const employeeId = currentUser.supabase_id ?? '';
    if (!employeeId) {
      setUploadError('Please sign in again.');
      return;
    }

    setUploading(true);
    try {
      await clearanceService.uploadDocument(employeeId, 0, docName.trim(), undefined, { name: currentUser.name ?? currentUser.full_name, role: currentUser.role });
      setIsUploadOpen(false);
      setDocName('Safety Training Certificate');
      void loadData(currentUser ?? undefined);
  toast({ title: 'Clearance Uploaded', description: 'Document uploaded for review.', type: 'success' });
    } catch (error) {
  const msg = error instanceof Error ? error.message : 'Upload failed. Please try again.';
  setUploadError(msg);
  toast({ title: 'Upload Failed', description: msg, type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const handleFacultySubmit = async (officeName: string) => {
    if (!currentUser) return;

    const employeeId = currentUser.supabase_id ?? '';
    const officeId = officeIdMap.get(normalize(officeName));
    if (!employeeId || !officeId) {
      toast({ title: 'Submission Failed', description: 'Please sign in again or select a valid office.', type: 'error' });
      return;
    }

    setSubmittingOfficeId(officeId);
    try {
      await clearanceService.uploadDocument(employeeId, Number(officeId), officeName, undefined, {
        name: currentUser.name ?? currentUser.full_name,
        role: currentUser.role,
      });
      await loadData(currentUser);
      toast({ title: 'Clearance Submitted', description: `${officeName} has been submitted for review.`, type: 'success' });
    } catch (error) {
      toast({ title: 'Submission Failed', description: error instanceof Error ? error.message : 'Submission failed. Please try again.', type: 'error' });
    } finally {
      setSubmittingOfficeId(null);
    }
  };

  const facultyStepRecords = useMemo<FacultyStepRecord[]>(() => {
    if (!currentUser || !isFacultyLikeRole(currentUser.role)) return [];

    const accountId = currentUser.id ? String(currentUser.id) : '';
    const accountName = normalize(currentUser.full_name || currentUser.name || '');

    const ownRecords = records.filter((record) => {
      const sameId = accountId !== '' && record.employeeId === accountId;
      const recordName = normalize(record.employeeName || '');
      const sameName =
        accountName !== '' &&
        (recordName === accountName || recordName.includes(accountName) || accountName.includes(recordName));
      return sameId || sameName;
    });

    return FACULTY_REQUIRED_OFFICES.map((office, index) => {
      for (const row of ownRecords) {
        if (normalize(row.requiredDocument || '') === normalize(office)) {
          return { ...row, _isRequiredPlaceholder: false };
        }
      }

      return {
        id: `required-${index}`,
        employeeId: accountId || 'N/A',
        employeeName: currentUser.full_name || currentUser.name || 'Faculty User',
        requiredDocument: office,
        status: 'pending' as const,
        _isRequiredPlaceholder: true,
      };
    });
  }, [currentUser, records]);

  const filtered = useMemo(() => {
    if (!currentUser) return [];
    const term = searchTerm.toLowerCase();
    if (isFacultyLikeRole(currentUser.role)) {
      return facultyStepRecords.filter((row) =>
        (row.requiredDocument ?? '').toLowerCase().includes(term) ||
        (row.employeeName ?? '').toLowerCase().includes(term)
      );
    }

    if (canReviewFaculty) {
      const officeRecords = records;

      const facultyMap = new Map<string, Clearance[]>();
      officeRecords.forEach((record) => {
        const id = record.employeeId;
        if (!facultyMap.has(id)) facultyMap.set(id, []);
        facultyMap.get(id)!.push(record);
      });

      return Array.from(facultyMap.values()).map((recs) => {
        const latest = recs[0];
        return {
          ...latest,
          requiredDocument: `Clearance Request (${recs.length} documents)`,
          _allRecords: recs,
        };
      }).filter((faculty) => (faculty.employeeName ?? '').toLowerCase().includes(term));
    }

    return records.filter((record) =>
      (record.employeeName ?? '').toLowerCase().includes(term) ||
      (record.requiredDocument ?? '').toLowerCase().includes(term)
    );
  }, [records, searchTerm, currentUser, facultyStepRecords, canReviewFaculty]);

  const adminFacultyProgress = useMemo<AdminFacultyProgress[]>(() => {
    if (currentUser?.role !== 'admin') return [];

    const monitoredOffices = offices.length > 0
      ? offices.map((office) => office.name).filter(Boolean)
      : FACULTY_REQUIRED_OFFICES;

    const recordsByFaculty = new Map<string, Clearance[]>();
    records.forEach((record) => {
      const key = String(record.employeeId);
      const existing = recordsByFaculty.get(key) ?? [];
      existing.push(record);
      recordsByFaculty.set(key, existing);
    });

    const knownFaculty = facultyMembers.map((member) => ({
      id: String(member.id),
      name: member.fullName,
      department: member.department,
    }));
    const submittedFaculty = Array.from(recordsByFaculty.entries())
      .filter(([id]) => !knownFaculty.some((member) => member.id === id))
      .map(([id, memberRecords]) => ({
        id,
        name: memberRecords[0]?.employeeName || 'Unknown faculty',
        department: 'Unassigned',
      }));

    return [...knownFaculty, ...submittedFaculty].map((faculty) => {
      const memberRecords = recordsByFaculty.get(faculty.id) ?? [];
      const approved = monitoredOffices.filter((office) =>
        memberRecords.some((record) => normalize(record.requiredDocument) === normalize(office) && record.status === 'approved')
      ).length;
      const submitted = monitoredOffices.filter((office) =>
        memberRecords.some((record) => normalize(record.requiredDocument) === normalize(office) && record.status !== 'rejected')
      ).length;
      const rejected = memberRecords.filter((record) => record.status === 'rejected').length;

      return {
        ...faculty,
        records: memberRecords,
        submitted,
        approved,
        rejected,
        completion: monitoredOffices.length > 0 ? Math.round((approved / monitoredOffices.length) * 100) : 0,
      };
    });
  }, [currentUser, facultyMembers, offices, records]);

  const adminOverview = useMemo(() => {
    const monitoredOffices = offices.length > 0
      ? offices.map((office) => office.name).filter(Boolean)
      : FACULTY_REQUIRED_OFFICES;
    const total = adminFacultyProgress.length * monitoredOffices.length;
    const submitted = adminFacultyProgress.reduce((sum, faculty) => sum + faculty.submitted, 0);
    const approved = adminFacultyProgress.reduce((sum, faculty) => sum + faculty.approved, 0);
    const rejected = adminFacultyProgress.reduce((sum, faculty) => sum + faculty.rejected, 0);
    const officeProgress = monitoredOffices.map((office) => {
      const approvedForOffice = adminFacultyProgress.filter((faculty) =>
        faculty.records.some((record) => normalize(record.requiredDocument) === normalize(office) && record.status === 'approved')
      ).length;
      return { office, approved: approvedForOffice, total: adminFacultyProgress.length };
    });

    return {
      faculty: adminFacultyProgress.length,
      submitted,
      approved,
      rejected,
      total,
      submissionPercent: total ? Math.round((submitted / total) * 100) : 0,
      completionPercent: total ? Math.round((approved / total) * 100) : 0,
      officeProgress,
    };
  }, [adminFacultyProgress, offices]);

  const facultyProgress = useMemo(() => {
    if (!isFacultyUser || facultyStepRecords.length === 0) return null;

    const approved = facultyStepRecords.filter((record) => record.status === 'approved').length;
    const submitted = facultyStepRecords.filter((record) => record.status === 'submitted').length;
    const rejected = facultyStepRecords.filter((record) => record.status === 'rejected').length;
    const pending = facultyStepRecords.filter((record) => !record._isRequiredPlaceholder && record.status === 'pending').length;
    const completion = Math.round((approved / facultyStepRecords.length) * 100);
    const submittedCount = facultyStepRecords.filter((record) => !record._isRequiredPlaceholder && record.status !== 'rejected').length;
    const submissionCompletion = Math.round((submittedCount / facultyStepRecords.length) * 100);
    const rejectedOffice = facultyStepRecords.find((record) => record.status === 'rejected')?.requiredDocument;
    const nextUnsubmittedOffice = facultyStepRecords.find((record) => record._isRequiredPlaceholder)?.requiredDocument;

    let stage = 'Ready to submit';
    let nextStep = nextUnsubmittedOffice
      ? `Submit your clearance to ${nextUnsubmittedOffice}.`
      : 'Submit each required clearance to begin the review process.';

    if (approved === facultyStepRecords.length) {
      stage = 'Clearance complete';
      nextStep = 'All required clearances are approved. No further action is needed.';
    } else if (rejectedOffice) {
      stage = 'Action required';
      nextStep = `Resubmit your clearance to ${rejectedOffice} and review the rejection reason below.`;
    } else if (submittedCount === facultyStepRecords.length) {
      stage = 'Awaiting office review';
      nextStep = 'All required clearances are submitted. Follow up with offices that still show as pending.';
    } else if (submittedCount > 0) {
      stage = 'Submission in progress';
      nextStep = nextUnsubmittedOffice
        ? `Submit your clearance to ${nextUnsubmittedOffice}; the other submissions are already in review.`
        : 'Complete the remaining clearance submissions.';
    }

    return {
      approved,
      submitted,
      rejected,
      pending,
      total: facultyStepRecords.length,
      completion,
      submittedCount,
      submissionCompletion,
      stage,
      nextStep,
    };
  }, [facultyStepRecords, isFacultyUser]);

  const handleDecision = async (record: Clearance, decision: 'approved' | 'rejected' | 'pending') => {
    if (!currentUser) return;
    if (!record.id) return;

    let reason: string | undefined;
    if (decision === 'rejected') {
      reason = prompt('Enter rejection reason:') || undefined;
    }

    // reviewed_by is an integer column (matches users.user_id), not a uuid,
    // so always send the numeric id here — never supabase_id.
    const reviewerId = currentUser.id != null ? String(currentUser.id) : undefined;

    setActionLoadingId(record.id);
    try {
      await clearanceService.updateStatus(record.id, decision, reason, reviewerId, currentUser.full_name, currentUser.role);
      await loadData(currentUser);
      let toastType: 'success' | 'error' | 'info' = 'info';
      if (decision === 'approved') {
        toastType = 'success';
      } else if (decision === 'rejected') {
        toastType = 'error';
      }
      toast({ title: 'Decision Saved', description: `Record ${decision}.`, type: toastType });
    } catch (err) {
      toast({ title: 'Decision Failed', description: err instanceof Error ? err.message : 'Could not update status.', type: 'error' });
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
        currentUser.full_name || currentUser.name || 'Approval officer',
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
      await loadData(currentUser ?? undefined);
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
      toast({ title: 'Document unavailable', description: `${filename}: ${error instanceof Error ? error.message : 'Could not open the document.'}`, type: 'error' });
    }
  };

  const handlePrintClearance = () => {
    setIsPrintPreviewOpen(true);
  };

  const handlePrintConfirmed = () => {
    setShouldPrintAfterPreviewClose(true);
    setIsPrintPreviewOpen(false);
  };

  useEffect(() => {
    if (!shouldPrintAfterPreviewClose || isPrintPreviewOpen) return;

    const frameId = window.requestAnimationFrame(() => {
      window.print();
      setShouldPrintAfterPreviewClose(false);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [shouldPrintAfterPreviewClose, isPrintPreviewOpen]);

  const { title: pageTitle, subtitle: pageSubtitle } = getClearancePageInfo(currentUser?.role);
  const facultyDepartment = currentUser?.department || facultyMembers.find((member) => String(member.id) === String(currentUser?.id))?.department || 'Department not assigned';

  const getStatusClass = (status: Clearance['status']) => {
    if (status === 'approved') return 'bg-emerald-100 text-emerald-800';
    if (status === 'pending' || status === 'submitted') return 'bg-amber-100 text-amber-800';
    if (status === 'rejected') return 'bg-rose-100 text-rose-800';
    return 'bg-slate-100 text-slate-800';
  };

  const getStatusLabel = (status: Clearance['status']) => status === 'submitted' ? 'pending' : status;

  const getFacultySubmitLabel = (record: Clearance & { _isRequiredPlaceholder?: boolean }) => {
    if (record.status === 'rejected') {
      return 'Re-request';
    }
    return record._isRequiredPlaceholder ? 'Request' : 'Requested';
  };

  let tableRows: React.ReactNode;
  let tableColumnCount = 3;
  if (currentUser?.role === 'admin' || showActionColumn || showRemarkColumn || showSubmitColumn) {
    tableColumnCount = 4;
  }
  const adminRows = currentUser?.role === 'admin'
    ? adminFacultyProgress.filter((faculty) => faculty.name.toLowerCase().includes(searchTerm.toLowerCase()) || faculty.department.toLowerCase().includes(searchTerm.toLowerCase()))
    : [];
  const hasNoRows = currentUser?.role === 'admin' ? adminRows.length === 0 : filtered.length === 0;
  const monitoredOfficeCount = offices.length > 0 ? offices.length : FACULTY_REQUIRED_OFFICES.length;
  if (loading) {
    tableRows = (
      <TableRow>
        <TableCell colSpan={tableColumnCount} className="text-center py-10 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-red-500" />
          Loading clearance data...
        </TableCell>
      </TableRow>
    );
  } else if (hasNoRows) {
    tableRows = (
      <TableRow>
        <TableCell colSpan={tableColumnCount} className="text-center py-10 text-slate-500">
          No documents found.
        </TableCell>
      </TableRow>
    );
  } else if (currentUser?.role === 'admin') {
    tableRows = adminRows.map((faculty) => {
      let statusLabel = 'In progress';
      let statusClass = 'bg-amber-100 text-amber-800';
      if (faculty.rejected > 0) {
        statusLabel = 'Needs resubmission';
        statusClass = 'bg-rose-100 text-rose-800';
      } else if (faculty.completion === 100) {
        statusLabel = 'Complete';
        statusClass = 'bg-emerald-100 text-emerald-800';
      } else if (faculty.submitted === 0) {
        statusLabel = 'Not submitted';
      }

      return (
        <TableRow key={faculty.id}>
        <TableCell>
          <div className="font-medium text-slate-800">{faculty.name}</div>
          <div className="text-xs text-slate-500">{faculty.department || 'Department not assigned'}</div>
        </TableCell>
        <TableCell className="text-sm text-slate-600">{faculty.submitted} / {monitoredOfficeCount} submitted</TableCell>
        <TableCell>
          <div className="flex min-w-40 items-center gap-3">
            <Progress value={faculty.completion} className="h-2" indicatorClassName={faculty.completion === 100 ? 'bg-emerald-500' : 'bg-[#D4A017]'} />
            <span className="text-sm font-semibold text-slate-700">{faculty.completion}%</span>
          </div>
        </TableCell>
        <TableCell>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}>
            {statusLabel}
          </span>
        </TableCell>
        </TableRow>
      );
    });
  } else {
    tableRows = filtered.map((record: Clearance & { _hasRecord?: boolean; _isRequiredPlaceholder?: boolean }) => (
      <TableRow
        key={record.id}
        className={canReviewFaculty ? 'cursor-pointer hover:bg-slate-50' : ''}
      >
        <TableCell>
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              {canReviewFaculty ? (
                <span className="text-slate-800 font-semibold">{record.employeeName}</span>
              ) : (
                <span className="text-slate-800">{record.requiredDocument}</span>
              )}
            </div>

            {/* Delete removed from list view; kept in office detail page */}
          </div>
          {record.validationWarning && (
            <div className="text-xs text-rose-600 mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Reason: {record.validationWarning}
            </div>
          )}
          {(record.filePath || record.attachments?.length) && (
            <Button type="button" variant="link" className="h-auto px-0 text-xs text-red-700" onClick={() => setDocumentRecord(record)}>
              <FileText className="mr-1 h-3.5 w-3.5" />
              View documents ({(record.filePath ? 1 : 0) + (record.attachments?.length ?? 0)})
            </Button>
          )}
          {record.notes?.map((note) => (
            <div key={note.id} className="mt-2 flex items-start justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
              <span><span className="font-semibold">Requirement reminder:</span> {note.content}</span>
              {canReviewFaculty && (
                <Button type="button" size="icon-sm" variant="ghost" className="shrink-0 text-amber-800 hover:bg-amber-100" onClick={() => void handleDeleteRemark(record, note.id)} aria-label="Delete requirement reminder">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </TableCell>
        <TableCell className="text-sm text-slate-600">{record.submissionDate || 'Not submitted'}</TableCell>
        <TableCell>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusClass(record.status)}`}>
            {record.status === 'approved' && <CheckCircle2 className="h-3 w-3" />}
            {getStatusLabel(record.status)}
          </span>
        </TableCell>
        {showSubmitColumn && (
          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
            {record.status !== 'approved' && (() => {
              const officeId = officeIdMap.get(normalize(record.requiredDocument));
              if (!officeId) return null;
              return (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={record.status === 'rejected' || record._isRequiredPlaceholder ? 'default' : 'secondary'}
                    className={record.status === 'rejected' || record._isRequiredPlaceholder ? '' : 'bg-slate-200 text-slate-500 hover:bg-slate-200 hover:text-slate-500'}
                    disabled={!currentUser?.supabase_id || submittingOfficeId === officeId || (!record._isRequiredPlaceholder && record.status !== 'rejected')}
                    onClick={() => void handleFacultySubmit(record.requiredDocument)}
                  >
                    {submittingOfficeId === officeId ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="mr-1 h-3.5 w-3.5" />}
                    {getFacultySubmitLabel(record)}
                  </Button>
                  <Link href={`/clearance/upload/${officeId}`} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                    {record.filePath ? 'Manage file' : 'Upload file'}
                  </Link>
                </div>
              );
            })()}
          </TableCell>
        )}
        {showRemarkColumn && (
          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
            <div className="inline-flex flex-col gap-1 sm:gap-2 sm:flex-row">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={record._hasRecord === false || actionLoadingId === record.id}
                onClick={() => {
                  setRemarkRecord(record);
                  setRemarkText('');
                }}
              >
                <MessageSquare className="mr-1 h-3.5 w-3.5" />
                Add remark
              </Button>
              {showActionColumn && <Button
                type="button"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={record._hasRecord === false || actionLoadingId === record.id || record.status === 'approved'}
                onClick={() => void handleDecision(record, 'approved')}
              >
                {actionLoadingId === record.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                Approve
              </Button>}
              {showActionColumn && <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={record._hasRecord === false || actionLoadingId === record.id || record.status === 'rejected'}
                onClick={() => void handleDecision(record, 'rejected')}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Reject
              </Button>}
              {showActionColumn && <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={record._hasRecord === false || actionLoadingId === record.id || record.status === 'pending'}
                onClick={() => void handleDecision(record, 'pending')}
              >
                <Clock className="mr-1 h-3.5 w-3.5" />
                Pending
              </Button>}
            </div>
          </TableCell>
        )}
      </TableRow>
    ));
  }

  return (
    <>
    <div className="space-y-6 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{pageTitle}</h1>
          <p className="text-slate-500">{pageSubtitle}</p>
        </div>

        {currentUser?.role !== 'admin' && !isFacultyUser && !isApprovalOfficer_ && (
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <Button className="bg-red-600 hover:bg-red-700" onClick={() => setIsUploadOpen(true)}>
              <UploadCloud className="mr-2 h-4 w-4" /> Upload Document
            </Button>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Submit Clearance Document</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleUpload} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <label htmlFor="clearance-doc-name" className="text-sm font-medium">Document Name</label>
                  <Input
                    id="clearance-doc-name"
                    value={docName}
                    onChange={(event) => {
                      setDocName(event.target.value);
                      if (uploadError) setUploadError('');
                    }}
                    required
                    aria-describedby="clearance-doc-name-help"
                  />
                  <p id="clearance-doc-name-help" className="text-xs text-slate-500">
                    Use the title shown on the clearance document so office staff can match it quickly.
                  </p>
                </div>
                {uploadError && <p className="text-sm text-rose-600">{uploadError}</p>}
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={uploading}>
                    {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit for Review
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}

        {canReviewFaculty && (
          <Dialog open={Boolean(remarkRecord)} onOpenChange={(open) => !open && setRemarkRecord(null)}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Requirement reminder for {remarkRecord?.employeeName}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <p className="text-sm text-slate-500">
                  Add the specific requirement this faculty member must submit before approval.
                </p>
                <textarea
                  className="min-h-28 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D4A017]/40"
                  value={remarkText}
                  onChange={(event) => setRemarkText(event.target.value)}
                  placeholder="Example: Submit the updated laboratory clearance certificate."
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
        )}

        <Dialog open={Boolean(documentRecord)} onOpenChange={(open) => !open && setDocumentRecord(null)}>
          <DialogContent className="min-w-0 overflow-hidden sm:max-w-lg">
            <DialogHeader className="min-w-0">
              <DialogTitle className="min-w-0 break-words">Uploaded documents for {documentRecord?.employeeName}</DialogTitle>
            </DialogHeader>
            <div className="min-w-0 space-y-2 pt-4">
              {documentRecord?.filePath && (
                <Button type="button" variant="outline" className="w-full min-w-0 max-w-full justify-start overflow-hidden" onClick={() => void handleOpenFile(documentRecord.filePath!, documentRecord.originalFilename || 'submitted document')}>
                  <FileText className="mr-2 h-4 w-4 text-red-600" />
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
                    {documentRecord.originalFilename || 'Submitted document'}
                  </span>
                </Button>
              )}
              {documentRecord?.attachments?.map((attachment) => (
                <Button key={attachment.id} type="button" variant="outline" className="w-full min-w-0 max-w-full justify-start overflow-hidden" onClick={() => void handleOpenFile(attachment.filePath, attachment.originalFilename)}>
                  <FileText className="mr-2 h-4 w-4 text-red-600" />
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">{attachment.originalFilename}</span>
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isPrintPreviewOpen} onOpenChange={setIsPrintPreviewOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl print:hidden">
            <DialogHeader>
              <DialogTitle>Academic clearance preview</DialogTitle>
              <p className="text-sm text-slate-500">Review every office before printing the clearance form for Human Resources.</p>
            </DialogHeader>
            <div className="border border-slate-400 bg-white p-5 text-slate-900 shadow-sm sm:p-8">
              <div className="border-b-2 border-slate-700 pb-4 text-center">
                <p className="text-lg font-bold tracking-wide">ST. DOMINIC COLLEGE OF ASIA</p>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-600">Human Resources Office</p>
                <h2 className="mt-4 text-xl font-bold">ACADEMIC CLEARANCE FORM</h2>
                <p className="mt-1 text-sm text-slate-600">Clearance status: {facultyProgress?.completion === 100 ? 'Complete' : 'Incomplete'}</p>
              </div>
              <div className="mt-5 grid gap-x-8 gap-y-2 border-b border-slate-300 pb-4 text-sm sm:grid-cols-2">
                <p><span className="font-semibold">Name:</span> {currentUser?.full_name || currentUser?.name || 'Faculty User'}</p>
                <p><span className="font-semibold">Date:</span> {new Date().toLocaleDateString()}</p>
                <p><span className="font-semibold">Position:</span> Faculty</p>
                <p><span className="font-semibold">Department:</span> {facultyDepartment}</p>
                <p><span className="font-semibold">Academic year:</span> {academicYear}</p>
                <p><span className="font-semibold">Semester:</span> {semester}</p>
                <p className="sm:col-span-2"><span className="font-semibold">Status:</span> [ {currentUser?.statusOfAppointment === 'full-time' ? 'x' : ' '} ] Full-Time&nbsp;&nbsp;&nbsp;[ {currentUser?.statusOfAppointment === 'part-time' ? 'x' : ' '} ] Part-Time</p>
              </div>
              <p className="my-5 text-center text-sm text-slate-700">This form shows the approval status of each office requirement.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-200 text-left">
                      <th className="border border-slate-400 px-3 py-2">Office / Department</th>
                      <th className="border border-slate-400 px-3 py-2">Status</th>
                      <th className="border border-slate-400 px-3 py-2">Date</th>
                      <th className="border border-slate-400 px-3 py-2">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facultyStepRecords.map((record) => (
                      <tr key={record.id}>
                        <td className="border border-slate-400 px-3 py-2 font-medium">{record.requiredDocument}</td>
                        <td className={`border border-slate-400 px-3 py-2 font-semibold ${record.status === 'approved' ? 'text-emerald-700' : record.status === 'rejected' ? 'text-rose-700' : 'text-amber-700'}`}>
                          {record._isRequiredPlaceholder ? 'Not submitted' : getStatusLabel(record.status)}
                        </td>
                        <td className="border border-slate-400 px-3 py-2">{record.reviewedAt || record.submissionDate || '-'}</td>
                        <td className="border border-slate-400 px-3 py-2">{record.rejectionReason || (record.status === 'approved' ? 'Approved' : 'Follow up with this office')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-300 pt-4 text-sm">
                <p><span className="font-semibold">Approved:</span> {facultyProgress?.approved ?? 0} of {facultyProgress?.total ?? 0}</p>
                <p className={facultyProgress?.completion === 100 ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
                  {facultyProgress?.completion === 100 ? 'Ready for HR submission' : 'Complete the missing office approvals before printing'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsPrintPreviewOpen(false)}>Close preview</Button>
              <Button type="button" onClick={handlePrintConfirmed} disabled={facultyProgress?.completion !== 100} className="bg-slate-900 text-white hover:bg-slate-700">
                <Printer className="mr-2 h-4 w-4" />
                Print form
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isFacultyUser && facultyProgress && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="space-y-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">Current stage</p>
                  <p className="mt-1 text-sm font-semibold text-amber-900">{facultyProgress.stage}</p>
                  <p className="mt-1 text-sm text-amber-900">{facultyProgress.nextStep}</p>
                </div>
                <Button type="button" onClick={handlePrintClearance} className="bg-slate-900 text-white hover:bg-slate-700">
                  <Printer className="mr-2 h-4 w-4" />
                  Preview clearance
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">Submission progress</p>
                <p className="text-3xl font-semibold tracking-[-0.02em] text-slate-900">{facultyProgress.submissionCompletion}%</p>
                <p className="text-sm text-slate-500">{facultyProgress.submittedCount} of {facultyProgress.total} submitted</p>
                <p className="mt-1 text-xs text-slate-500">Approval progress: {facultyProgress.approved} of {facultyProgress.total} approved</p>
              </div>
            </div>

            <Progress
              value={facultyProgress.submissionCompletion}
              className="h-2"
              indicatorClassName="bg-gradient-to-r from-[#0F172A] via-[#D4A017] to-emerald-600"
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Approved</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-800">{facultyProgress.approved}</p>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Rejected</p>
                <p className="mt-2 text-2xl font-semibold text-rose-800">{facultyProgress.rejected}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Pending</p>
                <p className="mt-2 text-2xl font-semibold text-amber-800">{facultyProgress.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {currentUser?.role === 'admin' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card><CardContent className="flex items-center gap-3 p-5"><Users className="h-8 w-8 text-slate-500" /><div><p className="text-sm text-slate-500">Faculty monitored</p><p className="text-2xl font-semibold text-slate-900">{adminOverview.faculty}</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-5"><ClipboardCheck className="h-8 w-8 text-[#D4A017]" /><div><p className="text-sm text-slate-500">Submission progress</p><p className="text-2xl font-semibold text-slate-900">{adminOverview.submissionPercent}%</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-5"><ShieldCheck className="h-8 w-8 text-emerald-600" /><div><p className="text-sm text-slate-500">Requirements completed</p><p className="text-2xl font-semibold text-slate-900">{adminOverview.completionPercent}%</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-5"><AlertTriangle className="h-8 w-8 text-rose-500" /><div><p className="text-sm text-slate-500">Needs resubmission</p><p className="text-2xl font-semibold text-slate-900">{adminOverview.rejected}</p></div></CardContent></Card>
          </div>
          <Card>
            <CardHeader><h2 className="text-lg font-semibold text-slate-900">Requirement coverage by approval office</h2><p className="text-sm text-slate-500">Approved faculty requirements out of the monitored faculty population.</p></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {adminOverview.officeProgress.map((office) => (
                <div key={office.office} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-start justify-between gap-3"><span className="text-sm font-medium text-slate-700">{office.office}</span><span className="text-xs font-semibold text-slate-500">{office.approved}/{office.total}</span></div>
                  <Progress value={office.total ? (office.approved / office.total) * 100 : 0} className="h-2" indicatorClassName="bg-emerald-500" />
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <Search className="h-5 w-5 text-slate-400" />
          <Input
            placeholder="Search by faculty or department"
            className="hidden md:block max-w-sm border-0 focus-visible:ring-0 px-0"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="max-h-128 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Faculty / Department</TableHead>
                {currentUser?.role === 'admin' ? (
                  <>
                    <TableHead>Submission progress</TableHead>
                    <TableHead>Completion</TableHead>
                    <TableHead>Status</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Submission Date</TableHead>
                    <TableHead>Status</TableHead>
                  </>
                )}
                {showSubmitColumn && <TableHead className="text-right">Action</TableHead>}
                {showRemarkColumn && <TableHead className="text-right">{showActionColumn ? 'Decision' : 'Remark'}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
    {isFacultyUser && (
      <section className="printable-clearance hidden print:block" aria-label="Printable faculty clearance">
        <div className="printable-clearance-content mx-auto max-w-4xl text-slate-900">
          <div className="border-b-2 border-slate-900 pb-2 text-center">
            <p className="text-base font-bold tracking-wide">ST. DOMINIC COLLEGE OF ASIA</p>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-600">Human Resources Office</p>
            <h1 className="mt-2 text-xl font-bold">ACADEMIC CLEARANCE FORM</h1>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-b border-slate-300 pb-3 text-xs">
            <p><span className="font-semibold">Faculty name:</span> {currentUser?.full_name || currentUser?.name || 'Faculty User'}</p>
            <p><span className="font-semibold">Printed:</span> {new Date().toLocaleDateString()}</p>
            <p><span className="font-semibold">Position:</span> Faculty</p>
            <p><span className="font-semibold">Department:</span> {facultyDepartment}</p>
            <p><span className="font-semibold">Requirements approved:</span> {facultyProgress?.approved ?? 0} of {facultyProgress?.total ?? 0}</p>
            <p><span className="font-semibold">Academic year:</span> {academicYear}</p>
            <p><span className="font-semibold">Semester:</span> {semester}</p>
            <p className="col-span-2"><span className="font-semibold">Status:</span> [ {currentUser?.statusOfAppointment === 'full-time' ? 'x' : ' '} ] Full-Time&nbsp;&nbsp;&nbsp;[ {currentUser?.statusOfAppointment === 'part-time' ? 'x' : ' '} ] Part-Time</p>
          </div>
          <p className="my-2 text-center text-xs text-slate-700">This is to certify that the faculty member has completed the required office clearances.</p>
          <table className="mt-3 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-slate-900 text-left">
                <th className="py-2 pr-4">Office / Department</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 text-right">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {facultyStepRecords.map((record) => (
                <tr key={record.id} className="border-b border-slate-300">
                  <td className="py-1 pr-4">{record.requiredDocument}</td>
                  <td className="py-1 pr-4">{record.reviewedAt || record.submissionDate || 'N/A'}</td>
                  <td className="py-1 text-right font-semibold uppercase">{record.status === 'approved' ? 'Approved' : getStatusLabel(record.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="printable-clearance-signatures mt-auto grid grid-cols-2 gap-16 text-center text-xs">
            <div className="border-t border-slate-900 pt-2">Faculty signature</div>
            <div className="border-t border-slate-900 pt-2">HR received by / date</div>
          </div>
        </div>
      </section>
    )}
    </>
  );
}