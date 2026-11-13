'use client';

import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Eye, EyeOff, Loader2, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

const DEPARTMENTS = [
  'Accounting Information System',
  'Accountancy',
  'Psychology',
  'Education',
  'Information Technology',
  'Multimedia Arts',
  'Communication',
  'Tourism Management',
  'Hospitality Management',
  'Business Administration',
  'Radiologic Technology',
  'Physical Therapy',
  'Nursing',
  'Biology',
  'Pharmacy',
  'Medical Laboratory Science',
] as const;

const accountSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter the first name.'),
  surname: z.string().trim().min(1, 'Enter the surname.'),
  middleName: z.string().trim().optional(),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(12, 'Use at least 12 characters.').regex(/[A-Za-z]/, 'Include at least one letter.').regex(/\d/, 'Include at least one number.'),
  department: z.enum(DEPARTMENTS, { message: 'Select a department.' }),
  phone: z.string().trim().min(1, 'Enter a contact number.'),
  status: z.enum(['active', 'on_leave', 'inactive'], { message: 'Select an account status.' }),
  statusOfAppointment: z.enum(['full-time', 'part-time'], { message: 'Select a status of appointment.' }),
  role: z.enum(['faculty', 'program_chair', 'dean'], { message: 'Select a faculty role.' }),
});

type AccountFormValues = z.infer<typeof accountSchema>;

export default function AccountCreationPage() {
  return (
    <RouteGuard requiredRoles={['admin']} fallbackPath="/dashboard/faculty">
      <AccountCreationContent />
    </RouteGuard>
  );
}

function AccountCreationContent() {
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<{ name: string; email: string; role: string } | null>(null);
  const [pendingAccounts, setPendingAccounts] = useState<Array<{ id: string; name: string; email: string; role: string; phone: string; department: string; statusOfAppointment: string }>>([]);
  const [isLoadingPending, setIsLoadingPending] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ id: string; name: string; action: 'approve' | 'reject' } | null>(null);
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: { firstName: '', surname: '', middleName: '', email: '', password: '', department: undefined, phone: '', status: 'active', statusOfAppointment: 'full-time', role: 'faculty' },
  });

  const loadPendingAccounts = async () => {
    try {
      const response = await fetch('/api/users/accounts/approval');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to load account requests.');
      setPendingAccounts(payload.data || []);
    } catch (error) {
      toast({ title: 'Unable to load requests', description: error instanceof Error ? error.message : 'Please try again.', type: 'error' });
    } finally {
      setIsLoadingPending(false);
    }
  };

  useEffect(() => {
    void loadPendingAccounts();
  }, []);

  const updateAccountApproval = async (id: string, action: 'approve' | 'reject') => {
    setProcessingId(id);
    try {
      const response = await fetch('/api/users/accounts/approval', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to update the account request.');
      setPendingAccounts((accounts) => accounts.filter((account) => account.id !== id));
      toast({ title: action === 'approve' ? 'Account approved' : 'Account rejected', description: payload.message, type: 'success' });
    } catch (error) {
      toast({ title: 'Approval update failed', description: error instanceof Error ? error.message : 'Please try again.', type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  const onSubmit = async (values: AccountFormValues) => {
    setIsSubmitting(true);
    setCreatedAccount(null);

    try {
      const response = await fetch('/api/users/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to create the account.');

      setCreatedAccount({ name: payload.data.name, email: payload.data.email, role: payload.data.role });
      form.reset({ firstName: '', surname: '', middleName: '', email: '', password: '', department: undefined, phone: '', status: 'active', statusOfAppointment: 'full-time', role: 'faculty' });
      toast({ title: 'Account created', description: `${payload.data.name} can now sign in.`, type: 'success' });
    } catch (error) {
      toast({ title: 'Account creation failed', description: error instanceof Error ? error.message : 'Please try again.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D4A017]">Administration</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Create Faculty Account</h1>
        <p className="text-slate-500">Set up login credentials and assign the faculty member’s access role.</p>
      </div>

      <section className="surface-panel rounded-[12px] p-6 md:p-8">
        <div className="mb-8 border-b border-slate-200 pb-6">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="text-xl font-semibold text-slate-900">Pending account requests</h2><p className="text-sm text-slate-500">Review registrations before granting access.</p></div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">{pendingAccounts.length}</span>
          </div>
          {isLoadingPending ? <p className="text-sm text-slate-500">Loading requests...</p> : pendingAccounts.length === 0 ? <p className="text-sm text-slate-500">No pending registrations.</p> : (
            <div className="space-y-3">
              {pendingAccounts.map((account) => (
                <div key={account.id} className="rounded-[10px] border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div><p className="font-semibold text-slate-900">{account.name}</p><p className="text-sm text-slate-600">{account.email} · {account.phone}</p><p className="text-xs text-slate-500">{account.department} · {account.statusOfAppointment} · {account.role === 'program_chair' ? 'Program Chair' : account.role === 'dean' ? 'Dean' : 'Faculty'}</p></div>
                    <div className="flex gap-2"><Button type="button" size="sm" disabled={processingId === account.id} onClick={() => setConfirmation({ id: account.id, name: account.name, action: 'reject' })} variant="outline">Reject</Button><Button type="button" size="sm" disabled={processingId === account.id} onClick={() => setConfirmation({ id: account.id, name: account.name, action: 'approve' })}>Approve</Button></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {createdAccount && (
          <div className="mb-6 flex gap-3 rounded-[10px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div><p className="font-semibold">Account ready</p><p>{createdAccount.name} ({createdAccount.email}) can sign in with the assigned {createdAccount.role === 'program_chair' ? 'program chair' : createdAccount.role} role.</p></div>
          </div>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="grid gap-5 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input id="firstName" autoComplete="given-name" placeholder="e.g. Maria" {...form.register('firstName')} aria-invalid={!!form.formState.errors.firstName} />
              {form.formState.errors.firstName && <p className="text-sm text-red-600">{form.formState.errors.firstName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="surname">Last Name</Label>
              <Input id="surname" autoComplete="family-name" placeholder="e.g. Santos" {...form.register('surname')} aria-invalid={!!form.formState.errors.surname} />
              {form.formState.errors.surname && <p className="text-sm text-red-600">{form.formState.errors.surname.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="middleName">Middle Name</Label>
              <Input id="middleName" autoComplete="additional-name" placeholder="Optional" {...form.register('middleName')} aria-invalid={!!form.formState.errors.middleName} />
              {form.formState.errors.middleName && <p className="text-sm text-red-600">{form.formState.errors.middleName.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="faculty@example.edu" {...form.register('email')} aria-invalid={!!form.formState.errors.email} />
            {form.formState.errors.email && <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 12 characters" className="pr-11" {...form.register('password')} aria-invalid={!!form.formState.errors.password} />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-900" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500">Use at least 12 characters, including a letter and a number.</p>
            {form.formState.errors.password && <p className="text-sm text-red-600">{form.formState.errors.password.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="department">Department</Label>
            <Select value={form.watch('department') ?? ''} onValueChange={(value) => form.setValue('department', value as AccountFormValues['department'], { shouldValidate: true })}>
              <SelectTrigger id="department" aria-invalid={!!form.formState.errors.department}><SelectValue placeholder="Select a department" /></SelectTrigger>
              <SelectContent>{DEPARTMENTS.map((department) => <SelectItem key={department} value={department}>{department}</SelectItem>)}</SelectContent>
            </Select>
            {form.formState.errors.department && <p className="text-sm text-red-600">{form.formState.errors.department.message}</p>}
          </div>

          <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" autoComplete="tel" placeholder="e.g. 09171234567" {...form.register('phone')} aria-invalid={!!form.formState.errors.phone} />
              {form.formState.errors.phone && <p className="text-sm text-red-600">{form.formState.errors.phone.message}</p>}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={form.watch('status')} onValueChange={(value) => form.setValue('status', value as AccountFormValues['status'], { shouldValidate: true })}>
                <SelectTrigger id="status" aria-invalid={!!form.formState.errors.status}><SelectValue placeholder="Select a status" /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="on_leave">On leave</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
              {form.formState.errors.status && <p className="text-sm text-red-600">{form.formState.errors.status.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="statusOfAppointment">Status of Appointment</Label>
              <Select value={form.watch('statusOfAppointment')} onValueChange={(value) => form.setValue('statusOfAppointment', value as AccountFormValues['statusOfAppointment'], { shouldValidate: true })}>
                <SelectTrigger id="statusOfAppointment" aria-invalid={!!form.formState.errors.statusOfAppointment}><SelectValue placeholder="Select appointment status" /></SelectTrigger>
                <SelectContent><SelectItem value="full-time">Full-time</SelectItem><SelectItem value="part-time">Part-time</SelectItem></SelectContent>
              </Select>
              {form.formState.errors.statusOfAppointment && <p className="text-sm text-red-600">{form.formState.errors.statusOfAppointment.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={form.watch('role')} onValueChange={(value) => form.setValue('role', value as AccountFormValues['role'], { shouldValidate: true })}>
              <SelectTrigger id="role" aria-invalid={!!form.formState.errors.role}><SelectValue placeholder="Select a role" /></SelectTrigger>
              <SelectContent><SelectItem value="faculty">Faculty</SelectItem><SelectItem value="program_chair">Program Chair</SelectItem><SelectItem value="dean">Dean</SelectItem></SelectContent>
            </Select>
            {form.formState.errors.role && <p className="text-sm text-red-600">{form.formState.errors.role.message}</p>}
          </div>

          <div className="flex justify-end border-t border-slate-200 pt-5">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              {isSubmitting ? 'Creating account...' : 'Create Account'}
            </Button>
          </div>
        </form>
      </section>
      <Dialog open={confirmation !== null} onOpenChange={(open) => { if (!open && !processingId) setConfirmation(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmation?.action === 'approve' ? 'Approve account?' : 'Reject account?'}</DialogTitle>
            <DialogDescription>
              {confirmation?.action === 'approve'
                ? `This will allow ${confirmation?.name} to sign in.`
                : `This will reject ${confirmation?.name}'s registration. They can submit the same email again later.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button
              type="button"
              variant={confirmation?.action === 'reject' ? 'destructive' : 'default'}
              disabled={!confirmation || processingId === confirmation.id}
              onClick={async () => {
                if (!confirmation) return;
                const request = confirmation;
                setConfirmation(null);
                await updateAccountApproval(request.id, request.action);
              }}
            >
              {processingId ? 'Processing...' : confirmation?.action === 'approve' ? 'Approve account' : 'Reject account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
