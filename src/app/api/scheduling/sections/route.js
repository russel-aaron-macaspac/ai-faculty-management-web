import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

const DEFAULT_SECTIONS = ["BSIT1A", "BSIT1B", "BSIT2A", "BSIT2B", "BSIT3A", "BSIT3B", "BSIT4A", "BSIT4B"].map((name) => ({ id: name, name }));

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

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("sections")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      if (isMissingSectionsTableError(error)) {
        return NextResponse.json({ data: DEFAULT_SECTIONS, fallback: true });
      }

      console.error("[SECTIONS GET ERROR]", error);
      return NextResponse.json({ error: "Failed to fetch sections" }, { status: 500 });
    }

    return NextResponse.json({ data: (data || []).map((section) => ({ ...section, name: formatSectionName(section.name) })) });
  } catch (err) {
    console.error("[SECTIONS GET ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body?.name || "").trim();

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("sections")
      .insert({ name })
      .select("id, name")
      .single();

    if (error) {
      if (isMissingSectionsTableError(error)) {
        return NextResponse.json(
          { error: "Sections table is not set up yet. Run the SQL migration to enable adding sections." },
          { status: 400 }
        );
      }

      console.error("[SECTIONS POST ERROR]", error);
      return NextResponse.json({ error: "Failed to create section" }, { status: 500 });
    }

    return NextResponse.json({ message: "Section created", data }, { status: 201 });
  } catch (err) {
    console.error("[SECTIONS POST ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
