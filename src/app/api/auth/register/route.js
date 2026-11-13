import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

const ALLOWED_APPOINTMENT_STATUSES = ['full-time', 'part-time'];
const ALLOWED_ROLES = ['faculty', 'program_chair', 'dean'];
const PASSWORD_MIN_LENGTH = 12;

export async function POST(request) {
  let authUserId = null;
  let supabase;

  try {
    const body = await request.json();
    const first_name = typeof body?.firstName === 'string' ? body.firstName.trim() : '';
    const last_name = typeof body?.lastName === 'string' ? body.lastName.trim() : '';
    const middle_name = typeof body?.middleName === 'string' ? body.middleName.trim() || null : null;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const department = typeof body?.department === 'string' ? body.department.trim() : '';
    const phone_number = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const status_of_appointment = typeof body?.statusOfAppointment === 'string' ? body.statusOfAppointment : '';
    const role = typeof body?.role === 'string' ? body.role : '';

    if (!first_name || !last_name || !department || !phone_number) {
      return NextResponse.json({ error: 'Complete all required fields.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (password.length < PASSWORD_MIN_LENGTH || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return NextResponse.json({ error: 'Password must be at least 12 characters and include a letter and a number.' }, { status: 400 });
    }
    if (!ALLOWED_APPOINTMENT_STATUSES.includes(status_of_appointment)) {
      return NextResponse.json({ error: 'Select a valid status of appointment.' }, { status: 400 });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Select a valid account role.' }, { status: 400 });
    }

    supabase = createSupabaseAdminClient();
    const [{ data: departmentRecord, error: departmentError }, { data: existingUser, error: existingError }] = await Promise.all([
      supabase.from('departments').select('department_id').ilike('name', department).maybeSingle(),
      supabase.from('users').select('user_id, supabase_id, approval_status').eq('email', email).maybeSingle(),
    ]);

    if (departmentError || existingError) {
      console.error('[REGISTRATION LOOKUP ERROR]', departmentError || existingError);
      return NextResponse.json({ error: 'Unable to verify the registration details.' }, { status: 500 });
    }
    if (!departmentRecord) {
      return NextResponse.json({ error: 'Select a department that exists in the system.' }, { status: 400 });
    }
    const passwordHash = await bcrypt.hash(password, 12);

    if (existingUser) {
      if (existingUser.approval_status !== 'rejected' || !existingUser.supabase_id) {
        return NextResponse.json({ error: 'An account with this email address already exists.' }, { status: 409 });
      }

      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(existingUser.supabase_id, {
        password,
        user_metadata: { first_name, middle_name, last_name, role },
      });

      if (authUpdateError) {
        console.error('[REGISTRATION REAPPLY AUTH UPDATE ERROR]', authUpdateError);
        return NextResponse.json({ error: 'Unable to reactivate the rejected registration.' }, { status: 500 });
      }

      const { error: reapplyError } = await supabase
        .from('users')
        .update({
          employee_no: `FAC-${existingUser.supabase_id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
          first_name,
          middle_name,
          last_name,
          password_hash: passwordHash,
          role,
          department_id: departmentRecord.department_id,
          phone_number,
          status: 'inactive',
          approval_status: 'pending',
          status_of_appointment,
        })
        .eq('user_id', existingUser.user_id)
        .eq('approval_status', 'rejected');

      if (reapplyError) {
        console.error('[REGISTRATION REAPPLY PROFILE UPDATE ERROR]', reapplyError);
        return NextResponse.json({ error: 'Unable to resubmit the rejected registration.' }, { status: 500 });
      }

      return NextResponse.json({ message: 'Registration resubmitted for admin approval.' }, { status: 201 });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, middle_name, last_name, role },
    });

    if (authError || !authData?.user?.id) {
      console.error('[REGISTRATION AUTH CREATE ERROR]', authError);
      return NextResponse.json({ error: 'Unable to create the registration.' }, { status: 500 });
    }
    authUserId = authData.user.id;

    const { error: profileError } = await supabase.from('users').insert({
      supabase_id: authUserId,
      employee_no: `FAC-${authUserId.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
      rfid_card_uid: null,
      first_name,
      middle_name,
      last_name,
      email,
      password_hash: passwordHash,
      role,
      department_id: departmentRecord.department_id,
      phone_number,
      status: 'inactive',
      approval_status: 'pending',
      status_of_appointment,
    });

    if (profileError) {
      console.error('[REGISTRATION PROFILE CREATE ERROR]', profileError);
      await supabase.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ error: 'Unable to save the registration.' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Registration submitted for admin approval.' }, { status: 201 });
  } catch (error) {
    if (authUserId && supabase) await supabase.auth.admin.deleteUser(authUserId);
    console.error('[REGISTRATION ERROR]', error);
    return NextResponse.json({ error: 'Unable to submit the registration.' }, { status: 500 });
  }
}
