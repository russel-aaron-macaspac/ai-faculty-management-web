import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const payload = {};

    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      }
      payload.name = name;
    }

    if (body?.capacity !== undefined) {
      const capacity = Number(body.capacity);
      if (Number.isNaN(capacity) || capacity <= 0) {
        return NextResponse.json({ error: "capacity must be a positive number" }, { status: 400 });
      }
      payload.capacity = capacity;
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "No fields provided to update" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("rooms")
      .update(payload)
      .eq("id", id)
      .select("id, name, capacity")
      .single();

    if (error) {
      console.error("[ROOMS PUT ERROR]", error);
      return NextResponse.json({ error: "Failed to update room" }, { status: 500 });
    }

    return NextResponse.json({ message: "Room updated", data });
  } catch (err) {
    console.error("[ROOMS PUT ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const supabase = createSupabaseAdminClient();

    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) {
      console.error("[ROOMS DELETE ERROR]", error);
      return NextResponse.json({ error: "Failed to delete room" }, { status: 500 });
    }

    return NextResponse.json({ message: "Room deleted" });
  } catch (err) {
    console.error("[ROOMS DELETE ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
