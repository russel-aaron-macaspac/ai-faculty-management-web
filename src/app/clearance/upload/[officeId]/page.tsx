'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Link as LinkIcon, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { clearanceService } from '@/services/clearanceService';
import { Clearance } from '@/types/clearance';
import { StoredUser } from '@/lib/stringUtils';
import { toast } from '@/lib/toast';
import { PopupDialog } from '@/components/ui/popup-dialog';

type Office = { id: string; name: string };

export default function ClearanceUploadPage() {
  const params = useParams<{ officeId: string }>();
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [office, setOffice] = useState<Office | null>(null);
  const [record, setRecord] = useState<Clearance | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [documentLink, setDocumentLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) {
      router.replace('/login');
      return;
    }

    try {
      const currentUser = JSON.parse(raw) as StoredUser;
      setUser(currentUser);
    } catch {
      router.replace('/login');
    }
  }, [router]);

  useEffect(() => {
    if (!user || !params.officeId) return;

    const load = async () => {
      setLoading(true);
      try {
        const [offices, records] = await Promise.all([
          clearanceService.getOffices(),
          clearanceService.getClearances(user.supabase_id ?? String(user.id ?? ''), params.officeId),
        ]);
        setOffice((offices as Office[]).find((item) => String(item.id) === params.officeId) ?? null);
        setRecord((records as Clearance[])[0] ?? null);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [params.officeId, user]);

  const handleUpload = async () => {
    if (!user || !office || (files.length === 0 && !documentLink.trim())) return;

    let link: URL | null = null;
    if (documentLink.trim()) {
      try {
        link = new URL(documentLink.trim());
        if (!['http:', 'https:'].includes(link.protocol)) throw new Error();
      } catch {
        toast({ title: 'Invalid link', description: 'Enter a valid http:// or https:// document link.', type: 'error' });
        return;
      }
    }

    setSaving(true);
    try {
      let clearanceId = record?.id;
      if (link && record?.id) {
        await clearanceService.addExternalLink(record.id, link.toString());
        toast({ title: 'Document link submitted', description: `The external document link was added for ${office.name}.`, type: 'success' });
        router.push('/clearance');
        return;
      }
      if (!record?.filePath && link) {
        await clearanceService.uploadDocument(
          user.supabase_id ?? String(user.id ?? ''),
          Number(office.id),
          'External document link',
          link.toString(),
          { name: user.name ?? user.full_name, role: user.role }
        );
        toast({ title: 'Document link submitted', description: `The external document link was added for ${office.name}.`, type: 'success' });
        router.push('/clearance');
        return;
      }
      if (!record?.filePath) {
        await clearanceService.uploadDocument(
          user.supabase_id ?? String(user.id ?? ''),
          Number(office.id),
          files[0].name,
          undefined,
          { name: user.name ?? user.full_name, role: user.role },
          files[0]
        );
        const records = await clearanceService.getClearances(user.supabase_id ?? String(user.id ?? ''), office.id);
        clearanceId = (records as Clearance[])[0]?.id;
      }

      if (!clearanceId) throw new Error('The clearance request was created but could not be loaded.');
      const additionalFiles = record?.filePath ? files : files.slice(1);
      if (additionalFiles.length > 0) await clearanceService.addAttachments(clearanceId, additionalFiles);
      toast({ title: 'Documents uploaded', description: `${files.length} file${files.length === 1 ? '' : 's'} added for ${office.name}.`, type: 'success' });
      router.push('/clearance');
    } catch (error) {
      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Could not upload the document.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (attachmentId?: string) => {
    if (!record) return;
    setRemoveTarget(attachmentId ?? 'primary');
  };

  const confirmRemove = async () => {
    if (!record || !removeTarget) return;
    setRemoving(true);
    try {
      if (removeTarget !== 'primary') {
        await clearanceService.deleteAttachment(record.id, removeTarget);
        setRecord({ ...record, attachments: record.attachments?.filter((attachment) => attachment.id !== removeTarget) });
      } else {
        await clearanceService.deletePrimaryFile(record.id);
        setRecord({ ...record, originalFilename: undefined, filePath: undefined });
      }
      setRemoveTarget(null);
      toast({ title: 'File removed', description: 'You can upload a replacement file.', type: 'success' });
    } catch (error) {
      toast({ title: 'Remove failed', description: error instanceof Error ? error.message : 'Could not remove the document.', type: 'error' });
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-red-600" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/clearance" className="inline-flex h-9 items-center justify-center rounded-md px-0 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">
        <ArrowLeft className="mr-2 h-4 w-4" />Back to clearance
      </Link>

      <Card>
        <CardHeader>
          <p className="text-sm font-medium text-slate-600">Faculty clearance</p>
          <h1 className="text-2xl font-semibold text-slate-900">{office?.name ?? 'Office document'}</h1>
          <p className="text-sm text-slate-500">Upload the document required by this office. The office will see it after submission.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {record?.filePath || record?.attachments?.length ? (
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs capitalize text-slate-500">Status: {record.status}</p>
                {record.filePath && <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><FileText className="h-5 w-5 shrink-0 text-red-600" /><p className="truncate text-sm font-medium text-slate-800">{record.originalFilename || 'Submitted document'}</p></div><Button type="button" size="icon-sm" variant="ghost" onClick={() => void handleRemove()} disabled={removing || record.status === 'approved'} aria-label="Delete primary file"><Trash2 className="h-4 w-4 text-rose-600" /></Button></div>}
                {record.attachments?.map((attachment) => <div key={attachment.id} className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><FileText className="h-5 w-5 shrink-0 text-red-600" /><p className="truncate text-sm font-medium text-slate-800">{attachment.originalFilename}</p></div><Button type="button" size="icon-sm" variant="ghost" onClick={() => void handleRemove(attachment.id)} disabled={removing || record.status === 'approved'} aria-label={`Delete ${attachment.originalFilename}`}><Trash2 className="h-4 w-4 text-rose-600" /></Button></div>)}
              </div>
              <div className="space-y-3">
                <Input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} aria-label="Choose clearance documents" />
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={() => void handleUpload()} disabled={files.length === 0 || saving} className="bg-primary text-primary-foreground hover:bg-blue-700">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                    Add files
                  </Button>
                </div>
                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <label htmlFor="clearance-document-link" className="flex items-center gap-2 text-sm font-medium text-slate-700"><LinkIcon className="h-4 w-4" />Or add a link for a large document</label>
                  <Input id="clearance-document-link" type="url" value={documentLink} onChange={(event) => setDocumentLink(event.target.value)} placeholder="https://drive.google.com/..." disabled={saving} />
                  <p className="text-xs text-slate-500">Use a shareable Google Drive or other https link when the file is too large to upload.</p>
                  <Button type="button" variant="outline" onClick={() => void handleUpload()} disabled={!documentLink.trim() || saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                    Submit document link
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} aria-label="Choose clearance documents" />
              <p className="text-xs text-slate-500">Accepted formats: PDF, DOC, DOCX, JPG, JPEG, and PNG.</p>
              <Button type="button" onClick={() => void handleUpload()} disabled={files.length === 0 || saving} className="bg-primary text-primary-foreground hover:bg-blue-700">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                Upload file
              </Button>
              <div className="space-y-2 border-t border-slate-200 pt-4">
                <label htmlFor="clearance-document-link" className="flex items-center gap-2 text-sm font-medium text-slate-700"><LinkIcon className="h-4 w-4" />Or add a link for a large document</label>
                <Input id="clearance-document-link" type="url" value={documentLink} onChange={(event) => setDocumentLink(event.target.value)} placeholder="https://drive.google.com/..." disabled={saving} />
                <p className="text-xs text-slate-500">Use a shareable Google Drive or other https link when the file is too large to upload.</p>
                <Button type="button" variant="outline" onClick={() => void handleUpload()} disabled={!documentLink.trim() || saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                  Submit document link
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <PopupDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remove this file?"
        description="The file will be removed from this office clearance and can be replaced with a new upload."
        confirmLabel="Remove file"
        destructive
        onConfirm={() => void confirmRemove()}
      />
    </div>
  );
}