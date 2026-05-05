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

export function AttendanceSummary({ userId, date }: Props) {
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

        // If a specific user is requested and we only get that user's record, normalize counts to 1/0
        if (userId) {
          setPresent(p);
          setLate(l);
          setAbsent(a);
        } else {
          setPresent(p);
          setLate(l);
          setAbsent(a);
        }
      } catch (e) {
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

  const stats = [
    { label: 'Present', value: Math.round((present / total) * 100), color: 'bg-emerald-500', icon: UserCheck, count: present },
    { label: 'Late', value: Math.round((late / total) * 100), color: 'bg-amber-500', icon: Clock, count: late },
    { label: 'Absent/Leave', value: Math.round((absent / total) * 100), color: 'bg-rose-500', icon: UserX, count: absent },
  ];

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Today's Attendance Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-slate-500">Loading attendance...</div>
        ) : (
          <div className="space-y-4 mt-2">
            {stats.map((stat) => (
              <div key={stat.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <stat.icon className="h-4 w-4 text-slate-400" />
                    {stat.label}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{stat.count}</span>
                    <span className="text-slate-500 text-xs">({stat.value}%)</span>
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
