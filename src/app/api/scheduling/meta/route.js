import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const [{ data: faculties, error: facultyError }, { data: subjects, error: subjectError }, { data: rooms, error: roomError }] =
      await Promise.all([
        supabase
          .from("users")
          .select("user_id, supabase_id, first_name, middle_name, last_name, role")
          .in("role", ["faculty", "program_chair"])
          .eq("status", "active")
          .order("last_name", { ascending: true }),
        supabase.from("subjects").select("id, code, name").order("code", { ascending: true }),
        supabase.from("rooms").select("id, name, capacity").order("name", { ascending: true }),
      ]);

    if (facultyError || subjectError || roomError) {
      console.error("[SCHEDULING META ERROR]", { facultyError, subjectError, roomError });
      return NextResponse.json({ error: "Failed to fetch metadata" }, { status: 500 });
    }

    return NextResponse.json({
      faculties: (faculties || [])
        .filter((f) => f.role === 'faculty')
        .map((f) => ({
        id: f.supabase_id,
        name: [f.first_name, f.middle_name, f.last_name].filter(Boolean).join(" "),
        role: f.role,
        })),
      subjects: subjects || [],
      rooms: rooms || [],
    });
  } catch (err) {
    console.error("[SCHEDULING META ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
