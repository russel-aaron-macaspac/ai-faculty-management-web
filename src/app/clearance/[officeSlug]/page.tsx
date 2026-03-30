'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, FileText, Loader2, ScanLine, Save, UploadCloud, ArrowLeft, Trash2, Bell, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clearanceService } from '@/services/clearanceService';
import { Clearance, ClearanceNote } from '@/types/clearance';
import { fromOfficeSlug } from '@/lib/clearanceOffices';
import { StoredUser, normalize } from '@/lib/stringUtils';
import { 
  DOCUMENT_TYPES, 
  validateDocument,
  SubmittedDocument,
  DocumentValidationResult 
} from '@/lib/documentTypes';
import { useClearanceNotifications } from '@/hooks/useClearanceNotifications';
import { format } from 'date-fns';

type OfficeLocalState = {
  notes: string;
  documents: SubmittedDocument[];
  ocrText: string;
};

const emptyLocalState: OfficeLocalState = {
  notes: '',
  documents: [],
  ocrText: '',
};

const loadSavedState = (key: string): OfficeLocalState => {
  if (globalThis.window === undefined) {
    return emptyLocalState;
  }

  const raw = localStorage.getItem(key);
  if (!raw) {
    return emptyLocalState;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OfficeLocalState>;
    return {
      notes: parsed.notes || '',
      documents: parsed.documents || [],
      ocrText: parsed.ocrText || '',
    };
  } catch {
    return emptyLocalState;
  }
};

const getStatusClass = (status: Clearance['status']) => {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-800';
  if (status === 'submitted') return 'bg-red-100 text-red-800';
  if (status === 'rejected') return 'bg-rose-100 text-rose-800';
  return 'bg-slate-100 text-slate-800';
};

export default function OfficeClearanceDetailPage() {
  const params = useParams<{ officeSlug: string }>();
  const officeSlug = Array.isArray(params.officeSlug) ? params.officeSlug[0] : params.officeSlug;
  const officeName = fromOfficeSlug(officeSlug) || officeSlug.split('-').join(' ');

  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [records, setRecords] = useState<Clearance[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<ClearanceNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  const { unreadCount } = useClearanceNotifications(
    currentUser?.id ? String(currentUser.id) : null
  );

  const storageKey = `clearance-office-${officeSlug}`;
  const [officeState, setOfficeState] = useState<OfficeLocalState>(() => loadSavedState(storageKey));
  const [selectedDocumentFile, setSelectedDocumentFile] = useState<File | null>(null);
  const [selectedOCRFile, setSelectedOCRFile] = useState<File | null>(null);
  const [selectedOCRDocumentType, setSelectedOCRDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [isOCRLoading, setIsOCRLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<DocumentValidationResult | null>(null);

  const handleOCRDocumentTypeChange = (value: string | null) => {
    setSelectedOCRDocumentType(value ?? DOCUMENT_TYPES[0]);
  };

  const getNoteClass = (noteType: string) => {
    if (noteType === 'remark') return 'bg-blue-50 border-blue-200';
    if (noteType === 'validation') return 'bg-amber-50 border-amber-200';
    return 'bg-slate-50 border-slate-200';
  };

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

  // Fetch remarks when the own office record changes
  const ownOfficeRecord = useMemo(() => {
    const accountId = currentUser?.id ? String(currentUser.id) : '';
    const accountName = normalize(currentUser?.full_name || currentUser?.name || '');

    const officeMatches = (record: Clearance) => normalize(record.requiredDocument) === normalize(officeName);

    return records.find((record) => {
      const sameId = accountId !== '' && record.employeeId === accountId;
      const recordName = normalize(record.employeeName);
      const sameName =
        accountName !== '' &&
        (recordName === accountName || recordName.includes(accountName) || accountName.includes(recordName));

      return officeMatches(record) && (sameId || sameName);
    });
  }, [records, currentUser, officeName]);

  useEffect(() => {
    if (ownOfficeRecord?.id) {
      setLoadingNotes(true);
      clearanceService
        .getClearanceNotes(ownOfficeRecord.id)
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
  }, [ownOfficeRecord?.id]);

  const saveLocalState = (nextState: OfficeLocalState) => {
    localStorage.setItem(storageKey, JSON.stringify(nextState));
    setOfficeState(nextState);
  };

  const handleSaveNotes = () => {
    saveLocalState(officeState);
  };

  const handleSubmitDocument = async () => {
    if (!selectedDocumentFile) return;

    const employeeId = currentUser?.id ? String(currentUser.id) : '';
    if (!employeeId) return;

    try {
      await clearanceService.uploadDocument(
        employeeId,
        currentUser?.full_name || currentUser?.name || '',
        officeName
      );

      const nextDocuments = [
        { name: selectedDocumentFile.name, submittedAt: new Date().toLocaleString() },
        ...officeState.documents,
      ];

      setSelectedDocumentFile(null);
      saveLocalState({ ...officeState, documents: nextDocuments });

      const data = await clearanceService.getClearances();
      setRecords(data);
    } catch (err) {
      console.error('Failed to submit document:', err);
      const message = err instanceof Error ? err.message : 'Failed to submit document';
      globalThis.alert(message);
    }
  };

  const handleRemoveDocument = (indexToRemove: number) => {
    const target = officeState.documents[indexToRemove];
    if (!target) {
      return;
    }

    const shouldRemove = globalThis.confirm(`Remove submitted document "${target.name}"?`);
    if (!shouldRemove) {
      return;
    }

    const nextDocuments = officeState.documents.filter((_, index) => index !== indexToRemove);
    saveLocalState({ ...officeState, documents: nextDocuments });
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

      saveLocalState({
        ...officeState,
        ocrText: extractedText,
      });
      setValidationResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process OCR.';
      saveLocalState({
        ...officeState,
        ocrText: `OCR scan failed: ${message}`,
      });
      setValidationResult(null);
    } finally {
      setIsOCRLoading(false);
    }
  };

  const status = ownOfficeRecord?.status || 'pending';
  const submittedDate = ownOfficeRecord?.submissionDate || (officeState.documents[0]?.submittedAt ?? 'Not submitted');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{officeName}</h1>
          <p className="text-slate-500 mt-1">Office-specific clearance status, notes, submission, and OCR AI scan.</p>
        </div>
        <Link href="/clearance" className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <ArrowLeft className="h-4 w-4" /> Back to Clearance
        </Link>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-red-500" />
          Loading office details...
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                    <Bell className="h-3 w-3" />
                    {unreadCount}
                  </div>
                )}
                Status & Officer Remarks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-600">Current Status</div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium capitalize gap-2 ${getStatusClass(status)}`}
                  >
                    {status === 'approved' && <CheckCircle2 className="h-4 w-4" />}
                    {status === 'rejected' && <XCircle className="h-4 w-4" />}
                    {status}
                  </span>
                </div>
              </div>

              {ownOfficeRecord?.rejectionReason && (
                <div className="rounded-md bg-rose-50 p-3 border border-rose-200">
                  <p className="text-sm font-medium text-rose-800">Rejection Reason:</p>
                  <p className="text-sm text-rose-700 mt-1">{ownOfficeRecord.rejectionReason}</p>
                </div>
              )}

              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-600">
                  Officer Remarks
                  {loadingNotes && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
                </div>
                {notes.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">No remarks from officers yet</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        className={`rounded-md border p-3 text-sm ${getNoteClass(note.note_type)}`}
                      >
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
                )}
              </div>

              <p className="text-xs text-slate-500">Submitted: {submittedDate}</p>
              {ownOfficeRecord?.validationWarning && (
                <p className="text-sm text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  {ownOfficeRecord.validationWarning}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                className="min-h-28 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-red-500"
                value={officeState.notes}
                onChange={(event) => setOfficeState((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Add office follow-up notes..."
              />
              <Button onClick={handleSaveNotes} className="bg-red-600 hover:bg-red-700">
                <Save className="mr-2 h-4 w-4" /> Save Notes
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Document Submission</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="file" onChange={(event) => setSelectedDocumentFile(event.target.files?.[0] || null)} />
              <Button onClick={() => void handleSubmitDocument()} className="bg-red-600 hover:bg-red-700">
                <UploadCloud className="mr-2 h-4 w-4" /> Submit Document
              </Button>

              <div className="space-y-2">
                {officeState.documents.length === 0 ? (
                  <p className="text-sm text-slate-500">No local submissions yet.</p>
                ) : (
                  officeState.documents.map((document, index) => (
                    <div key={`${document.name}-${index}`} className="rounded-md border border-slate-200 p-2 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-700">{document.name}</div>
                          <div className="text-xs text-slate-500">Submitted: {document.submittedAt}</div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRemoveDocument(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>OCR AI Scanner</CardTitle>
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
                <pre className="whitespace-pre-wrap text-xs text-slate-600">{officeState.ocrText || 'No OCR output yet.'}</pre>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}