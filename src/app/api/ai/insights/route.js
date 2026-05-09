import { createSupabaseAdminClient } from '@/lib/supabase/server-client';
import { NextResponse } from 'next/server';
import { detectScheduleConflicts } from '@/lib/scheduling/conflictDetection';

function isoDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    const supabase = createSupabaseAdminClient();

    const since = isoDateDaysAgo(7);

    const { data: attendanceRecords, error: attendanceError } = await supabase
      .from('attendance_logs')
      .select(`log_id, log_date, status, time_in, users!fk_attendance_user ( user_id, first_name, middle_name, last_name )`)
      .gte('log_date', since)
      .order('log_date', { ascending: false })
      .limit(1000);

    if (attendanceError) throw attendanceError;

    const lateRecords = (attendanceRecords || []).filter((r) => r.status === 'late');

    const lateCountByUser = {};
    for (const r of lateRecords) {
      const uid = String(r.users?.user_id ?? 'unknown');
      lateCountByUser[uid] = (lateCountByUser[uid] || 0) + 1;
    }

    const topLate = Object.entries(lateCountByUser)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([uid, count]) => ({ id: uid, count }));

    // Build a simple lateness timeseries for the last 14 days
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }

    const latenessSeries = days.map((day) => {
      const count = (attendanceRecords || []).filter((r) => r.log_date === day && r.status === 'late').length;
      return { date: day, lateCount: count };
    });

    const { data: clearanceRows } = await supabase
      .from('clearances')
      .select('document_id, status, office:offices ( office_id, name )')
      .order('submitted_at', { ascending: false })
      .limit(1000);

    const pendingByOffice = {};
    (clearanceRows || []).forEach((r) => {
      if (r.status !== 'pending') return;
      const name = r.office?.name ?? 'Unknown Office';
      pendingByOffice[name] = (pendingByOffice[name] || 0) + 1;
    });

    const alerts = [];

    if (topLate.length > 0) {
      const list = topLate.map((t) => `${t.id} (${t.count})`).join(', ');
      alerts.push({
        id: 'late-trend',
        type: 'warning',
        title: 'Late Arrival Trend Detected',
        message: `Several faculty members have repeated late arrivals in the last 7 days: ${list}.`,
        recommendation: 'Consider sending a gentle reminder about shift times or review schedule assignments for conflicts.'
      });
    }

    const pendingOffices = Object.entries(pendingByOffice).map(([office, count]) => ({ office, count }));
    if (pendingOffices.length > 0) {
      const top = pendingOffices.sort((a, b) => b.count - a.count)[0];
      alerts.push({
        id: 'clearance-backlog',
        type: 'insight',
        title: `Clearance Backlog: ${top.office}`,
        message: `${top.count} pending document(s) in ${top.office}.`,
        recommendation: 'Ask office admins to review pending documents or enable auto-notifications for submitters.'
      });
    }

    // Personalized insight if user_id provided
    if (userId) {
      const userLateCount = lateCountByUser[String(userId)] || 0;
      if (userLateCount >= 1) {
        alerts.unshift({
          id: 'personal-late',
          type: 'warning',
          title: 'Your Recent Arrivals',
          message: `You were late ${userLateCount} time(s) in the last 7 days.`,
          recommendation: 'Try enabling a calendar reminder 15 minutes before your earliest scheduled shift.'
        });
      } else {
        alerts.unshift({
          id: 'personal-on-time',
          type: 'success',
          title: 'Good Punctuality',
          message: 'No late records found for you in the past 7 days.',
          recommendation: 'Keep up the great attendance — consider mentoring peers.'
        });
      }

      // Check for schedule conflicts for this user
      try {
        const { data: userSchedules, error: schedErr } = await supabase
          .from('schedules')
          .select('id, day, start_time, end_time, room_id, status')
          .eq('faculty_id', userId)
          .neq('status', 'rejected');

        if (!schedErr && Array.isArray(userSchedules)) {
          // detect overlaps within user's schedules
          const conflicts = [];
          for (let i = 0; i < userSchedules.length; i++) {
            for (let j = i + 1; j < userSchedules.length; j++) {
              const a = userSchedules[i];
              const b = userSchedules[j];
              if (a.day !== b.day) continue;
              const aStart = String(a.start_time).slice(0, 5);
              const aEnd = String(a.end_time).slice(0, 5);
              const bStart = String(b.start_time).slice(0, 5);
              const bEnd = String(b.end_time).slice(0, 5);
              const overlaps = aStart < bEnd && aEnd > bStart;
              if (overlaps) {
                conflicts.push({ day: a.day, first: { id: a.id, start: aStart, end: aEnd, room: a.room_id }, second: { id: b.id, start: bStart, end: bEnd, room: b.room_id } });
              }
            }
          }

          if (conflicts.length > 0) {
            alerts.unshift({
              id: 'schedule-conflict',
              type: 'warning',
              title: 'Schedule Conflict Detected',
              message: `You have ${conflicts.length} overlapping schedule(s).`,
              recommendation: 'Review your schedule and resolve overlapping assignments; consider swapping or moving sections.'
            });
          }
        }
      } catch (err) {
        // ignore conflict detection failures
      }
    }

    // attach series to response for charts
    const meta = { latenessSeries };

    return NextResponse.json({ alerts, meta });
  } catch (err) {
    console.error('[AI INSIGHTS ERROR]', err);
    return NextResponse.json({ error: 'Failed to compute insights' }, { status: 500 });
  }
}
