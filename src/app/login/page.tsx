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
    .min(1, { message: 'Email is required.' })
    .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: 'Enter a valid school email address.',
    }),
  password: z.string().min(1, { message: 'Password is required.' }).min(6, { message: 'Password must be at least 6 characters.' }),
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
      let nextError = 'Sign-in failed. Please try again.';

      if (message) {
        nextError = /invalid|credential|password|email/i.test(message)
          ? 'Incorrect email or password.'
          : 'Sign-in failed. Please try again.';
      }

  setError(nextError);
  toast({ title: 'Sign In Failed', description: nextError, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }

if (showSplash) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 text-slate-900 university-shell">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center bg-no-repeat blur-md scale-105"
          style={{ backgroundImage: "url('/school.png')" }}
        />
        <div className="absolute inset-0 bg-white/24 backdrop-blur-[1px]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.04),rgba(248,250,252,0.7))]" />
        <div className="pointer-events-none absolute left-[12%] top-[18%] h-40 w-40 rounded-full bg-[#D4A017]/12 blur-3xl" />
        <div className="pointer-events-none absolute right-[10%] bottom-[16%] h-48 w-48 rounded-full bg-[#0F172A]/10 blur-3xl" />

        <div className="relative z-10 flex items-center justify-center">
          {/* ambient glow behind logo */}
          <div className="absolute h-56 w-56 rounded-full bg-[#D4A017]/14 blur-3xl animate-pulse" />

          {/* counter-rotating rings */}
          <div className="absolute h-80 w-80 rounded-full border border-dashed border-[#0F172A]/10 animate-[spin_12s_linear_infinite]" />
          <div className="absolute h-64 w-64 rounded-full border border-white/40 animate-[spin_9s_linear_infinite_reverse]" />

          <Image
            src="/croppedcolored.png"
            alt="DomStaX"
            width={220}
            height={37}
            priority
            className="relative z-10 h-auto splash-logo-pulse"
            style={{ width: '200px', maxWidth: '200px' }}
          />

          <div className="absolute left-1/2 top-[calc(50%+4.25rem)] flex -translate-x-1/2 items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#0F172A] animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="h-2 w-2 rounded-full bg-[#0F172A] animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="h-2 w-2 rounded-full bg-[#D4A017] animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 text-slate-900 university-shell">
      <div
        aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center bg-no-repeat blur-lg scale-105"
        style={{ backgroundImage: "url('/school.png')" }}
      />
        <div className="absolute inset-0 bg-white/30 backdrop-blur-[1px]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.05),rgba(248,250,252,0.72))]" />

      <Card className="surface-panel relative z-10 w-full max-w-md border-0 shadow-none">
        <CardHeader className="space-y-2 text-center">
          <Image
            src="/croppedcolored.png"
            alt="DomStaX"
            width={260}
            height={96}
            priority
            className="mx-auto h-auto"
            style={{ width: '220px', maxWidth: '260px' }}
          />
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
                <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
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
  );
}