import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { validatePassword } from '@/lib/passwordPolicy';

export async function POST(request) {
  try {
    const { userId, oldPassword, newPassword } = await request.json();

    if (!userId || !oldPassword || !newPassword) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    const passwordError = validatePassword(newPassword, oldPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("user_id, supabase_id, password_hash, status")
      .eq("user_id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    if (user.status !== "active") {
      return NextResponse.json(
        { error: "Account is not active." },
        { status: 403 }
      );
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password_hash);

    if (!isOldPasswordValid) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 401 }
      );
    }

    const passwordPolicyError = validatePassword(newPassword, oldPassword);
    if (passwordPolicyError) {
      return NextResponse.json({ error: passwordPolicyError }, { status: 400 });
    }

    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    const { error: updateError } = await supabase
      .from("users")
      .update({
        password_hash: newPasswordHash,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateError) {
      console.error("[CHANGE PASSWORD] DB update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update password. Please try again." },
        { status: 500 }
      );
    }

    if (user.supabase_id) {
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(user.supabase_id, {
        password: newPassword,
        user_metadata: {
          must_change_password: false,
        },
      });
      if (authUpdateError) {
        await supabase
          .from("users")
          .update({ password_hash: user.password_hash, updated_at: new Date().toISOString() })
          .eq("user_id", user.user_id);
        console.error("[CHANGE PASSWORD] Auth update error:", authUpdateError);
        return NextResponse.json(
          { error: "Password was not updated in authentication. Please try again." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { message: "Password Updated." },
      { status: 200 }
    );

  } catch (err) {
    console.error("[CHANGE PASSWORD ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}