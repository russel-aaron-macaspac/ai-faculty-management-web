'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser-client';

const schema = z.object({
  password: z.string().min(8, 'Use at least 8 characters.'),
  confirmPassword: z.string().min(1, 'Confirm your new password.'),
}).refine((values) => values.password === values.confirmPassword, { message: 'Passwords do not match.', path: ['confirmPassword'] });

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: '', confirmPassword: '' } });

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    client.auth.getSession().then((sessionResult) => setReady(Boolean(sessionResult.data.session)));
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const onSubmit = async ({ password }: z.infer<typeof schema>) => {
    const client = getSupabaseBrowserClient();
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      form.setError('root', { message: 'The reset link is invalid or expired. Request a new one and try again.' });
      return;
    }
    const sessionResult = await client.auth.getSession();
    const accessToken = sessionResult.data.session?.access_token;
    if (!accessToken) {
      form.setError('root', { message: 'Your recovery session expired. Request a new reset link.' });
      return;
    }
    const response = await fetch('/api/auth/reset-password', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    if (!response.ok) {
      form.setError('root', { message: 'Your password could not be saved. Please request a new reset link.' });
      return;
    }
    await client.auth.signOut();
    router.push('/login?reset=success');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 text-slate-900 university-shell">
      <div aria-hidden="true" className="absolute inset-0 scale-105 bg-cover bg-center blur-lg" style={{ backgroundImage: "url('/school.png')" }} />
      <div className="absolute inset-0 bg-white/35 backdrop-blur-[1px]" />
      <Card className="surface-panel relative z-10 w-full max-w-md border-0 shadow-none">
        <CardHeader className="space-y-3 text-center"><Image src="/croppedcolored.png" alt="DomStaX" width={220} height={80} priority className="mx-auto h-auto" /><CardTitle className="text-3xl font-semibold tracking-tight">Set a new password</CardTitle><CardDescription>{ready ? 'Choose a new password for your account.' : 'Open the reset link from your email to continue.'}</CardDescription></CardHeader>
        <CardContent>
          {ready ? <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField control={form.control} name="password" render={({ field }) => <FormItem><FormLabel>New password</FormLabel><FormControl><div className="relative"><Input type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters" className="pr-12" {...field} /><Button type="button" variant="ghost" size="icon" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="confirmPassword" render={({ field }) => <FormItem><FormLabel>Confirm new password</FormLabel><FormControl><div className="relative"><Input type={showConfirm ? 'text' : 'password'} autoComplete="new-password" placeholder="Re-enter your password" className="pr-12" {...field} /><Button type="button" variant="ghost" size="icon" onClick={() => setShowConfirm((value) => !value)} aria-label={showConfirm ? 'Hide password' : 'Show password'} className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2">{showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div></FormControl><FormMessage /></FormItem>} />
            {form.formState.errors.root && <div role="alert" className="rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{form.formState.errors.root.message}</div>}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}><KeyRound className="mr-2 h-4 w-4" />{form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update password'}</Button>
          </form></Form> : <Link href="/forgot-password" className="flex items-center justify-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Request a new reset link</Link>}
        </CardContent>
      </Card>
    </div>
  );
}