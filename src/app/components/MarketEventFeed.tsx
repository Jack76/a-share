import React from 'react';
import { Bell, Info, TriangleAlert, CircleX, CircleCheck, Clock } from 'lucide-react';
import { cn } from './ui/utils';
import { Loader } from 'lucide-react';
import { Zap, Target } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { MarketEvent } from '../types';

interface MarketEventFeedProps {
  events: MarketEvent[];
}

export const MarketEventFeed: React.FC<MarketEventFeedProps> = ({ events }) => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'Alert': return <TriangleAlert className="w-3 h-3 text-red-500" />;
      case 'Signal': return <Zap className="w-3 h-3 text-yellow-500" />;
      case 'Theme': return <Target className="w-3 h-3 text-blue-500" />;
      default: return <Info className="w-3 h-3 text-slate-400" />;
    }
  };

  if (!events || events.length === 0) {
    return (
      <div className="p-12 text-center flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Loader className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-tighter">等待信号捕捉中...</p>
      </div>
    );
  }

  return (
    <Card className="h-full flex flex-col border-none shadow-sm bg-card overflow-hidden">
      <CardHeader className="py-5 px-6 border-b border-border/50 bg-muted/30">
        <CardTitle className="text-sm font-black flex items-center gap-2 uppercase tracking-widest">
          <div className="p-1.5 bg-primary text-primary-foreground rounded-md">
            <Bell className="w-3.5 h-3.5" />
          </div>
          实战异动流 (Market Pulse)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-y-auto max-h-[500px] scrollbar-hide">
        <div className="divide-y divide-border/30">
          {events.map((event) => (
            <div key={event.id} className="p-4 hover:bg-muted/30 transition-all duration-200 flex gap-4 items-start group">
              <div className="mt-1 transition-transform group-hover:scale-110">{getIcon(event.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  {event.stockName ? (
                      <span className="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/5 rounded-full border border-primary/10 tracking-tighter uppercase">
                          {event.stockName}
                      </span>
                  ) : (
                      <div className="w-1 h-1 rounded-full bg-border" />
                  )}
                  <span className="text-[10px] font-bold font-mono text-muted-foreground/60 flex items-center gap-1.5 uppercase tracking-tighter">
                      <Clock className="w-3 h-3" /> {event.time}
                  </span>
                </div>
                <p className={cn("text-xs leading-relaxed font-medium tracking-tight", 
                  event.type === 'Danger' ? 'text-red-700 dark:text-red-400' : 
                  event.type === 'Success' ? 'text-green-700 dark:text-green-400' : 'text-slate-600 dark:text-slate-300'
                )}>
                  {event.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <div className="p-3 bg-muted/10 border-t border-border/50 text-center">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40 italic">Real-time Analysis Active</span>
      </div>
    </Card>
  );
};