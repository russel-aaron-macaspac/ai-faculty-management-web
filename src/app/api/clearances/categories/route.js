import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("clearance_categories")
      .select("category_id, office_id, name, description, is_required, sort_order, office:offices(name)")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[CLEARANCE CATEGORIES GET ERROR]", error);
      return NextResponse.json(
        { error: "Failed to fetch categories" },
        { status: 500 }
      );
    }

    const formatted = data.map((c) => ({
      id:          String(c.category_id),
      officeId:    String(c.office_id),
      officeName:  c.office?.name ?? "",
      name:        c.name,
      description: c.description ?? "",
      isRequired:  c.is_required ?? false,
      sortOrder:   c.sort_order ?? 0,
    }));

    return NextResponse.json({ data: formatted });
  } catch (err) {
    console.error("[CLEARANCE CATEGORIES GET ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const supabase = createSupabaseAdminClient();
    const body = await request.json();
    const { officeId, name, description, isRequired, sortOrder } = body;

    console.log("[CLEARANCE CATEGORIES POST BODY]", body);

    if (!officeId || !name) {
      return NextResponse.json(
        { error: "officeId and name are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("clearance_categories")
      .insert({
        office_id: Number(officeId),
        name,
        description:  description ?? null,
        is_required:  isRequired ?? false,
        sort_order:   sortOrder ?? 0,
      })
      .select("category_id")
      .single();

    if (error) {
      console.error("[CLEARANCE CATEGORIES POST ERROR]", error);
      return NextResponse.json(
        { error: "Failed to create category" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Category created successfully", id: String(data.category_id) },
      { status: 201 }
    );
  } catch (err) {
    console.error("[CLEARANCE CATEGORIES POST ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}