import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('users')
      .select('user_id, first_name, middle_name, last_name, email, role, phone_number, status_of_appointment, department_id, created_at')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[ACCOUNT APPROVAL LIST ERROR]', error);
      return NextResponse.json({ error: 'Unable to load account requests.' }, { status: 500 });
    }

    const departmentIds = [...new Set((data || []).map((user) => user.department_id).filter(Boolean))];
    const { data: departments, error: departmentsError } = departmentIds.length
      ? await supabase.from('departments').select('department_id, name').in('department_id', departmentIds)
      : { data: [], error: null };
    if (departmentsError) {
      console.error('[ACCOUNT APPROVAL DEPARTMENTS ERROR]', departmentsError);
      return NextResponse.json({ error: 'Unable to load account departments.' }, { status: 500 });
    }

    const names = new Map((departments || []).map((department) => [department.department_id, department.name]));
    return NextResponse.json({
      data: (data || []).map((user) => ({
        id: String(user.user_id),
        name: [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' '),
        email: user.email,
        role: user.role,
        phone: user.phone_number,
        department: names.get(user.department_id) || 'Unknown',
        statusOfAppointment: user.status_of_appointment,
        createdAt: user.created_at,
      })),
    });
  } catch (error) {
    console.error('[ACCOUNT APPROVAL LIST ERROR]', error);
    return NextResponse.json({ error: 'Unable to load account requests.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { id, action } = await request.json();
    if (!Number.isInteger(Number(id)) || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid approval request.' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('users')
      .update({
        status: action === 'approve' ? 'active' : 'inactive',
        approval_status: action === 'approve' ? 'approved' : 'rejected',
      })
      .eq('user_id', Number(id))
      .eq('approval_status', 'pending')
      .select('user_id')
      .maybeSingle();

    if (error) {
      console.error('[ACCOUNT APPROVAL UPDATE ERROR]', error);
      return NextResponse.json({ error: 'Unable to update the account request.' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Account request was not found or was already processed.' }, { status: 404 });

    return NextResponse.json({ message: action === 'approve' ? 'Account approved.' : 'Account rejected.' });
  } catch (error) {
    console.error('[ACCOUNT APPROVAL UPDATE ERROR]', error);
    return NextResponse.json({ error: 'Unable to update the account request.' }, { status: 500 });
  }
}
