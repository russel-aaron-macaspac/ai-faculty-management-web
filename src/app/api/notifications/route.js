import { createSupabaseAdminClient } from '@/lib/supabase/server-client';

/**
 * GET /api/notifications?userId=...
 * Fetch notifications for a user
 */
export async function GET(request) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    if (!userId) {
      return Response.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ notifications: data || [] }, { status: 200 });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return Response.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

/**
 * PATCH /api/notifications
 * Mark notification(s) as read
 * Required: notificationId OR userId (mark all as read)
 */
export async function PATCH(request) {
  try {
    const supabase = createSupabaseAdminClient();
    const { notificationId, userId, markAsRead = true } = await request.json();

    if (!notificationId && !userId) {
      return Response.json(
        { error: 'Missing notificationId or userId parameter' },
        { status: 400 }
      );
    }

    let updateQuery;
    if (notificationId) {
      updateQuery = supabase
        .from('notifications')
        .update({ is_read: markAsRead })
        .eq('id', notificationId)
        .select();
    } else {
      updateQuery = supabase
        .from('notifications')
        .update({ is_read: markAsRead })
        .eq('user_id', userId)
        .select();
    }

    const { data, error } = await updateQuery;

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(
      { message: 'Notification(s) updated', updated: data || [] },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating notification:', error);
    return Response.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
