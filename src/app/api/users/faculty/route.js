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
