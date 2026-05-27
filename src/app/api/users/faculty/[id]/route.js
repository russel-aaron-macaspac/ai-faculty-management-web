import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function PUT(req, { params }) {
  try {
    const { id } = params || {};
    const body = await req.json();
    const { fullName, email, department, phone, status } = body || {};

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    const updates = {};
    if (fullName) {
      const parts = String(fullName).trim().split(/\s+/);
      updates.first_name = parts.shift() || '';
      updates.last_name = parts.length ? parts.pop() : '';
      updates.middle_name = parts.length ? parts.join(' ') : null;
    }
    if (email) updates.email = email;
    if (department !== undefined) updates.department = department;
    if (phone !== undefined) updates.phone = phone;
    if (status !== undefined) updates.status = status;

    const { data, error } = await supabase.from('users').update(updates).eq('user_id', id).select('user_id, first_name, middle_name, last_name');

    if (error) {
      console.error('[FACULTY USER PUT ERROR]', error);
      return NextResponse.json({ error: 'Failed to update faculty user' }, { status: 500 });
    }

    const updated = (data || [])[0] || null;
    return NextResponse.json({ data: { id: String(updated?.user_id || ''), name: [updated?.first_name, updated?.middle_name, updated?.last_name].filter(Boolean).join(' ') } });
  } catch (err) {
    console.error('[FACULTY USER PUT ERROR]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = params || {};
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    // Soft-delete: set status to inactive so other parts of the app filtering active users will hide this
    const { error } = await supabase.from('users').update({ status: 'inactive' }).eq('user_id', id);
    if (error) {
      console.error('[FACULTY USER DELETE ERROR]', error);
      return NextResponse.json({ error: 'Failed to delete faculty user' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[FACULTY USER DELETE ERROR]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
