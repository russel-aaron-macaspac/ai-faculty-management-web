import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function PATCH(request, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = await params;
    const body = await request.json();
    const { status, rejectionReason, reviewedBy } = body;

    console.log("[CLEARANCES PATCH BODY]", { id, status, rejectionReason, reviewedBy });

    if (!status) {
      return NextResponse.json(
        { error: "status is required" },
        { status: 400 }
      );
    }

    if (!["approved", "rejected", "pending", "submitted"].includes(status)) {
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

    const { error } = await supabase
      .from("clearances")
      .update({
        status,
        rejection_reason: status === "rejected" ? rejectionReason : null,
        reviewed_by:      reviewedBy ?? null,
        reviewed_at:      new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      })
      .eq("document_id", id);

    if (error) {
      console.error("[CLEARANCES PATCH ERROR]", error);
      return NextResponse.json(
        { error: "Failed to update clearance status" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Clearance status updated successfully" });
  } catch (err) {
    console.error("[CLEARANCES PATCH ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}