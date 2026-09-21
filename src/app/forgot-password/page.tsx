'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser-client';

const schema = z.object({ email: z.string().trim().email('Enter a valid school email address.') });

export default function ForgotPasswordPage() {
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = async ({ email }: z.infer<typeof schema>) => {
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.toLowerCase(), { redirectTo });
      if (error) {
        form.setError('root', { message: 'We could not send the reset email. Please check the address and try again.' });
        return;
      }
      form.clearErrors('root');
      form.setError('root', { type: 'success', message: 'If an account exists for that email, a reset link is on its way.' });
    } catch (error) {
      form.setError('root', {
        message: error instanceof Error && error.message.includes('Missing NEXT_PUBLIC')
          ? 'Password recovery is not configured. Add the Supabase URL and public key to .env.local, then restart the dev server.'
          : 'We could not send the reset email. Please try again.',
      });
      return;
    }
  };

  const feedback = form.formState.errors.root;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 text-slate-900 university-shell">
      <div aria-hidden="true" className="absolute inset-0 scale-105 bg-cover bg-center blur-lg" style={{ backgroundImage: "url('/school.png')" }} />
      <div className="absolute inset-0 bg-white/35 backdrop-blur-[1px]" />
      <Card className="surface-panel relative z-10 w-full max-w-md border-0 shadow-none">
        <CardHeader className="space-y-3 text-center">
          <Image src="/croppedcolored.png" alt="DomStaX" width={220} height={80} priority className="mx-auto h-auto" />
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#D4A017]/15 text-[#8A6500]"><MailCheck className="h-6 w-6" /></div>
          <CardTitle className="text-3xl font-semibold tracking-tight">Forgot password?</CardTitle>
          <CardDescription>Enter your school email and we&apos;ll send you a secure reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" autoComplete="email" placeholder="youremail@sdca.edu.ph" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {feedback && <div role="status" className={feedback.type === 'success' ? 'rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700' : 'rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'}>{feedback.message}</div>}
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
              <Link href="/login" className="flex items-center justify-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back to sign in</Link>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}