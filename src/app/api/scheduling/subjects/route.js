import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("subjects")
      .select("id, code, name, units")
      .order("code", { ascending: true });

    if (error) {
      console.error("[SUBJECTS GET ERROR]", error);
      return NextResponse.json({ error: "Failed to fetch subjects" }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error("[SUBJECTS GET ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const code = String(body?.code || "").trim();
    const name = String(body?.name || "").trim();
    const units = body?.units === undefined || body?.units === null || body?.units === "" ? null : Number(body.units);

    if (!code || !name) {
      return NextResponse.json({ error: "code and name are required" }, { status: 400 });
    }

    if (units !== null && (!Number.isFinite(units) || units <= 0)) {
      return NextResponse.json({ error: "units must be a positive number" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Reuse an existing subject only if BOTH code and name match exactly.
    // A code alone matching is fine — the same code can be shared across
    // multiple subjects (e.g. IT301 -> "Networking 2", IT301 -> "Networking 3").
    const { data: existingSubject, error: existingSubjectError } = await supabase
      .from("subjects")
      .select("id, code, name, units")
      .ilike("code", code)
      .ilike("name", name)
      .maybeSingle();

    if (existingSubjectError) {
      console.error("[SUBJECTS POST LOOKUP ERROR]", existingSubjectError);
      return NextResponse.json({ error: "Failed to check existing subject" }, { status: 500 });
    }

    if (existingSubject) {
      return NextResponse.json({ message: "Subject already exists", data: existingSubject }, { status: 200 });
    }

    const { data, error } = await supabase
      .from("subjects")
      .insert({ code, name, units })
      .select("id, code, name, units")
      .single();

    if (error) {
      console.error("[SUBJECTS POST ERROR]", error);
      return NextResponse.json({ error: "Failed to create subject" }, { status: 500 });
    }

    return NextResponse.json({ message: "Subject created", data }, { status: 201 });
  } catch (err) {
    console.error("[SUBJECTS POST ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}