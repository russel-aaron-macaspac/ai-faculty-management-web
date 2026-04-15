import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("subjects")
      .select("id, code, name")
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

    if (!code || !name) {
      return NextResponse.json({ error: "code and name are required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("subjects")
      .insert({ code, name })
      .select("id, code, name")
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
