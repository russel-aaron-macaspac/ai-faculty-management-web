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
import { Loader2 } from 'lucide-react';

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
    } finally {
      setIsLoading(false);
    }
  }

  if (showSplash) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(239,68,68,0.16),transparent_42%),radial-gradient(circle_at_80%_30%,rgba(248,113,113,0.14),transparent_36%),radial-gradient(circle_at_50%_90%,rgba(251,146,60,0.12),transparent_46%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.12)_0%,rgba(15,23,42,0.45)_55%,rgba(2,6,23,0.75)_100%)]" />
        <div className="splash-grid-overlay absolute inset-0" />

        <div className="splash-fade-in relative z-10 flex w-full max-w-xl flex-col items-center gap-6 px-6 text-center">
          <div className="splash-logo-glow" aria-hidden="true" />
          <Image
            src="/croppedcolored.png"
            alt="DomStaX"
            width={260}
            height={96}
            priority
            className="splash-logo-pulse splash-logo-clarity relative z-10 h-auto w-[220px] sm:w-[260px]"
          />

          <p className="text-sm tracking-[0.24em] text-red-100/90 uppercase">Efficiency Starts Here.</p>

          <div className="splash-progress-track w-56 overflow-hidden rounded-full bg-white/15">
            <div className="splash-progress-bar h-1.5 w-full rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

      <Card className="w-full max-w-md shadow-xl border-0 bg-white/80 backdrop-blur-sm z-10">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight text-slate-900">Sign in</CardTitle>
          <CardDescription className="text-slate-500">
            Efficiency Starts Here
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="youremail@sdca.edu.ph" {...field} className="bg-white" />
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
                      <Input type="password" placeholder="••••••••" {...field} className="bg-white" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}