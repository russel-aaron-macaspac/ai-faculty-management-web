'use client';

import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { BookOpen, CheckCircle2, Loader2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

const subjectSchema = z.object({
  code: z.string().trim().min(1, 'Enter the subject code.'),
  name: z.string().trim().min(1, 'Enter the subject description.'),
  units: z.coerce.number({ message: 'Enter the number of units.' }).positive('Units must be greater than zero.'),
});

type SubjectFormValues = z.infer<typeof subjectSchema>;
type Subject = { id: string; code: string; name: string; units?: number | null };

export default function SubjectManagementPage() {
  return (
    <RouteGuard requiredRoles={['admin']} fallbackPath="/dashboard/faculty">
      <SubjectManagementContent />
    </RouteGuard>
  );
}

function SubjectManagementContent() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSubject, setCreatedSubject] = useState<Subject | null>(null);
  const form = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectSchema),
    defaultValues: { code: '', name: '', units: undefined },
  });

  const loadSubjects = async () => {
    try {
      const response = await fetch('/api/scheduling/subjects');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to load subjects.');
      setSubjects(payload.data || []);
    } catch (error) {
      toast({ title: 'Unable to load subjects', description: error instanceof Error ? error.message : 'Please try again.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSubjects();
  }, []);

  const onSubmit = async (values: SubjectFormValues) => {
    setIsSubmitting(true);
    setCreatedSubject(null);

    try {
      const response = await fetch('/api/scheduling/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to create the subject.');

      setCreatedSubject(payload.data);
      form.reset();
      await loadSubjects();
      toast({ title: payload.message === 'Subject already exists' ? 'Subject already exists' : 'Subject created', description: `${payload.data.code} - ${payload.data.name}`, type: 'success' });
    } catch (error) {
      toast({ title: 'Subject creation failed', description: error instanceof Error ? error.message : 'Please try again.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D4A017]">Administration</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Subject Management</h1>
        <p className="text-slate-500">Add subjects that can be used when loading faculty schedules.</p>
      </div>

      <section className="surface-panel rounded-[12px] p-6 md:p-8">
        {createdSubject && (
          <div className="mb-6 flex gap-3 rounded-[10px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div><p className="font-semibold">Subject ready</p><p>{createdSubject.code} - {createdSubject.name} is available for scheduling.</p></div>
          </div>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="grid gap-5 md:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,0.6fr)]">
            <div className="space-y-2">
              <Label htmlFor="subjectCode">Subject Code</Label>
              <Input id="subjectCode" placeholder="e.g. IT301" {...form.register('code')} aria-invalid={!!form.formState.errors.code} />
              {form.formState.errors.code && <p className="text-sm text-red-600">{form.formState.errors.code.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="subjectDescription">Subject Description</Label>
              <Input id="subjectDescription" placeholder="e.g. Database Management Systems" {...form.register('name')} aria-invalid={!!form.formState.errors.name} />
              {form.formState.errors.name && <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="subjectUnits">Units</Label>
              <Input id="subjectUnits" type="number" min="0.5" step="0.5" placeholder="e.g. 3" {...form.register('units', { valueAsNumber: true })} aria-invalid={!!form.formState.errors.units} />
              {form.formState.errors.units && <p className="text-sm text-red-600">{form.formState.errors.units.message}</p>}
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-200 pt-5">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {isSubmitting ? 'Adding subject...' : 'Add Subject'}
            </Button>
          </div>
        </form>
      </section>

      <section className="surface-panel rounded-[12px] p-6 md:p-8">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-[#D4A017]" />
          <h2 className="font-semibold text-slate-900">Saved Subjects</h2>
          <span className="text-sm text-slate-500">({subjects.length})</span>
        </div>
        {isLoading ? <p className="text-sm text-slate-500">Loading subjects...</p> : subjects.length === 0 ? <p className="text-sm text-slate-500">No subjects have been added yet.</p> : (
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {subjects.map((subject) => <div key={subject.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,2fr)_minmax(0,0.5fr)]"><span className="font-medium text-slate-900">{subject.code}</span><span className="text-slate-600">{subject.name}</span><span className="text-slate-500">{subject.units ?? '-'} units</span></div>)}
          </div>
        )}
      </section>
    </div>
  );
}