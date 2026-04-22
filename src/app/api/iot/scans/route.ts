import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  analyzeScanWithSchedule,
  logValidationAlert,
} from '@/lib/attendance/aiSchedulerValidation';

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

function toFullName(user?: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
}) {
  return [user?.first_name, user?.middle_name, user?.last_name].filter(Boolean).join(' ').trim();
}

function normalizeUid(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

type ScanUser = {
  user_id: number;
  employee_no: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
};

type AttendanceStatus = 'present' | 'late' | 'absent' | 'on_leave';
type AttendanceAction = 'TIME-IN' | 'TIME-OUT' | 'NONE';

type AttendanceResult = {
  action: AttendanceAction;
  status: AttendanceStatus;
};

async function resolveUserFromScan(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  normalizedUID: string,
  userId?: number | string | null
): Promise<{ resolvedUserId: number | null; resolvedUser: ScanUser | null }> {
  const parsedUserId = userId ? Number(userId) : null;

  if (parsedUserId && !Number.isNaN(parsedUserId)) {
    const { data: userLookup } = await supabase
      .from('users')
      .select('user_id, employee_no, first_name, middle_name, last_name')
      .eq('user_id', parsedUserId)
      .maybeSingle();

    return {
      resolvedUserId: userLookup?.user_id ?? null,
      resolvedUser: (userLookup as ScanUser | null) ?? null,
    };
  }

  const { data: userLookup } = await supabase
    .from('users')
    .select('user_id, employee_no, first_name, middle_name, last_name, status')
    .eq('rfid_card_uid', normalizedUID)
    .eq('status', 'active')
    .maybeSingle();

  if (userLookup?.user_id) {
    return {
      resolvedUserId: userLookup.user_id,
      resolvedUser: userLookup as ScanUser,
    };
  }

  const { data: cardLookup } = await supabase
    .from('rfid_cards')
    .select(
      `
      user_id,
      uid,
      status,
      user:users!rfid_cards_user_id_fkey (
        user_id,
        employee_no,
        first_name,
        middle_name,
        last_name,
        status
      )
    `
    )
    .ilike('uid', normalizedUID)
    .eq('status', 'active')
    .maybeSingle();

  const cardUser = Array.isArray(cardLookup?.user) ? cardLookup?.user[0] : cardLookup?.user;
  if (cardLookup?.user_id && cardUser?.status === 'active') {
    return {
      resolvedUserId: Number(cardLookup.user_id),
      resolvedUser: {
        user_id: Number(cardUser.user_id),
        employee_no: cardUser.employee_no ?? null,
        first_name: cardUser.first_name ?? null,
        middle_name: cardUser.middle_name ?? null,
        last_name: cardUser.last_name ?? null,
      },
    };
  }

  // Fallback: compare normalized values in memory for cases like lowercase/hyphenated stored UIDs.
  const { data: activeUsers } = await supabase
    .from('users')
    .select('user_id, employee_no, first_name, middle_name, last_name, rfid_card_uid')
    .eq('status', 'active')
    .not('rfid_card_uid', 'is', null)
    .limit(500);

  const matched = (activeUsers || []).find((user: { rfid_card_uid?: string | null }) => {
    if (!user.rfid_card_uid) {
      return false;
    }

    return normalizeUid(user.rfid_card_uid) === normalizedUID;
  });

  if (matched && 'user_id' in matched) {
    return {
      resolvedUserId: matched.user_id as number,
      resolvedUser: {
        user_id: matched.user_id as number,
        employee_no: (matched as { employee_no?: string | null }).employee_no ?? null,
        first_name: (matched as { first_name?: string | null }).first_name ?? null,
        middle_name: (matched as { middle_name?: string | null }).middle_name ?? null,
        last_name: (matched as { last_name?: string | null }).last_name ?? null,
      },
    };
  }

  return {
    resolvedUserId: null,
    resolvedUser: null,
  };
}

async function applyAttendanceLog(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  resolvedUserId: number | null,
  deviceId: string,
  scanTimestamp: string,
  attendanceStatus: AttendanceStatus
): Promise<AttendanceResult> {
  if (!resolvedUserId) {
    return { action: 'NONE', status: 'present' };
  }

  const now = scanTimestamp;
  const today = todayDate();

  const { data: existingLog, error: existingLogError } = await supabase
    .from('attendance_logs')
    .select('log_id, status, time_in, time_out')
    .eq('user_id', resolvedUserId)
    .eq('log_date', today)
    .is('time_out', null)
    .order('time_in', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingLogError) {
    throw existingLogError;
  }

  if (!existingLog) {
    const { error: insertAttendanceError } = await supabase.from('attendance_logs').insert({
      user_id: resolvedUserId,
      log_date: today,
      rfid_uid: randomUUID(),
      time_in: now,
      status: attendanceStatus,
      remarks: `RFID scan via ${deviceId}`,
    });

    if (insertAttendanceError) {
      throw insertAttendanceError;
    }

    return { action: 'TIME-IN', status: attendanceStatus };
  }

  if (existingLog.time_in && !existingLog.time_out) {
    const { error: updateAttendanceError } = await supabase
      .from('attendance_logs')
      .update({
        time_out: now,
        remarks: `RFID scan via ${deviceId}`,
      })
      .eq('log_id', existingLog.log_id);

    if (updateAttendanceError) {
      throw updateAttendanceError;
    }

    const existingStatus = (existingLog.status as AttendanceStatus) || 'present';
    return { action: 'TIME-OUT', status: existingStatus };
  }

  const { error: newShiftError } = await supabase.from('attendance_logs').insert({
    user_id: resolvedUserId,
    log_date: today,
    rfid_uid: randomUUID(),
    time_in: now,
    status: attendanceStatus,
    remarks: `RFID scan via ${deviceId}`,
  });

  if (newShiftError) {
    throw newShiftError;
  }

  return { action: 'TIME-IN', status: attendanceStatus };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');
    const uid = searchParams.get('uid');
    const limit = Number.parseInt(searchParams.get('limit') || '100', 10);
    const offset = Number.parseInt(searchParams.get('offset') || '0', 10);

    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from('rfid_scans')
      .select(
        `
        id,
        device_id,
        uid,
        user_id,
        timestamp,
        status,
        reason,
        user:users (
          user_id,
          employee_no,
          first_name,
          middle_name,
          last_name
        )
      `,
        { count: 'exact' }
      )
      .order('timestamp', { ascending: false });

    if (deviceId) {
      query = query.eq('device_id', deviceId);
    }

    if (uid) {
      query = query.eq('uid', uid.trim().toUpperCase());
    }

    const { data: scans, count, error } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      scans: scans || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching scans:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, uid, userId, status, reason, timestamp } = body;

    if (!deviceId || !uid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: deviceId, uid',
        },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const normalizedUID = normalizeUid(String(uid));
    const scanTimestamp = typeof timestamp === 'string' && timestamp ? timestamp : new Date().toISOString();
    const { resolvedUserId, resolvedUser } = await resolveUserFromScan(supabase, normalizedUID, userId);
    const aiResponse =
      resolvedUserId === null
        ? null
        : await analyzeScanWithSchedule({
            supabase,
            userId: resolvedUserId,
            deviceId,
            scanTimestamp,
          });
    const attendanceStatus: AttendanceStatus = aiResponse?.status === 'late' ? 'late' : 'present';
    const attendance = await applyAttendanceLog(
      supabase,
      resolvedUserId,
      deviceId,
      scanTimestamp,
      attendanceStatus
    );

    const fallbackReason = resolvedUserId ? null : 'Card not registered or user inactive';

    const persistedScanStatus = resolvedUserId ? (status ?? 'success') : 'not_registered';

    const { data: scan, error } = await supabase
      .from('rfid_scans')
      .insert({
        device_id: deviceId,
        uid: normalizedUID,
        user_id: resolvedUserId,
        timestamp: scanTimestamp,
        status: persistedScanStatus,
        reason: reason ?? fallbackReason,
      })
      .select()
      .single();

    if (error) throw error;

    if (resolvedUserId !== null && aiResponse) {
      await logValidationAlert(supabase, {
        userId: resolvedUserId,
        deviceId,
        aiResponse,
      });
    }

    return NextResponse.json({
      success: true,
      scan,
      attendance,
      analysis: aiResponse,
      user: resolvedUserId
        ? {
            id: resolvedUserId,
            full_name: toFullName(resolvedUser ?? undefined),
          }
        : null,
    });
  } catch (error) {
    console.error('Error creating scan record:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
