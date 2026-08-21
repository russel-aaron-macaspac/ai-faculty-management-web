'use client';

import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Eye, EyeOff, Loader2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

const accountSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the faculty member’s full name.'),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(12, 'Use at least 12 characters.').regex(/[A-Za-z]/, 'Include at least one letter.').regex(/\d/, 'Include at least one number.'),
  role: z.enum(['faculty', 'program_chair'], { message: 'Select a faculty role.' }),
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
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: { fullName: '', email: '', password: '', role: 'faculty' },
  });

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
      form.reset({ fullName: '', email: '', password: '', role: 'faculty' });
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
        {createdAccount && (
          <div className="mb-6 flex gap-3 rounded-[10px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div><p className="font-semibold">Account ready</p><p>{createdAccount.name} ({createdAccount.email}) can sign in with the assigned {createdAccount.role === 'program_chair' ? 'program chair' : 'faculty'} role.</p></div>
          </div>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="fullName">Faculty Name</Label>
            <Input id="fullName" placeholder="e.g. Dr. Maria Santos" {...form.register('fullName')} aria-invalid={!!form.formState.errors.fullName} />
            {form.formState.errors.fullName && <p className="text-sm text-red-600">{form.formState.errors.fullName.message}</p>}
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
            <Label htmlFor="role">Role</Label>
            <Select value={form.watch('role')} onValueChange={(value) => form.setValue('role', value as AccountFormValues['role'], { shouldValidate: true })}>
              <SelectTrigger id="role" aria-invalid={!!form.formState.errors.role}><SelectValue placeholder="Select a role" /></SelectTrigger>
              <SelectContent><SelectItem value="faculty">Faculty</SelectItem><SelectItem value="program_chair">Program Chair</SelectItem></SelectContent>
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
    </div>
  );
}
