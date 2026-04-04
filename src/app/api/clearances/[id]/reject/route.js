import { createSupabaseAdminClient } from '@/lib/supabase/server-client';

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

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
        reviewed_by: isUuid(reviewedBy) ? reviewedBy : null,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
        additional_notes: rejectionReason,
      })
      .eq('document_id', id)
      .select();

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    // Log rejection as audit entry
    await supabase
      .from('clearance_audit_log')
      .insert([
        {
          clearance_id: id,
          action: 'rejected',
          performed_by: reviewedByName,
          performer_role: reviewedByRole,
          details: rejectionReason,
          created_at: new Date().toISOString(),
        },
      ]);

    // Create notification for user
    const clearance = updateData?.[0];
    if (clearance) {
      await supabase
        .from('notifications')
        .insert([
          {
            user_id: clearance.user_id,
            title: 'Clearance Rejected',
            message: `Your ${clearance.document_type || 'clearance'} was rejected. Reason: ${rejectionReason.substring(0, 100)}...`,
            type: 'clearance_rejected',
            related_id: id,
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ]);
    }

    return Response.json(
      { message: 'Clearance rejected successfully', clearance: updateData?.[0] },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error rejecting clearance:', error);
    return Response.json({ error: 'Failed to reject clearance' }, { status: 500 });
  }
}
