'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ClearanceCategory } from '@/types/clearance';
import { clearanceService } from '@/services/clearanceService';
import { getRequiredOfficeForOfficer, isApprovalOfficer } from '@/lib/roleConfig';
import { StoredUser, normalize } from '@/lib/stringUtils';

interface ClearanceRequirementsPanelProps {
  user: StoredUser | null;
  offices: { id: string; name: string }[];
}

export function ClearanceRequirementsPanel({ user, offices }: Readonly<ClearanceRequirementsPanelProps>) {
  const [categories, setCategories] = useState<ClearanceCategory[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isOfficer = isApprovalOfficer(user?.role);
  const isFaculty = user?.role === 'faculty' || user?.role === 'program_chair' || user?.role === 'programchair';
  const office = useMemo(() => {
    if (!user?.role) return undefined;
    const officeName = getRequiredOfficeForOfficer(user.role);
    return offices.find((item) => normalize(item.name) === normalize(officeName || ''));
  }, [offices, user?.role]);

  const loadCategories = async () => {
    const data = await clearanceService.getCategories();
    setCategories(data as ClearanceCategory[]);
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const addCategory = async () => {
    if (!office?.id || !title.trim()) return;
    setSaving(true);
    setError('');
    try {
      await clearanceService.createCategory({ officeId: office.id, name: title, description, isRequired: true, sortOrder: categories.length });
      setTitle('');
      setDescription('');
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save requirement.');
    } finally {
      setSaving(false);
    }
  };

  if (isFaculty) {
    const visibleCategories = categories.filter((category) => offices.some((item) => item.id === String(category.officeId)));
    return (
      <Card>
        <CardHeader><div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-[#D4A017]" /><div><h2 className="text-lg font-semibold text-slate-900">Requirements checklist</h2><p className="text-sm text-slate-500">Requirements configured by approval officers.</p></div></div></CardHeader>
        <CardContent className="space-y-5">
          {visibleCategories.length === 0 ? <p className="text-sm text-slate-500">No requirements have been configured yet.</p> : <div className="space-y-2">{visibleCategories.map((category) => { const requirementOffice = category.officeName || offices.find((item) => item.id === String(category.officeId))?.name || 'Approval office'; return <div key={category.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-slate-800">{category.name}</p><span className="text-xs font-semibold text-[#8A6500]">{requirementOffice}</span></div>{category.description && <p className="text-xs text-slate-500">{category.description}</p>}</div>; })}</div>}
        </CardContent>
      </Card>
    );
  }

  if (!isOfficer || !office) return null;

  return (
    <Card>
      <CardHeader><div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-[#D4A017]" /><div><h2 className="text-lg font-semibold text-slate-900">Manage {office.name} requirements</h2><p className="text-sm text-slate-500">These checklist items are saved in the clearance categories table and shown to faculty.</p></div></div></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Requirement name" aria-label="Requirement name" /><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Instructions (optional)" aria-label="Requirement description" /><Button type="button" onClick={() => void addCategory()} disabled={saving || !title.trim()}><Plus className="mr-2 h-4 w-4" />Add requirement</Button></div>
        <div className="space-y-2">{categories.filter((category) => String(category.officeId) === office.id).map((category) => <div key={category.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"><div><p className="text-sm font-medium text-slate-800">{category.name}</p>{category.description && <p className="text-xs text-slate-500">{category.description}</p>}</div><Button type="button" size="sm" variant="ghost" onClick={() => void clearanceService.deleteCategory(String(category.id)).then(loadCategories)} aria-label={`Remove ${category.name}`}><Trash2 className="h-4 w-4 text-rose-500" /></Button></div>)}</div>
        {saving && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" />Saving changes...</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
