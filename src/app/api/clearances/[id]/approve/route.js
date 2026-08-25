import { createSupabaseAdminClient } from '@/lib/supabase/server-client';

// reviewed_by is an integer column (matches users.user_id), not a uuid.
const isInteger = (value) => /^-?\d+$/.test(String(value ?? '').trim());

/**
 * POST /api/clearances/[id]/approve
 * Approve a clearance request
 * Required: remarks, reviewedBy, reviewedByName, reviewedByRole
 */
export async function POST(request, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = await params;
    const { remarks, reviewedBy, reviewedByName, reviewedByRole } = await request.json();

    if (!reviewedBy || !reviewedByName) {
      return Response.json(
        { error: 'Missing reviewer information' },
        { status: 400 }
      );
    }

    // Update clearance status to approved
    const { data: updateData, error: updateError } = await supabase
      .from('clearances')
      .update({
        status: 'approved',
        reviewed_by: isInteger(reviewedBy) ? Number(reviewedBy) : null,
        reviewed_at: new Date().toISOString(),
        additional_notes: remarks || null,
      })
      .eq('document_id', id)
      .select();

    if (updateError) {
      console.error('[CLEARANCES APPROVE ERROR]', updateError);
      return Response.json(
        { error: updateError.message, code: updateError.code, hint: updateError.hint ?? null },
        { status: 500 }
      );
    }

    // Audit log — non-critical, don't let a failure here 500 the whole approval
    try {
      await supabase
        .from('clearance_audit_log')
        .insert([
          {
            clearance_id: id,
            action: 'approved',
            performed_by: isInteger(reviewedBy) ? Number(reviewedBy) : null,
            performer_role: reviewedByRole,
            details: remarks || 'Clearance approved',
            created_at: new Date().toISOString(),
          },
        ]);
    } catch (auditErr) {
      console.error('[CLEARANCES APPROVE] audit log failed:', auditErr);
    }

    // Notification — also non-critical
    try {
      const clearance = updateData?.[0];
      if (clearance?.user_id) {
        await supabase
          .from('notifications')
          .insert([
            {
              user_id: clearance.user_id,
              title: 'Clearance Approved',
              message: `Your ${clearance.document_type || 'clearance'} has been approved by ${reviewedByName}.`,
              type: 'clearance_approved',
              related_id: id,
              is_read: false,
              created_at: new Date().toISOString(),
            },
          ]);
      }
    } catch (notifErr) {
      console.error('[CLEARANCES APPROVE] notification failed:', notifErr);
    }

    return Response.json(
      { message: 'Clearance approved successfully', clearance: updateData?.[0] },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error approving clearance:', error);
    return Response.json({ error: 'Failed to approve clearance' }, { status: 500 });
  }
}