import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, Lightbulb, Bell, CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';

interface Alert {
  id: string;
  type: 'warning' | 'insight' | 'info' | 'success';
  title: string;
  message: string;
  recommendation?: string;
  progress?: {
    completion: number;
    approved: number;
    total: number;
  };
}

interface AIAlertsProps {
  alerts: Alert[];
}

// Single source of truth for alert styling — icon, text, background, and
// left-border colors are derived from the same semantic token per type,
// so nothing drifts out of sync with anything else.
const ALERT_STYLES: Record<
  Alert['type'],
  { icon: typeof AlertTriangle; iconClass: string; bg: string; border: string }
> = {
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-l-amber-400',
  },
  insight: {
    icon: Lightbulb,
    iconClass: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-l-blue-400',
  },
  success: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-l-emerald-400',
  },
  info: {
    icon: Bell,
    iconClass: 'text-slate-500',
    bg: 'bg-slate-50',
    border: 'border-l-slate-300',
  },
};

export function AIAlerts(props: Readonly<AIAlertsProps>) {
  const { alerts } = props;
  const [localAlerts, setLocalAlerts] = useState<Alert[]>(alerts || []);

  useEffect(() => {
    setLocalAlerts(alerts || []);
  }, [alerts]);

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      {/* Header now matches the same light surface as every other card —
          accent comes from the icon chip, not a full-bleed dark block. */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-50">
            <Sparkles className="h-4.5 w-4.5 text-blue-600" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold text-slate-900">Insights</CardTitle>
            <CardDescription className="mt-0.5 text-xs text-slate-500">
              Key updates from your recent activity.
            </CardDescription>
          </div>
        </div>
      </div>
      <CardContent className="p-0">
        {localAlerts.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Lightbulb}
              title="No insights available right now"
              description="AI alerts will appear here when the system detects attendance, schedule, or clearance anomalies."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100 bg-white">
            {localAlerts.map((alert) => {
              const style = ALERT_STYLES[alert.type];
              const Icon = style.icon;

              return (
                <div
                  key={alert.id}
                  className={cn('border-l-4 p-5 transition-colors hover:bg-slate-50', style.border)}
                >
                  <div className="flex gap-4">
                    <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', style.bg)}>
                      <Icon className={cn('h-4 w-4', style.iconClass)} />
                    </div>
                    <div className="flex-1 space-y-2">
                      <h4 className="text-sm font-semibold leading-none text-slate-900">{alert.title}</h4>
                      <p className="text-sm text-slate-600">{alert.message}</p>

                      {alert.progress && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Completion</p>
                            <span className="text-lg font-semibold text-slate-900">{alert.progress.completion}%</span>
                          </div>
                          <p className="text-sm text-slate-600">{alert.progress.approved} of {alert.progress.total} approved</p>
                        </div>
                      )}

                      {alert.recommendation && (
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Next step</p>
                          <p className="mt-1 text-sm text-slate-700">{alert.recommendation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}