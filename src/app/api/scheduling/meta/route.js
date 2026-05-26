import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

function isMissingSectionsTableError(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    (message.includes("relation") && message.includes("sections") && message.includes("does not exist")) ||
    (message.includes("table") && message.includes("sections") && message.includes("schema cache")) ||
    (message.includes("table") && message.includes("public.sections"))
  );
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const [
      { data: faculties, error: facultyError },
      { data: subjects, error: subjectError },
      { data: rooms, error: roomError },
      { data: sections, error: sectionError },
    ] =
      await Promise.all([
        supabase
          .from("users")
          .select("user_id, supabase_id, first_name, middle_name, last_name, role")
          .in("role", ["faculty", "program_chair"])
          .eq("status", "active")
          .order("last_name", { ascending: true }),
        supabase.from("subjects").select("id, code, name").order("code", { ascending: true }),
        supabase.from("rooms").select("id, name, capacity").order("name", { ascending: true }),
        supabase.from("sections").select("id, name").order("name", { ascending: true }),
      ]);

    if (facultyError || subjectError || roomError || (sectionError && !isMissingSectionsTableError(sectionError))) {
      console.error("[SCHEDULING META ERROR]", { facultyError, subjectError, roomError, sectionError });
      return NextResponse.json({ error: "Failed to fetch metadata" }, { status: 500 });
    }

    let normalizedSections = sections || [];
    if (sectionError && isMissingSectionsTableError(sectionError)) {
      normalizedSections = [
        { id: "1A", name: "1A" },
        { id: "1B", name: "1B" },
        { id: "2A", name: "2A" },
        { id: "2B", name: "2B" },
        { id: "3A", name: "3A" },
        { id: "3B", name: "3B" },
        { id: "4A", name: "4A" },
        { id: "4B", name: "4B" },
      ];
    }

    return NextResponse.json({
      faculties: (faculties || [])
        .map((f) => ({
        // Keep IDs aligned with schedule rows, which store users.user_id in schedules.faculty_id.
        id: String(f.user_id ?? f.supabase_id),
        name: [f.first_name, f.middle_name, f.last_name].filter(Boolean).join(" "),
        role: f.role,
        })),
      subjects: subjects || [],
      rooms: rooms || [],
      sections: normalizedSections,
    });
  } catch (err) {
    console.error("[SCHEDULING META ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
