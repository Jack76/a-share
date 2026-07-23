import React, { useState, lazy, Suspense } from 'react';
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
  Cloud, 
  CloudOff, 
  Loader,
  PieChart
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/sonner';
import { Badge } from './components/ui/badge';
import { cn } from './components/ui/utils';
import { BlackSwanOverlay } from './components/BlackSwanOverlay';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
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

const AppInner = ({ activeTab, setActiveTab, sidebarOpen, setSidebarOpen }: any) => {
  const { connectionStatus, isSaving, phase, metrics } = useTrading();
  
  const getMarketStatus = () => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const day = now.getDay();
    
    if (day === 0 || day === 6) return { text: "Weekend", color: "text-slate-500" };
    
    const time = hour * 100 + minute;
    if (time >= 915 && time <= 1130) return { text: "Trading (AM)", color: "text-green-600 animate-pulse font-bold" };
    if (time >= 1300 && time <= 1500) return { text: "Trading (PM)", color: "text-green-600 animate-pulse font-bold" };
    if (time >= 900 && time < 915) return { text: "Pre-Market", color: "text-orange-500 font-bold" };
    if (time > 1130 && time < 1300) return { text: "Lunch Break", color: "text-slate-500" };
    
    return { text: "Closed", color: "text-slate-400" };
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

  const navItems = [
    { id: 'dashboard', label: '市场情绪监测', shortLabel: '监测', icon: LayoutDashboard },
    { id: 'themes', label: '板块共振确认', shortLabel: '板块', icon: Target },
    { id: 'pool', label: '龙头核心池', shortLabel: '龙头', icon: Flame },
    { id: 'funds', label: '热门基金雷达', shortLabel: '基金', icon: PieChart },
    { id: 'trading', label: '实战交易决策', shortLabel: '交易', icon: Calculator },
    { id: 'review', label: '数据复盘归纳', shortLabel: '复盘', icon: BookOpen },
  ];

  const NavItem = ({ id, label, icon: Icon }: { id: string, label: string, icon: any }) => (
    <button
      onClick={() => { setActiveTab(id); setSidebarOpen(false); }}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
        activeTab === id 
          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.01]' 
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
            className="ml-auto lg:hidden text-slate-400 hover:text-slate-900"
            onClick={() => setSidebarOpen(false)}
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
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-black text-slate-900 uppercase tracking-wider">AI 核心已激活</span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
              系统已连接 Supabase Edge Function，实时分析全市场龙虎榜异动。
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 h-screen overflow-hidden pb-16 lg:pb-0">
        <header className="h-14 lg:h-20 border-b border-slate-200/60 flex items-center justify-between px-4 lg:px-8 bg-white/70 backdrop-blur-xl sticky top-0 z-30 shadow-sm shadow-slate-200/20">
          <div className="flex items-center gap-3 lg:gap-4">
            <button className="lg:hidden text-slate-900" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <span className="text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5 flex items-center gap-2">
                <span className="hidden sm:inline">战术指挥中心</span>
                <span className="sm:hidden">TAC</span>
                {metrics.divergenceIndex !== undefined && (
                  <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1 font-mono border-none bg-slate-100", 
                    Math.abs(metrics.divergenceIndex) > 5 ? "text-red-600 bg-red-50" : "text-slate-500")}>
                    背离: {metrics.divergenceIndex}
                  </Badge>
                )}
              </span>
              <h2 className="text-sm lg:text-lg font-black text-slate-900 tracking-tight uppercase italic">
                {activeTab === 'dashboard' && <span className="hidden sm:inline">市场情绪监测</span>}
                {activeTab === 'dashboard' && <span className="sm:hidden">监测</span>}
                {activeTab === 'themes' && <span className="hidden sm:inline">板块共振确认</span>}
                {activeTab === 'themes' && <span className="sm:hidden">板块</span>}
                {activeTab === 'pool' && <span className="hidden sm:inline">龙头核心池</span>}
                {activeTab === 'pool' && <span className="sm:hidden">龙头</span>}
                {activeTab === 'funds' && <span className="hidden sm:inline">热门基金雷达</span>}
                {activeTab === 'funds' && <span className="sm:hidden">基金</span>}
                {activeTab === 'trading' && <span className="hidden sm:inline">实战交易决策</span>}
                {activeTab === 'trading' && <span className="sm:hidden">交易</span>}
                {activeTab === 'review' && <span className="hidden sm:inline">数据复盘归纳</span>}
                {activeTab === 'review' && <span className="sm:hidden">复盘</span>}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 lg:gap-6">
            {/* Market Status */}
             <div className={`hidden md:flex items-center text-xs border px-3 py-1 rounded-full ${marketInfo.color} border-current bg-white font-black uppercase tracking-tight`}>
                 <div className="w-2 h-2 rounded-full bg-current mr-2" />
                 {marketInfo.text}
             </div>

            <div className="hidden xl:flex items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                {isSaving ? (
                    <span className="flex items-center"><Loader className="w-3 h-3 mr-1 animate-spin"/> 保存中</span>
                ) : connectionStatus === 'connected' ? (
                    <span className="flex items-center text-green-600"><Cloud className="w-3 h-3 mr-1"/> 已同步</span>
                ) : connectionStatus === 'connecting' ? (
                    <span className="flex items-center text-yellow-600"><Loader className="w-3 h-3 mr-1 animate-spin"/> 连接中</span>
                ) : (
                    <span className="flex items-center text-red-600"><CloudOff className="w-3 h-3 mr-1"/> 离线</span>
                )}
            </div>
            
            {/* User Profile */}
            <div className="flex items-center gap-2 lg:gap-3 pl-3 lg:pl-6 border-l border-slate-200">
                 <div className="text-right hidden xl:block">
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

        <div className="flex-1 overflow-y-auto no-scrollbar">
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
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 transition-all duration-200",
                    isActive ? "text-red-600" : "text-slate-400"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive && "animate-pulse")} />
                  <span className="text-[9px] font-black uppercase tracking-wider">
                    {item.shortLabel}
                  </span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600" />
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
