import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { useTrading } from '../context/Store';
import { MessageSquare, Bell, Clock } from 'lucide-react';

export const SentimentStream: React.FC = () => {
  const { marketEvents } = useTrading();

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'Success': return 'bg-red-50 text-red-700 border-red-200';
      case 'Warning': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Danger': return 'bg-green-50 text-green-700 border-green-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 border-b">
        <CardTitle className="text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                情绪实战流 (Sentiment Stream)
            </div>
            <Badge variant="secondary" className="text-[10px]">{marketEvents.length} 条记录</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-auto max-h-[400px]">
        {marketEvents.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <Bell className="w-8 h-8 opacity-20" />
            等待盘中重大事件触发...
          </div>
        ) : (
          <div className="divide-y">
            {marketEvents.map((event) => (
              <div key={event.id} className="p-3 hover:bg-accent/5 transition-colors">
                <div className="flex justify-between items-start mb-1">
                  <Badge variant="outline" className={`text-[10px] px-1 py-0 h-4 ${getTypeStyles(event.type)}`}>
                    {event.type === 'Success' ? '进攻' : event.type === 'Danger' ? '撤退' : event.type === 'Warning' ? '警示' : '信息'}
                  </Badge>
                  <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {event.time}
                  </span>
                </div>
                <p className="text-xs font-medium leading-relaxed">
                  {event.message}
                </p>
                {event.stockName && (
                    <div className="mt-1 flex items-center gap-1">
                         <div className="w-1 h-1 rounded-full bg-primary" />
                         <span className="text-[9px] text-muted-foreground">关联标的: {event.stockName}</span>
                    </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
