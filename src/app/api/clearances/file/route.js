import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return NextResponse.json({ error: 'path query parameter is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase.storage
      .from('clearance-files')
      .createSignedUrl(path, 60);

    if (error) {
      console.error('[CLEARANCE FILE GET ERROR]', error);
      return NextResponse.json(
        { error: 'Failed to create signed URL', details: error.message ?? error },
        { status: 500 }
      );
    }

    const url = data?.signedUrl ?? data?.signedURL ?? data?.signedurl;
    if (!url) {
      return NextResponse.json({ error: 'Signed URL not available' }, { status: 500 });
    }

    return NextResponse.json({ url });
  } catch (err) {
    console.error('[GET /api/clearances/file] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Server error', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
