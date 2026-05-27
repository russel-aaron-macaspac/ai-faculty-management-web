import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const body = await req.json();
    const { id, action } = body || {};

    console.log('[AI INSIGHTS ACTION] id:', id, 'action:', action);

    // TODO: persist actions (dismiss/apply) in DB or trigger follow-up jobs.
    // For now, just acknowledge the action.

    return NextResponse.json({ ok: true, id, action });
  } catch (err) {
    console.error('[AI INSIGHTS ACTION ERROR]', err);
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}
