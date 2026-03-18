import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Users, UserCheck, Clock, UserX } from 'lucide-react';

export function AttendanceSummary() {
  const stats = [
    { label: 'Present', value: 85, color: 'bg-emerald-500', icon: UserCheck, count: 142 },
    { label: 'Late', value: 10, color: 'bg-amber-500', icon: Clock, count: 18 },
    { label: 'Absent/Leave', value: 5, color: 'bg-rose-500', icon: UserX, count: 8 },
  ];

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
           <Users className="h-4 w-4" />
           Today&apos;s Attendance Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
