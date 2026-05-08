'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearanceService } from '@/services/clearanceService';
import { Clearance } from '@/types/clearance';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { UploadCloud, CheckCircle2, AlertTriangle, FileText, Loader2, Search, Check, X, Clock } from 'lucide-react';
import { FACULTY_REQUIRED_OFFICES, toOfficeSlug } from '@/lib/clearanceOffices';
import { isApprovalOfficer, getClearancePageInfo, isFacultyLikeRole } from '@/lib/roleConfig';
import { StoredUser } from '@/lib/stringUtils';

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

export default function ClearancePage() {
  const router = useRouter();
  const [records, setRecords] = useState<Clearance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [docName, setDocName] = useState('Safety Training Certificate');
  const [uploadError, setUploadError] = useState('');

  const isFacultyUser = isFacultyLikeRole(currentUser?.role);
  const isApprovalOfficer_ = isApprovalOfficer(currentUser?.role);
  const showActionColumn = isApprovalOfficer_;

  const getOfficeId = (role?: string): string | undefined => {
    if (!role) return undefined;
    const id = OFFICER_OFFICE_MAP[role];
    return id === undefined ? undefined : String(id);
  };

  const loadData = async (role?: string) => {
    setLoading(true);
    const officeId = isApprovalOfficer(role) ? getOfficeId(role) : undefined;
    const data = await clearanceService.getClearances(undefined, officeId);
    setRecords(data || []);
    setLoading(false);
  };

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) return;
    try {
      const user = JSON.parse(raw) as StoredUser;
      setCurrentUser(user);
      void loadData(user.role);
    } catch {
      // ignore
    }
  }, []);

  const handleUpload = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setUploadError('');

    if (!docName.trim()) {
      setUploadError('Enter a document name before submitting.');
      return;
    }

    const employeeId = currentUser?.id ? String(currentUser.id) : '';
    if (!employeeId) {
      setUploadError('Your account is missing a user ID. Please log in again.');
      return;
    }

    setUploading(true);
    try {
      await clearanceService.uploadDocument(employeeId, 0, docName.trim());
      setIsUploadOpen(false);
      setDocName('Safety Training Certificate');
      void loadData(currentUser?.role);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Unable to submit this document. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!currentUser) return [];
    const term = searchTerm.toLowerCase();
    const normalize = (value?: string) => (value ?? '').trim().toLowerCase().split(/\s+/).join(' ');
    if (isFacultyLikeRole(currentUser.role)) {
      const accountId = currentUser.id ? String(currentUser.id) : '';
      const accountName = normalize(currentUser.full_name || currentUser.name);
      const ownRecords = records.filter((record) => {
        const sameId = accountId !== '' && record.employeeId === accountId;
        const recordName = normalize(record.employeeName);
        const sameName =
          accountName !== '' &&
          (recordName === accountName || recordName.includes(accountName) || accountName.includes(recordName));
        return sameId || sameName;
      });

      return FACULTY_REQUIRED_OFFICES.map((office, index) => {
        const officeName = office;
        const existing = ownRecords.find((row) => normalize(row.requiredDocument) === normalize(officeName));
        if (existing) return existing;
        return {
          id: `required-${index}`,
          employeeId: accountId || 'N/A',
          employeeName: currentUser.full_name || currentUser.name || 'Faculty User',
          requiredDocument: officeName,
          status: 'pending' as const,
        };
      }).filter((row) =>
        (row.requiredDocument ?? '').toLowerCase().includes(term) ||
        (row.employeeName ?? '').toLowerCase().includes(term)
      );
    }

    if (isApprovalOfficer(currentUser.role)) {
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
  }, [records, searchTerm, currentUser]);

  const facultyStatusTotals = useMemo(() => {
    if (!isFacultyUser) {
      return { approved: 0, rejected: 0, pending: 0 };
    }

    return filtered.reduce(
      (totals, record) => {
        if (record.status === 'approved') {
          totals.approved += 1;
        } else if (record.status === 'rejected') {
          totals.rejected += 1;
        } else {
          // Treat submitted as pending for faculty progress tracking.
          totals.pending += 1;
        }
        return totals;
      },
      { approved: 0, rejected: 0, pending: 0 }
    );
  }, [filtered, isFacultyUser]);

  const handleDecision = async (record: Clearance, decision: 'approved' | 'rejected' | 'pending') => {
    if (!currentUser) return;
    if (!record.id) return;

    let reason: string | undefined;
    if (decision === 'rejected') {
      reason = prompt('Enter rejection reason:') || undefined;
    }

    setActionLoadingId(record.id);
    await clearanceService.updateStatus(record.id, decision, reason);
    await loadData(currentUser.role);
    setActionLoadingId(null);
  };

  const { title: pageTitle, subtitle: pageSubtitle } = getClearancePageInfo(currentUser?.role);

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
        <TableCell colSpan={showActionColumn ? 4 : 3} className="text-center py-10 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-red-500" />
          Loading clearance data...
        </TableCell>
      </TableRow>
    );
  } else if (filtered.length === 0) {
    tableRows = (
      <TableRow>
        <TableCell colSpan={showActionColumn ? 4 : 3} className="text-center py-10 text-slate-500">
          No documents found.
        </TableCell>
      </TableRow>
    );
  } else {
    tableRows = filtered.map((record: any) => (
      <TableRow
        key={record.id}
        className={isApprovalOfficer_ ? 'cursor-pointer hover:bg-slate-50' : ''}
        onClick={() => {
          if (isApprovalOfficer_) {
            router.push(`/clearance/faculty/${record.employeeId}`);
          }
        }}
      >
        <TableCell>
          <div className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-400" />
            {isApprovalOfficer_ ? (
              <span className="text-slate-800 font-semibold">{record.employeeName}</span>
            ) : (
              <Link
                href={`/clearance/${toOfficeSlug(record.requiredDocument)}`}
                className="text-slate-800 hover:text-red-700 hover:underline"
              >
                {record.requiredDocument}
              </Link>
            )}
          </div>
          {record.validationWarning && (
            <div className="text-xs text-rose-600 mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> AI Flag: {record.validationWarning}
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
        {showActionColumn && (
          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
            <div className="inline-flex flex-col gap-1 sm:gap-2 sm:flex-row">
              <Button
                type="button"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={record._hasRecord === false || actionLoadingId === record.id || record.status === 'approved'}
                onClick={() => void handleDecision(record, 'approved')}
              >
                {actionLoadingId === record.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={record._hasRecord === false || actionLoadingId === record.id || record.status === 'rejected'}
                onClick={() => void handleDecision(record, 'rejected')}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Reject
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={record._hasRecord === false || actionLoadingId === record.id || record.status === 'pending'}
                onClick={() => void handleDecision(record, 'pending')}
              >
                <Clock className="mr-1 h-3.5 w-3.5" />
                Pending
              </Button>
            </div>
          </TableCell>
        )}
      </TableRow>
    ));
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{pageTitle}</h1>
          <p className="text-slate-500 mt-1">{pageSubtitle}</p>
        </div>

        {!isFacultyUser && !isApprovalOfficer_ && (
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
      </div>

      {isFacultyUser && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Approved</p>
            <p className="mt-2 text-3xl font-bold text-emerald-800">{facultyStatusTotals.approved}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Rejected</p>
            <p className="mt-2 text-3xl font-bold text-rose-800">{facultyStatusTotals.rejected}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Pending</p>
            <p className="mt-2 text-3xl font-bold text-amber-800">{facultyStatusTotals.pending}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <Search className="h-5 w-5 text-slate-400" />
          <Input
            placeholder="Search by office or requirement..."
            className="hidden md:block max-w-sm border-0 focus-visible:ring-0 px-0"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Office / Requirement</TableHead>
              <TableHead>Submission Date</TableHead>
              <TableHead>Status</TableHead>
              {showActionColumn && <TableHead className="text-right">Decision</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableRows}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}