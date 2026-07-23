import React from 'react';
import { LineChart, Line, YAxis } from 'recharts';

// V59.6 FIX: Extract inline array/object props to stable module-level constants.
// Recharts 3.x triggers internal setState loops when props change reference every render.
const DOMAIN_AUTO: [string, string] = ['dataMin', 'dataMax'];
const MARGIN_SPARK = { top: 2, right: 2, bottom: 2, left: 2 };

interface SparklineProps {
  data: { day: string; close: number }[];
  width?: number;
  height?: number;
}

// V65.1 PERF: React.memo with custom comparator — history data is daily and rarely changes intraday.
// Only re-render when data length or last close actually changes, preventing recharts redraw on every refresh cycle.
export const Sparkline: React.FC<SparklineProps> = React.memo(({ data, width = 100, height = 40 }) => {
  if (width <= 0 || height <= 0) return null;

  if (!data || data.length < 2) {
      return <div style={{ width, height }} className="bg-muted/10 rounded flex items-center justify-center text-[10px] text-muted-foreground">-</div>;
  }

  // Filter out invalid data points
  const validData = data.filter(d => typeof d.close === 'number' && !isNaN(d.close));
  if (validData.length < 2) return null;

  const start = validData[0].close;
  const end = validData[validData.length - 1].close;
  const isUp = end >= start;
  const color = isUp ? '#ef4444' : '#22c55e'; // Red Up, Green Down

  return (
    <div style={{ width, height }} className="overflow-visible">
      <LineChart data={validData} width={width} height={height} margin={MARGIN_SPARK}>
        <YAxis domain={DOMAIN_AUTO} hide />
        <Line 
          type="monotone" 
          dataKey="close" 
          stroke={color} 
          strokeWidth={1.5} 
          dot={false} 
          isAnimationActive={false}
          connectNulls
        />
      </LineChart>
    </div>
  );
}, (prev, next) => {
  // Custom comparator: skip re-render if history data hasn't meaningfully changed
  if (prev.width !== next.width || prev.height !== next.height) return false;
  const pData = prev.data;
  const nData = next.data;
  if (!pData && !nData) return true;
  if (!pData || !nData) return false;
  if (pData.length !== nData.length) return false;
  if (pData.length === 0) return true;
  // Check first and last close — if both match, daily history hasn't changed
  return pData[0].close === nData[0].close && pData[pData.length - 1].close === nData[nData.length - 1].close;
});