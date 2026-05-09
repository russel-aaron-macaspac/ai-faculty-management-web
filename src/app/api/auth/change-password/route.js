import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export async function POST(request) {
  try {
    const { userId, oldPassword, newPassword } = await request.json();

    if (!userId || !oldPassword || !newPassword) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    if (oldPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must be different from the old password." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("user_id, password_hash, status")
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

    return NextResponse.json(
      { message: "Password updated successfully." },
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