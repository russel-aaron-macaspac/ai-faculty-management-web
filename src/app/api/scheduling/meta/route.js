import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";
import { getDepartmentScope } from "@/lib/scheduling/departmentAccess";

function isMissingSectionsTableError(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    (message.includes("relation") && message.includes("sections") && message.includes("does not exist")) ||
    (message.includes("table") && message.includes("sections") && message.includes("schema cache")) ||
    (message.includes("table") && message.includes("public.sections"))
  );
}

function formatSectionName(name) {
  const value = String(name || "").trim();
  return /^\d[AB]$/i.test(value) ? `BSIT${value.toUpperCase()}` : value;
}

const DEFAULT_BSIT_SECTIONS = ["BSIT1A", "BSIT1B", "BSIT2A", "BSIT2B", "BSIT3A", "BSIT3B", "BSIT4A", "BSIT4B"];

export async function GET(request) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const scope = await getDepartmentScope(supabase, searchParams.get("actorId"), searchParams.get("actorRole"));

    const [
      { data: faculties, error: facultyError },
      { data: subjects, error: subjectError },
      { data: rooms, error: roomError },
      { data: sections, error: sectionError },
    ] =
      await Promise.all([
        supabase
          .from("users")
          .select("user_id, supabase_id, first_name, middle_name, last_name, role, status_of_appointment, department_id")
          .in("role", ["faculty", "program_chair", "dean"])
          .eq("status", "active")
          .order("last_name", { ascending: true }),
        supabase.from("subjects").select("id, code, name, lecture_units, lab_units, hours").order("code", { ascending: true }),
        supabase.from("rooms").select("id, name, capacity").order("name", { ascending: true }),
        supabase.from("sections").select("id, name").order("name", { ascending: true }),
      ]);

    if (facultyError || subjectError || roomError || (sectionError && !isMissingSectionsTableError(sectionError))) {
      console.error("[SCHEDULING META ERROR]", { facultyError, subjectError, roomError, sectionError });
      return NextResponse.json({ error: "Failed to fetch metadata" }, { status: 500 });
    }

    const scopedFaculties = scope.isAdmin
      ? faculties || []
      : (scope.departmentId == null ? [] : (faculties || []).filter((faculty) => String(faculty.department_id) === String(scope.departmentId)));

    let normalizedSections = sections || [];
    if (sectionError && isMissingSectionsTableError(sectionError)) {
      normalizedSections = [
        { id: "1A", name: "BSIT1A" },
        { id: "1B", name: "BSIT1B" },
        { id: "2A", name: "BSIT2A" },
        { id: "2B", name: "BSIT2B" },
        { id: "3A", name: "BSIT3A" },
        { id: "3B", name: "BSIT3B" },
        { id: "4A", name: "BSIT4A" },
        { id: "4B", name: "BSIT4B" },
      ];
    }
    normalizedSections = normalizedSections.map((section) => ({ ...section, name: formatSectionName(section.name) }));
    const existingSectionNames = new Set(normalizedSections.map((section) => section.name.toUpperCase()));
    for (const name of DEFAULT_BSIT_SECTIONS) {
      if (!existingSectionNames.has(name)) normalizedSections.push({ id: name, name });
    }

    return NextResponse.json({
      faculties: scopedFaculties
        .map((f) => ({
        // Keep IDs aligned with schedule rows, which store users.user_id in schedules.faculty_id.
        id: String(f.user_id ?? f.supabase_id),
        name: [f.first_name, f.middle_name, f.last_name].filter(Boolean).join(" "),
        role: f.role,
        statusOfAppointment: f.status_of_appointment || null,
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
