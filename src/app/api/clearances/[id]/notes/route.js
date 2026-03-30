import { createSupabaseAdminClient } from '@/lib/supabase/server-client';

/**
 * GET /api/clearances/[id]/notes
 * Fetch all notes and remarks for a clearance record
 */
export async function GET(request, { params }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { id } = params;

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
    const { id } = params;
    const { content, authorId, authorName, noteType = 'remark' } = await request.json();

    if (!content || !authorId || !authorName) {
      return Response.json(
        { error: 'Missing required fields: content, authorId, authorName' },
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

    return Response.json(
      { message: 'Note added successfully', note: data?.[0] },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error adding clearance note:', error);
    return Response.json({ error: 'Failed to add note' }, { status: 500 });
  }
}
