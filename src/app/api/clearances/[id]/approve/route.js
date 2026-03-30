import { createSupabaseAdminClient } from '@/lib/supabase/server-client';

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

/**
 * POST /api/clearances/[id]/approve
 * Approve a clearance request
 * Required: remarks, reviewedBy, reviewedByName, reviewedByRole
 */
export async function POST(request, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = params;
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
        reviewed_by: isUuid(reviewedBy) ? reviewedBy : null,
        reviewed_at: new Date().toISOString(),
        additional_notes: remarks || null,
      })
      .eq('document_id', id)
      .select();

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    // Log approval as audit entry
    await supabase
      .from('clearance_audit_log')
      .insert([
        {
          clearance_id: id,
          action: 'approved',
          performed_by: reviewedByName,
          performer_role: reviewedByRole,
          details: remarks || 'Clearance approved',
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
            title: 'Clearance Approved',
            message: `Your ${clearance.document_type || 'clearance'} has been approved by ${reviewedByName}.`,
            type: 'clearance_approved',
            related_id: id,
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ]);
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
