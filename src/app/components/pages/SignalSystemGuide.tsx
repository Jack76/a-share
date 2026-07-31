import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Info, Zap, Anchor, Target, Waves, ShieldAlert, Skull, TrendingUp, ArrowUpRight, Ban, Ghost, Sparkles, Lock, Cloud, Scissors, Bomb, MousePointer2, ShieldCheck } from 'lucide-react';
import { cn } from '../ui/utils';

export const SignalSystemGuide: React.FC = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-10 px-3 rounded-xl text-slate-400 hover:text-slate-600 font-bold text-[10px] uppercase tracking-widest gap-2"
          aria-label="打开信号体系说明"
          title="信号体系说明"
        >
          <Info className="w-4 h-4" />
          <span className="hidden sm:inline">体系说明</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-slate-50/95 backdrop-blur-xl border-slate-200">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-indigo-600" />
            Predator-X 交易体系 (V16.0)
          </DialogTitle>
          <DialogDescription className="space-y-1" asChild>
            <div className="text-sm text-muted-foreground">
              <div>多维度规则辅助工具 • 核心信号图谱</div>
              <div className="text-xs text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded w-fit mt-1">
                V16.0：去绝对化阈值 · 自适应波动阈值 · 拆单特征代理
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-8 py-4">
          
          {/* Buying System */}
          <section className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 border-b pb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              进攻体系 (Buying Signals)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. Assault */}
              <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-red-100 text-red-600">
                      <Zap className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-slate-800">突击 (ASSAULT)</span>
                  </div>
                  <span className="text-[10px] font-black uppercase text-red-400 bg-red-50 px-2 py-0.5 rounded">右侧追涨</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  <strong className="text-slate-700">场景：</strong> 趋势加速期，分时强势进攻。<br/>
                  <strong className="text-slate-700">逻辑：</strong> 确认主升浪启动，顺势跟随。适合情绪高涨期。<br/>
                  <strong className="text-slate-700">风险：</strong> 成本较高，需严设止损。
                </p>
              </div>

              {/* 2. Suck */}
              <div className="bg-white p-4 rounded-xl border border-sky-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-sky-500" />
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-sky-100 text-sky-600">
                      <Waves className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-slate-800">低吸 (SUCK)</span>
                  </div>
                  <span className="text-[10px] font-black uppercase text-sky-400 bg-sky-50 px-2 py-0.5 rounded">左侧防守</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  <strong className="text-slate-700">场景：</strong> 上升趋势中的良性回调 (MA20支撑)。<br/>
                  <strong className="text-slate-700">逻辑：</strong> 牛回头。缩量洗盘，主力未出逃。<br/>
                  <strong className="text-slate-700">特点：</strong> 规则倾向于较紧的风险控制，实际表现需以滚动样本验证为准。
                </p>
              </div>

              {/* 3. WTS */}
              <div className="bg-white p-4 rounded-xl border border-orange-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-orange-500" />
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-orange-100 text-orange-600">
                      <ArrowUpRight className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-slate-800">弱转强 (WTS)</span>
                  </div>
                  <span className="text-[10px] font-black uppercase text-orange-400 bg-orange-50 px-2 py-0.5 rounded">爆发确认</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  <strong className="text-slate-700">场景：</strong> 昨日分歧烂板，今日竞价超预期高开。<br/>
                  <strong className="text-slate-700">逻辑：</strong> 分歧转一致，空头翻多，往往对应妖股启动。<br/>
                  <strong className="text-slate-700">特点：</strong> 爆发力最强，但机会稍纵即逝。
                </p>
              </div>

              {/* 4. Ambush */}
              <div className="bg-white p-4 rounded-xl border border-purple-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-purple-500" />
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-purple-100 text-purple-600">
                      <Target className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-slate-800">伏击 (AMBUSH)</span>
                  </div>
                  <span className="text-[10px] font-black uppercase text-purple-400 bg-purple-50 px-2 py-0.5 rounded">极值反转</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  <strong className="text-slate-700">场景：</strong> 股价新低但指标底背离 (MACD/RSI)。<br/>
                  <strong className="text-slate-700">逻辑：</strong> 杀跌动能耗尽，主力底部吸筹。<br/>
                  <strong className="text-slate-700">优势：</strong> 能够买在起爆前夜，盈亏比极高。
                </p>
              </div>

              {/* 5. Return (Boomerang) */}
              <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600">
                      <Anchor className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-slate-800">回马枪 (RETURN)</span>
                  </div>
                  <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-50 px-2 py-0.5 rounded">纠错重进</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  <strong className="text-slate-700">场景：</strong> 昨日破位洗盘 (假摔)，今日放量收复失地。<br/>
                  <strong className="text-slate-700">逻辑：</strong> 挖坑结束，主力反手做多。<br/>
                  <strong className="text-slate-700">策略：</strong> 立即买回，防止被震下车。
                </p>
              </div>

              {/* 6. Stargate */}
              <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-600">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-slate-800">星门 (STARGATE)</span>
                  </div>
                  <span className="text-[10px] font-black uppercase text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded">时空共振</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  <strong className="text-slate-700">场景：</strong> 个股、板块、情绪周期三维共振。<br/>
                  <strong className="text-slate-700">逻辑：</strong> 天时地利人和，合力最强。<br/>
                  <strong className="text-slate-700">验证：</strong> 不设固定胜率；以当前标的的非重叠滚动样本和真实跟踪账本为准。
                </p>
              </div>

            </div>
          </section>

          {/* Holding System */}
          <section className="space-y-4">
             <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 border-b pb-2 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              持仓体系 (Holding Signals)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {/* 1. Lock */}
               <div className="bg-white p-4 rounded-xl border border-pink-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-pink-500" />
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-pink-100 text-pink-600">
                      <Lock className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-slate-800">锁仓 (LOCK)</span>
                  </div>
                  <span className="text-[10px] font-black uppercase text-pink-400 bg-pink-50 px-2 py-0.5 rounded">涨停封死</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  <strong className="text-slate-700">场景：</strong> 标的封死涨停板。<br/>
                  <strong className="text-slate-700">策略：</strong> 只要不炸板，坚定持有。禁止市价追高，只能排板。<br/>
                  <strong className="text-slate-700">重点：</strong> "板上不卖，板下不追"。
                </p>
               </div>

               {/* 2. Infinite (Was Main) */}
               <div className="bg-white p-4 rounded-xl border border-fuchsia-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-fuchsia-500" />
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-fuchsia-100 text-fuchsia-600">
                      <Cloud className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-slate-800">无限 (INF)</span>
                  </div>
                  <span className="text-[10px] font-black uppercase text-fuchsia-400 bg-fuchsia-50 px-2 py-0.5 rounded">容量主升</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  <strong className="text-slate-700">场景：</strong> 大成交额(&gt;30亿)中军进入主升浪。<br/>
                  <strong className="text-slate-700">策略：</strong> 忽略RSI超买信号，死守5日线。日内急跌是低吸机会。<br/>
                  <strong className="text-slate-700">重点：</strong> "大票不看顶，只看趋势"。
                </p>
               </div>

               {/* 3. Guard (Ghost Protocol) */}
               <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-600">
                      <Ghost className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-slate-800">护盘 (GUARD)</span>
                  </div>
                  <span className="text-[10px] font-black uppercase text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded">幽灵协议</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  <strong className="text-slate-700">场景：</strong> 技术面破位，但检测到拆单吸筹(L2/Shadow)。<br/>
                  <strong className="text-slate-700">策略：</strong> 撤销卖单，暂时观望。主力在暗中护盘。<br/>
                  <strong className="text-slate-700">重点：</strong> "看跌不跌，必有妖孽"。
                </p>
               </div>

               {/* 4. Trend */}
               <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-slate-800">趋势 (TREND)</span>
                  </div>
                  <span className="text-[10px] font-black uppercase text-blue-400 bg-blue-50 px-2 py-0.5 rounded">机构逻辑</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  <strong className="text-slate-700">场景：</strong> 机构/北向重仓，严格贴合 MA20 运行。<br/>
                  <strong className="text-slate-700">策略：</strong> 屏蔽背离信号，沿 20 日线持股。破位再走。<br/>
                  <strong className="text-slate-700">重点：</strong> "做时间的朋友"。
                </p>
               </div>
            </div>
          </section>

          {/* Selling System */}
          <section className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 border-b pb-2 flex items-center gap-2">
              <Ban className="w-4 h-4" />
              防守体系 (Selling Signals)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {/* 1. Take/Cut */}
               <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="font-bold text-xs">止盈/止损 (TAKE/CUT)</span>
                  </div>
                  <p className="text-[10px] text-slate-500">基础风控。触发预设止盈位或跌破动态护盘线。</p>
               </div>

               {/* 2. Escape */}
               <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-slate-800" />
                    <span className="font-bold text-xs">离场 (ESCAPE)</span>
                  </div>
                  <p className="text-[10px] text-slate-500">主力出货。放量杀跌击穿支撑，资金坚决流出。</p>
               </div>

               {/* 3. Top Divergence */}
               <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    <span className="font-bold text-xs">出逃 (TOP)</span>
                  </div>
                  <p className="text-[10px] text-slate-500">顶背离。股价新高但指标死叉，见顶信号。</p>
               </div>

               {/* 4. Hollow Rise */}
               <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-1">
                     <Ghost className="w-3 h-3 text-indigo-400" />
                    <span className="font-bold text-xs">空涨 (HOLLOW)</span>
                  </div>
                  <p className="text-[10px] text-slate-500">中军诱多。股价拉升但净流出占比 &gt; 5%，掩护出货。</p>
               </div>

               {/* 5. Sickle */}
               <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Skull className="w-3 h-3 text-slate-800" />
                    <span className="font-bold text-xs">镰刀 (SICKLE)</span>
                  </div>
                  <p className="text-[10px] text-slate-500">长上影线杀跌，日内亏钱效应显著，立即避险。</p>
               </div>

               {/* 6. Trim */}
               <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Scissors className="w-3 h-3 text-slate-800" />
                    <span className="font-bold text-xs">减仓 (TRIM)</span>
                  </div>
                  <p className="text-[10px] text-slate-500">加速赶顶。换手率达到均值的 3 倍 (爆量)，分批止盈。</p>
               </div>

               {/* 7. Nuke */}
               <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Bomb className="w-3 h-3 text-red-600" />
                    <span className="font-bold text-xs">核按钮 (NUKE)</span>
                  </div>
                  <p className="text-[10px] text-slate-500">恶庄砸盘。识别为恶意游资席位，竞价直接挂跌停出货。</p>
               </div>

               {/* 8. Trap */}
               <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-1">
                    <MousePointer2 className="w-3 h-3 text-orange-600" />
                    <span className="font-bold text-xs">诱多 (TRAP)</span>
                  </div>
                  <p className="text-[10px] text-slate-500">筹码阻击。上方套牢盘巨大，主力托单出货。</p>
               </div>

               {/* 9. Avoid/Safe */}
               <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-3 h-3 text-slate-600" />
                    <span className="font-bold text-xs">避险 (SAFE/AVOID)</span>
                  </div>
                  <p className="text-[10px] text-slate-500">系统熔断。大盘崩盘或个股风险评分过高，强制空仓。</p>
               </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
