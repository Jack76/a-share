import React, { useEffect, useState } from 'react';
import { useTrading } from '../../context/Store';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { BookOpen, Save, Sparkles, History, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { AlertCircle, Target, ShieldCheck, Flame, Zap } from 'lucide-react';
import { cn } from '../ui/utils';
import { QuantitativeBattleReport } from '../QuantitativeBattleReport';
import { getChinaTradingClock } from '../../utils/marketClock';
import { readPredictionLedger, summarizePredictionLedger } from '../../utils/predictionLedger';

export const Review: React.FC = () => {
  const { journal, setJournal, journalHistory, phase, metrics, stocks, themes, marketIndices, marketStats } = useTrading();
  const [localJournal, setLocalJournal] = useState(journal);
  const ledgerSummary = summarizePredictionLedger(readPredictionLedger());
  
  // Sync when context changes (initial load) & Auto-Date Correction
  useEffect(() => {
    const today = getChinaTradingClock().tradeDate;
    if (journal.date !== today) {
        const updatedJournal = {
          date: today,
          phase,
          whatWentRight: '',
          whatWentWrong: '',
          strategy: '',
        };
        setLocalJournal(updatedJournal);
        setJournal(updatedJournal);
    } else {
        setLocalJournal(journal);
    }
  }, [journal, phase, setJournal]);

  // Auto-save mechanism (Debounce 1.5s)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        localJournal.whatWentRight !== journal.whatWentRight ||
        localJournal.whatWentWrong !== journal.whatWentWrong ||
        localJournal.strategy !== journal.strategy
      ) {
        setJournal(localJournal);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [localJournal, setJournal, journal]);

  const handleChange = (key: keyof typeof journal, value: string) => {
    setLocalJournal(prev => ({ ...prev, [key]: value }));
  };
  
  const generateInsights = () => {
      // 1. Market Overview (Deep Analysis)
      const sh = marketIndices.find(i => i.code.includes('sh000001'));
      const sz = marketIndices.find(i => i.code.includes('sz399001'));
      
      // Use fallback values if metrics are undefined
      const upCount = marketStats?.upCount || metrics.upCount || 0;
      const downCount = marketStats?.downCount || metrics.downCount || 0;
      
      const upDownRatio = downCount > 0 ? (upCount / downCount).toFixed(2) : "N/A";
      const marketTone = upCount > downCount * 2 ? "普涨盛宴" : 
                         downCount > upCount * 2 ? "普跌冰点" : 
                         "多空分化";
      
      const volumeText = metrics.volumeHigh ? "放量" : "缩量";
      
      let marketOverview = `【指数与量能】\n市场定性：${marketTone} (${volumeText})\n`;
      if (sh) marketOverview += `上证指数：${sh.changePercent > 0 ? '↑' : '↓'}${Math.abs(sh.changePercent).toFixed(2)}%\n`;
      if (sz) marketOverview += `深证成指：${sz.changePercent > 0 ? '↑' : '↓'}${Math.abs(sz.changePercent).toFixed(2)}%\n`;
      marketOverview += `涨跌分布：涨${upCount}家 / 跌${downCount}家 (比率 ${upDownRatio})\n`;
      
      // 2. Sentiment Cycle (Hardcore Metrics) - Adjusted for 5300+ stocks
      const limitUpMood = metrics.limitUpCount > 90 ? "极热" : metrics.limitUpCount > 50 ? "活跃" : "低迷";
      const panicMood = metrics.limitDownCount > 40 ? "恐慌蔓延" : metrics.limitDownCount > 10 ? "局部亏钱" : "情绪稳定";
      const premiumText = metrics.yesterdayLimitUpEffect > 2 ? "高溢价接力" : metrics.yesterdayLimitUpEffect < -2 ? "大面核按钮" : "平盘震荡";
      
      let sentimentDeep = `\n【情绪周期解构】\n当前阶段：${phase.toUpperCase()} (${phase === 'Climax' ? '高潮' : phase === 'Ebb' ? '退潮' : phase === 'Startup' ? '启动' : '混沌'})\n`;
      sentimentDeep += `多头火力：涨停 ${metrics.limitUpCount} 家 (${limitUpMood}) | 连板高度 ${metrics.spaceHeight}板\n`;
      sentimentDeep += `空头宣泄：跌停 ${metrics.limitDownCount} 家 (${panicMood})\n`;
      sentimentDeep += `接力反馈：昨日涨停今表现 ${metrics.yesterdayLimitUpEffect > 0 ? '+' : ''}${metrics.yesterdayLimitUpEffect}% (${premiumText})`;

      // 3. Theme & Leader Structure
      // Filter out auto-generated themes to focus on real market concepts
      const validThemes = themes.filter(t => t.type === 'Main' && t.name !== '自动扫描' && t.name !== '自动发现' && t.name !== 'Auto-Discovered');
      const topThemes = validThemes.map(t => `${t.name}(${t.strength}%)`).slice(0, 3);
      const leaderStatus = metrics.leaderStrong ? "核心龙头晋级强力" : "高位龙头出现断板/补跌";
      
      const structureText = `\n\n【结构与主线】\n核心主线：${topThemes.length ? topThemes.join(' > ') : "无明显主线，轮动混沌"}\n龙头反馈：${leaderStatus}`;
      
      // Assemble "What Went Right"
      const marketContext = marketOverview + sentimentDeep + structureText;

      // 4. Strategy Generation (Scenario Based - V10.2 Enhanced)
      let strategy = "";
      const baseIndent = "   ";
      
      // Scenario Logic based on Phase
      if (phase === 'Climax') {
          strategy = `【明日实战推演：高潮分歧与去弱留强】\n`;
          strategy += `⚡️ 竞价策略 (09:15-09:25)：\n`;
          strategy += `${baseIndent}- 核心龙头监控：若继续大单顶一字，必须观察封单金额是否减少。若封单/成交量 < 10，谨防开盘炸板。\n`;
          strategy += `${baseIndent}- 持仓处理：后排跟风股若开盘不及预期（低开或弱转强失败），竞价直接核按钮离场，不存幻想。\n\n`;
          
          strategy += `🏹 盘中博弈 (09:30-14:50)：\n`;
          strategy += `${baseIndent}- 机会锚点：只关注核心龙头在分歧时的抗跌换手板机会（T字板）。买点必须严格控制在分时均线附近。\n`;
          strategy += `${baseIndent}- 陷阱规避：严禁在高潮次日接力中位股（3-4板），这是"大面"最高发区域。\n\n`;
          
          strategy += `🛡 风控底线：\n`;
          strategy += `${baseIndent}- 仓位上限：6成。若指数跌破分时均线，无条件减仓至3成保住利润。\n`;
          
      } else if (phase === 'Ebb') {
          strategy = `【明日实战推演：退潮防御与冰点试错】\n`;
          strategy += `⚡️ 竞价策略 (09:15-09:25)：\n`;
          strategy += `${baseIndent}- 风险信号：若跌停家数(${metrics.limitDownCount})竞价阶段依然超过 5 家，说明退潮未结束，全天禁止开新仓。\n`;
          strategy += `${baseIndent}- 核按钮预演：手中若有高位股，开盘稍有不对（不及预期）需立即按跌停价出逃。\n\n`;
          
          strategy += `🏹 盘中博弈 (09:30-14:50)：\n`;
          strategy += `${baseIndent}- 试错节点：耐心等待"冰点"信号（连板高度压缩至2-3板，涨停家数<20）。\n`;
          strategy += `${baseIndent}- 标的选择：仅关注首板一进二的弱转强，或新题材的首板试错。老题材全部放弃。\n\n`;
          
          strategy += `🛡 风控底线：\n`;
          strategy += `${baseIndent}- 仓位上限：1-2成（娱乐仓）。此时主要任务是防守，切勿试图抄底"A杀"个股。\n`;
          
      } else if (phase === 'Startup') {
          strategy = `【明日实战推演：主升确立与积极进攻】\n`;
          strategy += `⚡️ 竞价策略 (09:15-09:25)：\n`;
          strategy += `${baseIndent}- 龙头确认：观察昨日首板最强股的开盘溢价。若出现大面积高开（>5%），确认周期启动。\n`;
          strategy += `${baseIndent}- 抢筹逻辑：聚焦当前最强板块【${themes[0]?.name || '主线'}】的前排核心，竞价可直接试探性上仓位。\n\n`;
          
          strategy += `🏹 盘中博弈 (09:30-14:50)：\n`;
          strategy += `${baseIndent}- 主线进攻：大胆博弈1进2或龙头弱转强。此时盈亏比最佳，不要畏高。\n`;
          strategy += `${baseIndent}- 补涨挖掘：若龙头一字买不到，立即切换至板块内低位首板进行套利。\n\n`;
          
          strategy += `🛡 风控底线：\n`;
          strategy += `${baseIndent}- 仓位上限：8成。主升期要敢于重仓，但若主线板块明日大幅低开，则需警惕"一日游"风险。\n`;
          
      } else { // Chaos / Ice / Repair
          strategy = `【明日实战推演：混沌震荡与低吸潜伏】\n`;
          strategy += `⚡️ 竞价策略 (09:15-09:25)：\n`;
          strategy += `${baseIndent}- 观察反馈：市场无主线，资金主要在老妖股中抱团。观察前期辨识度个股的竞价承接。\n\n`;
          
          strategy += `🏹 盘中博弈 (09:30-14:50)：\n`;
          strategy += `${baseIndent}- 低吸核心：采取"低吸"策略，关注前期龙头的深水区反核（-5%以下买入），不做追涨。\n`;
          strategy += `${baseIndent}- 潜伏预期：寻找具备事件驱动（周末消息面）的低位板块进行潜伏。\n\n`;
          
          strategy += `🛡 风控底线：\n`;
          strategy += `${baseIndent}- 仓位上限：3成。不见兔子不撒鹰，避免在轮动中左右挨打。\n`;
      }
      
      // 5. Target Scanning (AI Enhanced - Full Market 5100+ Stocks)
      const dragons = stocks
          .filter(s => s.isLimitUp && (s.strengthScore || 0) > 75) // Increased threshold for v8.0
          .sort((a, b) => (b.strengthScore || 0) - (a.strengthScore || 0))
          .slice(0, 5)
          .map(s => `${s.name}(${s.consecutiveLimitUps}板|强${s.strengthScore})`);
      
      const risks = stocks
          .filter(s => (s.trapRiskScore || 0) > 80) // Stricter risk threshold
          .sort((a, b) => (b.trapRiskScore || 0) - (a.trapRiskScore || 0))
          .slice(0, 3)
          .map(s => `${s.name}(诱多${s.trapRiskScore})`);

      const targets = `\n【全市场规则筛选】\n[关注] 核心晋级：${dragons.length ? dragons.join('、') : '无（建议空仓）'}\n[规避] 风险标的：${risks.length ? risks.join('、') : '无'}`;
      
      strategy += targets;
      
      // 6. Detailed Logic Review (Missing Out / Chasing High / Panic Selling)
      let rights: string[] = [];
      let wrongs: string[] = [];
      
      const heldStocks = stocks.filter(s => s.status === 'Hold');
      const soldStocks = stocks.filter(s => s.status === 'Sold');

      // (A) Check Holdings
      if (heldStocks.length > 0) {
          const profitable = heldStocks.filter(s => (s.changePercent || 0) > 0);
          if (profitable.length > 0) rights.push(`持有 ${profitable.map(s => `${s.name}(+${s.changePercent}%)`).join('、')} 等标的顺势盈利`);
          
          const losing = heldStocks.filter(s => (s.changePercent || 0) < 0);
          if (losing.length > 0) wrongs.push(`持有 ${losing.map(s => `${s.name}(${s.changePercent}%)`).join('、')} 等标的逆势亏损，需审查是否违反纪律`);
      }

      // (B) Check Sold (Selling too early)
      const soldButRising = soldStocks.filter(s => (s.changePercent || 0) > 5);
      if (soldButRising.length > 0) {
          wrongs.push(`卖飞 ${soldButRising.map(s => s.name).join('、')} (今日大涨)，可能存在过度恐慌或止盈过早`);
      }

      // (C) Check Missing Out (Fear of Heights)
      if (phase === 'Climax' && heldStocks.length === 0 && metrics.limitUpCount > 90) {
           wrongs.push(`在市场高潮期(${metrics.limitUpCount}家涨停)空仓踏空，可能是"恐高症"导致错失主升浪`);
      }

      // Default Positive Message if no obvious errors
      if (wrongs.length === 0) {
          wrongs.push("今日操作纪律执行良好，未出现明显的冲动交易或踏空失误。");
      }

      // Rules-based summary using the current snapshot.
      setLocalJournal(prev => ({
          ...prev,
          whatWentRight: marketContext + (rights.length ? `\n\n【账户高光】\n${rights.join('；')}` : ""),
          whatWentWrong: `【深度反思】\n${wrongs.join('；\n')}`,
          strategy: strategy
      }));
      
      toast.success("已根据当前行情生成规则复盘");
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-10 md:px-10 md:py-16 space-y-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-8">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase italic flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-red-600" />
            数据复盘归纳 (Post-Game Analysis)
          </h2>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-2">
            知行合一：量化交易的核心在于对博弈过程的持续修正
          </p>
        </div>
        <div className="flex items-center gap-3">
            <Badge variant="outline" className="px-4 py-1.5 border-slate-200 bg-white text-slate-600 font-black">
                仅本机自动保存
            </Badge>
        </div>
      </div>

      {/* 0. Strategic Briefing (Moved to Top for Alignment) */}
      <div className="w-full">
          <QuantitativeBattleReport metrics={metrics} phase={phase} stocks={stocks} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-10">
          {/* Left Column: Snapshot (Glass Effect) */}
          <div className="xl:col-span-1 space-y-8">
              <Card className="border border-slate-200 shadow-sm bg-white/80 backdrop-blur-md overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                        <History className="w-3.5 h-3.5" />
                        今日盘面快照 (Daily Snapshot)
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-black text-slate-500 uppercase">市场阶段</span>
                        <Badge className={cn("px-3 py-1 font-black italic", 
                            phase === 'Climax' ? 'bg-red-600' : 
                            phase === 'Ebb' ? 'bg-blue-600' : 'bg-slate-900')}>
                            {phase}
                        </Badge>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="group">
                            <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase mb-2">
                                <span>涨停效应 (Limit Up)</span>
                                <span className={metrics.limitUpCount > 50 ? "text-red-600" : ""}>{metrics.limitUpCount > 50 ? "STRONG" : "WEAK"}</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div className={cn("h-full transition-all duration-1000", metrics.limitUpCount > 50 ? "w-full bg-red-500" : "w-1/3 bg-slate-300")} />
                            </div>
                        </div>

                        <div className="group">
                            <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase mb-2">
                                <span>亏钱效应 (Panic)</span>
                                <span className={metrics.bigLosses ? "text-green-600" : ""}>{metrics.bigLosses ? "HIGH" : "LOW"}</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div className={cn("h-full transition-all duration-1000", metrics.bigLosses ? "w-full bg-green-500" : "w-1/4 bg-slate-300")} />
                            </div>
                        </div>

                        <div className="group">
                            <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase mb-2">
                                <span>龙头溢价 (Leader)</span>
                                <span className={metrics.leaderStrong ? "text-red-600" : ""}>{metrics.leaderStrong ? "PREMIUM" : "BROKEN"}</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div className={cn("h-full transition-all duration-1000", metrics.leaderStrong ? "w-full bg-red-400" : "w-1/2 bg-slate-300")} />
                            </div>
                        </div>
                    </div>

                    <Separator className="bg-slate-100" />
                    
                    <div className="pt-2">
                        <Button 
                            variant="default" 
                            className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 font-black text-xs uppercase tracking-widest"
                            onClick={generateInsights}
                        >
                            <Sparkles className="w-4 h-4 mr-2 text-red-500" />
                            生成规则复盘
                        </Button>
                    </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">真实预测跟踪账本</div>
                      <div className="mt-1 text-2xl font-black text-slate-900">{ledgerSummary.resolved}<span className="ml-1 text-xs text-slate-400">已完成</span></div>
                    </div>
                    <Badge variant="outline" className="text-[9px]">{ledgerSummary.pending} 待验证</Badge>
                  </div>
                  <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
                    {ledgerSummary.hitRate === null
                      ? '尚无满 5 个交易日的真实跟踪样本，暂不展示命中率。'
                      : `方向命中率 ${ledgerSummary.hitRate.toFixed(1)}%，仅统计本机持续记录的实时信号。`}
                  </p>
                </CardContent>
              </Card>

              <div className="p-6 rounded-2xl bg-red-50 border border-red-100 space-y-3">
                  <h4 className="text-[10px] font-black text-red-600 uppercase tracking-widest flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5" /> 复盘建议 (Review Guide)
                  </h4>
                  <p className="text-[11px] font-medium text-red-800 leading-relaxed">
                      复盘不是写日记，而是修正逻辑。重点分析：<br/>
                      1. 核心龙头的进场点是否符合周期？<br/>
                      2. 仓位分配是否与当前混沌度匹配？<br/>
                      3. 是否出现了情绪负背离而未及时撤退？
                  </p>
              </div>
          </div>

          {/* Right Column: Journal Form (Large Area) */}
          <div className="xl:col-span-3 space-y-8">
              <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
                <CardHeader className="bg-slate-50/30 border-b border-slate-50 p-6">
                  <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-black flex items-center gap-3 uppercase tracking-tight italic">
                        <History className="w-4 h-4 text-slate-400" />
                        操盘手复盘日志 (Trader's Logbook)
                      </CardTitle>
                      <Badge variant="outline" className="font-mono text-[10px] px-3">{localJournal.date}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600 flex items-center gap-2">
                            <ArrowRight className="w-4 h-4" /> 盘面全景与操作亮点
                        </Label>
                        <Textarea 
                          className="min-h-[180px] font-bold text-xs leading-relaxed bg-slate-50/50 border-slate-100 focus-visible:ring-red-500 p-4 rounded-xl" 
                          placeholder="今日指数、板块及个股的表现总结..."
                          value={localJournal.whatWentRight}
                          onChange={e => handleChange('whatWentRight', e.target.value)}
                        />
                      </div>

                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-green-600 flex items-center gap-2">
                            <ArrowRight className="w-4 h-4" /> 决策失误与人性反思
                        </Label>
                        <Textarea 
                          className="min-h-[180px] font-bold text-xs leading-relaxed bg-slate-50/50 border-slate-100 focus-visible:ring-green-500 p-4 rounded-xl" 
                          placeholder="贪婪、恐惧、还是逻辑执行不到位？"
                          value={localJournal.whatWentWrong}
                          onChange={e => handleChange('whatWentWrong', e.target.value)}
                        />
                      </div>
                  </div>

                  <div className="space-y-3 pt-4">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 flex items-center gap-2">
                        <Target className="w-4 h-4 text-red-600" /> 次日实战推演策略 (Next Action)
                    </Label>
                    <Textarea 
                      className="min-h-[120px] font-black text-sm leading-relaxed border-2 border-slate-100 focus-visible:ring-slate-900 p-6 rounded-2xl bg-white shadow-inner" 
                      placeholder="明日的具体操作指令..."
                      value={localJournal.strategy}
                      onChange={e => handleChange('strategy', e.target.value)}
                    />
                  </div>
                </CardContent>
                <CardFooter className="block border-t border-slate-100 bg-slate-50/50 p-6">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-[10px] font-black tracking-widest text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                        <History className="w-4 h-4" /> 历史复盘（{journalHistory.filter(item => item.date !== localJournal.date).length}）
                      </summary>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {journalHistory.filter(item => item.date !== localJournal.date).length > 0 ? (
                          journalHistory
                            .filter(item => item.date !== localJournal.date)
                            .map(item => (
                              <details key={item.date} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                <summary className="cursor-pointer list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                                  <span className="block text-xs font-black text-slate-800">{item.date}</span>
                                  <span className="mt-0.5 block truncate text-[10px] text-slate-500">{item.whatWentRight || item.strategy || '空白复盘'}</span>
                                </summary>
                                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-[10px] leading-relaxed text-slate-600">
                                  <p className="whitespace-pre-wrap">{item.whatWentRight || '无盘面记录'}</p>
                                  <p className="whitespace-pre-wrap">{item.whatWentWrong || '无反思记录'}</p>
                                  <p className="whitespace-pre-wrap font-bold">{item.strategy || '无次日计划'}</p>
                                </div>
                              </details>
                            ))
                        ) : (
                          <span className="text-[10px] text-slate-400">完成当天复盘后，历史记录会保存在当前浏览器。</span>
                        )}
                      </div>
                    </details>
                </CardFooter>
              </Card>
          </div>
      </div>
    </div>
  );
};
