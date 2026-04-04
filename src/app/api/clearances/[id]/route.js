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

export async function PATCH(request, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = await params;
    const body = await request.json();
    const { status, rejectionReason, reviewedBy } = body;

    if (!status) {
      return NextResponse.json(
        { error: "status is required" },
        { status: 400 }
      );
    }

    const validStatuses = ["approved", "rejected", "pending", "submitted"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "status must be approved, rejected, pending, or submitted" },
        { status: 400 }
      );
    }

    if (status === "rejected" && !rejectionReason) {
      return NextResponse.json(
        { error: "rejectionReason is required when rejecting a document" },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("clearances")
      .update({
        status,
        rejection_reason: status === "rejected" ? rejectionReason : null,
        reviewed_by:      reviewedBy ?? null,
        reviewed_at:      new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      })
      .eq("document_id", id);

    if (updateError) {
      console.error("[CLEARANCES PATCH ERROR]", updateError);
      return NextResponse.json(
        { error: "Failed to update clearance status" },
        { status: 500 }
      );
    }

    const { data: row, error: selectError } = await supabase
      .from("clearances")
      .select(SELECT_FIELDS)
      .eq("document_id", id)
      .maybeSingle();

    if (selectError || !row) {
      return NextResponse.json(
        { message: "Clearance status updated successfully" }
      );
    }

    return NextResponse.json({
      message: "Clearance status updated successfully",
      data:    formatRow(row),
    });
  } catch (err) {
    console.error("[CLEARANCES PATCH ERROR]", err);
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

    const { data: existing, error: findError } = await supabase
      .from("clearances")
      .select("document_id, status, file_path")
      .eq("document_id", id)
      .maybeSingle();

    if (findError || !existing) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    if (existing.status === "approved") {
      return NextResponse.json(
        { error: "Cannot delete an approved document" },
        { status: 422 }
      );
    }

    if (existing.file_path) {
      await supabase.storage
        .from("clearance-files")
        .remove([existing.file_path]);
    }

    const { error: deleteError } = await supabase
      .from("clearances")
      .delete()
      .eq("document_id", id);

    if (deleteError) {
      console.error("[CLEARANCES DELETE ERROR]", deleteError);
      return NextResponse.json(
        { error: "Failed to delete document" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Document deleted successfully" });
  } catch (err) {
    console.error("[CLEARANCES DELETE ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}