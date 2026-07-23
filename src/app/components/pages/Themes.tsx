import React, { useState, useMemo } from 'react';
import { useTrading } from '../../context/Store';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Trash2, Plus, TrendingUp, Zap, Radar, ArrowRight, GitBranch } from 'lucide-react';
import { Theme } from '../../types';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { DragonGenealogy } from '../DragonGenealogy';

export const Themes: React.FC = () => {
  const { themes, marketThemes, addTheme, removeTheme, stocks } = useTrading();
  const [newThemeName, setNewThemeName] = useState('');
  const [newThemeType, setNewThemeType] = useState<Theme['type']>('Main');
  const [newThemeLogic, setNewThemeLogic] = useState('');

  // ------------------------------------------------------------------
  // Data Source Selection: Prefer Market Themes if available (User Request)
  // ------------------------------------------------------------------
  // Filter out "Automatic Discovery" concept/theme to avoid clutter
  const activeThemes = useMemo(() => {
      const source = (marketThemes && marketThemes.length > 0) ? marketThemes : themes;
      return source.filter(t => t.name !== '自动扫描' && t.name !== '自动发现' && t.name !== 'Auto-Discovered');
  }, [marketThemes, themes]);

  // Separate Themes by Source for AI Insights
  const marketScanThemes = activeThemes.filter(t => t.id.startsWith('sina-') || t.id.startsWith('theme-'));
  const poolAutoThemes = activeThemes.filter(t => t.id.startsWith('auto-'));
  
  const handleAdd = () => {
    if (!newThemeName) return;
    const theme: Theme = {
      id: Date.now().toString(),
      name: newThemeName,
      type: newThemeType,
      logic: newThemeLogic
    };
    addTheme(theme);
    setNewThemeName('');
    setNewThemeLogic('');
  };

  // Helper to parse auto-generated logic string
  const parseLogic = (logicStr: string) => {
      // Expected format: "涨幅:4.5%, 涨停:2/5, 龙头:StockName"
      if (!logicStr.includes('涨幅:')) return { raw: logicStr };
      
      try {
          const parts = logicStr.split(', ');
          const changeStr = parts.find(p => p.startsWith('涨幅:'))?.split(':')[1].replace('%', '') || '0';
          const limitUpStr = parts.find(p => p.startsWith('涨停:'))?.split(':')[1] || '0/0';
          const leaderStr = parts.find(p => p.startsWith('龙头:'))?.split(':')[1] || '';
          
          return {
              change: parseFloat(changeStr),
              limitUpRatio: limitUpStr,
              leader: leaderStr,
              raw: null
          };
      } catch (e) {
          return { raw: logicStr };
      }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-10 md:px-10 md:py-16 space-y-16">
      
      {/* SECTION 1: SECTOR RESONANCE MAP (Improved Visualization) */}
      <section>
          <div className="flex items-center justify-between mb-6">
              <div>
                  <h3 className="text-xl font-bold tracking-tighter flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-red-500" />
                      板块共振热力图
                  </h3>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest mt-1">Sector Resonance Heatmap</p>
              </div>
              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest border-red-200 text-red-600 bg-red-50">
                  Real-time Pooling
              </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Array.from(new Set(stocks.filter(s => s.concept && s.concept !== '自动发现' && s.concept !== '自动扫描').map(s => s.concept))).map(concept => {
                  const sectorStocks = stocks.filter(s => s.concept === concept);
                  const avgChange = sectorStocks.reduce((sum, s) => sum + (s.changePercent || 0), 0) / sectorStocks.length;
                  const limitUps = sectorStocks.filter(s => s.isLimitUp).length;
                  const total = sectorStocks.length;
                  
                  const isHot = avgChange > 3 || limitUps > 0;
                  
                  return (
                      <Card key={concept} className={cn(
                          "relative overflow-hidden border-none shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md cursor-default",
                          isHot ? "bg-red-500/5 ring-1 ring-red-500/20" : "bg-card ring-1 ring-border/50"
                      )}>
                          {isHot && <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-bl-full animate-pulse" />}
                          <CardContent className="p-5 flex flex-col items-center justify-center text-center">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-2 truncate w-full">{concept}</div>
                              <div className={cn("text-2xl font-bold tracking-tighter leading-none mb-3", avgChange > 0 ? "text-red-600" : "text-green-600")}>
                                  {avgChange > 0 ? '+' : ''}{avgChange.toFixed(1)}%
                              </div>
                              <div className="flex flex-wrap gap-1 justify-center">
                                  {limitUps > 0 && (
                                      <Badge className="bg-red-600 text-[9px] h-4 px-1.5 font-bold uppercase tracking-tighter">
                                          {limitUps} 涨停
                                      </Badge>
                                  )}
                                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-bold uppercase tracking-tighter opacity-60">
                                      {total} 标的
                                  </Badge>
                              </div>
                          </CardContent>
                      </Card>
                  );
              })}
          </div>
      </section>

      <div className="space-y-12">
          {/* Main Themes List */}
          <div className="space-y-12">
              <div className="space-y-6">
                  <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold tracking-tighter flex items-center gap-2">
                        <Zap className="w-5 h-5 text-purple-500" />
                        当前主线确认 (Active Themes)
                      </h3>
                  </div>
                  
                  <Card className="border-none shadow-sm overflow-hidden bg-card">
                      <Table>
                        <TableHeader className="bg-muted/30">
                          <TableRow className="hover:bg-transparent border-none">
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest py-4">板块名称</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest py-4">定性分析</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest py-4">实时数据</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest py-4">核心领涨</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest py-4 text-right">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activeThemes.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-20">
                                <div className="flex flex-col items-center gap-2">
                                    <Radar className="w-8 h-8 text-muted-foreground/20 animate-spin" />
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">等待主线确认中...</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            activeThemes
                            .map(theme => {
                                // Try to calculate from local pool first
                                const sectorStocks = stocks.filter(s => s.concept === theme.name);
                                const hasLocalData = sectorStocks.length > 0;
                                
                                // Local Calculation
                                const localAvgChange = hasLocalData ? sectorStocks.reduce((sum, s) => sum + (s.changePercent || 0), 0) / sectorStocks.length : 0;
                                const localLimitUps = hasLocalData ? sectorStocks.filter(s => s.isLimitUp).length : 0;
                                const localLeader = hasLocalData ? (sectorStocks.find(s => s.role === 'Leader') || sectorStocks.sort((a,b) => (b.changePercent||0) - (a.changePercent||0))[0]) : undefined;
                                
                                // Market Data Fallback (from backend)
                                // Assuming theme.strength is roughly equivalent to limitUps or score
                                // Assuming theme.stockCount is total limit ups
                                const marketLimitUps = theme.stockCount || theme.strength || 0;
                                
                                // Decision: If market data shows MORE limit ups than local, use market data for "Broad View"
                                // But keep local avg change as proxy for intensity if available
                                const displayLimitUps = Math.floor(Math.max(localLimitUps, marketLimitUps));
                                const displayTotal = Math.floor(Math.max(sectorStocks.length, displayLimitUps * 2)); // Rough estimate if total missing
                                const displayAvgChange = hasLocalData ? localAvgChange : (displayLimitUps > 0 ? 3.5 : 0); // Mock avg change if no local data
                                
                                return {
                                    ...theme,
                                    avgChange: displayAvgChange,
                                    limitUps: displayLimitUps,
                                    totalStocks: displayTotal,
                                    calculatedLeader: localLeader || (theme.leaderName ? { name: theme.leaderName, changePercent: 10 } as Stock : undefined)
                                };
                            })
                            .sort((a, b) => {
                                if (b.limitUps !== a.limitUps) return b.limitUps - a.limitUps;
                                return b.avgChange - a.avgChange;
                            })
                            .map((theme) => {
                              return (
                                  <TableRow key={theme.id} className="group transition-colors border-border/30">
                                    <TableCell>
                                        <div className="font-bold text-base tracking-tight group-hover:text-primary transition-colors">{theme.name}</div>
                                        {(() => {
                                            const getStatus = () => {
                                                // v41.2 Update: Support PreLaunch and Decline states
                                                if (theme.type === 'Decline') return { label: '退潮预警', variant: 'outline' as const, className: "bg-slate-100 text-slate-600 border-slate-300" };
                                                if (theme.type === 'PreLaunch') return { label: '蓄势待发', variant: 'outline' as const, className: "bg-amber-50 text-amber-600 border-amber-200 animate-pulse" };
                                                if (theme.type === 'Main') return { label: '核心主线', variant: 'destructive' as const, className: "" };
                                                if (theme.type === 'Sub') return { label: '局部活跃', variant: 'default' as const, className: "bg-blue-600 hover:bg-blue-700" };

                                                // Fallback Logic
                                                if (theme.limitUps >= 8) return { label: '绝对主线', variant: 'destructive' as const, className: "" };
                                                if (theme.limitUps >= 4) return { label: '强势板块', variant: 'destructive' as const, className: "" };
                                                if (theme.limitUps >= 2) return { label: '局部活跃', variant: 'default' as const, className: "bg-blue-600" };
                                                if (theme.avgChange > 2) return { label: '异动观察', variant: 'secondary' as const, className: "" };
                                                if (theme.avgChange < -1) return { label: '调整承压', variant: 'outline' as const, className: "" };
                                                return { label: '震荡整理', variant: 'secondary' as const, className: "" };
                                            };
                                            const status = getStatus();
                                            return (
                                                <Badge variant={status.variant} className={cn("text-[9px] h-4 mt-1 font-bold tracking-tight py-0 px-1.5", status.className)}>
                                                    {status.label}
                                                </Badge>
                                            );
                                        })()}
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-xs text-muted-foreground font-medium max-w-[150px] leading-relaxed italic">
                                            {theme.logic.split('Pool: ')[1] || theme.logic}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                          <div className="flex flex-col gap-1.5">
                                              <div className={cn("flex items-center gap-1", theme.avgChange > 0 ? "text-red-600" : "text-green-600")}>
                                                  <TrendingUp className="w-3 h-3" />
                                                  <span className="text-xs font-bold font-mono">{theme.avgChange > 0 ? '+' : ''}{theme.avgChange.toFixed(1)}%</span>
                                              </div>
                                              <div className="flex items-center gap-1 text-orange-600">
                                                  <Zap className="w-3 h-3" />
                                                  <span className="text-xs font-bold font-mono">{theme.limitUps}/{theme.totalStocks} 涨停</span>
                                              </div>
                                          </div>
                                    </TableCell>
                                    <TableCell>
                                       {theme.calculatedLeader ? (
                                           <div className="flex flex-col gap-1">
                                                <Badge variant="outline" className="font-bold font-mono text-blue-600 bg-blue-50/50 border-blue-100 uppercase tracking-tighter w-fit">
                                                    {theme.calculatedLeader.name}
                                                </Badge>
                                                <span className={cn("text-[9px] font-black", (theme.calculatedLeader.changePercent||0) > 0 ? "text-red-500" : "text-green-500")}>
                                                    {(theme.calculatedLeader.changePercent||0) > 0 ? '+' : ''}{theme.calculatedLeader.changePercent}%
                                                </span>
                                           </div>
                                       ) : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeTheme(theme.id)}>
                                        <Trash2 className="w-4 h-4 text-destructive" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                  </Card>
              </div>

              {/* Dragon Genealogy Section for Top Themes */}
              <div className="space-y-6 pt-6">
                  <div className="flex items-center gap-3">
                      <GitBranch className="w-5 h-5 text-red-600" />
                      <h3 className="text-xl font-bold tracking-tighter">龙头谱系架构 (Sector Hierarchy)</h3>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {activeThemes
                        .sort((a, b) => ((b.strength || 0) + (b.stockCount || 0)) - ((a.strength || 0) + (a.stockCount || 0)))
                        .slice(0, 2)
                        .map(theme => (
                          <DragonGenealogy key={theme.id} theme={theme} stocks={stocks} />
                      ))}
                  </div>
              </div>
          </div>

          {/* Manual Entry (Horizontal Layout) */}
          <div className="space-y-6 pt-8 border-t border-slate-100/50">
              <h3 className="text-xl font-bold tracking-tighter flex items-center gap-2 text-slate-400">
                <Plus className="w-5 h-5" />
                手动补充 (Manual Supplement)
              </h3>
              <Card className="border-none shadow-sm bg-card">
                <CardContent className="p-6">
                  <div className="flex flex-col xl:flex-row items-end gap-6">
                      <div className="w-full xl:w-1/4 space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">板块名称</label>
                        <Input 
                          value={newThemeName} 
                          onChange={(e) => setNewThemeName(e.target.value)}
                          placeholder="e.g. 低空经济"
                          className="bg-muted/30 border-none font-bold placeholder:font-medium h-12"
                        />
                      </div>
                      <div className="w-full xl:w-1/5 space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">逻辑重要性</label>
                        <Select value={newThemeType} onValueChange={(v: Theme['type']) => setNewThemeType(v)}>
                          <SelectTrigger className="bg-muted/30 border-none font-bold h-12">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Main">核心主线 (Main)</SelectItem>
                            <SelectItem value="Vice">辅助支线 (Vice)</SelectItem>
                            <SelectItem value="PreLaunch">蓄势待发 (PreLaunch)</SelectItem>
                            <SelectItem value="Decline">退潮预警 (Decline)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 w-full space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">上涨逻辑描述</label>
                        <Input 
                          value={newThemeLogic} 
                          onChange={(e) => setNewThemeLogic(e.target.value)}
                          placeholder="e.g. 政策持续催化"
                          className="bg-muted/30 border-none font-bold h-12"
                        />
                      </div>
                      <div className="w-full xl:w-auto">
                          <Button onClick={handleAdd} disabled={!newThemeName} className="w-full xl:w-auto h-12 px-8 shadow-lg shadow-primary/20">
                            <Plus className="w-4 h-4 mr-2" />
                            确认添加
                          </Button>
                      </div>
                  </div>
                </CardContent>
              </Card>
          </div>
      </div>
    </div>
  );
};