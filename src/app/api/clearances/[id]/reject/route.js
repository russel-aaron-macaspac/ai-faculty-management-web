import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import { notifyAllUsers } from '@/lib/notifications';

// reviewed_by is an integer column (matches users.user_id), not a uuid.
const isInteger = (value) => /^-?\d+$/.test(String(value ?? '').trim());

/**
 * POST /api/clearances/[id]/reject
 * Reject a clearance request
 * Required: rejectionReason, reviewedBy, reviewedByName, reviewedByRole
 */
export async function POST(request, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = await params;
    const { rejectionReason, reviewedBy, reviewedByName, reviewedByRole } = await request.json();

    if (!rejectionReason || !reviewedBy || !reviewedByName) {
      return Response.json(
        { error: 'Missing required fields: rejectionReason, reviewedBy, reviewedByName' },
        { status: 400 }
      );
    }

    // Update clearance status to rejected
    const { data: updateData, error: updateError } = await supabase
      .from('clearances')
      .update({
        status: 'rejected',
        reviewed_by: isInteger(reviewedBy) ? Number(reviewedBy) : null,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
        additional_notes: rejectionReason,
      })
      .eq('document_id', id)
      .select();

    if (updateError) {
      console.error('[CLEARANCES REJECT ERROR]', updateError);
      return Response.json(
        { error: updateError.message, code: updateError.code, hint: updateError.hint ?? null },
        { status: 500 }
      );
    }

    // Log rejection as audit entry
    try {
      await supabase
        .from('clearance_audit_log')
        .insert([
          {
            clearance_id: id,
            action: 'rejected',
            performed_by: isInteger(reviewedBy) ? Number(reviewedBy) : null,
            performer_role: reviewedByRole,
            details: JSON.stringify(rejectionReason),
            created_at: new Date().toISOString(),
          },
        ]);
    } catch (auditErr) {
      console.error('[CLEARANCES REJECT] audit log failed:', auditErr);
    }

    await notifyAllUsers(supabase, {
      title: 'Clearance rejected',
      message: `Clearance #${id} was rejected. Reason: ${rejectionReason.substring(0, 100)}`,
      type: 'clearance_rejected',
      relatedId: String(id),
    });

    return Response.json(
      { message: 'Clearance rejected successfully', clearance: updateData?.[0] },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error rejecting clearance:', error);
    return Response.json({ error: 'Failed to reject clearance' }, { status: 500 });
  }
}