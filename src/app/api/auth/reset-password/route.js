import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const authorization = request.headers.get('authorization') || '';
    const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const { password } = await request.json();

    if (!accessToken || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'A valid recovery session and password are required.' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData?.user?.id) {
      return NextResponse.json({ error: 'Recovery session is invalid or expired.' }, { status: 401 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
      .eq('supabase_id', authData.user.id);

    if (updateError) {
      console.error('[RESET PASSWORD UPDATE ERROR]', updateError);
      return NextResponse.json({ error: 'Unable to save the new password.' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Password updated.' });
  } catch (error) {
    console.error('[RESET PASSWORD ERROR]', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}