import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("users")
      .select("user_id, first_name, middle_name, last_name, role, status")
      .eq("role", "faculty")
      .eq("status", "active")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    if (error) {
      console.error("[FACULTY USERS GET ERROR]", error);
      return NextResponse.json({ error: "Failed to fetch faculty users" }, { status: 500 });
    }

    const formatted = (data || []).map((u) => ({
      id: String(u.user_id),
      name: [u.first_name, u.middle_name, u.last_name].filter(Boolean).join(" "),
    }));

    return NextResponse.json({ data: formatted });
  } catch (err) {
    console.error("[FACULTY USERS GET ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { fullName, email, department, phone, status } = body || {};

    if (!fullName || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Split fullName into first, middle, last
    const parts = String(fullName).trim().split(/\s+/);
    const first_name = parts.shift() || '';
    const last_name = parts.length ? parts.pop() : '';
    const middle_name = parts.length ? parts.join(' ') : null;

    const insertPayload = {
      first_name,
      middle_name,
      last_name,
      email,
      role: 'faculty',
      status: status || 'active',
      department: department || null,
      phone: phone || null,
    };

    const { data, error } = await supabase.from('users').insert(insertPayload).select('user_id, first_name, middle_name, last_name');

    if (error) {
      console.error('[FACULTY USERS POST ERROR]', error);
      return NextResponse.json({ error: 'Failed to create faculty user' }, { status: 500 });
    }

    const created = (data || [])[0] || null;
    return NextResponse.json({ data: { id: String(created?.user_id || ''), name: [created?.first_name, created?.middle_name, created?.last_name].filter(Boolean).join(' ') } });
  } catch (err) {
    console.error('[FACULTY USERS POST ERROR]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
