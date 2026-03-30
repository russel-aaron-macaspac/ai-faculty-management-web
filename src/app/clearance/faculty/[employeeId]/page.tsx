'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, FileText, Loader2, ScanLine, Save, ArrowLeft, CheckCircle2, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clearanceService } from '@/services/clearanceService';
import { Clearance, ClearanceNote } from '@/types/clearance';
import { StoredUser } from '@/lib/stringUtils';
import { 
  DOCUMENT_TYPES, 
  validateDocument,
  SubmittedDocument,
  DocumentValidationResult 
} from '@/lib/documentTypes';
import { format } from 'date-fns';
import { getRequiredOfficeForOfficer } from '@/lib/roleConfig';

export default function FacultyDetailPage() {
  const params = useParams<{ employeeId: string }>();
  const employeeId = Array.isArray(params.employeeId) ? params.employeeId[0] : params.employeeId;

  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [records, setRecords] = useState<Clearance[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<ClearanceNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  const [facultyDocuments, setFacultyDocuments] = useState<SubmittedDocument[]>([]);
  const [dlrcNotes, setDlrcNotes] = useState('');
  const [selectedOCRFile, setSelectedOCRFile] = useState<File | null>(null);
  const [selectedOCRDocumentType, setSelectedOCRDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [isOCRLoading, setIsOCRLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<DocumentValidationResult | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Dialog states for approval/rejection
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (raw) {
      try {
        setCurrentUser(JSON.parse(raw) as StoredUser);
      } catch {
        // Ignore bad local storage payload.
      }
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await clearanceService.getClearances();
      setRecords(data);
      setLoading(false);
    };

    void load();
  }, []);

  const facultyRecord = useMemo(() => {
    return records.find((record) => record.employeeId === employeeId);
  }, [records, employeeId]);

  const officerOfficeName = useMemo(() => {
    return getRequiredOfficeForOfficer(currentUser?.role);
  }, [currentUser?.role]);

  const facultyName = useMemo(() => {
    return facultyRecord?.employeeName || `Faculty (${employeeId})`;
  }, [facultyRecord?.employeeName, employeeId]);

  useEffect(() => {
    if (facultyRecord?.id) {
      setLoadingNotes(true);
      clearanceService
        .getClearanceNotes(facultyRecord.id)
        .then((data) => {
          setNotes(data || []);
        })
        .catch((error) => {
          console.error('Error fetching notes:', error);
          setNotes([]);
        })
        .finally(() => {
          setLoadingNotes(false);
        });
    }
  }, [facultyRecord?.id]);

  const facultyDocumentsData = useMemo(() => {
    if (!facultyRecord) return [];
    
    const storageKey = `faculty-documents-${employeeId}`;
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    try {
      return JSON.parse(raw) as SubmittedDocument[];
    } catch {
      return [];
    }
  }, [facultyRecord, employeeId]);

  const dlrcNotesData = useMemo(() => {
    if (!facultyRecord) return '';
    
    const storageKey = `faculty-dlrc-notes-${employeeId}`;
    return localStorage.getItem(storageKey) || '';
  }, [facultyRecord, employeeId]);

  useEffect(() => {
    setFacultyDocuments(facultyDocumentsData);
    setDlrcNotes(dlrcNotesData);
  }, [facultyDocumentsData, dlrcNotesData]);

  const saveDlrcNotes = () => {
    const storageKey = `faculty-dlrc-notes-${employeeId}`;
    localStorage.setItem(storageKey, dlrcNotes);
  };

  const handleOCRDocumentTypeChange = (value: string | null) => {
    setSelectedOCRDocumentType(value ?? DOCUMENT_TYPES[0]);
  };

  const handleRunOCR = async () => {
    if (!selectedOCRFile) {
      return;
    }

    setIsOCRLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedOCRFile);

      const response = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json()) as { text?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'OCR request failed');
      }

      const extractedText = payload.text || '';
      const result = validateDocument(selectedOCRDocumentType, extractedText);

      setOcrText(extractedText);
      setValidationResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process OCR.';
      setOcrText(`OCR scan failed: ${message}`);
      setValidationResult(null);
    } finally {
      setIsOCRLoading(false);
    }
  };

  const resolveTargetRecord = async (): Promise<Clearance> => {
    if (facultyRecord) {
      return facultyRecord;
    }

    if (!officerOfficeName) {
      throw new Error('No office is mapped to your approval role.');
    }

    await clearanceService.uploadDocument(employeeId, facultyName, officerOfficeName);

    const refreshed = await clearanceService.getClearances();
    setRecords(refreshed);

    const normalize = (value: string) => value.trim().toLowerCase().split(/\s+/).join(' ');
    const matched =
      refreshed.find(
        (record) =>
          record.employeeId === employeeId &&
          normalize(record.requiredDocument) === normalize(officerOfficeName)
      ) || refreshed.find((record) => record.employeeId === employeeId);

    if (!matched) {
      throw new Error('Unable to create a clearance record for this faculty user.');
    }

    return matched;
  };

  const applyDecision = async (targetRecord: Clearance, decision: 'approved' | 'rejected' | 'pending') => {
    const reviewerId = currentUser?.id ? String(currentUser.id) : '';
    const reviewerName = currentUser?.full_name || currentUser?.name || 'Officer';
    const reviewerRole = currentUser?.role || 'approval_officer';

    if (decision === 'approved') {
      await clearanceService.approveClearance(
        targetRecord.id,
        approvalRemarks,
        reviewerId,
        reviewerName,
        reviewerRole
      );
      setIsApproveDialogOpen(false);
      setApprovalRemarks('');
      return;
    }

    if (decision === 'rejected') {
      await clearanceService.rejectClearance(
        targetRecord.id,
        rejectionReason,
        reviewerId,
        reviewerName,
        reviewerRole
      );
      setIsRejectDialogOpen(false);
      setRejectionReason('');
      return;
    }

    await clearanceService.updateStatus(targetRecord.id, 'pending');
  };

  const handleDecision = async (decision: 'approved' | 'rejected' | 'pending') => {
    if (!currentUser) return;

    const actionKey = facultyRecord?.id || `virtual-${employeeId}`;
    setActionLoadingId(actionKey);
    try {
      const targetRecord = await resolveTargetRecord();
      await applyDecision(targetRecord, decision);

      const data = await clearanceService.getClearances();
      setRecords(data);
    } catch (error) {
      console.error('Error making decision:', error);
      const message = error instanceof Error ? error.message : 'Failed to update clearance decision';
      globalThis.alert(message);
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

  const status: Clearance['status'] = facultyRecord?.status ?? 'pending';
  const actionTargetId = facultyRecord?.id || `virtual-${employeeId}`;
  const submissionDate = facultyRecord?.submissionDate || 'Not submitted';

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-red-500" />
        Loading faculty details...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{facultyName}</h1>
          <p className="text-slate-500 mt-1">Clearance review and document verification (DLRC).</p>
        </div>
        <Link href="/clearance" className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <ArrowLeft className="h-4 w-4" /> Back to Clearance
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getStatusClass(status)}`}>
              {status === 'approved' && <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
              {status}
            </span>
            <p className="text-sm text-slate-600">Submission date: {submissionDate}</p>
            {facultyRecord?.validationWarning && (
              <p className="text-sm text-rose-600">AI note: {facultyRecord.validationWarning}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Approval Status & Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-600 mb-2">Current Status</p>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium capitalize gap-2 ${getStatusClass(status)}`}>
                {status === 'approved' && <CheckCircle2 className="h-4 w-4" />}
                {status === 'rejected' && <X className="h-4 w-4" />}
                {status}
              </span>
            </div>

            {facultyRecord?.rejectionReason && status === 'rejected' && (
              <div className="rounded-md bg-rose-50 p-3 border border-rose-200">
                <p className="text-sm font-medium text-rose-800">Rejection Reason:</p>
                <p className="text-sm text-rose-700 mt-1">{facultyRecord.rejectionReason}</p>
              </div>
            )}

            <div className="space-y-2">
              <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    disabled={status === 'approved' || actionLoadingId === actionTargetId}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    {actionLoadingId === actionTargetId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Approve Clearance
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Approve Clearance</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="approval-remarks" className="text-sm font-medium text-slate-700">Approval Remarks (Optional)</label>
                      <textarea
                        id="approval-remarks"
                        className="w-full mt-2 rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"
                        placeholder="Add any remarks or notes for the faculty..."
                        value={approvalRemarks}
                        onChange={(e) => setApprovalRemarks(e.target.value)}
                        rows={4}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsApproveDialogOpen(false);
                          setApprovalRemarks('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void handleDecision('approved')}
                        disabled={actionLoadingId === actionTargetId}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        {actionLoadingId === actionTargetId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Approval
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    disabled={status === 'rejected' || actionLoadingId === actionTargetId}
                    variant="destructive"
                    className="w-full"
                  >
                    {actionLoadingId === actionTargetId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                    Reject Clearance
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Reject Clearance</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="rejection-reason" className="text-sm font-medium text-slate-700">Rejection Reason *</label>
                      <textarea
                        id="rejection-reason"
                        className="w-full mt-2 rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-rose-500"
                        placeholder="Please provide a reason for rejection..."
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        rows={4}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsRejectDialogOpen(false);
                          setRejectionReason('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void handleDecision('rejected')}
                        disabled={!rejectionReason.trim() || actionLoadingId === actionTargetId}
                        variant="destructive"
                      >
                        {actionLoadingId === actionTargetId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Rejection
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Button 
                onClick={() => void handleDecision('pending')} 
                disabled={status === 'pending' || actionLoadingId === actionTargetId}
                variant="outline"
                className="w-full"
              >
                {actionLoadingId === actionTargetId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
                Mark as Pending
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>DLRC Review Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              className="min-h-28 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-red-500"
              value={dlrcNotes}
              onChange={(event) => setDlrcNotes(event.target.value)}
              placeholder="Add internal review notes, concerns, or observations..."
            />
            <Button onClick={saveDlrcNotes} className="bg-red-600 hover:bg-red-700">
              <Save className="mr-2 h-4 w-4" /> Save Notes
            </Button>

            {loadingNotes && (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading remarks...</span>
              </div>
            )}
            {notes.length > 0 && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-slate-600 mb-3">Remarks History</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-md border p-3 text-sm bg-slate-50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-slate-800">{note.author_name}</span>
                        <span className="text-xs text-slate-500">
                          {format(new Date(note.created_at), 'MMM d, yyyy HH:mm')}
                        </span>
                      </div>
                      <p className="text-slate-700">{note.content}</p>
                      <span className="text-xs font-medium text-slate-600 mt-1 inline-block capitalize">
                        {note.note_type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Submitted Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {facultyDocuments.length === 0 ? (
              <p className="text-sm text-slate-500">No documents submitted yet.</p>
            ) : (
              facultyDocuments.map((document, index) => (
                <div key={`${document.name}-${index}`} className="rounded-md border border-slate-200 p-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-700">{document.name}</div>
                      <div className="text-xs text-slate-500">Submitted: {document.submittedAt}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader>
            <CardTitle>OCR AI Scanner - Document Verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="ocr-document-type" className="text-sm font-medium text-slate-700">Document Type</label>
              <Select value={selectedOCRDocumentType} onValueChange={handleOCRDocumentTypeChange}>
                <SelectTrigger id="ocr-document-type" className="w-full">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Input type="file" onChange={(event) => setSelectedOCRFile(event.target.files?.[0] || null)} />
            <Button onClick={() => void handleRunOCR()} disabled={isOCRLoading} className="bg-red-600 hover:bg-red-700">
              {isOCRLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4" />} Run OCR AI Scan
            </Button>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Selected Type: <span className="text-slate-700 normal-case">{selectedOCRDocumentType}</span>
              </div>

              {validationResult && (
                <div className="mb-3 rounded-md border border-slate-200 bg-white p-3 text-sm">
                  <p className="text-slate-700">
                    Matched Document Type: {validationResult.isMatch ? '✅' : '❌'}
                  </p>
                  <p className="text-slate-700">Confidence Score: {validationResult.confidence}%</p>
                  <p className="text-slate-700">
                    Detected Keywords: {validationResult.matchedKeywords.length > 0 ? validationResult.matchedKeywords.join(', ') : 'None'}
                  </p>
                  {!validationResult.isMatch && (
                    <p className="mt-2 flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-4 w-4" />
                      Uploaded document does not match selected type
                    </p>
                  )}
                </div>
              )}

              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <FileText className="h-4 w-4" /> Extracted Text
              </div>
              <pre className="whitespace-pre-wrap text-xs text-slate-600">{ocrText || 'No OCR output yet.'}</pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
