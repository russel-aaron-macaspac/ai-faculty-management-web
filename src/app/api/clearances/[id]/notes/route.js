import { createSupabaseAdminClient } from '@/lib/supabase/server-client';

/**
 * GET /api/clearances/[id]/notes
 * Fetch all notes and remarks for a clearance record
 */
export async function GET(request, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = await params;

    // Fetch notes from clearance_notes table
    const { data, error } = await supabase
      .from('clearance_notes')
      .select('*')
      .eq('clearance_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ notes: data || [] }, { status: 200 });
  } catch (error) {
    console.error('Error fetching clearance notes:', error);
    return Response.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

/**
 * POST /api/clearances/[id]/notes
 * Add a note or remark to a clearance record
 * Required: content, authorId, authorName, noteType (remark|followup|validation)
 */
export async function POST(request, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = await params;
    const { content, authorId, authorName, noteType = 'remark' } = await request.json();

    if (!id || !content || !authorId || !authorName) {
      return Response.json(
        { error: 'Missing required fields: clearanceId, content, authorId, authorName' },
        { status: 400 }
      );
    }

    // Insert note into clearance_notes table
    const { data, error } = await supabase
      .from('clearance_notes')
      .insert([
        {
          clearance_id: id,
          content,
          author_id: authorId,
          author_name: authorName,
          note_type: noteType,
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const { data: clearance } = await supabase
      .from('clearances')
      .select('user_id, office:offices(name)')
      .eq('document_id', id)
      .maybeSingle();

    if (clearance?.user_id) {
      const { data: faculty } = await supabase
        .from('users')
        .select('user_id, supabase_id')
        .or(`user_id.eq.${clearance.user_id},supabase_id.eq.${clearance.user_id}`)
        .maybeSingle();
      const notificationUserId = faculty?.supabase_id || faculty?.user_id || clearance.user_id;
      const officeLabel = clearance.office?.name ? ' for ' + clearance.office.name : '';
      const { error: notificationError } = await supabase.from('notifications').insert({
        user_id: String(notificationUserId),
        title: 'Clearance requirement reminder',
        message: `${authorName} added a reminder${officeLabel}: ${content}`,
        type: 'clearance_note_added',
        related_id: String(id),
        is_read: false,
        created_at: new Date().toISOString(),
      });

      if (notificationError) {
        console.warn('Could not create clearance note notification:', notificationError);
      }
    }

    return Response.json(
      { message: 'Note added successfully', note: data?.[0] },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error adding clearance note:', error);
    return Response.json({ error: 'Failed to add note' }, { status: 500 });
  }
}

/**
 * DELETE /api/clearances/[id]/notes
 * Delete one officer remark from a clearance record
 */
export async function DELETE(request, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = await params;
    const { noteId } = await request.json();

    if (!id || !noteId) {
      return Response.json({ error: 'clearanceId and noteId are required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('clearance_notes')
      .delete()
      .eq('id', noteId)
      .eq('clearance_id', id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ message: 'Note deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting clearance note:', error);
    return Response.json({ error: 'Failed to delete note' }, { status: 500 });
  }
}
