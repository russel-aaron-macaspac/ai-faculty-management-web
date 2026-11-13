const OFFICE_ROLE_ALIASES = {
  'Dominican Learning Resource Center': ['dlrc'],
  'Property Management Office': ['pmo'],
  Laboratory: ['laboratory'],
  'Information & Communications Technology Office': ['ict'],
  'Community Extension Services Office': ['ceso'],
  'Program Chair': ['programchair', 'program_chair'],
  Dean: ['dean'],
  'Registrar Office': ['registrar'],
  'Office of the Vice President for Research, Extension & Linkages': ['ovprel'],
  'Office of the Vice President for Academic Affairs': ['ovpaa'],
  'Accounting Office': ['account', 'accounting', 'accounting_office'],
  'Treasury Office': ['treasury'],
  'Human Resources Office': ['hro'],
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalizeOfficeName = (name) => String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function resolveOfficeRecipientIds(supabase, officeId) {
  if (officeId == null) return [];

  const { data: office, error: officeError } = await supabase
    .from('offices')
    .select('name')
    .eq('office_id', officeId)
    .maybeSingle();

  if (officeError) {
    console.error('[NOTIFICATIONS] Failed to resolve office:', officeError);
    return [];
  }

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('user_id, supabase_id, role, email, first_name, middle_name, last_name')
    .eq('status', 'active');

  if (usersError) {
    console.error('[NOTIFICATIONS] Failed to resolve office recipients:', usersError);
    return [];
  }

  const officeRoleEntry = Object.entries(OFFICE_ROLE_ALIASES)
    .find(([officeName]) => normalizeOfficeName(officeName) === normalizeOfficeName(office?.name));
  const roles = officeRoleEntry?.[1] || [];
  const normalizedOfficeName = normalizeOfficeName(office?.name);
  const normalizedRoles = roles.map(normalizeOfficeName);
  const officeUsers = (users || []).filter((user) => {
    const role = normalizeOfficeName(user.role);
    const emailLocalPart = normalizeOfficeName(String(user.email ?? '').split('@')[0]);
    const fullName = normalizeOfficeName(
      [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ')
    );

    return normalizedRoles.includes(role)
      || normalizedRoles.some((alias) => emailLocalPart === alias || emailLocalPart.includes(alias))
      || fullName === normalizedOfficeName;
  });

  return officeUsers.flatMap((user) => [user.user_id, user.supabase_id]).filter(Boolean);
}

export async function notifyAllUsers(
  supabase,
  {
    title,
    message,
    type,
    relatedId = null,
    excludeUserId = null,
    recipientUserIds = [],
    recipientRoles = [],
    officeId = null,
  }
) {
  let resolvedRecipientIds = recipientUserIds;

  if (resolvedRecipientIds.length === 0 && recipientRoles.length > 0) {
    const { data: roleUsers, error: roleUsersError } = await supabase
      .from('users')
      .select('user_id, supabase_id')
      .eq('status', 'active')
      .in('role', recipientRoles);

    if (roleUsersError) {
      console.error('[NOTIFICATIONS] Failed to resolve role recipients:', roleUsersError);
      return { data: null, error: roleUsersError };
    }

    resolvedRecipientIds = (roleUsers || [])
      .flatMap((user) => [user.user_id, user.supabase_id])
      .filter(Boolean);
  }

  if (resolvedRecipientIds.length === 0 && relatedId != null) {
    const relatedTable = type.startsWith('clearance_') ? 'clearances'
      : type.startsWith('schedule_') ? 'schedules'
      : null;
    const relatedIdColumn = relatedTable === 'clearances' ? 'document_id' : 'schedule_id';
    const { data: relatedRecord, error: relatedError } = relatedTable
      ? await supabase
        .from(relatedTable)
        .select(relatedTable === 'clearances' ? 'user_id, office_id' : 'user_id')
        .eq(relatedIdColumn, relatedId)
        .maybeSingle()
      : { data: null, error: null };

    if (relatedError) {
      console.error('[NOTIFICATIONS] Failed to resolve related record:', relatedError);
    }

    if (relatedRecord) {
      resolvedRecipientIds = [
        relatedRecord.user_id,
        ...(await resolveOfficeRecipientIds(supabase, relatedRecord.office_id)),
      ];
    }
  }

  if (officeId != null) {
    resolvedRecipientIds = [
      ...resolvedRecipientIds,
      ...(await resolveOfficeRecipientIds(supabase, officeId)),
    ];
  }

  const recipientIds = [...new Set(
    resolvedRecipientIds.filter((userId) => userId != null).map((userId) => String(userId))
  )];
  if (recipientIds.length === 0) {
    console.warn('[NOTIFICATIONS] No relevant recipient found; notification was not created.', {
      type,
      relatedId,
    });
    return { data: [], error: null };
  }

  const numericRecipientIds = recipientIds.filter((userId) => /^\d+$/.test(userId));
  const supabaseRecipientIds = recipientIds.filter((userId) => UUID_PATTERN.test(userId));
  const [numericUsersResult, supabaseUsersResult] = await Promise.all([
    numericRecipientIds.length
      ? supabase
        .from('users')
        .select('user_id, supabase_id')
        .in('user_id', numericRecipientIds)
      : { data: [], error: null },
    supabaseRecipientIds.length
      ? supabase
        .from('users')
        .select('user_id, supabase_id')
        .in('supabase_id', supabaseRecipientIds)
      : { data: [], error: null },
  ]);

  if (numericUsersResult.error || supabaseUsersResult.error) {
    const usersError = numericUsersResult.error || supabaseUsersResult.error;
    console.error('[NOTIFICATIONS] Failed to resolve notification recipients:', usersError);
    return { data: null, error: usersError };
  }

  const users = [...(numericUsersResult.data || []), ...(supabaseUsersResult.data || [])];
  const recipients = [...new Set(users
    .map((user) => user.supabase_id || user.user_id)
    .filter((userId) => userId != null && String(userId) !== String(excludeUserId ?? '')))];

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
