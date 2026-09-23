import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("subjects")
      .select("id, code, name, units, lecture_units, lab_units, hours, required_equipment_type")
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
    const lectureUnits = body?.lectureUnits === undefined || body?.lectureUnits === "" ? 0 : Number(body.lectureUnits);
    const labUnits = body?.labUnits === undefined || body?.labUnits === "" ? 0 : Number(body.labUnits);
    const hours = body?.hours === undefined || body?.hours === null || body?.hours === "" ? null : Number(body.hours);
    const requiredEquipmentType = body?.requiredEquipmentType === null || body?.requiredEquipmentType === undefined || body?.requiredEquipmentType === "" ? null : String(body.requiredEquipmentType).trim().toLowerCase();

    if (!code || !name) {
      return NextResponse.json({ error: "code and name are required" }, { status: 400 });
    }

    if (requiredEquipmentType !== null && requiredEquipmentType !== "computer") {
      return NextResponse.json({ error: "requiredEquipmentType must be computer" }, { status: 400 });
    }

    if (units !== null && (!Number.isFinite(units) || units <= 0)) {
      return NextResponse.json({ error: "units must be a positive number" }, { status: 400 });
    }

    if (hours !== null && (!Number.isFinite(hours) || hours <= 0)) {
      return NextResponse.json({ error: "hours must be a positive number" }, { status: 400 });
    }

    if ([lectureUnits, labUnits].some((value) => !Number.isFinite(value) || value < 0)) {
      return NextResponse.json({ error: "lecture and lab units must be zero or positive numbers" }, { status: 400 });
    }

    if (units !== null && lectureUnits + labUnits > units) {
      return NextResponse.json({ error: "lecture and lab units cannot exceed total units" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Reuse an existing subject only if BOTH code and name match exactly.
    // A code alone matching is fine — the same code can be shared across
    // multiple subjects (e.g. IT301 -> "Networking 2", IT301 -> "Networking 3").
    const { data: existingSubject, error: existingSubjectError } = await supabase
      .from("subjects")
      .select("id, code, name, units, lecture_units, lab_units, hours, required_equipment_type")
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
      .insert({ code, name, units, lecture_units: lectureUnits, lab_units: labUnits, hours, required_equipment_type: requiredEquipmentType })
      .select("id, code, name, units, lecture_units, lab_units, hours, required_equipment_type")
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