import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getDepartmentScope } from "@/lib/scheduling/departmentAccess";
import { NextResponse } from "next/server";
import { recordClearanceAuditEvent } from "@/lib/auditLog";

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
    const actorId = searchParams.get("actorId");
    const actorRole = searchParams.get("actorRole");
    let scopedSupabaseIds = [];
    let scopedNumericIds = [];

    let query = supabase
      .from("clearances")
      .select(SELECT_FIELDS)
      .order("document_id", { ascending: false });

    if (actorRole === "program_chair") {
      const scope = await getDepartmentScope(supabase, actorId, actorRole);
      if (scope.departmentId == null) {
        return NextResponse.json({ data: [] });
      }

      const { data: departmentUsers, error: departmentUsersError } = await supabase
        .from("users")
        .select("user_id, supabase_id")
        .eq("department_id", scope.departmentId);

      if (departmentUsersError) {
        console.error("[CLEARANCES GET SCOPE ERROR]", departmentUsersError);
        return NextResponse.json(
          { error: "Failed to scope clearances", details: departmentUsersError },
          { status: 500 }
        );
      }

      scopedSupabaseIds = (departmentUsers || [])
        .map((entry) => entry?.supabase_id)
        .filter((value) => typeof value === "string" && value.trim() !== "");

      scopedNumericIds = (departmentUsers || [])
        .map((entry) => entry?.user_id)
        .filter((value) => value != null)
        .map((value) => String(value));

      const scopedUserIds = scopedSupabaseIds.length > 0 ? scopedSupabaseIds : scopedNumericIds;

      if (scopedUserIds.length === 0) {
        return NextResponse.json({ data: [] });
      }

      query = query.in("user_id", scopedUserIds);
    }

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

    let scopedData = data || [];

    if (
      actorRole === "program_chair" &&
      scopedData.length === 0 &&
      !userId &&
      scopedSupabaseIds.length > 0 &&
      scopedNumericIds.length > 0
    ) {
      let fallbackQuery = supabase
        .from("clearances")
        .select(SELECT_FIELDS)
        .order("document_id", { ascending: false })
        .in("user_id", scopedNumericIds);

      if (officeId) {
        fallbackQuery = fallbackQuery.eq("office_id", officeId);
      }

      const { data: fallbackData, error: fallbackError } = await fallbackQuery;
      if (!fallbackError && Array.isArray(fallbackData)) {
        scopedData = fallbackData;
      }
    }

    console.log("[CLEARANCES GET SUCCESS] Fetched", scopedData.length, "clearances");
    const clearanceIds = scopedData.map((row) => row.document_id).filter(Boolean);
    let notesByClearance = new Map();
    if (clearanceIds.length > 0) {
      const { data: notes, error: notesError } = await supabase
        .from("clearance_notes")
        .select("id, clearance_id, content, author_id, author_name, note_type, created_at, updated_at")
        .in("clearance_id", clearanceIds)
        .order("created_at", { ascending: false });

      if (notesError) {
        console.warn("[CLEARANCES GET NOTES ERROR]", notesError);
      } else {
        notesByClearance = (notes || []).reduce((map, note) => {
          const key = String(note.clearance_id);
          map.set(key, [...(map.get(key) || []), note]);
          return map;
        }, new Map());
      }
    }

    const formatted = scopedData.map((row) => ({
      ...formatRow(row),
      notes: notesByClearance.get(String(row.document_id)) || [],
    }));

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
  file_path,
  actorName,
  actorRole
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
  // If the existing record was rejected/expired, refresh it with the new upload
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

    await recordClearanceAuditEvent(supabase, {
      clearanceId: existing.document_id,
      actorName,
      actorRole,
      category: "Clearance",
      action: "resubmitted",
      target: `Clearance #${existing.document_id}`,
      details: `Document resubmitted by user #${user_id}`,
    });

    return NextResponse.json({ data: formatRow(updated) });
  }
  // If the existing record has no file (file_path missing) or the stored file cannot be found,
  // allow replacing it by updating the existing record to point to the newly uploaded file.
  try {
    const hasFilePath = !!existing.file_path;
    let storageMissing = false;

    if (hasFilePath) {
      // Try to download the existing file to check existence. If it fails, treat as missing.
      const { data: downloadData, error: downloadError } = await supabase.storage
        .from('clearance-files')
        .download(existing.file_path);

      if (downloadError) {
        storageMissing = true;
      }
    }

    if (!hasFilePath || storageMissing) {
      const { data: updated, error: updateError } = await refreshRejectedClearance(
        supabase,
        existing,
        original_filename,
        file_path
      );

      if (updateError || !updated) {
        return NextResponse.json(
          { error: "Failed to replace existing clearance record", details: updateError?.message ?? updateError },
          { status: 500 }
        );
      }

      await recordClearanceAuditEvent(supabase, {
        clearanceId: existing.document_id,
        actorName,
        actorRole,
        category: "Clearance",
        action: "resubmitted",
        target: `Clearance #${existing.document_id}`,
        details: `Document resubmitted by user #${user_id}`,
      });

      return NextResponse.json({ data: formatRow(updated) });
    }
  } catch (checkErr) {
    console.error('[POST /api/clearances] Error checking existing file presence:', checkErr);
    // Fall through to the default conflict response below.
  }

  return NextResponse.json(
    { error: "A clearance record for this office already exists. Please wait for review or contact the administrator if you need to upload again.", details: existing.status },
    { status: 409 }
  );
}

export async function POST(req) {
  try {
    const supabase = createSupabaseAdminClient();

    // If request has form data (files), handle multiple file uploads first
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const user_id = form.get('user_id');
      const office_id = form.get('office_id');
      const actorName = form.get('actor_name');
      const actorRole = form.get('actor_role');

      if (!user_id || !office_id) {
        return NextResponse.json({ error: 'Missing user_id or office_id' }, { status: 400 });
      }

      const files = form.getAll('files');
      if (!files || files.length === 0) {
        return NextResponse.json({ error: 'No files provided' }, { status: 400 });
      }

      const results = [];
      for (const f of files) {
        try {
          // `f` is a File/Blob-like object
          const arrayBuffer = await f.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const safeName = (f.name || 'upload').replace(/[^a-zA-Z0-9.\-_]/g, '_');
          const destPath = `uploads/clearances/${String(user_id)}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safeName}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('clearance-files')
            .upload(destPath, buffer, { contentType: f.type || 'application/octet-stream' });

          if (uploadError) {
            console.error('[CLEARANCES UPLOAD ERROR]', uploadError);
            results.push({ success: false, error: uploadError.message ?? uploadError });
            continue;
          }

          // Insert clearance record for this uploaded file
          const { data, error } = await supabase
            .from('clearances')
            .insert([
              {
                user_id: String(user_id),
                office_id: Number(office_id),
                original_filename: f.name ?? null,
                file_path: destPath,
                status: 'pending',
                submitted_at: new Date().toISOString(),
              },
            ])
            .select(SELECT_FIELDS)
            .maybeSingle();

          if (error) {
            // Try to handle duplicate or other insert errors gracefully
            const resp = await handleClearanceInsertError(
              supabase,
              error,
              String(user_id),
              Number(office_id),
              f.name,
              destPath,
              actorName,
              actorRole
            );

            // If the error handler returned a response, push that as result
            results.push({ success: resp?.data ? true : false, data: resp?.data ?? null, error: resp?.error ?? null });
            continue;
          }

          await recordClearanceAuditEvent(supabase, {
            clearanceId: data.document_id,
            actorName,
            actorRole,
            category: "Clearance",
            action: "submitted",
            target: `Clearance #${data.document_id}`,
            details: `Document submitted by user #${user_id}`,
          });

          results.push({ success: true, data });
        } catch (err) {
          console.error('[POST /api/clearances] File processing error:', err);
          results.push({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
      }

      return NextResponse.json({ results });
    }

    // Otherwise parse JSON body for single-record submissions
    const body = await req.json();
    const { user_id, office_id, original_filename, file_path, actor_name: actorName, actor_role: actorRole } = body || {};

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
        file_path,
        actorName,
        actorRole
      );
    }

    const formatted = formatRow(data);

    await recordClearanceAuditEvent(supabase, {
      clearanceId: data.document_id,
      actorName,
      actorRole,
      category: "Clearance",
      action: "submitted",
      target: `Clearance #${data.document_id}`,
      details: `Document submitted by user #${user_id}`,
    });

    return NextResponse.json({ data: formatted });
  } catch (err) {
    console.error("[POST /api/clearances] Unexpected error:", err);
    return NextResponse.json(
      { error: "Server error", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}