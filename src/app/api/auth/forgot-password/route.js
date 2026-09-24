import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

async function ensureAuthUserLink(supabase, email) {
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('user_id, supabase_id, email, status')
    .eq('email', email)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile || profile.status !== 'active') return null;
  if (profile.supabase_id) return profile.supabase_id;

  const { data: existingAuthUsers, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;

  let authUser = existingAuthUsers.users.find((user) => user.email?.toLowerCase() === email);
  if (!authUser) {
    const { data: createdAuthUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: randomBytes(32).toString('hex'),
      email_confirm: true,
    });
    if (createError) throw createError;
    authUser = createdAuthUser.user;
  }

  if (!authUser?.id) throw new Error('Supabase Auth user could not be linked.');

  const { error: linkError } = await supabase
    .from('users')
    .update({ supabase_id: authUser.id })
    .eq('user_id', profile.user_id);
  if (linkError) throw linkError;

  return authUser.id;
}

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const supabaseAdmin = createSupabaseAdminClient();
    await ensureAuthUserLink(supabaseAdmin, normalizedEmail);

    return NextResponse.json({ message: 'If an account exists for that email, a reset link is on its way.' });
  } catch (error) {
    console.error('[FORGOT PASSWORD REQUEST ERROR]', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}