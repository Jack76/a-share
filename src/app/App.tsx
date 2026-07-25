import React, { useCallback, useEffect, useState, lazy, Suspense } from 'react';
import { TradingProvider, useTrading } from './context/Store';

// V65.1 PERF: Lazy load pages — only the active tab's code is loaded
const Dashboard = lazy(() => import('./components/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Themes = lazy(() => import('./components/pages/Themes').then(m => ({ default: m.Themes })));
const DragonPool = lazy(() => import('./components/pages/DragonPool').then(m => ({ default: m.DragonPool })));
const FundRadar = lazy(() => import('./components/pages/FundRadar').then(m => ({ default: m.FundRadar })));
const Trading = lazy(() => import('./components/pages/Trading').then(m => ({ default: m.Trading })));
const Review = lazy(() => import('./components/pages/Review').then(m => ({ default: m.Review })));
import { 
  LayoutDashboard, 
  Target, 
  Flame, 
  Calculator, 
  BookOpen, 
  Menu, 
  X, 
  Loader,
  PieChart,
  CircleCheck,
  CircleAlert,
  Cloud,
  CloudOff,
  Database,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/sonner';
import { Badge } from './components/ui/badge';
import { cn } from './components/ui/utils';
import { BlackSwanOverlay } from './components/BlackSwanOverlay';
import { deriveMarketHealth } from './utils/dataHealth';
import { getPageFromSearch, getPageUrl, type PageId } from './utils/pageNavigation';

export default function App() {
  const [activeTab, setActiveTabState] = useState<PageId>(() => getPageFromSearch(window.location.search));
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const syncPageFromUrl = () => {
      setActiveTabState(getPageFromSearch(window.location.search));
    };

    window.addEventListener('popstate', syncPageFromUrl);
    return () => window.removeEventListener('popstate', syncPageFromUrl);
  }, []);

  const setActiveTab = useCallback((page: PageId) => {
    if (getPageFromSearch(window.location.search) !== page) {
      window.history.pushState(null, '', getPageUrl(window.location.href, page));
    }
    setActiveTabState(page);
  }, []);
  
  return (
    <TradingProvider>
      <AppInner 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        sidebarOpen={sidebarOpen} 
        setSidebarOpen={setSidebarOpen} 
      />
    </TradingProvider>
  );
}

type AppInnerProps = {
  activeTab: PageId;
  setActiveTab: (page: PageId) => void;
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const AppInner = ({ activeTab, setActiveTab, sidebarOpen, setSidebarOpen }: AppInnerProps) => {
  const {
    connectionStatus,
    isSaving,
    localSaveStatus,
    phase,
    metrics,
    marketIndices,
    refreshData,
    marketRefreshStatus,
    lastMarketRefreshAt,
    marketRefreshError,
  } = useTrading();
  
  const getMarketStatus = () => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const day = now.getDay();
    
    if (day === 0 || day === 6) return { text: "周末休市", color: "text-slate-500" };
    
    const time = hour * 100 + minute;
    if (time >= 915 && time <= 1130) return { text: "上午交易中", color: "text-green-600 font-bold" };
    if (time >= 1300 && time <= 1500) return { text: "下午交易中", color: "text-green-600 font-bold" };
    if (time >= 900 && time < 915) return { text: "集合竞价", color: "text-orange-500 font-bold" };
    if (time > 1130 && time < 1300) return { text: "午间休市", color: "text-slate-500" };
    
    return { text: "已休市", color: "text-slate-500" };
  };

  const marketInfo = getMarketStatus();

  const phaseTheme = {
    'Climax': 'theme-climax',
    'Startup': 'theme-startup',
    'Ebb': 'theme-ebb',
    'Ice': 'theme-ice',
    'Repair': 'theme-repair',
    'Chaos': 'theme-chaos'
  }[phase] || 'theme-chaos';

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'themes': return <Themes />;
      case 'pool': return <DragonPool />;
      case 'funds': return <FundRadar />;
      case 'trading': return <Trading />;
      case 'review': return <Review />;
      default: return <Dashboard />;
    }
  };

  const navItems: Array<{
    id: PageId;
    label: string;
    shortLabel: string;
    mobileTitle: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'dashboard', label: '市场情绪监测', shortLabel: '监测', mobileTitle: '市场监测', icon: LayoutDashboard },
    { id: 'themes', label: '板块共振确认', shortLabel: '板块', mobileTitle: '板块共振', icon: Target },
    { id: 'pool', label: '龙头核心池', shortLabel: '龙头', mobileTitle: '龙头池', icon: Flame },
    { id: 'funds', label: '热门基金雷达', shortLabel: '基金', mobileTitle: '基金雷达', icon: PieChart },
    { id: 'trading', label: '实战交易决策', shortLabel: '交易', mobileTitle: '交易决策', icon: Calculator },
    { id: 'review', label: '数据复盘归纳', shortLabel: '复盘', mobileTitle: '复盘归纳', icon: BookOpen },
  ];

  const activeNavItem = navItems.find(item => item.id === activeTab) || navItems[0];
  const cloudMeta = isSaving
    ? { label: '云端备份中', detail: '本机已保存，正在备份到云端', color: 'text-blue-600', dot: 'bg-blue-500', Icon: Loader, spinning: true }
    : connectionStatus === 'connected'
      ? { label: '云端已备份', detail: '本机数据已完成云端备份', color: 'text-green-600', dot: 'bg-green-500', Icon: Cloud, spinning: false }
      : connectionStatus === 'connecting'
        ? { label: '云端连接中', detail: '本机数据可用，正在连接云端备份', color: 'text-amber-600', dot: 'bg-amber-500', Icon: Loader, spinning: true }
        : { label: '仅本机保存', detail: '云端备份不可用，本机数据仍可正常使用', color: 'text-amber-700', dot: 'bg-amber-500', Icon: CloudOff, spinning: false };
  const marketHealth = deriveMarketHealth({
    refreshStatus: marketRefreshStatus,
    indexCount: marketIndices.length,
    breadthStatus: metrics.marketDataStatus,
    coverage: metrics.marketDataCoverage,
  });
  const marketHealthStyle = {
    green: { color: 'text-green-700', dot: 'bg-green-500', Icon: CircleCheck },
    amber: { color: 'text-amber-700', dot: 'bg-amber-500', Icon: CircleAlert },
    red: { color: 'text-red-700', dot: 'bg-red-500', Icon: CircleAlert },
    blue: { color: 'text-blue-700', dot: 'bg-blue-500', Icon: Loader },
  }[marketHealth.tone];
  const refreshTimeLabel = lastMarketRefreshAt
    ? new Date(lastMarketRefreshAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '尚未成功更新';
  const localSaveMeta = localSaveStatus === 'saving'
    ? { label: '保存中', detail: '正在写入当前浏览器', color: 'text-blue-700', Icon: Loader, spinning: true }
    : localSaveStatus === 'error'
      ? { label: '保存失败', detail: '浏览器存储空间不足或不可用', color: 'text-red-700', Icon: CircleAlert, spinning: false }
      : { label: '已保存', detail: '策略、自选与持仓保存在当前浏览器', color: 'text-green-700', Icon: HardDrive, spinning: false };

  const NavItem = ({ id, label, icon: Icon }: { id: PageId, label: string, icon: any }) => (
    <button
      onClick={() => { setActiveTab(id); setSidebarOpen(false); }}
      aria-current={activeTab === id ? 'page' : undefined}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
        activeTab === id 
          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/15'
          : 'hover:bg-muted text-muted-foreground hover:text-foreground'
      }`}
    >
      <div className="flex items-center space-x-3">
        <Icon className={`w-5 h-5 transition-transform duration-300 ${activeTab === id ? 'rotate-0' : 'group-hover:scale-105'}`} />
        <span className="font-medium text-sm">{label}</span>
      </div>
      {activeTab === id && (
        <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground animate-pulse" />
      )}
    </button>
  );

  return (
    <div className={`h-screen flex text-slate-900 font-sans overflow-hidden transition-colors duration-1000 ${phaseTheme} bg-slate-50`}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-slate-950 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        跳到主要内容
      </a>
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Desktop Only */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 shadow-xl transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-16 lg:h-20 flex items-center px-6 lg:px-8 border-b border-slate-100 shrink-0">
          <div className="p-2 bg-red-600 rounded-lg mr-3 shadow-lg shadow-red-600/10">
            <Flame className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
          </div>
          <div>
            <h1 className="font-black text-base lg:text-lg tracking-tight leading-none text-slate-900 uppercase italic">Dragon Quant</h1>
            <div className="text-[9px] lg:text-[10px] uppercase font-black text-slate-400 mt-1 tracking-widest opacity-70">交易引擎 V2.0</div>
          </div>
          <button 
            className="ml-auto lg:hidden text-slate-400 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-lg"
            onClick={() => setSidebarOpen(false)}
            aria-label="关闭导航菜单"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <nav className="flex-1 p-4 lg:p-6 space-y-3 lg:space-y-4 overflow-y-auto no-scrollbar">
          <div>
            <div className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
              博弈全流程 (Workflow)
            </div>
            <div className="space-y-1.5">
              {navItems.map(item => (
                <React.Fragment key={item.id}>
                  <NavItem id={item.id} label={item.label} icon={item.icon} />
                </React.Fragment>
              ))}
            </div>
          </div>
        </nav>

        <div className="p-6 lg:p-8 mt-auto shrink-0 hidden lg:block">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
                <div className={cn("w-2 h-2 rounded-full", cloudMeta.dot)} />
                <span className={cn("text-[10px] font-black tracking-wider", cloudMeta.color)}>{cloudMeta.label}</span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
              {cloudMeta.detail}
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 h-screen overflow-hidden pb-16 lg:pb-0">
        <header className="h-16 lg:h-20 border-b border-slate-200/80 flex items-center justify-between px-3 sm:px-4 lg:px-8 bg-white/95 sticky top-0 z-30 shadow-sm shadow-slate-200/20">
          <div className="flex items-center gap-3 lg:gap-4">
            <button
              className="lg:hidden text-slate-900 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              onClick={() => setSidebarOpen(true)}
              aria-label="打开导航菜单"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <span className="text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5 flex items-center gap-2">
                <span>战术中心</span>
                {metrics.divergenceIndex !== undefined && (
                  <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1 font-mono border-none bg-slate-100", 
                    Math.abs(metrics.divergenceIndex) > 5 ? "text-red-600 bg-red-50" : "text-slate-500")}>
                    背离: {metrics.divergenceIndex}
                  </Badge>
                )}
              </span>
              <h2 className="text-sm lg:text-lg font-black text-slate-900 tracking-tight">
                <span className="hidden sm:inline">{activeNavItem.label}</span>
                <span className="sm:hidden">{activeNavItem.mobileTitle}</span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-4">
            {/* Market Status */}
             <div className={`hidden md:flex items-center text-[10px] border px-2.5 py-1.5 rounded-full ${marketInfo.color} border-current bg-white font-bold`}>
                 <div className="w-2 h-2 rounded-full bg-current mr-2" />
                 {marketInfo.text}
             </div>

            <details className="group relative">
                <summary
                  className={cn(
                    "flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-current bg-white px-2 py-1.5 text-[10px] font-bold transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 [&::-webkit-details-marker]:hidden",
                    marketHealthStyle.color,
                  )}
                  aria-label={`数据状态：${marketHealth.label}`}
                  title={`${marketHealth.detail}，点击查看数据状态`}
                >
                  <marketHealthStyle.Icon className={cn("w-3.5 h-3.5", marketRefreshStatus === 'refreshing' && "animate-spin")} />
                  <span className="hidden sm:inline">{marketHealth.label}</span>
                </summary>
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl">
                <div className="border-b border-slate-100 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-black text-slate-900">数据健康</div>
                      <div className="mt-0.5 text-[10px] text-slate-400">各数据源独立显示，避免混淆</div>
                    </div>
                    <Badge variant="outline" className={cn("text-[9px] border-current", marketHealthStyle.color)}>
                      {marketHealth.label}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1 p-2">
                  <div className="flex items-start gap-3 rounded-xl px-3 py-2.5">
                    <localSaveMeta.Icon className={cn("mt-0.5 size-4", localSaveMeta.color, localSaveMeta.spinning && "animate-spin")} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-slate-800">本机保存</div>
                      <div className="text-[10px] text-slate-500">{localSaveMeta.detail}</div>
                    </div>
                    <span className={cn("text-[10px] font-bold", localSaveMeta.color)}>{localSaveMeta.label}</span>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl px-3 py-2.5">
                    <cloudMeta.Icon className={cn("mt-0.5 size-4", cloudMeta.color, cloudMeta.spinning && "animate-spin")} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-slate-800">云端备份</div>
                      <div className="text-[10px] text-slate-500">{cloudMeta.detail}</div>
                    </div>
                    <span className={cn("text-[10px] font-bold", cloudMeta.color)}>{cloudMeta.label.replace('云端', '')}</span>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                    <Database className={cn("mt-0.5 size-4", marketHealthStyle.color)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-slate-800">行情数据</div>
                      <div className="text-[10px] text-slate-500">{marketHealth.detail}</div>
                      <div className="mt-1 text-[9px] text-slate-400">
                        最近更新：{refreshTimeLabel}
                        {typeof metrics.marketDataCoverage === 'number' && ` · 宽度覆盖 ${(metrics.marketDataCoverage * 100).toFixed(0)}%`}
                      </div>
                      {marketRefreshError && (
                        <div className="mt-1 truncate text-[9px] text-red-600" title={marketRefreshError}>更新失败：{marketRefreshError}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="border-t border-slate-100 p-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refreshData()}
                    disabled={marketRefreshStatus === 'refreshing'}
                    className="h-8 w-full gap-1.5 text-xs"
                  >
                    <RefreshCw className={cn("size-3.5", marketRefreshStatus === 'refreshing' && "animate-spin")} />
                    {marketRefreshStatus === 'refreshing' ? '正在获取行情' : '重新获取行情'}
                  </Button>
                </div>
              </div>
            </details>
            
            {/* User Profile */}
            <div className="hidden xl:flex items-center gap-3 pl-4 border-l border-slate-200">
                 <div className="text-right">
                     <div className="text-xs font-black text-slate-900 uppercase tracking-widest">Quant-X 终端</div>
                     <div className="text-[10px] text-red-600 font-black uppercase tracking-tighter">战略账户</div>
                 </div>
                 <div className="relative">
                    <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl bg-slate-900 flex items-center justify-center text-white font-black text-xs lg:text-sm border border-slate-800 shadow-sm">
                      QX
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 lg:-bottom-1 lg:-right-1 w-3 h-3 lg:w-4 lg:h-4 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                        <div className="w-1 h-1 lg:w-1.5 lg:h-1.5 rounded-full bg-white animate-pulse" />
                    </div>
                 </div>
            </div>
          </div>
        </header>

        <div id="main-content" className="flex-1 overflow-y-auto no-scrollbar" tabIndex={-1}>
          <Suspense fallback={
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin w-6 h-6 border-2 border-slate-300 border-t-red-600 rounded-full" />
            </div>
          }>
            {renderContent()}
          </Suspense>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-2xl">
          <div className="grid grid-cols-6 h-16">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  onMouseDown={event => event.preventDefault()}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    "relative min-w-0 flex flex-col items-center justify-center gap-1 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500",
                    isActive ? "text-red-600" : "text-slate-400"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[9px] font-black uppercase tracking-wider">
                    {item.shortLabel}
                  </span>
                  {isActive && (
                    <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full bg-red-600" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </main>
      <Toaster />
      <BlackSwanOverlay />
    </div>
  );
};
