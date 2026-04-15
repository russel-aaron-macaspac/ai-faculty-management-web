import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("rooms")
      .select("id, name, capacity")
      .order("name", { ascending: true });

    if (error) {
      console.error("[ROOMS GET ERROR]", error);
      return NextResponse.json({ error: "Failed to fetch rooms" }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error("[ROOMS GET ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body?.name || "").trim();
    const capacity = Number(body?.capacity);

    if (!name || Number.isNaN(capacity) || capacity <= 0) {
      return NextResponse.json({ error: "name and valid capacity are required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("rooms")
      .insert({ name, capacity })
      .select("id, name, capacity")
      .single();

    if (error) {
      console.error("[ROOMS POST ERROR]", error);
      return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
    }

    return NextResponse.json({ message: "Room created", data }, { status: 201 });
  } catch (err) {
    console.error("[ROOMS POST ERROR]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
