import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, Lightbulb, Bell, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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

export function AIAlerts({ alerts }: AIAlertsProps) {
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
    <Card className="shadow-sm border-red-100 overflow-hidden">
      <div className="bg-gradient-to-r from-red-600 to-red-600 px-6 py-4 flex items-center justify-between">
        <div>
           <CardTitle className="text-white flex items-center gap-2">
             <Lightbulb className="h-5 w-5 text-amber-300" />
             AI Assistant Insights
           </CardTitle>
           <CardDescription className="text-red-100 mt-1">Smart recommendations and anomaly detection</CardDescription>
        </div>
        <div className="bg-white/20 px-3 py-1 rounded-full text-xs font-semibold text-white backdrop-blur-sm border border-white/30">
          Powered by AI
        </div>
      </div>
      <CardContent className="p-0">
        {alerts.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">No insights available right now.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {alerts.map((alert) => (
              <div key={alert.id} className={cn('p-4 transition-colors hover:bg-slate-50 border-l-4', getBgClass(alert.type).replace('bg-', 'border-l-').split(' ')[0])}>
                <div className="flex gap-4">
                  <div className="mt-1 flex-shrink-0">
                    {getIcon(alert.type)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <h4 className="text-sm font-semibold text-slate-900 leading-none">{alert.title}</h4>
                    <p className="text-sm text-slate-600">{alert.message}</p>
                    
                    {alert.recommendation && (
                      <div className="mt-3 bg-white p-3 rounded-md border border-slate-200 shadow-sm">
                        <p className="text-xs font-medium text-red-700 flex flex-col gap-1">
                          <span className="uppercase text-[10px] tracking-wider font-bold text-slate-400">Actionable Suggestion</span>
                          {alert.recommendation}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs">Apply Fix</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500">Dismiss</Button>
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
