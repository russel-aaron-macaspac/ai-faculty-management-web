import { createSupabaseAdminClient } from "@/lib/supabase/server-client";
import { NextResponse } from "next/server";

const OFFICE_LOOKUP_COLUMNS = ['name', 'office_name', 'title'];

const normalizeOffice = (value = '') =>
  value
    .toLowerCase()
    .trim()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join(' ');

async function loadOffices(supabase) {
  for (const labelColumn of OFFICE_LOOKUP_COLUMNS) {
    const { data, error } = await supabase
      .from('offices')
      .select(`office_id, ${labelColumn}`)
      .order('office_id', { ascending: true });

    if (!error && data) {
      return data.map((row) => ({
        office_id: String(row.office_id),
        label: row[labelColumn],
      }));
    }
  }

  return [];
}

async function findOfficeIdByName(supabase, officeName) {
  const normalizedTarget = normalizeOffice(officeName);

  const offices = await loadOffices(supabase);
  const matched = offices.find((office) => normalizeOffice(office.label) === normalizedTarget);

  return matched?.office_id ?? null;
}

export async function GET(request) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    let query = supabase
      .from("clearances")
      .select(
        `document_id,status,submitted_at,rejection_reason,user_id,office_id,reviewed_by,reviewed_at`
      )
      .order("document_id", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[CLEARANCES GET ERROR]", error);
      return NextResponse.json(
        { error: "Failed to fetch clearances" },
        { status: 500 }
      );
    }

    const userIds = Array.from(new Set((data || []).map((d) => d.user_id).filter(Boolean)));

    const usersRes = userIds.length
      ? await supabase
          .from('users')
          .select('user_id,first_name,middle_name,last_name')
          .in('user_id', userIds)
      : { data: [], error: null };

    const officeMap = new Map();
    const offices = await loadOffices(supabase);
    offices.forEach((office) => {
      officeMap.set(String(office.office_id), office.label || 'Unknown Office');
    });

    const userMap = new Map(
      (usersRes.data || []).map((u) => [
        String(u.user_id),
        [u.first_name, u.middle_name, u.last_name].filter(Boolean).join(' '),
      ])
    );

    const formatted = (data || []).map((d) => {
      const fullName = userMap.get(String(d.user_id)) || 'Unknown';
      const officeName = officeMap.get(String(d.office_id)) || 'Unknown Office';

      return {
        id:                String(d.document_id),
        employeeId:        String(d.user_id ?? ""),
        employeeName:      fullName,
        requiredDocument:  officeName,
        status:            d.status ?? "pending",
        submissionDate:    d.submitted_at ? d.submitted_at.split("T")[0] : null,
        validationWarning: d.rejection_reason ?? null,
        reviewedBy:        d.reviewed_by ? String(d.reviewed_by) : undefined,
        reviewedAt:        d.reviewed_at ?? undefined,
      };
    });

    return NextResponse.json({ data: formatted });
  } catch (err) {
    console.error("[CLEARANCES GET ERROR]", err);
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
    const { employeeId, officeName, academicYear, semester } = body;

    console.log("[CLEARANCES POST BODY]", { employeeId, officeName, academicYear, semester });

    if (!employeeId || !officeName) {
      return NextResponse.json(
        { error: "employeeId and officeName are required" },
        { status: 400 }
      );
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("user_id, status")
      .eq("user_id", employeeId)
      .single();

    console.log("[CLEARANCES POST USER]", { user, userError });

    if (userError || !user) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    if (user.status !== "active") {
      return NextResponse.json(
        { error: "Cannot submit clearance for an inactive employee" },
        { status: 422 }
      );
    }

    const officeId = await findOfficeIdByName(supabase, officeName);

    if (!officeId) {
      return NextResponse.json(
        { error: `No office found matching "${officeName}"` },
        { status: 404 }
      );
    }

    const { data: existing } = await supabase
      .from("clearances")
      .select("document_id, status")
      .eq("user_id", employeeId)
      .eq("office_id", officeId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "A document for this office has already been submitted" },
        { status: 409 }
      );
    }

    const insertPayload = {
      user_id: employeeId,
      office_id: officeId,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    };

    // Keep insert schema-safe: only include optional fields when explicitly provided.
    if (academicYear) {
      insertPayload.academic_year = academicYear;
    }
    if (semester) {
      insertPayload.semester = semester;
    }

    const { data: newDocument, error: insertError } = await supabase
      .from("clearances")
      .insert(insertPayload)
      .select("document_id")
      .single();

    if (insertError) {
      console.error("[CLEARANCES POST ERROR]", insertError);
      return NextResponse.json(
        { error: insertError.message || "Failed to submit clearance document" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Document submitted successfully", id: String(newDocument.document_id) },
      { status: 201 }
    );
  } catch (err) {
    console.error("[CLEARANCES POST ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}