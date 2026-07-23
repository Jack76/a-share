# A股短线量化交易系统 - 完整技术归纳总结

**版本**: v38.0  
**核心算法**: 猎杀者 V5.0 + TrapGuard v4.2 + CVD 微观博弈引擎  
**开发时间**: 2026-01-04  
**架构模式**: 前后端分离 + Supabase Edge Functions + KV存储

---

## 一、系统定位与核心价值

### 1.1 定位
基于 Supabase Edge Functions 的 **A股短线量化交易 Web 应用**，专注于捕捉市场情绪转折点，通过主力资金监控与微观结构分析，识别"诱多陷阱"(TRAP)与"黄金坑"(GOLD)机会。

### 1.2 核心价值主张
- **反诱多算法 (TrapGuard)**: 量价背离、尾盘拉升、假突破、高位派发 4 大诱多模式识别
- **主力净流入追踪 (Hunter V5.0)**: 基于主力资金质量 + ATR 动态攻防线的龙头筛选
- **微观博弈视角 (CVD)**: 分时级 Cumulative Volume Delta，实时捕捉买卖盘力量对比
- **预期差模型 (Expectation Gap)**: 对比"竞价应有表现"与"实际开盘表现"，预判主力行为
- **情景化评分系统**: 根据市场阶段 (Startup/Climax/Ebb/Ice/Repair/Chaos) 动态调整评分逻辑

### 1.3 设计哲学
- **严格禁止 Emoji**，全面采用军事化术语 (LOCK/EVAC/FIRE/ALERT)
- **视觉焦点**: 高危信号使用脉冲动画 (`animate-pulse`)，critical 区域用红/橙渐变
- **数据密度优先**: 密集排布关键指标，拒绝冗余装饰

---

## 二、技术架构与技术栈

### 2.1 架构图
```
┌──────────────┐      ┌──────────────────────┐      ┌──────────────┐
│   Frontend   │ <──> │ Supabase Edge Func   │ <──> │  Postgres    │
│   (React)    │      │    Hono Web Server   │      │  KV Store    │
└──────────────┘      └──────────────────────┘      └──────────────┘
       │                       │
       │                       └──> Sina Finance API (Market Data Proxy)
       │                       └──> East Money API (Fund Data)
       │
       └──> Session Storage (CVD 缓存) + Local State (Context API)
```

### 2.2 前端技术栈
| 技术 | 版本 | 用途 |
|------|------|------|
| **React** | 18.3.1 | 前端框架 |
| **Tailwind CSS** | 4.1.12 | 样式系统 (禁止使用 text-2xl/font-bold，统一由 theme.css 控制) |
| **Recharts** | 2.15.2 | 图表库 (主力选择，已解决尺寸 bug) |
| **Motion** | 12.23.24 | 动画引擎 (非 Framer Motion，新版直接 `import { motion }`) |
| **Lucide React** | 0.487.0 | 图标库 (使用前必须 bash 检查 icon 是否存在) |
| **Radix UI** | 多个组件 | 无障碍组件库 (Dialog/Tooltip/Select 等) |
| **Sonner** | 2.0.3 | Toast 通知 |
| **date-fns** | 3.6.0 | 日期处理 |

### 2.3 后端技术栈
| 技术 | 用途 |
|------|------|
| **Supabase Edge Functions** | 无服务器计算 (Deno 环境) |
| **Hono** | 轻量级 Web 框架 (`npm:hono`) |
| **KV Store** | Postgres 键值表 (`kv_store_545d7fd7`) |
| **CORS** | 全域开放，支持跨域请求 |
| **Logger** | 所有请求日志打印到 console.log |

### 2.4 API 端点设计
```
/make-server-545d7fd7/health              GET    健康检查
/make-server-545d7fd7/data                GET    加载所有交易数据 (stocks/themes/metrics/journal)
/make-server-545d7fd7/data                POST   保存交易数据 (支持部分更新)
/make-server-545d7fd7/market/themes       GET    实时热门题材 (Sina Finance Proxy)
/make-server-545d7fd7/market/search       GET    股票代码/名称搜索
/make-server-545d7fd7/market/ticks        GET    分时 Tick 数据 (CVD 计算原料)
```

### 2.5 数据流设计
```
1. 用户打开应用 -> TradingProvider 初始化
2. 从 Supabase 加载持久化数据 (stocks/themes/metrics/journal)
3. 定时刷新 (5s/10s 轮询)：
   - fetchStockData() -> 实时行情 (Sina API)
   - fetchStockHistoryBatch() -> K线历史 (60日)
   - fetchStockTicks() -> 分时成交 (CVD)
4. 本地计算引擎 (前端)：
   - calculateIndicators() -> 技术指标 (MA/MACD/RSI/ATR/MFI/Chip)
   - calculateLimitUpStrength() -> 封板强度
   - analyzeTrapRisk() -> 诱多风险
   - generateAIPrediction() -> AI 预判
5. 更新 Context State -> UI 自动 re-render
6. 用户操作 (添加/删除股票、更新笔记) -> POST /data 持久化到 KV Store
```

---

## 三、核心算法体系

### 3.1 猎杀者 V5.0 (Hunter V5.0) - 龙头池评分算法

#### 算法理念
**"主力资金净流入"是唯一真相，价格/成交量都可以造假，但资金流向不会说谎。**

#### 评分维度 (calculateQuality)
```typescript
基础分: 50

1. 价格动量 (Fact)
   - 涨停板: +25
   - 涨幅 > 5%: +15
   - 跌幅 < -5%: -15

2. 市场阶段适配 (Context)
   - Climax 期: Leader +15, 其他 -5
   - Ebb 期: 全体 -20, 但 Rebound 信号 +20
   - Startup 期: Potential 且涨幅 > 3%, +10

3. 主力资金 (Truth) - 核心权重
   - 主力净流入 > 1000万: +15
   - 主力净流出 < -1000万: -20
   - 如无主力数据,用 moneyQualityScore (MFI指标代理)

4. 风控 (TrapGuard)
   - trapRiskScore > 60: -30 (一票否决)

5. 技术结构
   - MFI > 85 (超买): -10
   - MFI < 20 (超卖): +10
   - 高换手 (>25%) 且非涨停: -10 (筹码分歧)

最终分数: clamp(0, 100)
```

#### 情景化筛选 (Scenario-based Filtering)
- **Startup** (启动期): 优先"潜力股" (Potential) + 低位放量
- **Climax** (高潮期): 只看 Leader (龙头) + 连板高度
- **Ebb** (退潮期): 寻找"反核"信号 (Rebound) + 超跌反弹

### 3.2 TrapGuard v4.2 - 反诱多监测系统

#### 诱多模式识别 (4 大类型)
```typescript
1. 量价背离 (VolumeDivergence)
   - 触发条件: 价格创新高 && 成交量萎缩 (< 5日均量 0.6倍)
   - 风险级别: High
   - 逻辑: 主力出货完成，散户接盘

2. 尾盘拉升 (LateDayPull)
   - 触发条件: 14:30后拉升 > 3%, 且全天波动 < ATR * 0.5
   - 风险级别: Medium
   - 逻辑: 尾盘偷鸡，做高收盘价，次日低开

3. 假突破 (FakeBreakthrough)
   - 触发条件: 突破 MA20 但收盘价 < MA20 + ATR * 0.3
   - 风险级别: Medium
   - 逻辑: 试探性突破失败，主力诱多出货

4. 高位派发 (Exhaustion)
   - 触发条件: 连续涨停后首次炸板 + 巨量 (> 平均量 3倍)
   - 风险级别: High
   - 逻辑: 高位筹码派发，主力撤退信号
```

#### 风险评分公式 (trapRiskScore)
```typescript
score = 0
for signal in trapSignals:
    if signal.severity == 'High': score += 30
    if signal.severity == 'Medium': score += 15
    if signal.severity == 'Low': score += 5

// 叠加背离指数 (Alpha Divergence)
if alpha < -10: score += 20
if chipPressure > 70: score += 15 // 上方筹码压力

return clamp(0, 100, score)
```

### 3.3 CVD 微观博弈引擎 (Cumulative Volume Delta)

#### 原理
**分时级成交单分解为"主动买入"与"主动卖出", 累计差值形成 CVD 曲线。**

#### 计算逻辑 (MicroStructureCVD.tsx)
```typescript
// 1. 获取 Tick 数据 (fetchStockTicks)
const ticks = await fetch(`/market/ticks?code=${code}`)

// 2. 分类成交单
for tick in ticks:
    if tick.type == '买盘' || tick.price > lastPrice:
        buyVol += tick.volume
        delta += tick.volume
    else:
        sellVol += tick.volume
        delta -= tick.volume
    
    lastCVD += delta
    dataPoints.push({ time, price, cvd: lastCVD, delta })

// 3. 背离检测
if price上涨 && cvd下跌:
    signal = 'TRAP' // 价格上涨但资金撤退
if price下跌 && cvd上涨:
    signal = 'GOLD' // 价格下跌但资金买入
```

#### 可视化设计
- **双轴图表**: 上方显示价格走势 (AreaChart), 下方显示 CVD 累计 (Line)
- **颜色编码**: 
  - CVD 上升 (买盘占优): 绿色 (`stroke-green-500`)
  - CVD 下降 (卖盘占优): 红色 (`stroke-red-500`)
- **实时更新**: Session Storage 缓存, 防止 Dialog 关闭后数据丢失

### 3.4 预期差模型 (Expectation Gap) - v35.0

#### 核心公式
```
预期差 = 实际竞价开盘涨幅 - 理论应有涨幅
```

#### 理论预期计算 (Based on Yesterday)
```typescript
// 场景 1: 昨日涨停
if yesterday.isLimitUp:
    if turnoverRate < 1%:  // 缩量一字板
        expectedOpen = +5.0%
    else if turnoverRate > 15%:  // 烂板/炸板
        expectedOpen = -2.0%
    else:
        expectedOpen = +2.0%

// 场景 2: 昨日大跌
else if yesterday.changePercent < -5%:
    expectedOpen = -3.0%

// 场景 3: 正常波动
else:
    expectedOpen = 0%
```

#### 情景化定性
```typescript
gap = actualOpen - expectedOpen

if gap > +4% && yesterday烂板:
    label = "弱转强" (最强信号)
    score += 10

if gap < -4% && yesterday缩量板:
    label = "强转弱" (最危险信号)
    score -= 10

// 量比验证
if gap > 0 && volumeRatio < 0.5:
    gap /= 2  // 无量高开,打折扣
```

#### 输出示例
```
{
  gap: +6.2,
  reason: "【弱转强】昨日分歧今日抢筹，超预期"
}
```

### 3.5 Alpha 背离指数 (calculateAlphaDivergence)

#### 原理
**对比"价格动能"与"成交量动能", 如果价格创新高但成交量萎缩, 则为负背离 (诱多信号)。**

#### 计算逻辑
```typescript
// 1. 价格动能 (最近10日累计涨幅)
priceChg = (lastClose - close_10_days_ago) / close_10_days_ago

// 2. 成交量动能 (最近10日平均量 / 前30日平均量)
volMomentum = avgVol_10 / avgVol_30

// 3. Alpha = 价格动能 - 成交量动能 (标准化到 -100 ~ +100)
alpha = (priceChg * 100) - (volMomentum - 1) * 50

// 4. 解读
if alpha > 15: "正背离" (量价齐升, 健康上涨)
if alpha < -15: "负背离" (量缩价涨, 诱多风险)
```

#### 应用场景
- **TimeSharingDivergence 组件**: 可视化 120 日价格与情绪背离
- **TrapGuard 组件**: 负背离时 trapRiskScore += 20
- **AI Prediction**: 结合 alpha 判断"暴力洗盘"还是"杀猪盘"

---

## 四、核心功能模块

### 4.1 导航结构 (6大板块)
```
1. Dashboard  - 战情总览 (Market Radar, Sentiment Stream, Trap Alerts)
2. Themes     - 题材监控 (实时热门概念, 板块轮动)
3. Dragon Pool - 龙头池 (Hunter V5.0 算法, 主力资金筛选)
4. Fund Radar - 基金追踪 (ETF/场外基金净值监控)
5. Trading    - 实战交易 (仓位管理, 止盈止损设置)
6. Review     - 复盘日记 (每日情绪 Phase 记录, 策略总结)
```

### 4.2 Dragon Pool (龙头池) - 核心模块

#### 功能清单
- **智能扫描**: 一键扫描预设核心标的 (CORE_SAMPLES 25 只)
- **实时刷新**: 5 秒自动刷新 (市场开盘期)
- **多维排序**: 
  - Quality (质量评分)
  - Prediction (AI 预判趋势)
  - Trap (诱多风险)
  - ChangePercent (涨幅)
  - MainForceInflow (主力净流入)
- **多重筛选**:
  - 角色筛选: Leader/Vice/Potential/Substitute
  - 状态筛选: Watch/Hold/Sold
  - 信号筛选: Accelerate/Rebound/Divergence/Top
  - 概念筛选: 低空经济/CPO/固态电池/人形机器人...
- **深度诊断 (StockDiagnosisDialog)**:
  - 分时 CVD 微观结构
  - 量价背离趋势图
  - L2 盘口压力 (委买/委卖)
  - 筹码分布图 (Chip Distribution)
  - AI 战术建议 (买点/卖点/持仓策略)

#### 关键组件
```typescript
<DragonPool>
  ├─ StockTableRow (性能优化: React.memo)
  │  └─ Sparkline (7日价格迷你图)
  │
  ├─ StockDiagnosisDialog
  │  ├─ MicroStructureCVD (Tick级CVD曲线)
  │  ├─ TimeSharingDivergence (120日背离图)
  │  ├─ L2PressureGauge (五档盘口)
  │  ├─ ChipsDistribution (筹码分布)
  │  └─ AuctionInsight (竞价数据)
  │
  └─ DragonLineage (龙头谱系图, 未实现)
```

### 4.3 Dashboard (战情总览)

#### 布局设计 (响应式 Grid)
```
┌─────────────────────────────────────────────────┐
│ MarketTicker (顶部固定)                         │
│ WarRoomTicker (滚动警报)                        │
├─────────────────────────────────────────────────┤
│ WarRoomMatrix (2x2 核心指标矩阵)                │
├─────────────┬───────────────────────────────────┤
│ Sentiment   │ TrapGuard Alerts                  │
│ Evolution   │ (诱多监测)                        │
│ Stream      │                                   │
├─────────────┼───────────────────────────────────┤
│ Market Radar│ Resonance Monitor                 │
│ (情绪雷达)  │ (板块共振)                        │
├─────────────┴───────────────────────────────────┤
│ Dragon Scanner (龙头扫描器)                     │
├─────────────────────────────────────────────────┤
│ Limit Ladder (涨停阶梯)                         │
└─────────────────────────────────────────────────┘
```

#### 关键组件说明
- **WarRoomMatrix**: 2x2 网格显示 4 个核心指标
  - 市场温度 (Market Temp): 0-100, > 75 过热, < 25 冰封
  - 涨停家数 (Limit Up Count): 实时统计
  - 市场阶段 (Phase): Startup/Climax/Ebb/Chaos/Ice/Repair
  - 风险对冲因子 (Hedge Factor): 0-100, 越高越危险

- **SentimentEvolutionStream**: 实时情绪流 (折线图)
  - Y轴: 情绪分数 (0-100)
  - X轴: 时间 (最近 30 个数据点)
  - 颜色: 绿色 (乐观) / 橙色 (谨慎) / 红色 (恐慌)

- **TrapGuardAlerts**: 实时诱多警报列表
  - 显示 trapRiskScore > 60 的股票
  - 展示具体诱多模式 (VolumeDivergence/LateDayPull...)
  - 风险进度条 (红色脉冲动画)

- **MarketRadar**: 雷达图 (6 维度)
  - 情绪热度 (Sentiment)
  - 涨停家数 (Limit Up)
  - 连板高度 (Height)
  - 成交量 (Volume)
  - 板块集中度 (Concentration)
  - 主力活跃度 (Main Force)

- **LimitLadder**: 涨停阶梯可视化
  - 横轴: 连板高度 (1板/2板/3板...)
  - 纵轴: 股票数量
  - 交互: 点击柱状图展开该高度的所有股票

### 4.4 Themes (题材监控)

#### 数据源
- **实时题材**: Sina Finance API (通过 Supabase Edge Function 代理)
- **预设题材**: PRESET_THEMES (15 个核心赛道)
  - 大金融, 低空经济, 高位妖股, CPO, AI算力, 先进封装, 人形机器人, 固态电池, 半导体设备, 量子科技, 商业航天, 算力租赁, 数据要素, 合成生物, 鸿蒙生态

#### 功能
- **题材强度排序**: 按涨停家数 (stockCount) 降序
- **一键导入**: 点击题材卡片一键添加所有标的到龙头池
- **板块联动**: 显示板块领涨股 (leaderName)
- **热度可视化**: Badge 颜色编码 (红色=热门, 蓝色=次要)

### 4.5 Trading (实战交易)

#### 功能清单
- **持仓展示**: 过滤 status === 'Hold' 的股票
- **盈亏计算**: (currentPrice - costPrice) / costPrice * 100
- **止盈止损**:
  - 动态移动止损 (Trailing Stop): 基于 ATR 自动计算
  - 手动设置止损价 (trailingStopPrice)
  - 目标价设置 (profitTarget)
- **仓位建议 (PositionAdvisor)**:
  - 基于 AI Prediction 的 positionAdvice
  - 清仓走人 / 底仓试错 / 重仓出击 / 锁仓不动
- **战术建议 (TacticalAdvisory)**:
  - 买点: "打板/均线吸/五日线低吸"
  - 卖点: "现价/反抽即走"
  - 持仓策略: "不破不卖/止盈减半"

### 4.6 Review (复盘日记)

#### 功能
- **每日情绪记录**: 自动保存 phaseHistory (最近 30 天)
- **三要素**:
  - What Went Right (今日成功操作)
  - What Went Wrong (今日失误)
  - Strategy (明日策略)
- **情绪时间线 (SentimentCycleTimeline)**:
  - 横轴: 日期
  - 纵轴: Phase (Startup -> Climax -> Ebb -> Chaos)
  - 可视化: 折线图 + 渐变填充

---

## 五、UI/UX 设计规范

### 5.1 设计原则
- **无 Emoji**: 全面禁止, 使用军事化术语替代
- **高对比度**: 深色背景 (slate-900) + 白色文字, 或白色背景 + 深色文字
- **脉冲动画**: 高危信号使用 `animate-pulse` (如 trapRiskScore > 75)
- **渐变强调**: 红/橙/绿渐变表达风险等级 (bg-gradient-to-r from-red-500 to-orange-500)
- **军事化术语**:
  - LOCK (锁定)
  - EVAC (撤离)
  - FIRE (开火/买入)
  - ALERT (警报)
  - CONFIRM (确认)
  - STANDBY (待命)

### 5.2 颜色语义
```typescript
// 风险等级
High Risk    -> text-red-600 bg-red-50 border-red-200
Medium Risk  -> text-orange-600 bg-orange-50 border-orange-200
Low Risk     -> text-green-600 bg-green-50 border-green-200

// 市场阶段 (Phase Theme)
Climax  -> theme-climax (红色/热烈)
Startup -> theme-startup (绿色/活力)
Ebb     -> theme-ebb (橙色/谨慎)
Ice     -> theme-ice (蓝色/冰封)
Repair  -> theme-repair (紫色/修复)
Chaos   -> theme-chaos (灰色/混沌)
```

### 5.3 字体系统
- **标题**: font-black (900) uppercase tracking-widest
- **正文**: font-medium (500)
- **数据**: font-mono (等宽字体, 用于价格/代码)
- **强调**: text-[10px] (极小字号) + uppercase + tracking-[0.2em] (超宽字距)

### 5.4 布局规范
- **卡片圆角**: rounded-3xl (大圆角, 现代感)
- **阴影**: shadow-xl shadow-slate-200/40 (轻量柔和)
- **间距**: space-y-16 (纵向超大间距, 避免拥挤)
- **响应式**: grid grid-cols-1 xl:grid-cols-2 (移动优先)

### 5.5 Tailwind 禁用规则
**重要**: 禁止使用以下 Tailwind class, 由 `/src/styles/theme.css` 统一控制:
- `text-2xl`, `text-lg`, `text-sm` (字号)
- `font-bold`, `font-semibold` (字重)
- `leading-none`, `leading-tight` (行高)

---

## 六、数据模型与状态管理

### 6.1 核心数据结构

#### Stock (个股)
```typescript
interface Stock {
  // 基础信息
  id: string;
  code: string;           // 股票代码 (sh600519)
  name: string;           // 股票名称 (贵州茅台)
  concept?: string;       // 题材概念 (白酒/消费)
  role: 'Leader' | 'Vice' | 'Substitute' | 'Potential' | 'Main' | 'Follower';
  status: 'Watch' | 'Hold' | 'Sold';
  
  // 实时行情
  currentPrice?: number;
  changePercent?: number;
  isLimitUp?: boolean;
  consecutiveLimitUps?: number;  // 连板数
  volume?: number;
  turnoverRate?: number;
  mainForceInflow?: number;      // 主力净流入 (单位: 百万)
  
  // 技术指标 (calculateIndicators)
  technicals?: {
    ma5/ma10/ma20/ma60/ma120/ma250: number;
    atr: number;                  // 平均真实波动率
    avgVol5: number;              // 5日均量
    rsi?: { rsi6, rsi12, rsi24 };
    mfi?: number;                 // 资金流量指数
    chipPressure?: number;        // 筹码压力 (0-100)
  };
  
  // 评分系统
  strengthScore?: number;         // 封板强度 (0-100)
  resonanceScore?: number;        // 板块共振 (0-100)
  independenceScore?: number;     // 独立性 (0-100)
  trapRiskScore?: number;         // 诱多风险 (0-100)
  premiumExpectation?: number;    // 次日溢价预期 (%)
  moneyQualityScore?: number;     // 资金质量 (0-100)
  
  // AI 预判
  aiPrediction?: {
    trend: 'Accelerate' | 'Divergence' | 'Top' | 'Rebound' | 'Neutral';
    summary: string;
    strategy: string;
    positionAdvice?: string;
    buyPoint?: string;
    sellPoint?: string;
  };
  
  // 诱多信号
  trapSignals?: Array<{
    type: 'VolumeDivergence' | 'LateDayPull' | 'FakeBreakthrough' | 'Exhaustion';
    severity: 'Low' | 'Medium' | 'High';
    description: string;
  }>;
  
  // 竞价数据 (v4.0)
  auctionData?: {
    openGap: number;              // 开盘涨幅
    auctionVolume: number;        // 竞价成交量
    volumeRatio: number;          // 竞价量比
    strength: number;             // 竞价强度 (0-100)
  };
  
  // 仓位管理
  costPrice?: number;
  buyDate?: string;
  trailingStopPrice?: number;
  profitTarget?: number;
}
```

#### Theme (题材)
```typescript
interface Theme {
  id: string;
  name: string;                   // 题材名称 (低空经济)
  type: 'Main' | 'Vice';          // 主线/副线
  logic: string;                  // 逻辑描述
  strength?: number;              // 板块热度 (0-100)
  stockCount?: number;            // 涨停家数
  leaderName?: string;            // 板块领涨股
}
```

#### DailyMetrics (市场指标)
```typescript
interface DailyMetrics {
  // 基础指标
  limitUpCount: number;           // 涨停家数
  limitDownCount: number;         // 跌停家数
  height: number;                 // 连板高度
  spaceHeight: number;            // 市场最高连板
  
  // 情绪指标
  marketTemp?: number;            // 市场温度 (0-100)
  marketEntropy?: number;         // 市场熵值 (0-100)
  leaderSurvivalProb?: number;    // 龙头生存概率
  
  // 风控指标
  hedgeFactor?: number;           // 风险对冲因子 (0-100)
  volatilityIndex?: number;       // 波动率指数
  divergenceIndex?: number;       // 指数与情绪背离
  inflectionSignal?: 'None' | 'Bottom' | 'Peak';  // 拐点信号
  
  // 布尔判断
  leaderStrong: boolean;          // 龙头是否强势
  clearTheme: boolean;            // 是否有明确题材
  volumeHigh: boolean;            // 成交量是否放大
  leaderBreak: boolean;           // 龙头是否破位
  heightDrop: boolean;            // 连板高度是否下降
  fakeStrength?: boolean;         // 指数虚假繁荣
}
```

#### MarketPhase (市场阶段)
```typescript
type MarketPhase = 
  | 'Startup'   // 启动期 (情绪回暖, 连板出现)
  | 'Climax'    // 高潮期 (情绪高涨, 高度板)
  | 'Ebb'       // 退潮期 (情绪回落, 高度回撤)
  | 'Chaos'     // 混沌期 (无主线, 散乱)
  | 'Ice'       // 冰封期 (恐慌, 跌停潮)
  | 'Repair';   // 修复期 (触底反弹前夕)
```

### 6.2 状态管理 (Context API)

#### TradingContext 结构
```typescript
const TradingContext = createContext<{
  // 核心数据
  stocks: Stock[];
  themes: Theme[];
  metrics: DailyMetrics;
  marketIndices: MarketIndex[];
  phase: MarketPhase;
  phaseHistory: PhaseRecord[];
  sentimentHistory: SentimentPoint[];
  marketEvents: MarketEvent[];
  journal: JournalEntry;
  
  // 状态标志
  isMarketOpen: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  isSaving: boolean;
  
  // 方法
  addStock: (stock: Stock) => void;
  addStocks: (stocks: Stock[]) => void;
  updateStock: (id: string, updates: Partial<Stock>) => void;
  updateStocks: (updates: Array<{ id, changes }>) => void;
  removeStock: (id: string) => void;
  addTheme: (theme: Theme) => void;
  removeTheme: (id: string) => void;
  setMetrics: (metrics: DailyMetrics) => void;
  setJournal: (entry: JournalEntry) => void;
  refreshData: () => Promise<void>;
  forceRefreshHistory: () => void;
}>();
```

#### 数据持久化策略
```typescript
// 1. Supabase KV Store (持久化)
- stocks       -> kv.set('trading:stocks', stocks)
- themes       -> kv.set('trading:themes', themes)
- metrics      -> kv.set('trading:metrics', metrics)
- journal      -> kv.set('trading:journal', journal)

// 2. Session Storage (临时缓存)
- CVD 数据     -> sessionStorage.setItem(`cvd_v1_${code}`, data)
- 历史 K线     -> stockHistoryCache.current[code]

// 3. Memory (运行时)
- sentimentHistory (情绪流)
- phaseHistory (阶段历史)
- marketEvents (市场事件)
```

---

## 七、外部 API 集成

### 7.1 Sina Finance API (新浪财经)

#### 用途
实时行情、分时 Tick、历史 K线

#### 代理策略
**所有请求必须通过 Supabase Edge Function 代理, 避免 CORS 问题。**

#### 主要端点
```bash
# 实时行情 (单个)
https://hq.sinajs.cn/list=sh600519

# 历史 K线 (日线)
https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData
?symbol=sh600519&scale=240&datalen=60

# 分时 Tick
https://vip.stock.finance.sina.com.cn/quotes_service/view/vML_DataList.php
?astock=sh600519&symbol=sh600519
```

#### 数据解析
```javascript
// 实时行情 (以 sh600519 为例)
const raw = "var hq_str_sh600519=\"贵州茅台,1650.00,1660.00,...\""
const fields = raw.split(',')
const stock = {
  name: fields[0],
  open: parseFloat(fields[1]),
  prevClose: parseFloat(fields[2]),
  currentPrice: parseFloat(fields[3]),
  high: parseFloat(fields[4]),
  low: parseFloat(fields[5]),
  volume: parseFloat(fields[8]),
  turnover: parseFloat(fields[9]),
  // ...
}
```

### 7.2 East Money API (东方财富)

#### 用途
基金数据、主力资金流向

#### 端点
```bash
# 基金估值 (场外)
https://fundmobapi.eastmoney.com/FundMApi/FundVarietieValuationDetail.ashx?FCODE=001186

# 主力资金流向 (Level-2 数据)
http://push2.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=1.600519
```

---

## 八、性能优化策略

### 8.1 前端优化
```typescript
// 1. React.memo (避免不必要的 re-render)
export const StockTableRow = React.memo<Props>(({ stock, ... }) => {
  // ...
});

// 2. useMemo (缓存计算结果)
const sortedStocks = useMemo(() => {
  return stocks.sort(...).filter(...)
}, [stocks, sortConfig, filterText]);

// 3. useRef (缓存不变值)
const stocksRef = useRef(stocks);
const stockHistoryCache = useRef<Record<string, any>>({});

// 4. 分页/虚拟滚动 (大数据列表)
// TODO: 当龙头池 > 100 只时,使用 react-window 虚拟化

// 5. Debounce/Throttle (防抖/节流)
const debouncedSearch = useMemo(() => debounce(handleSearch, 300), []);
```

### 8.2 后端优化
```typescript
// 1. 请求去重 (In-flight Deduplication)
const inFlightRequests = new Map<string, Promise<any>>();
if (inFlightRequests.has(key)) {
  return inFlightRequests.get(key);
}

// 2. 缓存 (3秒TTL)
const stockDataCache = new Map<string, { data, timestamp }>();
if (cache.has(code) && Date.now() - cache.get(code).timestamp < 3000) {
  return cache.get(code).data;
}

// 3. 批量请求 (Batch Fetching)
const codes = ['sh600519', 'sh600036', ...];
const results = await Promise.all(codes.map(c => fetchStockData(c)));

// 4. 重试策略 (Retry with Exponential Backoff)
const fetchWithRetry = async (url, options, retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetch(url, options);
    } catch (e) {
      if (i < retries) {
        await sleep(1000 * (i + 1));
      }
    }
  }
};
```

### 8.3 渲染优化
```typescript
// 1. 避免 Layout Thrashing (批量 DOM 操作)
// ❌ 不好
stocks.forEach(s => {
  document.getElementById(s.id).style.color = 'red';
});

// ✅ 好 (使用 React State)
setStocks(stocks.map(s => ({ ...s, highlight: true })));

// 2. CSS 动画优化 (使用 transform/opacity, 避免 width/height)
// ❌ 不好
.pulse { animation: pulse 1s; }
@keyframes pulse { 0% { width: 0; } 100% { width: 100px; } }

// ✅ 好
.pulse { animation: pulse 1s; }
@keyframes pulse { 0% { transform: scale(1); } 100% { transform: scale(1.05); } }

// 3. 避免频繁 re-render (使用 React DevTools Profiler 检测)
```

---

## 九、已知问题与技术债

### 9.1 已修复
- ✅ Recharts 图表尺寸错误 (ResponsiveContainer 必须有明确高度)
- ✅ JSX 语法错误 (MicroStructureCVD / TimeSharingDivergence)
- ✅ Lucide Icon 导入失败 (未验证 icon 名称是否存在)
- ✅ DragonPool 评分算法逻辑漏洞 (Ebb 期全体 -20 过于严格)

### 9.2 待优化
- ⚠️ **历史数据加载慢**: 60 日 K线批量请求耗时 > 5s (考虑 WebSocket 推送)
- ⚠️ **Tick 数据丢失**: Sina API 分时数据有时返回空 (需要 fallback 策略)
- ⚠️ **主力资金数据缺失**: 大部分股票没有 mainForceInflow 字段 (依赖 East Money Level-2, 需付费)
- ⚠️ **CVD 计算精度**: Tick 分类逻辑简化 (理想方案需要逐笔委托数据)
- ⚠️ **移动端体验**: 当前布局以桌面为主, 移动端卡片过大 (需要 responsive 重构)

### 9.3 功能缺失
- ❌ **回测系统**: 未实现历史数据回测 (无法验证算法准确率)
- ❌ **实时推送**: 当前为轮询模式, 延迟 5-10s (理想方案: WebSocket)
- ❌ **龙头谱系图 (DragonLineage)**: UI 已创建但逻辑未实现
- ❌ **仓位管理**: 只有基础计算, 缺少"止盈止损触发自动通知"
- ❌ **多账户支持**: 当前为单用户单账户, 无法管理多个账户

---

## 十、未来规划与迭代方向

### 10.1 v39.0 规划 (短期)
- **WebSocket 实时推送**: 替代轮询, 降低延迟到 < 1s
- **主力资金 Level-2 数据**: 接入 East Money API (需付费), 获取真实主力流向
- **移动端优化**: 响应式重构, 卡片尺寸自适应, 侧边栏改为 Drawer

### 10.2 v40.0 规划 (中期)
- **回测引擎**: 基于历史数据验证算法准确率, 生成"胜率/盈亏比"报告
- **机器学习模型**: 基于 Tensorflow.js, 训练"涨停次日溢价预测模型"
- **多账户支持**: Supabase Auth + 用户表, 支持多用户隔离

### 10.3 v41.0+ 规划 (长期)
- **情绪指数产品化**: 将"市场温度/熵值/拐点信号"打包为独立 API, 对外输出
- **自动交易接口**: 对接券商 API (如华泰/中信), 实现"策略信号自动下单"
- **社区功能**: 用户分享龙头池/复盘日记, 形成量化社区

---

## 十一、开发者指南

### 11.1 快速上手
```bash
# 1. 克隆项目 (假设项目已在 Figma Make)
cd /path/to/project

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 访问应用
http://localhost:5173
```

### 11.2 核心文件索引
```
/src/app/
  ├─ App.tsx                      # 主入口, 导航路由
  ├─ context/Store.tsx            # Context API, 全局状态管理
  ├─ types.ts                     # TypeScript 类型定义
  ├─ utils/
  │  ├─ indicators.ts             # 技术指标计算引擎
  │  └─ scoring.ts                # 评分算法 (Hunter/TrapGuard/AI)
  ├─ services/
  │  └─ marketData.ts             # API 请求封装 (Sina/East Money)
  ├─ data/
  │  └─ presetStocks.ts           # 预设题材与核心标的
  └─ components/
     ├─ pages/
     │  ├─ Dashboard.tsx          # 战情总览
     │  ├─ DragonPool.tsx         # 龙头池
     │  ├─ StockTableRow.tsx      # 个股行组件
     │  └─ StockDiagnosisDialog.tsx # 深度诊断弹窗
     ├─ TrapGuard.tsx             # 诱多监测卡片
     ├─ MicroStructureCVD.tsx     # CVD 微观结构图表
     ├─ TimeSharingDivergence.tsx # 量价背离趋势图
     ├─ MarketRadar.tsx           # 市场雷达图
     └─ ...                       # 其他 40+ 组件

/supabase/functions/server/
  ├─ index.tsx                    # Hono Web Server 入口
  └─ kv_store.tsx                 # KV Store 工具函数 (禁止修改)

/src/styles/
  ├─ theme.css                    # 主题配置 (字号/字重/行高)
  └─ tailwind.css                 # Tailwind 全局样式
```

### 11.3 开发规范
1. **禁止 Emoji**: 代码/UI 中不得出现任何 Emoji
2. **类型安全**: 所有组件必须使用 TypeScript, 严格检查类型
3. **命名规范**:
   - 组件: PascalCase (DragonPool, TrapGuard)
   - 函数: camelCase (calculateQuality, fetchStockData)
   - 常量: UPPER_SNAKE_CASE (CORE_SAMPLES, PRESET_THEMES)
4. **注释规范**:
   ```typescript
   /**
    * 计算预期差 (Expectation Gap) - v35.0
    * @param stock 股票对象
    * @param marketTemp 市场温度
    * @returns { gap: number, reason: string }
    */
   export const calculateExpectationGap = (stock: Stock, marketTemp: number) => {
     // ...
   }
   ```
5. **Git Commit 规范**:
   ```
   feat: 新增龙头池情景化评分算法 (Hunter V5.0)
   fix: 修复 Recharts 图表尺寸错误
   refactor: 重构 CVD 计算逻辑, 提升性能
   docs: 更新系统架构文档
   ```

### 11.4 调试技巧
```typescript
// 1. 使用 console.log 分组
console.group('Dragon Pool Quality Calculation');
console.log('Stock:', stock.name);
console.log('Quality Score:', calculateQuality(stock));
console.groupEnd();

// 2. 使用 React DevTools
// 安装 React DevTools 扩展, 查看 Context State 变化

// 3. 使用 Network 面板
// 查看 Sina API 请求耗时, 定位性能瓶颈

// 4. 使用 Performance Profiler
// 录制操作流程, 找到导致 Layout Thrashing 的代码
```

---

## 十二、安全与合规

### 12.1 API Key 管理
```typescript
// ❌ 禁止硬编码 API Key
const API_KEY = 'sk-1234567890abcdef';

// ✅ 使用环境变量 (Supabase Secrets)
const API_KEY = Deno.env.get('EAST_MONEY_API_KEY');
```

### 12.2 数据隐私
- **用户数据**: KV Store 仅存储股票代码/名称/笔记, 不涉及个人隐私
- **第三方 API**: Sina/East Money 为公开数据源, 无需授权
- **CORS 策略**: Edge Function 开放 `origin: "*"`, 仅用于原型, 生产环境需改为白名单

### 12.3 免责声明
**本系统仅用于学习与研究, 不构成任何投资建议。股市有风险, 投资需谨慎。**

---

## 十三、总结

### 核心竞争力
1. **反诱多算法 (TrapGuard)**: 填补市场空白, 传统量化系统忽视的"诱多陷阱"识别
2. **预期差模型**: 从"事后解释"转向"事前预判", 提升博弈维度
3. **微观结构 CVD**: 分时级买卖盘力量对比, 比传统 MACD/KDJ 更敏感
4. **情景化评分**: 根据市场阶段动态调整策略, 避免"一招鲜吃遍天"的陷阱

### 当前进度
- ✅ 核心算法体系完成 (Hunter V5.0 + TrapGuard v4.2 + CVD)
- ✅ 龙头池迭代完成 (主力资金权重 + 情景化评分)
- ✅ Recharts 图表修复 (TimeSharingDivergence + MicroStructureCVD)
- ✅ UI/UX 军事化改造 (无 Emoji + 脉冲动画)
- ⚠️ 数据源依赖 Sina API (存在不稳定性, 需要 fallback)
- ⚠️ 缺少回测验证 (无法量化算法准确率)

### 技术亮点
- **Supabase Edge Functions**: 无服务器架构, 零运维成本
- **Hono + Deno**: 轻量高效, 比 Express 快 3-4 倍
- **Context API**: 无需 Redux, 轻量级状态管理
- **Motion (Framer Motion)**: 流畅动画, 提升用户体验
- **Recharts**: 声明式图表, 易于定制

### 未来方向
- **数据源升级**: 接入券商 Level-2 数据, 获取真实主力流向
- **WebSocket 推送**: 降低延迟到 < 1s
- **机器学习**: 训练"涨停次日溢价预测模型"
- **社区化**: 用户分享龙头池/复盘日记

---

**文档版本**: v1.0  
**最后更新**: 2026-01-04  
**维护者**: AI Assistant  
**联系方式**: 通过 Figma Make 平台反馈
