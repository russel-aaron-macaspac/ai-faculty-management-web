'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, FileText, Loader2, Save, UploadCloud, ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { clearanceService } from '@/services/clearanceService';
import { toast } from '@/lib/toast';
import { Clearance } from '@/types/clearance';
import { fromOfficeSlug } from '@/lib/clearanceOffices';
import { StoredUser, normalize } from '@/lib/stringUtils';
import { SubmittedDocument } from '@/lib/documentTypes';

type OfficeLocalState = {
  notes: string;
  documents: SubmittedDocument[];
};

const emptyLocalState: OfficeLocalState = {
  notes: '',
  documents: [],
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
  const [offices, setOffices] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const storageKey = `clearance-office-${officeSlug}`;
  const [officeState, setOfficeState] = useState<OfficeLocalState>(() => loadSavedState(storageKey));
  const [selectedDocumentFiles, setSelectedDocumentFiles] = useState<File[]>([]);
  const [documentError, setDocumentError] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const officeData = useMemo(() => {
    if (!officeName || offices.length === 0) return null;
    const match = offices.find((o) => o.name.toLowerCase() === officeName.toLowerCase());
    if (!match) return null;
    return { id: match.id, name: match.name };
  }, [officeName, offices]);

  const handleOpenFile = async (path: string) => {
    setFileError('');
    if (!path) {
      setFileError('No file available');
      return;
    }
    setFileLoading(true);
    try {
      const url = await clearanceService.getFileUrl(path);
      if (url) window.open(url, '_blank');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open file';
      setFileError(msg);
    } finally {
      setFileLoading(false);
    }
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

  const canSubmitDocument =
    !ownOfficeRecord ||
    ownOfficeRecord.status === 'rejected';

  const saveLocalState = (nextState: OfficeLocalState) => {
    localStorage.setItem(storageKey, JSON.stringify(nextState));
    setOfficeState(nextState);
  };

  const handleSaveNotes = () => {
    saveLocalState(officeState);
  };

  const handleSubmitDocument = async () => {
      setDocumentError('');
      if (!selectedDocumentFiles || selectedDocumentFiles.length === 0) {
        setDocumentError('Choose at least one file before submitting the document.');
        return;
      }

    const userId = currentUser?.supabase_id ?? '';
    if (!userId) {
      setDocumentError('Your record is missing the Supabase user UUID. Please log out and sign in again.');
      return;
    }

    if (!officeData?.id) {
      console.error('Office not found for slug:', officeSlug, '| officeName:', officeName, '| offices:', offices);
      setDocumentError('Office not found. Please contact the administrator.');
      return;
    }

    try {
      await clearanceService.uploadDocuments(
        userId,
        Number(officeData.id),
        selectedDocumentFiles
      );

      const newDocs = selectedDocumentFiles.map((f) => ({ name: f.name, submittedAt: new Date().toLocaleString() }));
      const nextDocuments = [
        ...newDocs,
        ...officeState.documents,
      ];

      setSelectedDocumentFiles([]);
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

  const status = ownOfficeRecord?.status || 'pending';
  const submittedDate = ownOfficeRecord?.submissionDate || (officeState.documents[0]?.submittedAt ?? 'Not submitted');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{officeName}</h1>
          <p className="text-slate-500 mt-1">Office-specific clearance status, notes, and document submission.</p>
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
              {ownOfficeRecord?.filePath && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleOpenFile(ownOfficeRecord.filePath as string)}
                    disabled={fileLoading || deleting}
                  >
                    {fileLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    View submitted file
                  </Button>
                    {ownOfficeRecord?.id && (currentUser?.supabase_id === ownOfficeRecord.employeeId || String(currentUser?.id) === String(ownOfficeRecord.employeeId)) && ownOfficeRecord.status !== 'approved' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="ml-2"
                        onClick={async () => {
                          if (!confirm('Delete this submitted document? This will remove the submission and allow re-upload.')) return;
                          setDeleting(true);
                          try {
                            await clearanceService.deleteDocument(ownOfficeRecord.id as string);
                            const data = await clearanceService.getClearances();
                            setRecords(data);
                            toast({ title: 'Deleted', description: 'Document removed. You may upload again.', type: 'info' });
                          } catch (err) {
                            toast({ title: 'Delete Failed', description: err instanceof Error ? err.message : 'Unable to delete document', type: 'error' });
                          } finally {
                            setDeleting(false);
                          }
                        }}
                        disabled={fileLoading || deleting}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </Button>
                    )}
                  {fileError && <p className="text-sm text-rose-600 mt-2">{fileError}</p>}
                </div>
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
                multiple
                onChange={(event) => {
                  const files = event.target.files ? Array.from(event.target.files) : [];
                  setSelectedDocumentFiles(files);
                  if (documentError) setDocumentError('');
                }}
              />
              <p className="text-xs text-slate-500">Attach a file that matches the selected office requirement before submitting.</p>
              {documentError && <p className="text-sm text-rose-600">{documentError}</p>}
              <Button
                onClick={() => void handleSubmitDocument()}
                disabled={!canSubmitDocument}
                className="bg-red-600 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UploadCloud className="mr-2 h-4 w-4" /> Submit Document
              </Button>
              {!canSubmitDocument && (
                <p className="text-sm text-slate-500">
                  A clearance record already exists for this office. Please wait for review or contact the administrator if you need to upload again.
                </p>
              )}
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
        </div>
      )}
    </div>
  );
}