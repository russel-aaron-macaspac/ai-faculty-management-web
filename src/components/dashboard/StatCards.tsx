import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

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

export function StatCard(props: Readonly<StatCardProps>) {
  const { title, value, description, icon: Icon, trend, trendValue, className, href } = props;
  let trendVariant: 'success' | 'destructive' | 'secondary' = 'secondary';
  let trendArrow = '→';

  if (trend === 'up') {
    trendVariant = 'success';
    trendArrow = '↑';
  } else if (trend === 'down') {
    trendVariant = 'destructive';
    trendArrow = '↓';
  }

  const cardContent = (
    <Card className={cn('group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg', href && 'cursor-pointer', className)}>
      <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-primary via-sky-500 to-cyan-500" />
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        {trend && trendValue && (
          <div className="mt-3 flex items-center gap-2">
            <Badge variant={trendVariant} className="px-2 py-0.5">
              {trendArrow} {trendValue}
            </Badge>
            <span className="text-xs text-slate-500">vs last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (!href) {
    return cardContent;
  }

  return (
    <Link href={href} className="block rounded-3xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15">
      {cardContent}
    </Link>
  );
}
