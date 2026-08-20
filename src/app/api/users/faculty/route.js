import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import crypto from 'crypto';
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("users")
      .select("user_id, first_name, middle_name, last_name, email, role, status, status_of_appointment")
      .in("role", ["faculty", "program_chair"])
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
      email: u.email || null,
      statusOfAppointment: u.status_of_appointment || null,
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
    const { fullName, email, department, phone, status, statusOfAppointment } = body || {};

    if (!fullName || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['full-time', 'part-time'].includes(statusOfAppointment)) {
      return NextResponse.json({ error: 'Status of appointment must be full-time or part-time' }, { status: 400 });
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
      status_of_appointment: statusOfAppointment || null,
    };

    // Insert profile row into users table
    const { data, error } = await supabase.from('users').insert(insertPayload).select('user_id, first_name, middle_name, last_name');

    if (error) {
      console.error('[FACULTY USERS POST ERROR]', error);
      return NextResponse.json({ error: 'Failed to create faculty user' }, { status: 500 });
    }

    const created = (data || [])[0] || null;

    // Create a Supabase Auth user with a random temporary password so the new faculty can sign in.
    // If this fails, roll back the profile insert to avoid dangling records.
    try {
      const tempPassword = crypto.randomBytes(12).toString('base64').replace(/\+/g, 'A').replace(/\//g, 'B');

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { first_name, middle_name, last_name, role: 'faculty' },
      });

      if (authError) {
        console.error('[FACULTY AUTH CREATE ERROR]', authError);
        // rollback profile row
        try {
          await supabase.from('users').delete().eq('user_id', created.user_id);
        } catch (delErr) {
          console.error('[FACULTY ROLLBACK ERROR]', delErr);
        }

        return NextResponse.json({ error: 'Failed to create auth user for faculty' }, { status: 500 });
      }

      // Success: return both profile id and auth user id (do not return password)
      return NextResponse.json({ data: { id: String(created?.user_id || ''), name: [created?.first_name, created?.middle_name, created?.last_name].filter(Boolean).join(' '), auth_user_id: authData?.id || null } });
    } catch (errAuth) {
      console.error('[FACULTY AUTH UNEXPECTED ERROR]', errAuth);
      try {
        await supabase.from('users').delete().eq('user_id', created.user_id);
      } catch (delErr) {
        console.error('[FACULTY ROLLBACK ERROR]', delErr);
      }
      return NextResponse.json({ error: 'Internal server error during auth creation' }, { status: 500 });
    }
  } catch (err) {
    console.error('[FACULTY USERS POST ERROR]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
