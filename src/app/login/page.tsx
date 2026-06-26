'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { authService } from '@/services/authService';
import { getDashboardPathForRole } from '@/lib/roleConfig';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: 'Email address is required.' })
    .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: 'Enter a valid school email address.',
    }),
  password: z.string().min(1, { message: 'Password is required.' }).min(6, { message: 'Password must be at least 6 characters long.' }),
});

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const splashTimer = globalThis.setTimeout(() => {
      setShowSplash(false);
    }, 2200);

    return () => globalThis.clearTimeout(splashTimer);
  }, []);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authService.login(values.email, values.password);
      localStorage.setItem('user', JSON.stringify(response.user));
  toast({ title: 'Signed In', description: `Welcome back, ${response.user.full_name}`, type: 'success' });
      router.push(getDashboardPathForRole(response.user.role));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      let nextError = 'Unable to sign in right now. Please try again.';

      if (message) {
        nextError = /invalid|credential|password|email/i.test(message)
          ? 'Incorrect email or password. Check your credentials and try again.'
          : message;
      }

  setError(nextError);
  toast({ title: 'Sign In Failed', description: nextError, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }

  if (showSplash) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 text-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.18),transparent_34%),radial-gradient(circle_at_80%_30%,rgba(29,78,216,0.12),transparent_28%),linear-gradient(180deg,#f8fafc,#eef4fb)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent" />
        <div className="splash-grid-overlay absolute inset-0" />

        <div className="splash-fade-in surface-panel relative z-10 flex w-full max-w-xl flex-col items-center gap-6 rounded-3xl px-8 py-10 text-center">
          <div className="splash-logo-glow" aria-hidden="true" />
          <Image
            src="/croppedcolored.png"
            alt="DomStaX"
            width={260}
            height={96}
            priority
            className="splash-logo-pulse splash-logo-clarity relative z-10 h-auto"
            style={{ width: '220px', maxWidth: '260px' }}
          />

          <p className="text-xs font-semibold tracking-[0.24em] text-primary uppercase">Faculty operations, simplified.</p>

          <div className="splash-progress-track w-56 overflow-hidden rounded-full bg-slate-200">
            <div className="splash-progress-bar h-1.5 w-full rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <div className="relative hidden overflow-hidden border-r border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_32%),linear-gradient(180deg,#eff6ff,#f8fafc)] px-10 py-12 lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">DomStaX</p>
          <h1 className="mt-4 max-w-xl text-5xl font-semibold tracking-tight text-slate-900">A modern faculty command center for academic operations.</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
            Manage attendance, clearance, schedules, and faculty workflows from one calm, structured workspace.
          </p>
        </div>

        <div className="grid max-w-xl gap-4 sm:grid-cols-3">
          {[
            ['Unified operations', 'Clearance, scheduling, and attendance in one system.'],
            ['Role-aware views', 'Each user lands on a dashboard tailored to their responsibilities.'],
            ['Professional UI', 'Blue-white surfaces, readable hierarchy, and accessible controls.'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
              <p className="text-sm font-semibold text-slate-900">{title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
        <Card className="surface-panel w-full max-w-md border-0 shadow-none">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-3xl font-semibold tracking-tight text-slate-900">Sign in</CardTitle>
            <CardDescription className="text-slate-500">
              Access your faculty management workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="youremail@sdca.edu.ph" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            {...field}
                            className="pr-12"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowPassword((current) => !current)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            aria-pressed={showPassword}
                            className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-slate-500 hover:text-slate-900"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {error && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}