import { createSupabaseAdminClient } from '@/lib/supabase/server-client';

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value)
  );

async function resolveNotificationUserId(supabase, userId) {
  if (isUuid(userId)) return userId;

  const { data: user, error } = await supabase
    .from('users')
    .select('user_id, supabase_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[NOTIFICATIONS] Failed to resolve user:', error);
    return null;
  }

  return user?.supabase_id || user?.user_id || null;
}

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

    const notificationUserId = await resolveNotificationUserId(supabase, userId);
    if (!notificationUserId) {
      return Response.json({ notifications: [] }, { status: 200 });
    }

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', notificationUserId)
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
      const notificationUserId = await resolveNotificationUserId(supabase, userId);
      if (!notificationUserId) {
        return Response.json({ message: 'No matching user', updated: [] }, { status: 200 });
      }

      updateQuery = supabase
        .from('notifications')
        .update({ is_read: markAsRead })
        .eq('user_id', notificationUserId)
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
