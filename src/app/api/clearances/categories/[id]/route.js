import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function PUT(request, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = await params;
    const body = await request.json();
    const { name, description, isRequired, sortOrder } = body;

    console.log("[CLEARANCE CATEGORIES PUT BODY]", { id, ...body });

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("clearance_categories")
      .update({
        name,
        description:  description ?? null,
        is_required:  isRequired ?? false,
        sort_order:   sortOrder ?? 0,
      })
      .eq("category_id", id);

    if (error) {
      console.error("[CLEARANCE CATEGORIES PUT ERROR]", error);
      return NextResponse.json(
        { error: "Failed to update category" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Category updated successfully" });
  } catch (err) {
    console.error("[CLEARANCE CATEGORIES PUT ERROR]", err);
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

    console.log("[CLEARANCE CATEGORIES DELETE]", { id });

    const { error } = await supabase
      .from("clearance_categories")
      .delete()
      .eq("category_id", id);

    if (error) {
      console.error("[CLEARANCE CATEGORIES DELETE ERROR]", error);
      return NextResponse.json(
        { error: "Failed to delete category" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Category deleted successfully" });
  } catch (err) {
    console.error("[CLEARANCE CATEGORIES DELETE ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}