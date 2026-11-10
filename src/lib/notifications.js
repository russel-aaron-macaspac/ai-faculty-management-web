export async function notifyAllUsers(
  supabase,
  { title, message, type, relatedId = null, excludeUserId = null }
) {
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('user_id, supabase_id');

  if (usersError) {
    console.error('[NOTIFICATIONS] Failed to load active users:', usersError);
    return { data: null, error: usersError };
  }

  const recipients = (users || [])
    .map((user) => user.supabase_id || user.user_id)
    .filter((userId) => userId != null && String(userId) !== String(excludeUserId ?? ''));

  if (recipients.length === 0) return { data: [], error: null };

  const { data, error } = await supabase.from('notifications').insert(
    recipients.map((userId) => ({
      user_id: userId,
      title,
      message,
      type,
      related_id: relatedId,
      is_read: false,
      created_at: new Date().toISOString(),
    }))
  );

  if (error) {
    console.error('[NOTIFICATIONS] Failed to create notifications:', error);
  }

  return { data, error };
}
