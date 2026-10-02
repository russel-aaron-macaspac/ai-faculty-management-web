import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const form = await request.formData();
    const files = form.getAll("files").filter((file) => file && typeof file.arrayBuffer === "function");
    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: clearance, error: clearanceError } = await supabase
      .from("clearances")
      .select("document_id, user_id, status")
      .eq("document_id", id)
      .maybeSingle();

    if (clearanceError || !clearance) {
      return NextResponse.json({ error: "Clearance request not found" }, { status: 404 });
    }
    if (clearance.status === "approved") {
      return NextResponse.json({ error: "Cannot add files to an approved clearance" }, { status: 422 });
    }

    const attachments = [];
    for (const file of files) {
      const safeName = (file.name || "upload").replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const filePath = `uploads/clearances/${String(clearance.user_id)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("clearance-files")
        .upload(filePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "application/octet-stream" });

      if (uploadError) {
        return NextResponse.json({ error: "Failed to store attachment", details: uploadError.message }, { status: 500 });
      }
      attachments.push({
        clearance_id: Number(id),
        original_filename: file.name || safeName,
        file_path: filePath,
      });
    }

    const { data, error } = await supabase
      .from("clearance_attachments")
      .insert(attachments)
      .select("attachment_id, clearance_id, original_filename, file_path, uploaded_at");

    if (error) {
      console.error("[CLEARANCE ATTACHMENTS INSERT ERROR]", error);
      await supabase.storage.from("clearance-files").remove(attachments.map((attachment) => attachment.file_path));
      return NextResponse.json({ error: "Failed to save attachments", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data.map((attachment) => ({
      id: String(attachment.attachment_id),
      clearanceId: String(attachment.clearance_id),
      originalFilename: attachment.original_filename,
      filePath: attachment.file_path,
      uploadedAt: attachment.uploaded_at,
    })) });
  } catch (error) {
    console.error("[CLEARANCE ATTACHMENTS POST ERROR]", error);
    return NextResponse.json({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { attachmentId, primary } = await request.json();
    const supabase = createSupabaseAdminClient();

    if (primary) {
      const { data: clearance, error: clearanceError } = await supabase
        .from("clearances")
        .select("file_path, status")
        .eq("document_id", id)
        .maybeSingle();

      if (clearanceError || !clearance) {
        return NextResponse.json({ error: "Clearance request not found" }, { status: 404 });
      }
      if (clearance.status === "approved") {
        return NextResponse.json({ error: "Cannot delete a file from an approved clearance" }, { status: 422 });
      }

      if (clearance.file_path) {
        await supabase.storage.from("clearance-files").remove([clearance.file_path]);
      }
      const { error: updateError } = await supabase
        .from("clearances")
        .update({ original_filename: null, file_path: null })
        .eq("document_id", id);

      if (updateError) {
        return NextResponse.json({ error: "Failed to remove primary file", details: updateError.message }, { status: 500 });
      }
      return NextResponse.json({ message: "Primary file removed successfully" });
    }

    const { data: attachment, error: findError } = await supabase
      .from("clearance_attachments")
      .select("attachment_id, file_path")
      .eq("attachment_id", attachmentId)
      .eq("clearance_id", id)
      .maybeSingle();

    if (findError || !attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    await supabase.storage.from("clearance-files").remove([attachment.file_path]);
    const { error: deleteError } = await supabase
      .from("clearance_attachments")
      .delete()
      .eq("attachment_id", attachmentId)
      .eq("clearance_id", id);

    if (deleteError) {
      return NextResponse.json({ error: "Failed to remove attachment", details: deleteError.message }, { status: 500 });
    }
    return NextResponse.json({ message: "Attachment removed successfully" });
  } catch (error) {
    console.error("[CLEARANCE ATTACHMENTS DELETE ERROR]", error);
    return NextResponse.json({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}