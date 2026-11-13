import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { normalizeApprovalOfficerRole } from '@/lib/roleConfig';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("user_id, supabase_id, email, role, first_name, middle_name, last_name, password_hash, status, approval_status, phone_number, address, status_of_appointment, department_id, last_login")
      .eq("email", email)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    if (user.approval_status === 'pending') {
      return NextResponse.json(
        { error: 'Your account is waiting for administrator approval.' },
        { status: 403 }
      );
    }

    if (user.status !== 'active') {
      return NextResponse.json(
        { error: 'This account is not active.' },
        { status: 403 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const mustChangePassword = user.last_login === null;

    await supabase
      .from("users")
      .update({ last_login: new Date().toISOString() })
      .eq("user_id", user.user_id);

    // Approval officers are stored as staff (or an office-specific role) in the
    // database. Resolve configured officer emails first so the frontend always
    // receives the role id used by navigation and redirects.
    const frontendRole = normalizeApprovalOfficerRole(user.role, user.email);

    const fullName = [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ');
    const { data: department } = user.department_id
      ? await supabase.from('departments').select('name').eq('department_id', user.department_id).maybeSingle()
      : { data: null };

    return NextResponse.json({
      user: {
        id: user.user_id,
        supabase_id: user.supabase_id,
        email: user.email,
        role: frontendRole,
        full_name: fullName,
        name: fullName,
        mustChangePassword,
        phone: user.phone_number || null,
        address: user.address || null,
        statusOfAppointment: user.status_of_appointment || null,
        department: department?.name || null,
        department_id: user.department_id ?? null,
      },
    });
  } catch (err) {
    console.error("[LOGIN ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}