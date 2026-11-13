'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { Loader2 } from 'lucide-react';

const DEPARTMENTS = ['Accounting Information System', 'Accountancy', 'Psychology', 'Education', 'Information Technology', 'Multimedia Arts', 'Communication', 'Tourism Management', 'Hospitality Management', 'Business Administration', 'Radiologic Technology', 'Physical Therapy', 'Nursing', 'Biology', 'Pharmacy', 'Medical Laboratory Science'] as const;
const schema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name.'),
  lastName: z.string().trim().min(1, 'Enter your last name.'),
  middleName: z.string().trim().optional(),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(12, 'Use at least 12 characters.').regex(/[A-Za-z]/, 'Include a letter.').regex(/\d/, 'Include a number.'),
  department: z.enum(DEPARTMENTS, { message: 'Select your department.' }),
  phone: z.string().trim().min(1, 'Enter your phone number.'),
  statusOfAppointment: z.enum(['full-time', 'part-time'], { message: 'Select your appointment status.' }),
  role: z.enum(['faculty', 'program_chair', 'dean'], { message: 'Select your role.' }),
});
type RegistrationValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<RegistrationValues>({ resolver: zodResolver(schema), defaultValues: { firstName: '', lastName: '', middleName: '', email: '', password: '', department: undefined, phone: '', statusOfAppointment: 'full-time', role: 'faculty' } });

  async function onSubmit(values: RegistrationValues) {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Registration failed.');
      toast({ title: 'Registration submitted', description: 'An administrator must approve your account before you can sign in.', type: 'success' });
      router.push('/login');
    } catch (error) {
      toast({ title: 'Registration failed', description: error instanceof Error ? error.message : 'Please try again.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10">
      <Card className="surface-panel w-full max-w-2xl border-0 shadow-none">
        <CardHeader><CardTitle className="text-3xl">Create an account</CardTitle><CardDescription>Submit your faculty details for administrator approval.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5 md:grid-cols-2" noValidate>
            {(['firstName', 'lastName', 'middleName'] as const).map((field) => (
              <div key={field} className="space-y-2"><Label htmlFor={field}>{field === 'firstName' ? 'First name' : field === 'lastName' ? 'Last name' : 'Middle name'}</Label><Input id={field} {...form.register(field)} placeholder={field === 'middleName' ? 'Optional' : undefined} />{form.formState.errors[field] && <p className="text-sm text-red-600">{form.formState.errors[field].message}</p>}</div>
            ))}
            <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" {...form.register('email')} />{form.formState.errors.email && <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>}</div>
            <div className="space-y-2"><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" {...form.register('phone')} />{form.formState.errors.phone && <p className="text-sm text-red-600">{form.formState.errors.phone.message}</p>}</div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" {...form.register('password')} /><p className="text-xs text-slate-500">At least 12 characters, including a letter and a number.</p>{form.formState.errors.password && <p className="text-sm text-red-600">{form.formState.errors.password.message}</p>}</div>
            <div className="space-y-2"><Label htmlFor="department">Department</Label><Select value={form.watch('department') ?? ''} onValueChange={(value) => form.setValue('department', value as RegistrationValues['department'], { shouldValidate: true })}><SelectTrigger id="department"><SelectValue placeholder="Select a department" /></SelectTrigger><SelectContent>{DEPARTMENTS.map((department) => <SelectItem key={department} value={department}>{department}</SelectItem>)}</SelectContent></Select>{form.formState.errors.department && <p className="text-sm text-red-600">{form.formState.errors.department.message}</p>}</div>
            <div className="space-y-2"><Label htmlFor="statusOfAppointment">Appointment status</Label><Select value={form.watch('statusOfAppointment')} onValueChange={(value) => form.setValue('statusOfAppointment', value as RegistrationValues['statusOfAppointment'], { shouldValidate: true })}><SelectTrigger id="statusOfAppointment"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="full-time">Full-time</SelectItem><SelectItem value="part-time">Part-time</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="role">Role</Label><Select value={form.watch('role')} onValueChange={(value) => form.setValue('role', value as RegistrationValues['role'], { shouldValidate: true })}><SelectTrigger id="role"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="faculty">Faculty</SelectItem><SelectItem value="program_chair">Program Chair</SelectItem><SelectItem value="dean">Dean</SelectItem></SelectContent></Select>{form.formState.errors.role && <p className="text-sm text-red-600">{form.formState.errors.role.message}</p>}</div>
            <div className="flex items-center justify-between md:col-span-2"><Link href="/login" className="text-sm text-slate-600 underline">Already have an account?</Link><Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit registration</Button></div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
