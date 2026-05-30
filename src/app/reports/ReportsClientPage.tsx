'use client';

import { useEffect, useMemo, useState } from 'react';
import { RouteGuard } from '@/components/RouteGuard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, TrendingUp, Users, Clock, FileCheck2, Filter } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { attendanceService } from '@/services/attendanceService';
import { facultyService } from '@/services/facultyService';
import { clearanceService } from '@/services/clearanceService';
import { parseTimeToMinutes } from '@/lib/timeUtils';

export default function ReportsPage() {
  const [attendance, setAttendance] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [clearances, setClearances] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [f, a, c] = await Promise.all([
          facultyService.getFaculty(),
          attendanceService.getAttendance(),
          clearanceService.getClearances(),
        ]);

        if (!mounted) return;
        setFaculties(f || []);
        setAttendance(a || []);
        setClearances(c || []);
      } catch (err) {
        console.error('[ReportsPage] failed to load data', err);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const facultyCount = faculties.length;

    const presentStatuses = new Set(['present', 'late']);
    const presentCount = attendance.filter((r: any) => presentStatuses.has(r.status)).length;

    const avgAttendance = facultyCount ? Math.round((presentCount / facultyCount) * 1000) / 10 : 0;

    // total hours from attendance records with timeIn/timeOut
    let totalMinutes = 0;
    attendance.forEach((r: any) => {
      if (r.timeIn && r.timeOut) {
        const start = parseTimeToMinutes(r.timeIn);
        const end = parseTimeToMinutes(r.timeOut);
        if (start !== null && end !== null && end > start) {
          totalMinutes += end - start;
        }
      }
    });
    const totalHours = Math.round((totalMinutes / 60) * 10) / 10; // one decimal

    const activePersonnel = new Set(attendance.map((r: any) => r.employeeId)).size;

    const clearanceTotal = Array.isArray(clearances) ? clearances.length : 0;
    const clearanceApproved = Array.isArray(clearances) ? clearances.filter((c: any) => c.status === 'approved').length : 0;
    const clearanceCompliance = clearanceTotal ? Math.round((clearanceApproved / clearanceTotal) * 100) : 0;

    // departmental attendance
    const deptMap: Record<string, { total: number; present: number }> = {};
    const facultyById: Record<string, any> = {};
    faculties.forEach((f: any) => { facultyById[String(f.id)] = f; });

    faculties.forEach((f: any) => {
      const dept = f.department || 'Unknown';
      if (!deptMap[dept]) deptMap[dept] = { total: 0, present: 0 };
      deptMap[dept].total += 1;
    });

    attendance.forEach((r: any) => {
      const fac = facultyById[String(r.employeeId)];
      const dept = fac?.department || 'Unknown';
      if (!deptMap[dept]) deptMap[dept] = { total: 0, present: 0 };
      // Only count if the employee is part of the faculty list
      if (facultyById[String(r.employeeId)]) {
        if (presentStatuses.has(r.status)) {
          deptMap[dept].present += 1;
        }
      }
    });

    const departmental = Object.keys(deptMap).map((k) => ({
      name: k,
      percent: deptMap[k].total ? Math.round((deptMap[k].present / deptMap[k].total) * 100) : 0,
    }));

    // clearance document breakdown by type/title
    const docMap: Record<string, { pending: number; total: number; label?: string }> = {};
    (clearances || []).forEach((d: any) => {
      const key = d.document_type || d.title || d.office_name || 'Other';
      if (!docMap[key]) docMap[key] = { pending: 0, total: 0, label: key };
      docMap[key].total += 1;
      if (d.status && d.status !== 'approved') docMap[key].pending += 1;
    });

    const docStats = Object.values(docMap).slice(0, 6);

    return { avgAttendance, totalHours, activePersonnel, departmental, clearanceCompliance, docStats };
  }, [attendance, faculties, clearances]);

  return (
    <RouteGuard requiredRoles={["admin"]} fallbackPath="/dashboard/faculty">
      <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Analytics & Reports</h1>
          <p className="text-slate-500 mt-1">Cross-module insights and system-wide analytics.</p>
        </div>
        <div className="flex gap-3">
           <Button variant="outline" className="border-slate-200">
             <Filter className="mr-2 h-4 w-4" /> This Month
           </Button>
           <Button className="bg-slate-900 hover:bg-slate-800 text-white">
             <Download className="mr-2 h-4 w-4" /> Export All PDF
           </Button>
        </div>
      </div>

      {/* High-level metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
               <div>
                  <p className="text-sm font-medium text-slate-500">Avg. Attendance Rate</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">{metrics.avgAttendance}%</p>
               </div>
               <div className="p-2 bg-emerald-50 rounded-lg"><TrendingUp className="h-5 w-5 text-emerald-500" /></div>
            </div>
            <div className="mt-4 flex items-center text-sm text-emerald-600 font-medium">
               <span>{metrics.avgAttendance >= 0 ? `Compared to last month N/A` : ''}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
               <div>
                  <p className="text-sm font-medium text-slate-500">Total Hours Logged</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">{metrics.totalHours}</p>
               </div>
               <div className="p-2 bg-red-50 rounded-lg"><Clock className="h-5 w-5 text-red-500" /></div>
            </div>
            <div className="mt-4 flex items-center text-sm text-red-600 font-medium">
               <span>Hours calculated from attendance logs</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
               <div>
                  <p className="text-sm font-medium text-slate-500">Clearance Compliance</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">{metrics.clearanceCompliance}%</p>
               </div>
               <div className="p-2 bg-amber-50 rounded-lg"><FileCheck2 className="h-5 w-5 text-amber-500" /></div>
            </div>
            <div className="mt-4 flex items-center text-sm text-amber-600 font-medium">
               <span>Action required for {Math.max(0, (Array.isArray(clearances) ? clearances.filter((c: any) => c.status !== 'approved').length : 0))} employees</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
               <div>
                  <p className="text-sm font-medium text-slate-500">Active Personnel</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">{metrics.activePersonnel}</p>
               </div>
               <div className="p-2 bg-red-50 rounded-lg"><Users className="h-5 w-5 text-red-500" /></div>
            </div>
            <div className="mt-4 flex items-center text-sm text-slate-500 font-medium">
               <span>{faculties.length} Faculty / {Math.max(0, metrics.activePersonnel - faculties.length)} Others</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Reports Grids */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="col-span-1 shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle>Departmental Attendance</CardTitle>
            <CardDescription>Monthly attendance rates by department.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {metrics.departmental.map((d: any) => (
             <div className="space-y-2" key={d.name}>
               <div className="flex justify-between text-sm"><span>{d.name}</span><span className="font-bold">{d.percent}%</span></div>
               <Progress value={d.percent} className="h-2" indicatorClassName={d.percent > 95 ? 'bg-emerald-500' : d.percent > 90 ? 'bg-amber-500' : 'bg-red-500'} />
             </div>
            ))}
          </CardContent>
        </Card>

        <Card className="col-span-1 shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle>Clearance Document Status</CardTitle>
            <CardDescription>Breakdown of pending administrative documents</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="space-y-4">
                {metrics.docStats.length === 0 && <div className="text-sm text-slate-500">No clearance documents available</div>}
                {metrics.docStats.map((d: any) => (
                  <div key={d.label} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div>
                      <p className="font-medium text-slate-900">{d.label}</p>
                      <p className="text-xs text-slate-500">Administrative document</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">{d.pending}/{d.total}</p>
                      <p className="text-xs text-rose-500 font-medium">Pending</p>
                    </div>
                  </div>
                ))}
             </div>
          </CardContent>
        </Card>
      </div>

    </div>
    </RouteGuard>
  );
}
