function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value)
  );
}

export async function resolveUserDisplayName(supabase, userId) {
  if (userId == null || String(userId).trim() === '') return 'Unknown user';

  const column = isUuid(userId) ? 'supabase_id' : 'user_id';
  const { data: user, error } = await supabase
    .from('users')
    .select('user_id, supabase_id, first_name, middle_name, last_name, email')
    .eq(column, userId)
    .maybeSingle();

  if (error) {
    console.error('[USERS] Failed to resolve display name:', error);
    return String(userId);
  }

  const fullName = [user?.first_name, user?.middle_name, user?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return fullName || user?.email || String(userId);
}
