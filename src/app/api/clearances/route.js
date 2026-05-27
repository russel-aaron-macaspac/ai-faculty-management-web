import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

const SELECT_FIELDS = `
  document_id,
  status,
  submitted_at,
  rejection_reason,
  original_filename,
  file_path,
  user:users!clearances_user_id_fkey (
    user_id,
    first_name,
    middle_name,
    last_name
  ),
  office:offices!clearance_documents_office_id_fkey (
    office_id,
    name
  )
`;

function formatRow(d) {
  const fullName = d.user
    ? [d.user.first_name, d.user.middle_name, d.user.last_name]
        .filter(Boolean)
        .join(" ")
    : "Unknown";

  return {
    id:                String(d.document_id),
    employeeId:        String(d.user?.user_id ?? ""),
    employeeName:      fullName,
    requiredDocument:  d.office?.name ?? "",
    officeId:          d.office?.office_id
                         ? String(d.office.office_id)
                         : undefined,
    status:            d.status ?? "pending",
    submissionDate:    d.submitted_at
                         ? d.submitted_at.split("T")[0]
                         : null,
    validationWarning: d.rejection_reason ?? null,
    originalFilename:  d.original_filename ?? null,
    filePath:          d.file_path ?? null,
  };
}

export async function GET(request) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const officeId = searchParams.get("officeId");

    let query = supabase
      .from("clearances")
      .select(SELECT_FIELDS)
      .order("document_id", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    if (officeId) {
      query = query.eq("office_id", officeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[CLEARANCES GET ERROR]", error);
      return NextResponse.json(
        { error: "Failed to fetch clearances", details: error },
        { status: 500 }
      );
    }

    console.log("[CLEARANCES GET SUCCESS] Fetched", data?.length ?? 0, "clearances");
    const formatted = (data || []).map(formatRow);

    return NextResponse.json({ data: formatted });
  } catch (err) {
    console.error("[GET /api/clearances] Unexpected error:", err);
    return NextResponse.json(
      { error: "Server error", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

function isDuplicateClearanceError(error) {
  return (
    error?.code === "23505" ||
    error?.message?.includes("duplicate key") ||
    error?.details?.includes("duplicate key")
  );
}

async function fetchExistingClearance(supabase, user_id, office_id) {
  return supabase
    .from("clearances")
    .select(SELECT_FIELDS)
    .eq("user_id", user_id)
    .eq("office_id", office_id)
    .single();
}

async function refreshRejectedClearance(supabase, existing, original_filename, file_path) {
  return supabase
    .from("clearances")
    .update({
      original_filename: original_filename ?? null,
      file_path: file_path ?? null,
      status: "pending",
      submitted_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("document_id", existing.document_id)
    .select(SELECT_FIELDS)
    .single();
}

async function handleClearanceInsertError(
  supabase,
  error,
  user_id,
  office_id,
  original_filename,
  file_path
) {
  console.error("[POST /api/clearances]", error);

  if (!isDuplicateClearanceError(error)) {
    return NextResponse.json(
      { error: "Failed to create clearance record", details: error.message ?? error },
      { status: 500 }
    );
  }

  const { data: existing, error: existingError } = await fetchExistingClearance(
    supabase,
    user_id,
    office_id
  );

  if (existingError || !existing) {
    return NextResponse.json(
      { error: "Failed to create clearance record", details: error.message ?? error },
      { status: 500 }
    );
  }

  if (existing.status === "rejected" || existing.status === "expired") {
    const { data: updated, error: updateError } = await refreshRejectedClearance(
      supabase,
      existing,
      original_filename,
      file_path
    );

    if (updateError || !updated) {
      return NextResponse.json(
        { error: "Failed to resubmit clearance record", details: updateError?.message ?? updateError },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: formatRow(updated) });
  }

  return NextResponse.json(
    { error: "A clearance record for this office already exists.", details: existing.status },
    { status: 409 }
  );
}

export async function POST(req) {
  try {
    const supabase = createSupabaseAdminClient();
    const body = await req.json();
    const { user_id, office_id, original_filename, file_path } = body;

    if (!user_id || !office_id) {
      return NextResponse.json(
        { error: "Missing user_id or office_id" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("clearances")
      .insert([
        {
          user_id,
          office_id,
          original_filename: original_filename ?? null,
          file_path: file_path ?? null,
          status: "pending",
          submitted_at: new Date().toISOString(),
        },
      ])
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      return await handleClearanceInsertError(
        supabase,
        error,
        user_id,
        office_id,
        original_filename,
        file_path
      );
    }

    const formatted = formatRow(data);

    return NextResponse.json({ data: formatted });
  } catch (err) {
    console.error("[POST /api/clearances] Unexpected error:", err);
    return NextResponse.json(
      { error: "Server error", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}