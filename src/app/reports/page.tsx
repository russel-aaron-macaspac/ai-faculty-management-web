'use client';

import { RouteGuard } from '@/components/RouteGuard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, TrendingUp, Users, Clock, FileCheck2, Filter } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function ReportsPage() {
  return (
    <RouteGuard requiredRoles={['admin']} fallbackPath="/dashboard/faculty">
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
                  <p className="text-3xl font-bold text-slate-900 mt-2">94.2%</p>
               </div>
               <div className="p-2 bg-emerald-50 rounded-lg"><TrendingUp className="h-5 w-5 text-emerald-500" /></div>
            </div>
            <div className="mt-4 flex items-center text-sm text-emerald-600 font-medium">
               <span>+2.1% from last month</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
               <div>
                  <p className="text-sm font-medium text-slate-500">Total Hours Logged</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">1,204</p>
               </div>
               <div className="p-2 bg-red-50 rounded-lg"><Clock className="h-5 w-5 text-red-500" /></div>
            </div>
            <div className="mt-4 flex items-center text-sm text-red-600 font-medium">
               <span>140h Faculty / 1064h Staff</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
               <div>
                  <p className="text-sm font-medium text-slate-500">Clearance Compliance</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">82%</p>
               </div>
               <div className="p-2 bg-amber-50 rounded-lg"><FileCheck2 className="h-5 w-5 text-amber-500" /></div>
            </div>
            <div className="mt-4 flex items-center text-sm text-amber-600 font-medium">
               <span>Action required for 18 employees</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
               <div>
                  <p className="text-sm font-medium text-slate-500">Active Personnel</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">172</p>
               </div>
               <div className="p-2 bg-red-50 rounded-lg"><Users className="h-5 w-5 text-red-500" /></div>
            </div>
            <div className="mt-4 flex items-center text-sm text-slate-500 font-medium">
               <span>124 Faculty / 48 Staff</span>
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
             <div className="space-y-2">
               <div className="flex justify-between text-sm"><span>Computer Science</span><span className="font-bold">98%</span></div>
               <Progress value={98} className="h-2" indicatorClassName="bg-red-500" />
             </div>
             <div className="space-y-2">
               <div className="flex justify-between text-sm"><span>Mathematics</span><span className="font-bold">95%</span></div>
               <Progress value={95} className="h-2" indicatorClassName="bg-red-500" />
             </div>
             <div className="space-y-2">
               <div className="flex justify-between text-sm"><span>Physics</span><span className="font-bold">91%</span></div>
               <Progress value={91} className="h-2" indicatorClassName="bg-amber-500" />
             </div>
             <div className="space-y-2">
               <div className="flex justify-between text-sm"><span>Human Resources</span><span className="font-bold">99%</span></div>
               <Progress value={99} className="h-2" indicatorClassName="bg-emerald-500" />
             </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle>Clearance Document Status</CardTitle>
            <CardDescription>Breakdown of pending administrative documents</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                   <div>
                     <p className="font-medium text-slate-900">Medical Certificates</p>
                     <p className="text-xs text-slate-500">Annual requirement</p>
                   </div>
                   <div className="text-right">
                     <p className="text-sm font-bold text-slate-900">45/172</p>
                     <p className="text-xs text-rose-500 font-medium">Pending</p>
                   </div>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                   <div>
                     <p className="font-medium text-slate-900">Safety Training</p>
                     <p className="text-xs text-slate-500">Bi-annual for Labs</p>
                   </div>
                   <div className="text-right">
                     <p className="text-sm font-bold text-slate-900">12/35</p>
                     <p className="text-xs text-rose-500 font-medium">Pending</p>
                   </div>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                   <div>
                     <p className="font-medium text-slate-900">Contract Renewals</p>
                     <p className="text-xs text-slate-500">Adjunct Faculty</p>
                   </div>
                   <div className="text-right">
                     <p className="text-sm font-bold text-slate-900">8/24</p>
                     <p className="text-xs text-amber-500 font-medium">In Review</p>
                   </div>
                </div>
             </div>
          </CardContent>
        </Card>
      </div>

    </div>
    </RouteGuard>
  );
}
