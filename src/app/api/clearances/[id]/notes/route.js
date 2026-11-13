import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import { notifyAllUsers } from '@/lib/notifications';

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

    const { data: clearance, error: clearanceError } = await supabase
      .from('clearances')
      .select('document_id')
      .eq('document_id', id)
      .maybeSingle();

    if (clearanceError || !clearance) {
      console.error('[CLEARANCE NOTES] Failed to resolve clearance number:', clearanceError);
      return Response.json({ error: 'Clearance not found' }, { status: 404 });
    }

    const clearanceNumber = String(clearance.document_id);
    await notifyAllUsers(supabase, {
      title: 'Clearance updated',
      message: `${authorName} added a reminder to clearance #${clearanceNumber}: ${content}`,
      type: 'clearance_note_added',
      relatedId: clearanceNumber,
    });

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
