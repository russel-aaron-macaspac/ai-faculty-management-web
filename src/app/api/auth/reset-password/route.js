import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/passwordPolicy';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const authorization = request.headers.get('authorization') || '';
    const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const { password } = await request.json();

    if (!accessToken || typeof password !== 'string') {
      return NextResponse.json({ error: 'A valid recovery session and password are required.' }, { status: 400 });
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData?.user?.id) {
      return NextResponse.json({ error: 'Recovery session is invalid or expired.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('password_hash')
      .eq('supabase_id', authData.user.id)
      .maybeSingle();
    if (profile?.password_hash && await bcrypt.compare(password, profile.password_hash)) {
      return NextResponse.json({ error: 'New password must be different from the current password.' }, { status: 400 });
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

    await supabase.auth.admin.updateUserById(authData.user.id, {
      user_metadata: { must_change_password: false },
    });

    return NextResponse.json({ message: 'Password updated.' });
  } catch (error) {
    console.error('[RESET PASSWORD ERROR]', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}