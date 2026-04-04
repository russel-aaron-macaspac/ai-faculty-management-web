// src/app/api/offices/route.js
import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("offices")
      .select("office_id, name, description, is_required, sort_order")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[OFFICES GET ERROR]", error);
      return NextResponse.json(
        { error: "Failed to fetch offices" },
        { status: 500 }
      );
    }

    const formatted = data.map((o) => ({
      id:          String(o.office_id),
      name:        o.name,
      description: o.description ?? "",
      isRequired:  o.is_required ?? false,
      sortOrder:   o.sort_order ?? 0,
    }));

    return NextResponse.json({ data: formatted });
  } catch (err) {
    console.error("[OFFICES GET ERROR]", err);
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
    const { name, description, isRequired, sortOrder } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("offices")
      .insert({
        name,
        description:  description ?? null,
        is_required:  isRequired ?? false,
        sort_order:   sortOrder ?? 0,
      })
      .select("office_id")
      .single();

    if (error) {
      console.error("[OFFICES POST ERROR]", error);
      return NextResponse.json(
        { error: "Failed to create office" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Office created successfully", id: String(data.office_id) },
      { status: 201 }
    );
  } catch (err) {
    console.error("[OFFICES POST ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}