import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, Lightbulb, Bell, CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { toast } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

interface Alert {
  id: string;
  type: 'warning' | 'insight' | 'info' | 'success';
  title: string;
  message: string;
  recommendation?: string;
}

interface AIAlertsProps {
  alerts: Alert[];
}

export function AIAlerts(props: Readonly<AIAlertsProps>) {
  const { alerts } = props;
  const [localAlerts, setLocalAlerts] = useState<Alert[]>(alerts || []);

  useEffect(() => {
    setLocalAlerts(alerts || []);
  }, [alerts]);

  const handleApply = async (alert: Alert) => {
    setLocalAlerts((prev) => prev.filter((item) => item.id !== alert.id));

    try {
      await fetch('/api/ai/insights/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alert.id, action: 'apply' }),
      });
      toast({ title: 'Applied suggestion', description: alert.recommendation ?? 'Applied AI suggestion', type: 'success' });
    } catch (err) {
      setLocalAlerts((prev) => [alert, ...prev]);
      toast({ title: 'Failed to apply', description: String(err), type: 'error' });
    }
  };

  const handleDismiss = async (alert: Alert) => {
    setLocalAlerts((prev) => prev.filter((item) => item.id !== alert.id));

    try {
      await fetch('/api/ai/insights/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alert.id, action: 'dismiss' }),
      });
      toast({ title: 'Insight dismissed', type: 'info' });
    } catch (err) {
      setLocalAlerts((prev) => [alert, ...prev]);
      toast({ title: 'Failed to dismiss', description: String(err), type: 'error' });
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertTriangle className="h-5 w-5 text-rose-500" />;
      case 'insight': return <Lightbulb className="h-5 w-5 text-amber-500" />;
      case 'success': return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      default: return <Bell className="h-5 w-5 text-red-500" />;
    }
  };

  const getBgClass = (type: string) => {
    switch (type) {
      case 'warning': return 'bg-rose-50 border-rose-100';
      case 'insight': return 'bg-amber-50 border-amber-100';
      case 'success': return 'bg-emerald-50 border-emerald-100';
      default: return 'bg-red-50 border-red-100';
    }
  };

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <div className="flex items-center justify-between bg-linear-to-r from-primary via-sky-600 to-cyan-600 px-6 py-4">
        <div>
           <CardTitle className="flex items-center gap-2 text-white">
             <Sparkles className="h-5 w-5 text-sky-100" />
             AI Assistant Insights
           </CardTitle>
           <CardDescription className="mt-1 text-sky-100/90">Smart recommendations and anomaly detection</CardDescription>
        </div>
        <Badge variant="outline" className="border-white/20 bg-white/15 text-white">
          Powered by AI
        </Badge>
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
            {localAlerts.map((alert) => (
              <div key={alert.id} className={cn('border-l-4 p-5 transition-colors hover:bg-slate-50', getBgClass(alert.type).replace('bg-', 'border-l-').split(' ')[0])}>
                <div className="flex gap-4">
                  <div className="mt-1 shrink-0">
                    {getIcon(alert.type)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <h4 className="text-sm font-semibold text-slate-900 leading-none">{alert.title}</h4>
                    <p className="text-sm text-slate-600">{alert.message}</p>
                    
                    {alert.recommendation && (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                          <span className="uppercase text-[10px] tracking-wider font-bold text-slate-400">Actionable Suggestion</span>
                          {alert.recommendation}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleApply(alert)}>Apply Fix</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500" onClick={() => handleDismiss(alert)}>Dismiss</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
