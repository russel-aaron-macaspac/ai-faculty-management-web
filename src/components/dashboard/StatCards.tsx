import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

type Accent = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
  href?: string;
  /**
   * Semantic meaning of this card's value, e.g. 'success' for "Cleared",
   * 'warning' for something needing attention, 'neutral' for a plain
   * count with no inherent status (default). Drives the icon chip and
   * left-border color — same tokens used across AIAlerts and
   * AttendanceSummary, so a card's color always means the same thing
   * everywhere in the app.
   */
  accent?: Accent;
}

const ACCENT_STYLES: Record<Accent, { chipBg: string; chipText: string; chipRing: string; border: string }> = {
  neutral: {
    chipBg: 'bg-slate-100',
    chipText: 'text-slate-600',
    chipRing: 'ring-slate-200',
    border: 'border-l-slate-200',
  },
  success: {
    chipBg: 'bg-emerald-50',
    chipText: 'text-emerald-600',
    chipRing: 'ring-emerald-100',
    border: 'border-l-emerald-400',
  },
  warning: {
    chipBg: 'bg-amber-50',
    chipText: 'text-amber-600',
    chipRing: 'ring-amber-100',
    border: 'border-l-amber-400',
  },
  danger: {
    chipBg: 'bg-rose-50',
    chipText: 'text-rose-600',
    chipRing: 'ring-rose-100',
    border: 'border-l-rose-400',
  },
  info: {
    chipBg: 'bg-blue-50',
    chipText: 'text-blue-600',
    chipRing: 'ring-blue-100',
    border: 'border-l-blue-400',
  },
};

export function StatCard(props: Readonly<StatCardProps>) {
  const { title, value, description, icon: Icon, trend, trendValue, className, href, accent = 'neutral' } = props;
  let trendVariant: 'success' | 'destructive' | 'secondary' = 'secondary';
  let trendArrow = '→';

  if (trend === 'up') {
    trendVariant = 'success';
    trendArrow = '↑';
  } else if (trend === 'down') {
    trendVariant = 'destructive';
    trendArrow = '↓';
  }

  const style = ACCENT_STYLES[accent];

  const cardContent = (
    <Card
      className={cn(
        // h-full + flex column so every card fills its grid cell equally
        // and the value/description/trend block anchors to a consistent
        // position regardless of how much text a given card has.
        'group relative flex h-full flex-col overflow-hidden border-l-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        style.border,
        href && 'cursor-pointer',
        className,
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ring-1', style.chipBg, style.chipText, style.chipRing)}>
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between">
        <div>
          <div className="text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
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
    <Link href={href} className="block h-full rounded-[12px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300/40">
      {cardContent}
    </Link>
  );
}