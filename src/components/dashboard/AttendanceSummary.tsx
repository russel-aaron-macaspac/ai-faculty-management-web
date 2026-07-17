import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Users, UserCheck, Clock, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { attendanceService } from '@/services/attendanceService';
import { format } from 'date-fns';

interface Props {
  userId?: string;
  date?: string; // yyyy-MM-dd
}

export function AttendanceSummary({ userId, date }: Readonly<Props>) {
  const [present, setPresent] = useState(0);
  const [late, setLate] = useState(0);
  const [absent, setAbsent] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const targetDate = date ?? format(new Date(), 'yyyy-MM-dd');
        const records = await attendanceService.getAttendance(targetDate, userId);

        let p = 0;
        let l = 0;
        let a = 0;

        for (const r of records) {
          if (r.status === 'present') p += 1;
          else if (r.status === 'late') l += 1;
          else a += 1;
        }

        setPresent(p);
        setLate(l);
        setAbsent(a);
      } catch (error) {
        console.warn('[AttendanceSummary] failed to load attendance', error);
        setPresent(0);
        setLate(0);
        setAbsent(0);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [userId, date]);

  const total = present + late + absent || 1; // avoid divide by zero

  // Semantic status colors — same emerald/amber/rose tokens used in
  // AIAlerts, so "good/attention/bad" reads consistently across the app
  // instead of borrowing brand colors (navy/gold) that have no inherent
  // status meaning.
  const stats = [
    { label: 'Present', value: Math.round((present / total) * 100), color: 'bg-emerald-500', icon: UserCheck, count: present },
    { label: 'Late', value: Math.round((late / total) * 100), color: 'bg-amber-500', icon: Clock, count: late },
    { label: 'Absent/Leave', value: Math.round((absent / total) * 100), color: 'bg-rose-500', icon: UserX, count: absent },
  ];

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <Users className="h-4 w-4" />
          Today's Attendance Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-slate-500">Loading attendance...</div>
        ) : (
          <div className="mt-2 space-y-4">
            {stats.map((stat) => (
              <div key={stat.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 font-medium text-slate-700">
                    <stat.icon className="h-4 w-4 text-slate-400" />
                    {stat.label}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{stat.count}</span>
                    <span className="text-xs text-slate-500">({stat.value}%)</span>
                  </div>
                </div>
                <Progress value={stat.value} className="h-2" indicatorClassName={stat.color} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}