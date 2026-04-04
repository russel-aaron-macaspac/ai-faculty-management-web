import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function PUT(request, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = await params;
    const body = await request.json();
    const { name, description, isRequired, sortOrder } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("offices")
      .update({
        name,
        description:  description ?? null,
        is_required:  isRequired ?? false,
        sort_order:   sortOrder ?? 0,
      })
      .eq("office_id", id);

    if (error) {
      console.error("[OFFICES PUT ERROR]", error);
      return NextResponse.json(
        { error: "Failed to update office" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Office updated successfully" });
  } catch (err) {
    console.error("[OFFICES PUT ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = await params;

    const { error } = await supabase
      .from("offices")
      .delete()
      .eq("office_id", id);

    if (error) {
      console.error("[OFFICES DELETE ERROR]", error);
      return NextResponse.json(
        { error: "Failed to delete office" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Office deleted successfully" });
  } catch (err) {
    console.error("[OFFICES DELETE ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}