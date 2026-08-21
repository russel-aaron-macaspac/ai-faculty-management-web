import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

const ALLOWED_ROLES = ['faculty', 'program_chair'];
const ALLOWED_STATUSES = ['active', 'on_leave', 'inactive'];
const ALLOWED_APPOINTMENT_STATUSES = ['full-time', 'part-time'];
const PASSWORD_MIN_LENGTH = 12;

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  const first_name = parts.shift() || '';
  const last_name = parts.length ? parts.pop() : '';
  const middle_name = parts.length ? parts.join(' ') : null;
  return { first_name, middle_name, last_name };
}

export async function POST(request) {
  let authUserId = null;
  let supabase;

  try {
    const body = await request.json();
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const status = typeof body?.status === 'string' ? body.status : '';
    const statusOfAppointment = typeof body?.statusOfAppointment === 'string' ? body.statusOfAppointment : '';
    const role = typeof body?.role === 'string' ? body.role : '';

    if (fullName.length < 2) {
      return NextResponse.json({ error: 'Faculty name must be at least 2 characters.' }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      return NextResponse.json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` }, { status: 400 });
    }

    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return NextResponse.json({ error: 'Password must include at least one letter and one number.' }, { status: 400 });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Select a valid faculty role.' }, { status: 400 });
    }

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 });
    }

    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Select a valid account status.' }, { status: 400 });
    }

    if (!ALLOWED_APPOINTMENT_STATUSES.includes(statusOfAppointment)) {
      return NextResponse.json({ error: 'Select a valid status of appointment.' }, { status: 400 });
    }

    supabase = createSupabaseAdminClient();
    const { data: existingUser, error: existingError } = await supabase
      .from('users')
      .select('user_id')
      .eq('email', email)
      .maybeSingle();

    if (existingError) {
      console.error('[ACCOUNT CREATION LOOKUP ERROR]', existingError);
      return NextResponse.json({ error: 'Unable to verify the email address.' }, { status: 500 });
    }

    if (existingUser) {
      return NextResponse.json({ error: 'An account with this email address already exists.' }, { status: 409 });
    }

    const { first_name, middle_name, last_name } = splitName(fullName);
    const passwordHash = await bcrypt.hash(password, 12);
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, middle_name, last_name, role },
    });

    if (authError || !authData?.user?.id) {
      if (authError?.message?.toLowerCase().includes('already') || authError?.status === 422) {
        return NextResponse.json({ error: 'An account with this email address already exists.' }, { status: 409 });
      }
      console.error('[ACCOUNT AUTH CREATE ERROR]', authError);
      return NextResponse.json({ error: 'Unable to create the login account.' }, { status: 500 });
    }

    authUserId = authData.user.id;
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        supabase_id: authUserId,
        employee_no: `FAC-${authUserId.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        rfid_card_uid: null,
        first_name,
        middle_name,
        last_name,
        email,
        password_hash: passwordHash,
        role,
        phone_number: phone,
        status,
        status_of_appointment: statusOfAppointment,
      })
      .select('user_id, first_name, middle_name, last_name, email, role')
      .single();

    if (profileError) {
      console.error('[ACCOUNT PROFILE CREATE ERROR]', profileError);
      await supabase.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ error: 'Unable to save the faculty profile.' }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        id: String(profile.user_id),
        name: [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' '),
        email: profile.email,
        role: profile.role,
      },
    }, { status: 201 });
  } catch (error) {
    if (authUserId && supabase) {
      await supabase.auth.admin.deleteUser(authUserId);
    }
    console.error('[ACCOUNT CREATION ERROR]', error);
    return NextResponse.json({ error: 'Unable to create the faculty account.' }, { status: 500 });
  }
}
