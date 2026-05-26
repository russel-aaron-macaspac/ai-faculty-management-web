import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import { NextResponse } from 'next/server';

export async function PUT(req) {
  try {
    const body = await req.json();
    const { id, phone, address } = body || {};

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    const updates = {};
    if (phone !== undefined) updates.phone_number = phone;
    if (address !== undefined) updates.address = address;

    const { error } = await supabase.from('users').update(updates).eq('user_id', id);
    if (error) {
      console.error('[PROFILE UPDATE ERROR]', error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[PROFILE UPDATE ERROR]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
