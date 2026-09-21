import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const redirectTo = new URL('/reset-password', request.url).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });

    if (error) {
      console.error('[FORGOT PASSWORD ERROR]', error);
      return NextResponse.json({ error: 'Unable to send the password reset email.' }, { status: 500 });
    }

    return NextResponse.json({ message: 'If an account exists for that email, a reset link is on its way.' });
  } catch (error) {
    console.error('[FORGOT PASSWORD REQUEST ERROR]', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}