import type { Schedule } from '@/types/schedule';

export const isApprovedSchedule = (status?: Schedule['status'] | null) => status === 'approved';

export const getScheduleStatusLabel = (status?: Schedule['status'] | null) => {
  if (!status) return 'Unknown';
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  return 'Pending';
};

export const getScheduleStatusClasses = (status?: Schedule['status'] | null) => {
  if (status === 'approved') return 'border-emerald-700/40 bg-emerald-200 text-emerald-950';
  if (status === 'rejected') return 'border-rose-700/40 bg-rose-200 text-rose-950';
  return 'border-orange-700/40 bg-orange-200 text-orange-950';
};
