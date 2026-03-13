'use client';

import { useState, useEffect } from 'react';
import { attendanceService } from '@/services/attendanceService';
import { Attendance } from '@/types/attendance';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Download, Loader2, Search, AlertTriangle, Filter } from 'lucide-react';
import { format } from 'date-fns';

export default function AttendancePage() {
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const loadData = async () => {
    setLoading(true);
    const data = await attendanceService.getAttendance(filterDate);
    setRecords(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [filterDate]);

  const filtered = records.filter(r =>
    r.employeeName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Attendance Log</h1>
          <p className="text-slate-500 mt-1">Monitor daily time-in/time-out records (RFID ready).</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="border-slate-200">
            <Filter className="mr-2 h-4 w-4 text-slate-500" /> Filter
          </Button>
        
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search className="h-5 w-5 text-slate-400" />
            <Input
              placeholder="Search by employee name..."
              className="max-w-sm border-0 focus-visible:ring-0 px-0"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Date:</span>
            <Input
              type="date"
              className="w-auto h-9"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Employee</TableHead>
              <TableHead>Time In</TableHead>
              <TableHead>Time Out</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-emerald-500" />
                  Loading attendance records...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-slate-500">
                  No records found for this date.
                </TableCell>
              </TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium text-slate-900">{r.employeeName}</div>
                  <div className="text-xs text-slate-500">ID: {r.employeeId}</div>
                  {r.anomalyDetected && (
                    <div className="flex items-center gap-1 text-[10px] text-amber-600 font-medium mt-1">
                      <AlertTriangle className="h-3 w-3" /> AI Alert: Flagged for review
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{r.timeIn || '--:--'}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{r.timeOut || '--:--'}</div>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${r.status === 'present' ? 'bg-emerald-100 text-emerald-800' :
                    r.status === 'late' ? 'bg-amber-100 text-amber-800' :
                      r.status === 'on_leave' ? 'bg-red-100 text-red-800' :
                        'bg-rose-100 text-rose-800'
                    }`}>
                    {r.status.replace('_', ' ')}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
