import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Rocket, Waves, TriangleAlert, Zap, ArrowUpRight, Clock } from 'lucide-react';
import { Stock } from '../types';

interface MarketRadarProps {
  stocks: Stock[];
}

export const MarketRadar: React.FC<MarketRadarProps> = ({ stocks }) => {
  // Filter stocks with active intraday alerts
  const activeAlerts = stocks
    .filter(s => s.alerts && s.alerts.length > 0)
    .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'rocket': return <Rocket className="w-4 h-4 text-red-500 animate-bounce" />;
      case 'dive': return <Waves className="w-4 h-4 text-green-500 animate-pulse" />;
      case 'broken': return <TriangleAlert className="w-4 h-4 text-orange-500 animate-pulse" />;
      default: return <Zap className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getAlertText = (type: string) => {
    switch (type) {
      case 'rocket': return '急速拉升 (Rocket)';
      case 'dive': return '高位跳水 (Diving)';
      case 'broken': return '涨停炸板 (Broken Board)';
      default: return '异动 (Activity)';
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-500" />
          盘中异动雷达 (Intraday Radar)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2">
        {activeAlerts.length === 0 ? (
          <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground text-xs space-y-2">
            <div className="w-8 h-8 rounded-full border-2 border-dashed border-muted animate-spin-slow" />
            <p>等待盘中信号捕捉...</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[250px] overflow-auto pr-1">
            {activeAlerts.map(stock => (
              <div key={stock.id} className="p-2 border rounded-md bg-accent/10 hover:bg-accent/20 transition-colors">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{stock.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{stock.code}</span>
                  </div>
                  <span className={cn("text-xs font-bold font-mono", (stock.changePercent || 0) >= 0 ? "text-red-500" : "text-green-500")}>
                    {stock.changePercent > 0 ? '+' : ''}{stock.changePercent}%
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {stock.alerts?.map(alert => (
                    <Badge key={alert} variant="secondary" className="flex items-center gap-1 text-[10px] px-1 py-0 border-0 bg-background shadow-sm">
                      {getAlertIcon(alert)}
                      {getAlertText(alert)}
                    </Badge>
                  ))}
                </div>
                {stock.aiPrediction?.strategy && (
                    <div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground italic">
                        <ArrowUpRight className="w-2 h-2" />
                        {stock.aiPrediction.strategy}
                    </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 pt-3 border-t flex items-center justify-between text-[10px] text-muted-foreground px-2">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> 自动刷新: 3s</span>
            <span>核心池监测中</span>
        </div>
      </CardContent>
    </Card>
  );
};

// Internal CN helper since it's used
function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(' ');
}