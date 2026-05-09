'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, FileText, Loader2, ScanLine, Save, UploadCloud, ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clearanceService } from '@/services/clearanceService';
import { Clearance } from '@/types/clearance';
import { fromOfficeSlug } from '@/lib/clearanceOffices';
import { StoredUser, normalize } from '@/lib/stringUtils';
import { 
  DOCUMENT_TYPES, 
  validateDocument,
  SubmittedDocument,
  DocumentValidationResult 
} from '@/lib/documentTypes';

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
  if (globalThis.window === undefined) return emptyLocalState;
  const raw = localStorage.getItem(key);
  if (!raw) return emptyLocalState;
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

const DOCUMENT_TYPE_RULES: Record<string, string[]> = {
  'ICT Device Return Slip': ['device return', 'ict office', 'asset tag'],
  'Library Clearance Form': ['library', 'borrowed books', 'return slip'],
  'Laboratory Tools Return Checklist': ['laboratory', 'tools', 'checklist'],
  'CESO Completion Certificate': ['ceso', 'completion certificate', 'completed'],
  'Financial Clearance': ['financial clearance', 'cashier', 'no outstanding balance'],
  'PMO Equipment Return': ['pmo', 'equipment return', 'property management office'],
  'Program Chair Clearance': ['program chair', 'clearance', 'department'],
  'Borrowed Book Slip': ['borrowed book slip', 'borrowed books slip', 'borrowed book', 'library', 'book return', 'dlrc'],
};

export default function OfficeClearanceDetailPage() {
  const params = useParams<{ officeSlug: string }>();
  const officeSlug = Array.isArray(params.officeSlug) ? params.officeSlug[0] : params.officeSlug;
  const officeName = fromOfficeSlug(officeSlug) || officeSlug.split('-').join(' ');

  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [records, setRecords] = useState<Clearance[]>([]);
  const [offices, setOffices] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const storageKey = `clearance-office-${officeSlug}`;
  const [officeState, setOfficeState] = useState<OfficeLocalState>(() => loadSavedState(storageKey));
  const [selectedDocumentFile, setSelectedDocumentFile] = useState<File | null>(null);
  const [selectedOCRFile, setSelectedOCRFile] = useState<File | null>(null);
  const [selectedOCRDocumentType, setSelectedOCRDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [isOCRLoading, setIsOCRLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<DocumentValidationResult | null>(null);
  const [documentError, setDocumentError] = useState('');
  const [ocrError, setOcrError] = useState('');

  const officeData = useMemo(() => {
    if (!officeName || offices.length === 0) return null;
    const match = offices.find((o) => o.name.toLowerCase() === officeName.toLowerCase());
    if (!match) return null;
    return { id: match.id, name: match.name };
  }, [officeName, offices]);

  const handleOCRDocumentTypeChange = (value: string | null) => {
    setSelectedOCRDocumentType(value ?? DOCUMENT_TYPES[0]);
  };

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (raw) {
      try {
        setCurrentUser(JSON.parse(raw) as StoredUser);
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    clearanceService.getOffices().then((data) => {
      if (Array.isArray(data)) setOffices(data);
    });
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

  const ownOfficeRecord = useMemo(() => {
    const accountId = currentUser?.id ? String(currentUser.id) : '';
    const accountName = normalize(currentUser?.full_name || currentUser?.name || '');
    const officeMatches = (record: Clearance) =>
      normalize(record.requiredDocument) === normalize(officeName);

    return records.find((record) => {
      const sameId = accountId !== '' && record.employeeId === accountId;
      const recordName = normalize(record.employeeName);
      const sameName =
        accountName !== '' &&
        (recordName === accountName || recordName.includes(accountName) || accountName.includes(recordName));
      return officeMatches(record) && (sameId || sameName);
    });
  }, [records, currentUser, officeName]);

  const saveLocalState = (nextState: OfficeLocalState) => {
    localStorage.setItem(storageKey, JSON.stringify(nextState));
    setOfficeState(nextState);
  };

  const handleSaveNotes = () => {
    saveLocalState(officeState);
  };

  const handleSubmitDocument = async () => {
    setDocumentError('');
    if (!selectedDocumentFile) {
      setDocumentError('Choose a file before submitting the document.');
      return;
    }

    const userId = currentUser?.id ? String(currentUser.id) : '';
    if (!userId) {
      setDocumentError('Your user ID is missing. Please log in again.');
      return;
    }

    if (!officeData?.id) {
      console.error('Office not found for slug:', officeSlug, '| officeName:', officeName, '| offices:', offices);
      setDocumentError('Office not found. Please contact the administrator.');
      return;
    }

    try {
      await clearanceService.uploadDocument(
        userId,
        Number(officeData.id),
        selectedDocumentFile.name,
      );

      const nextDocuments = [
        { name: selectedDocumentFile.name, submittedAt: new Date().toLocaleString() },
        ...officeState.documents,
      ];

      setSelectedDocumentFile(null);
      setDocumentError('');
      saveLocalState({ ...officeState, documents: nextDocuments });

      const data = await clearanceService.getClearances();
      setRecords(data);
    } catch (err) {
      console.error('Failed to submit document:', err);
      setDocumentError(err instanceof Error ? err.message : 'Failed to submit document. Please try again.');
    }
  };

  const handleRemoveDocument = (indexToRemove: number) => {
    const target = officeState.documents[indexToRemove];
    if (!target) return;
    const shouldRemove = globalThis.confirm(`Remove submitted document "${target.name}"?`);
    if (!shouldRemove) return;
    const nextDocuments = officeState.documents.filter((_, index) => index !== indexToRemove);
    saveLocalState({ ...officeState, documents: nextDocuments });
  };

  const handleRunOCR = async () => {
    setOcrError('');
    if (!selectedOCRFile) {
      setOcrError('Choose a file before running OCR.');
      return;
    }
    setIsOCRLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedOCRFile);
      const response = await fetch('/api/ocr', { method: 'POST', body: formData });
      const payload = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || 'OCR request failed');
      const extractedText = payload.text || '';
      const result = validateDocument(selectedOCRDocumentType, extractedText);
      saveLocalState({ ...officeState, ocrText: extractedText });
      setValidationResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process OCR.';
      saveLocalState({ ...officeState, ocrText: `OCR scan failed: ${message}` });
      setValidationResult(null);
      setOcrError(message);
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
            <CardHeader><CardTitle>Status</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getStatusClass(status)}`}>
                {status}
              </span>
              <p className="text-sm text-slate-600">Submission date: {submittedDate}</p>
              {ownOfficeRecord?.validationWarning && (
                <p className="text-sm text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  {ownOfficeRecord.validationWarning}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
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
            <CardHeader><CardTitle>Document Submission</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="file"
                onChange={(event) => {
                  setSelectedDocumentFile(event.target.files?.[0] || null);
                  if (documentError) setDocumentError('');
                }}
              />
              <p className="text-xs text-slate-500">Attach a file that matches the selected office requirement before submitting.</p>
              {documentError && <p className="text-sm text-rose-600">{documentError}</p>}
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
                        <Button type="button" size="sm" variant="destructive" onClick={() => handleRemoveDocument(index)}>
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader><CardTitle>OCR AI Scanner</CardTitle></CardHeader>
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
              <Input
                type="file"
                onChange={(event) => {
                  setSelectedOCRFile(event.target.files?.[0] || null);
                  if (ocrError) setOcrError('');
                }}
              />
              <p className="text-xs text-slate-500">Run OCR only after selecting a document file to inspect its contents.</p>
              {ocrError && <p className="text-sm text-rose-600">{ocrError}</p>}
              <Button onClick={() => void handleRunOCR()} disabled={isOCRLoading} className="bg-red-600 hover:bg-red-700">
                {isOCRLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4" />} Run OCR AI Scan
              </Button>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Selected Type: <span className="text-slate-700 normal-case">{selectedOCRDocumentType}</span>
                </div>
                {validationResult && (
                  <div className="mb-3 rounded-md border border-slate-200 bg-white p-3 text-sm">
                    <p className="text-slate-700">Matched Document Type: {validationResult.isMatch ? '✅' : '❌'}</p>
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