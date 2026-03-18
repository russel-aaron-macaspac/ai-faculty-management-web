import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
  href?: string;
}

export function StatCard({ title, value, description, icon: Icon, trend, trendValue, className, href }: StatCardProps) {
  const cardContent = (
    <Card className={cn('shadow-sm hover:shadow-md transition-shadow', href && 'cursor-pointer', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
        <div className="h-8 w-8 rounded-full bg-red-50 flex items-center justify-center">
          <Icon className="h-4 w-4 text-red-500" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
        {trend && trendValue && (
          <div className="mt-2 text-xs flex items-center">
            <span
              className={cn(
                'font-medium',
                trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-rose-500' : 'text-slate-500'
              )}
            >
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
            </span>
            <span className="text-slate-500 ml-1">vs last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (!href) {
    return cardContent;
  }

  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2">
      {cardContent}
    </Link>
  );
}
