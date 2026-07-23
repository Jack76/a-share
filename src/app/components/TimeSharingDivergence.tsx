import React, { useMemo, useRef, useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ComposedChart, Line, Bar } from 'recharts';
import { Stock } from '../types';
import { cn } from './ui/utils';
import { TriangleAlert, TrendingUp, TrendingDown, Zap, Activity } from 'lucide-react';
import { calculateAlphaDivergence } from '../utils/indicators';

// V67 FIX: ResizeObserver-based container sizing (replaces ResponsiveContainer)
// Eliminates 0x0 dimension warnings inside Dialogs where ResponsiveContainer fails.
function useContainerSize(ref: React.RefObject<HTMLDivElement | null>): { width: number; height: number } {
    const [size, setSize] = useState({ width: 0, height: 0 });
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
        }
        const ro = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                const { width, height } = entry.contentRect;
                const w = Math.floor(width);
                const h = Math.floor(height);
                if (w > 0 && h > 0) {
                    setSize(prev => (prev.width === w && prev.height === h) ? prev : { width: w, height: h });
                }
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return size;
}

// V59.6 FIX: Stable prop references for recharts 3.x
const TSD_DOMAIN_SENTIMENT: [number, number] = [0, 100];
const TSD_XAXIS_TICK = { fontSize: 9, fontWeight: 700 };
const TSD_TOOLTIP_CONTENT_STYLE = { borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: '900' };
const TSD_REF_LABEL = { position: 'top' as const, value: '背离预警', fill: '#ef4444', fontSize: 10, fontWeight: 900 };
const TSD_TOOLTIP_FORMATTER = (value: any, name: any) => {
    if (name === 'realVolume') return [value, '成交量'];
    if (name === 'sentiment') return [value, '情绪指数'];
    if (name === 'price') return [`¥${value}`, '价格'];
    return [value, name];
};
const TSD_MARGIN = { top: 5, right: 10, left: 10, bottom: 5 };

interface Props {
  stock: Stock;
  height?: number;
}

export const TimeSharingDivergence: React.FC<Props> = ({ stock, height = 300 }) => {
  // V67 FIX: Use ResizeObserver instead of ResponsiveContainer + isReady delay
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const { width: chartW, height: chartH } = useContainerSize(chartContainerRef);

  // Real Calculation: Trend Divergence (Price vs Market Sentiment Alpha)
  const history = stock.history || [];
  
  // Use shared engine for unified results
  const { alpha, sentiments, priceChg } = useMemo(() => calculateAlphaDivergence(history, stock.isLimitUp), [history, stock.isLimitUp]);

  const data = useMemo(() => {
    if (!history || history.length < 5) return [];

    // Visual aspect: Expand to 120 days (Half-Year) for full Trend Structure
    const recentHistory = history.slice(-120);
    const maxVol = Math.max(...recentHistory.map(h => h.volume || 1));
    
    const chartData = recentHistory.map((h, i) => {
        const price = h.close;
        const volume = h.volume || 0;
        const normalizedVol = maxVol > 0 ? (volume / maxVol) * 30 : 0;
        
        const prev = recentHistory[i-1] || h;
        const velocity = (h.close - prev.close) / (prev.close || 1);
        const baseVol = recentHistory[0].volume || 1;
        const volIntensity = h.volume ? h.volume / baseVol : 1;
        
        const sentiment = Math.min(95, Math.max(5, 50 + (velocity * 500) + (volIntensity * 2)));

        return {
            time: h.day.substring(5),
            price,
            sentiment: Math.floor(sentiment),
            volume: normalizedVol,
            realVolume: volume
        };
    });

    return chartData;
  }, [history]);

  // V67.2: Main signal awareness — prevent trend assessment from contradicting predatorEngine
  // MUST be defined before stats useMemo which references these values
  const mainSignalType = stock.aiPrediction?.signalType;
  const mainSummary = stock.aiPrediction?.summary || '';
  const isSellSignal = mainSignalType === 'SELL';
  const isTrapRelated = ['出货', '出逃', '离场', '诱多', '陷阱', '埋人', '核按钮', '拉高出货', '空涨', '止损', '避险', '天量', 'TRAP', 'ESCAPE', 'EVAC', 'NUKE', 'HOLLOW', 'CUT'].some(k => mainSummary.includes(k));
  const mainSignalOverride = isSellSignal || isTrapRelated;

  // Alpha Quantitative Metrics (Shared with engine)
  const stats = useMemo(() => {
    const latest = history.slice(-10);
    const avgVol = latest.reduce((acc, d) => acc + (d.volume || 0), 0) / latest.length;
    let prob = 0;
    if (alpha < 0) {
        prob = Math.abs(alpha) * 3 + (avgVol * 0.0000005);
    } else {
        prob = Math.max(5, 20 - alpha * 2);
    }
    
    // V67.3: Fake Breakout Probability Arbitration (假突破概率仲裁)
    // 与 V67.2 趋势文案仲裁同源：当 predatorEngine 主信号已判定 SELL/出货/陷阱时，
    // 纯 Alpha 计算的低概率(如 5%)与主信号严重矛盾。
    // 仲裁逻辑：主信号 > Alpha 单一指标，设置概率下限。
    let isArbitrated = false;
    if (mainSignalOverride) {
        // 区分严重程度：陷阱关键词 = 更高下限
        const trapFloor = isTrapRelated ? 75 : 60;
        if (prob < trapFloor) {
            prob = trapFloor + Math.min(15, Math.abs(alpha) * 0.5); // 在下限基础上微调
            isArbitrated = true;
        }
    }
    
    return {
        divergence: alpha,
        fakeBreakProb: Math.min(98, Math.max(2, Math.round(prob))),
        priceChg: priceChg || 0,
        isArbitrated
    };
  }, [alpha, history, priceChg, mainSignalOverride, isTrapRelated]);

  // V59.6 FIX: Memoize priceDomain to prevent recharts 3.x infinite loop
  const priceDomain = useMemo(() => {
    if (data.length === 0) return [0, 1] as [number, number];
    return [Math.min(...data.map(d => d.price)) * 0.98, Math.max(...data.map(d => d.price)) * 1.02] as [number, number];
  }, [data]);

  // Unique gradient ID to avoid collisions if multiple instances
  const gradientId = useRef(`tsd-price-${Math.random().toString(36).substr(2, 6)}`).current;

  if (data.length === 0) {
    return (
        <div className="h-[300px] flex flex-col items-center justify-center bg-slate-50 rounded-3xl border border-dashed border-slate-200 p-8 text-center">
            <Activity className="w-8 h-8 text-slate-300 mb-3 animate-pulse" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
                正在同步历史量价数据...<br/>同步完成后将自动计算趋势背离指数
            </span>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">Quantum Trend Analyzer</span>
            <span className="text-xs font-black text-slate-900 italic">日线趋势背离监测 (Trend Momentum)</span>
        </div>
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-[10px] font-black text-slate-400 uppercase">价格线</span>
            </div>
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-[10px] font-black text-slate-400 uppercase">情绪指数</span>
            </div>
        </div>
      </div>

      <div className="glass p-4 rounded-3xl border border-slate-200 shadow-inner bg-white/50 relative overflow-hidden h-[300px]" style={{ width: '100%', minHeight: 300 }}>
        {/* Divergence Highlight Overlay */}
        <div className="absolute top-[20%] right-[15%] w-24 h-24 bg-red-500/5 blur-2xl rounded-full animate-pulse pointer-events-none" />
        
        {/* V67 FIX: Ref container always rendered so ResizeObserver can measure */}
        <div ref={chartContainerRef} className="w-full h-full">
          {chartW > 0 && chartH > 0 && data.length > 0 && (
              <ComposedChart width={chartW} height={chartH} data={data} margin={TSD_MARGIN}>
                {/* V67 FIX: defs MUST be first child so gradients are available before Area references them */}
                <defs key="tsd-defs">
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>

                <XAxis key="tsd-xaxis" dataKey="time" minTickGap={30} tick={TSD_XAXIS_TICK} />
                <YAxis key="tsd-yaxis-left" yAxisId="left" domain={priceDomain} hide />
                <YAxis key="tsd-yaxis-right" yAxisId="right" domain={TSD_DOMAIN_SENTIMENT} hide />
                <Tooltip 
                  formatter={TSD_TOOLTIP_FORMATTER}
                  contentStyle={TSD_TOOLTIP_CONTENT_STYLE}
                />
                
                {/* Volume bars at the bottom */}
                <Bar key="tsd-bar-vol" yAxisId="right" dataKey="volume" fill="#e2e8f0" opacity={0.3} barSize={4} />
                
                {/* Sentiment Line */}
                <Line 
                  key="tsd-line-sentiment"
                  yAxisId="right" 
                  type="monotone" 
                  dataKey="sentiment" 
                  stroke="#dc2626" 
                  strokeWidth={3} 
                  dot={false} 
                  animationDuration={1000}
                />
                
                {/* Price Area */}
                <Area 
                  key="tsd-area-price"
                  yAxisId="left" 
                  type="monotone" 
                  dataKey="price" 
                  stroke="#2563eb" 
                  strokeWidth={2} 
                  fill={`url(#${gradientId})`} 
                  animationDuration={1500}
                />

                {/* Marker for Divergence */}
                <ReferenceLine 
                  key="tsd-refline"
                  yAxisId="left" 
                  x="10:15" 
                  stroke="#ef4444" 
                  strokeDasharray="3 3" 
                  label={TSD_REF_LABEL} 
                />
              </ComposedChart>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-red-50 border border-red-100 flex items-start gap-4">
            <div className="p-2 bg-red-600 rounded-xl text-white shadow-lg">
                <TriangleAlert className="w-4 h-4" />
            </div>
            <div>
                <div className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">趋势风险评估</div>
                <p className="text-[11px] font-bold text-slate-700 leading-relaxed italic">
                    {/* V67.2: Main signal override — when predatorEngine says SELL/TRAP, trend assessment must not contradict */}
                    {mainSignalOverride && stats.divergence > 5 ?
                        `信号仲裁 (Alpha: +${stats.divergence.toFixed(1)})：虽然 Alpha 数值为正，但主引擎多维度分析已判定【${mainSummary.slice(0, 20)}】。Alpha 正值可能是主力对倒拉升制造的"资金假象"，用于吸引跟风盘接货。以主信号为准，切勿被单一指标误导。` :
                     mainSignalOverride && stats.divergence > 0 ?
                        `信号仲裁 (Alpha: +${stats.divergence.toFixed(1)})：Alpha 微正但主引擎检测到出货特征【${mainSummary.slice(0, 20)}】。量价表面健康不代表安全，主力常在出货末期维持正向 Alpha 掩护撤退。以主信号为准。` :
                     stock.isThemeDropout ?
                        `逆势警报 (Alpha 失效)：${stats.divergence > 0 ? "尽管资金动能强劲" : "资金随板块同步流出"} (Alpha: ${stats.divergence > 0 ? "+" : ""}${stats.divergence.toFixed(1)})，受板块退潮拖累，谨防补跌风险。` :
                     stats.divergence < -15 ? 
                        (stats.priceChg > 0 ?
                            `检测到严重的趋势背离 (Alpha: ${stats.divergence.toFixed(1)})：股价推高但成交量能显著萎缩，显示主力正在进行诱多派发。` :
                            `趋势极度疲弱 (Alpha: ${stats.divergence.toFixed(1)})：股价下跌且缺乏资金承接，呈无抵抗阴跌态势。`) :
                     stats.divergence < -5 ?
                        `趋势轻微背离 (Alpha: ${stats.divergence.toFixed(1)})：股价上涨动能略快于资金支持，虽未触发系统性风险，但需警惕冲高回落。` :
                     stats.divergence > 5 ?
                        (stats.priceChg < 0 ? 
                            `量价底背离迹象明显 (Alpha: +${stats.divergence.toFixed(1)})：股价下跌但资金承接有力，筹码正在低位沉淀，有望迎来修复性反弹。` :
                            `资金动能强劲 (Alpha: +${stats.divergence.toFixed(1)})：情绪指数领涨股价，显示主力资金正在积极推升，趋势大概率延续。`) :
                        "当前量价关系相对健康，情绪指数与价格走势基本同步，未发现严重的系统性背离风险。"}
                </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-start gap-4">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg">
                <TrendingUp className="w-4 h-4" />
            </div>
            <div>
                <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">背离量化指标 (Alpha)</div>
                <div className="flex items-center gap-3 mt-1">
                    <div className="flex flex-col">
                        <span className={cn("text-[14px] font-black", stats.divergence < 0 ? "text-red-600" : "text-emerald-600")}>
                            {stats.divergence > 0 ? '+' : ''}{stats.divergence.toFixed(1)}
                        </span>
                        <span className="text-[8px] font-black text-slate-400 uppercase">背离值</span>
                    </div>
                    <div className="w-px h-6 bg-blue-200" />
                    <div className="flex flex-col">
                        <span className={cn(
                            "text-[14px] font-black",
                            stats.fakeBreakProb >= 70 ? "text-red-600" :
                            stats.fakeBreakProb >= 50 ? "text-orange-500" :
                            "text-slate-900"
                        )}>
                            {stats.fakeBreakProb}%
                            {stats.isArbitrated && <span className="text-[8px] text-red-500 ml-0.5 align-super">!</span>}
                        </span>
                        <span className="text-[8px] font-black text-slate-400 uppercase">
                            {stats.isArbitrated ? '假突破概率 (仲裁)' : '假突破概率'}
                        </span>
                    </div>
                </div>
            </div>
          </div>
      </div>
    </div>
  );
};
