'use client';

import { useEffect, useMemo, useState } from 'react';
import { StatCard } from '@/components/dashboard/StatCards';
import { AIAlerts } from '@/components/dashboard/AIAlerts';
import { User } from '@/types/user';
import { FileCheck2, Clock, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { clearanceService } from '@/services/clearanceService';
import { Clearance } from '@/types/clearance';
import { getApprovalOfficerConfig } from '@/lib/roleConfig';

export default function ApprovalDashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [clearances, setClearances] = useState<Clearance[]>([]);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(JSON.parse(userStr));
    }
  }, []);

  useEffect(() => {
    const loadClearances = async () => {
      const data = await clearanceService.getClearances();
      setClearances(data as Clearance[]);
    };

    void loadClearances();
  }, []);

  const officeLabel = user?.role ? getApprovalOfficerConfig(user.role)?.name ?? 'Office' : 'Office';

  const stats = useMemo(() => {
    const pending = clearances.filter((item) => item.status === 'submitted' || item.status === 'pending').length;
    const approved = clearances.filter((item) => item.status === 'approved').length;
    const rejected = clearances.filter((item) => item.status === 'rejected').length;
    const total = clearances.length;

    return { pending, approved, rejected, total };
  }, [clearances]);

  const alerts = [
    {
      id: 'approval-queue',
      type: stats.pending > 0 ? ('warning' as const) : ('insight' as const),
      title: stats.pending > 0 ? 'Pending review queue' : 'Queue is clear',
      message:
        stats.pending > 0
          ? `${stats.pending} submissions are waiting for your decision.`
          : 'No pending submissions for your office right now.',
      recommendation: stats.pending > 0 ? 'Open Clearance to approve or reject submissions.' : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Approval Dashboard</h1>
        <p className="text-slate-500 mt-1">
          Welcome, {user?.name ?? 'Officer'}. Manage and review clearance requests for {officeLabel}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Pending Reviews" value={stats.pending} icon={Clock} href="/clearance" />
        <StatCard title="Approved" value={stats.approved} icon={CheckCircle2} href="/clearance" />
        <StatCard title="Rejected" value={stats.rejected} icon={XCircle} href="/clearance" />
        <StatCard title="Total Records" value={stats.total} icon={FileCheck2} href="/clearance" />
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <div className="md:col-span-4 lg:col-span-5 space-y-6">
          <AIAlerts alerts={alerts} />

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4">Approval Workflow</h3>
            <div className="space-y-3">
              {[
                '1. Review attached documents and remarks from faculty submissions.',
                '2. Mark requests as Approved once requirements are complete.',
                '3. Use Rejected status and provide notes when corrections are needed.',
              ].map((step) => (
                <div key={step} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="md:col-span-3 lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-red-500" />
            <h3 className="font-semibold text-slate-800 mt-3">Office Scope</h3>
            <p className="text-sm text-slate-500 mt-2">You can only process clearance records assigned to your approval office.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
