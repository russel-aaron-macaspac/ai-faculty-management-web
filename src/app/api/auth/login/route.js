import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { APPROVAL_OFFICERS } from '@/lib/roleConfig';

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
      .select("user_id, email, role, first_name, middle_name, last_name, password_hash, status")
      .eq("email", email)
      .eq("status", "active")
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    await supabase
      .from("users")
      .update({ last_login: new Date().toISOString() })
      .eq("user_id", user.user_id);

    // If the DB role is 'staff' but the email belongs to a configured approval officer,
    // map the frontend role to the approval officer id so the UI shows approval features.
    let frontendRole = user.role;
    if (user.role === 'staff' && user.email) {
      const match = APPROVAL_OFFICERS.find((o) => o.email.toLowerCase() === String(user.email).toLowerCase());
      if (match) {
        frontendRole = match.id;
      }
    }

    return NextResponse.json({
      user: {
        id: user.user_id,
        email: user.email,
        role: frontendRole,
        full_name: [user.first_name, user.middle_name, user.last_name]
          .filter(Boolean)
          .join(" "),
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