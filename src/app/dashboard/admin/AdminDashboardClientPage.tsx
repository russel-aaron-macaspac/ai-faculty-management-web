'use client';

import { RouteGuard } from '@/components/RouteGuard';
import { useEffect, useState } from 'react';
import { StatCard } from '@/components/dashboard/StatCards';
import { AIAlerts } from '@/components/dashboard/AIAlerts';
import { AttendanceSummary } from '@/components/dashboard/AttendanceSummary';
import { Users, CalendarDays, FileCheck2, BarChart3 } from 'lucide-react';
import { User } from '@/types/user';
import { facultyService } from '@/services/facultyService';
import { scheduleService } from '@/services/scheduleService';
import { clearanceService } from '@/services/clearanceService';
import { parseTimeToMinutes } from '@/lib/timeUtils';

export default function AdminDashboardPage() {
  return (
    <RouteGuard requiredRoles={['admin']} fallbackPath="/dashboard/faculty">
      <AdminDashboardContent />
    </RouteGuard>
  );
}

function AdminDashboardContent() {
  const [user, setUser] = useState<User | null>(null);
  const [facultyCount, setFacultyCount] = useState<number | null>(null);
  const [activeClasses, setActiveClasses] = useState<number | null>(null);
  const [clearanceCompletion, setClearanceCompletion] = useState<{ percent: number; pending: number } | null>(null);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(JSON.parse(userStr));
    }
  }, []);

  useEffect(() => {
    const loadKPIs = async () => {
      try {
        const faculties = await facultyService.getFaculty();
        setFacultyCount(faculties.length);

        const schedules = await scheduleService.getSchedules();
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const active = schedules.filter((s) => {
          const start = parseTimeToMinutes(s.startTime);
          const end = parseTimeToMinutes(s.endTime);
          return start !== null && end !== null && start <= nowMinutes && nowMinutes <= end;
        }).length;
        setActiveClasses(active);

        try {
          const pendingApprovals = await scheduleService.getPendingApprovals('admin');
          setPendingApprovalsCount(pendingApprovals.length);
        } catch (err) {
          console.warn('[ADMIN DASHBOARD] Failed to load pending approvals', err);
          setPendingApprovalsCount(null);
        }

        const clearances = await clearanceService.getClearances();
        const pending = clearances.filter((c: any) => c.status === 'submitted' || c.status === 'pending').length;
        const total = clearances.length || 1;
        const percent = Math.round(((total - pending) / total) * 100);
        setClearanceCompletion({ percent, pending });
      } catch (e) {
        console.error('[ADMIN DASHBOARD] Failed to load dashboard KPIs', e);
      }
    };

    void loadKPIs();
  }, []);

  const computedAlerts = () => {
    const alerts: any[] = [];

    if (clearanceCompletion && clearanceCompletion.pending > 20) {
      alerts.push({ id: 'c1', type: 'warning' as const, title: 'High Pending Clearances', message: `${clearanceCompletion.pending} pending clearances need attention.`, recommendation: 'Allocate more reviewers to clear the queue.' });
    }

    if (activeClasses && activeClasses > 50) {
      alerts.push({ id: 's1', type: 'insight' as const, title: 'High number of active classes', message: `${activeClasses} classes are active now.`, recommendation: undefined });
    }

    return alerts;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Admin Dashboard</h1>
        <p className="text-slate-500 mt-1">Welcome back, {user?.name}. Here&apos;s what&apos;s happening today.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Faculty" value={facultyCount ?? '...'} description={facultyCount == null ? undefined : 'Active faculty records'} icon={Users} href="/faculty" />
        <StatCard title="Active Classes" value={activeClasses ?? '...'} description="Happening right now" icon={CalendarDays} href="/schedules" />
        <StatCard title="Clearance Completion" value={clearanceCompletion ? `${clearanceCompletion.percent}%` : '...'} description={clearanceCompletion ? `Pending: ${clearanceCompletion.pending}` : undefined} icon={FileCheck2} href="/clearance" />
        <StatCard title="Reports" value="View" description="Reports & Analytics" icon={BarChart3} href="/reports" />
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* Main Content Area */}
        <div className="md:col-span-4 lg:col-span-5 space-y-6">
          <AIAlerts alerts={computedAlerts()} />
          
          <div className="grid gap-6 md:grid-cols-2">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-4">Pending Schedule Approvals</h3>
              <div className="text-sm text-slate-500">{pendingApprovalsCount == null ? 'Loading schedule data...' : `${pendingApprovalsCount} schedules await admin review.`}</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-4">Pending Clearances</h3>
              <div className="text-sm text-slate-500">{clearanceCompletion ? `${clearanceCompletion.pending} documents require admin review.` : 'Loading clearance data...'}</div>
            </div>
          </div>
        </div>

        {/* Sidebar Widgets Area */}
        <div className="md:col-span-3 lg:col-span-2 space-y-6">
          <AttendanceSummary />
        </div>
      </div>
    </div>
  );
}
