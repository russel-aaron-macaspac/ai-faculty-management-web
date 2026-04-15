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

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "No fields provided to update" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("subjects")
      .update(payload)
      .eq("id", id)
      .select("id, code, name")
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
