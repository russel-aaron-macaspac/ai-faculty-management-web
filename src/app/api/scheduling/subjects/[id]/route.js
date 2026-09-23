import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const payload = {};
    if (body?.code !== undefined) {
      const code = String(body.code).trim();
      if (!code) {
        return NextResponse.json({ error: "code cannot be empty" }, { status: 400 });
      }
      payload.code = code;
    }

    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      }
      payload.name = name;
    }

    if (body?.hours !== undefined) {
      const hours = Number(body.hours);
      if (!Number.isFinite(hours) || hours <= 0) {
        return NextResponse.json({ error: "hours must be a positive number" }, { status: 400 });
      }
      payload.hours = hours;
    }

    for (const [inputName, columnName] of [["lectureUnits", "lecture_units"], ["labUnits", "lab_units"]]) {
      if (body?.[inputName] !== undefined) {
        const value = Number(body[inputName]);
        if (!Number.isFinite(value) || value < 0) {
          return NextResponse.json({ error: `${inputName} must be zero or a positive number` }, { status: 400 });
        }
        payload[columnName] = value;
      }
    }

    if (body?.units !== undefined) {
      const units = Number(body.units);
      if (!Number.isFinite(units) || units <= 0) {
        return NextResponse.json({ error: "units must be a positive number" }, { status: 400 });
      }
      payload.units = units;
    }

    if (body?.requiredEquipmentType !== undefined) {
      const value = body.requiredEquipmentType === null || body.requiredEquipmentType === "" ? null : String(body.requiredEquipmentType).trim().toLowerCase();
      if (value !== null && value !== "computer") {
        return NextResponse.json({ error: "requiredEquipmentType must be computer" }, { status: 400 });
      }
      payload.required_equipment_type = value;
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "No fields provided to update" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("subjects")
      .update(payload)
      .eq("id", id)
      .select("id, code, name, units, lecture_units, lab_units, hours, required_equipment_type")
      .single();

    if (error) {
      console.error("[SUBJECTS PUT ERROR]", error);
      return NextResponse.json({ error: "Failed to update subject" }, { status: 500 });
    }

    return NextResponse.json({ message: "Subject updated", data });
  } catch (err) {
    console.error("[SUBJECTS PUT ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const supabase = createSupabaseAdminClient();

    const { error: scheduleDeleteError } = await supabase.from("schedules").delete().eq("subject_id", id);
    if (scheduleDeleteError) {
      console.error("[SUBJECTS DELETE ERROR] Failed to delete related schedules", scheduleDeleteError);
      return NextResponse.json({ error: "Failed to delete schedules linked to this subject" }, { status: 500 });
    }

    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) {
      console.error("[SUBJECTS DELETE ERROR]", error);
      return NextResponse.json({ error: "Failed to delete subject" }, { status: 500 });
    }

    return NextResponse.json({ message: "Subject deleted" });
  } catch (err) {
    console.error("[SUBJECTS DELETE ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
