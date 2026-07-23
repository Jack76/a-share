import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { PhaseRecord, MarketPhase } from '../types';
import { CalendarClock, ArrowRight } from 'lucide-react';

interface CycleTimelineProps {
  history: PhaseRecord[];
  currentPhase: MarketPhase;
  currentTemp: number;
}

export const CycleTimeline: React.FC<CycleTimelineProps> = ({ history, currentPhase, currentTemp }) => {
  
  const getPhaseColor = (p: MarketPhase) => {
    switch (p) {
      case 'Climax': return 'bg-red-500 text-white border-red-600';
      case 'Startup': return 'bg-red-300 text-red-900 border-red-400';
      case 'Ebb': return 'bg-green-600 text-white border-green-700';
      default: return 'bg-slate-200 text-slate-700 border-slate-300';
    }
  };

  const getPhaseLabel = (p: MarketPhase) => {
    switch (p) {
      case 'Climax': return '高潮 (Climax)';
      case 'Startup': return '启动 (Startup)';
      case 'Ebb': return '退潮 (Ebb)';
      default: return '混沌 (Chaos)';
    }
  };

  // Combine history + today
  const todayStr = new Date().toISOString().split('T')[0];
  const fullTimeline = [
      ...history,
      { date: 'Today', phase: currentPhase, temperature: currentTemp, isToday: true }
  ];

  return (
    <Card className="border-t-4 border-t-primary">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          情绪周期演变 (Cycle Evolution)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {fullTimeline.map((record, idx) => (
                <div key={idx} className="flex items-center flex-shrink-0">
                    <div className={`
                        flex flex-col items-center justify-center p-2 rounded-lg border min-w-[100px] space-y-1 relative
                        ${record.isToday ? 'bg-accent/10 shadow-md ring-2 ring-primary/20' : 'bg-background/50 opacity-70'}
                    `}>
                        <div className="text-[10px] text-muted-foreground font-mono">
                            {record.isToday ? '今日 (Today)' : record.date.slice(5)}
                        </div>
                        <Badge className={`${getPhaseColor(record.phase)} hover:${getPhaseColor(record.phase)} h-6 text-[10px]`}>
                            {getPhaseLabel(record.phase)}
                        </Badge>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1 overflow-hidden">
                             <div 
                                className={`h-full ${record.temperature > 80 ? 'bg-red-500' : record.temperature < 20 ? 'bg-blue-500' : 'bg-slate-400'}`} 
                                style={{ width: `${record.temperature}%` }}
                             />
                        </div>
                    </div>
                    {idx < fullTimeline.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-muted-foreground/30 mx-1" />
                    )}
                </div>
            ))}
            
            {/* Future Prediction Placeholder */}
            <ArrowRight className="w-4 h-4 text-muted-foreground/30 mx-1" />
            <div className="flex flex-col items-center justify-center p-2 rounded-lg border border-dashed border-slate-300 min-w-[100px] h-[86px] text-muted-foreground bg-slate-50/50">
                <span className="text-xs">Next?</span>
            </div>
        </div>
      </CardContent>
    </Card>
  );
};
