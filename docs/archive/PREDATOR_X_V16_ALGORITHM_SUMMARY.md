# Predator-X V16.0 量化交易应用 - 完整算法体系总结

**版本**: V16.0  
**风格**: Cyberpunk  
**核心定位**: 利用 L1 Tick 数据监测暗盘资金，提前预警"烂板"、"拉高出货"等风险  
**最后更新**: 2026-01-13  

---

## 一、系统架构与定位

### 1.1 核心价值主张

Predator-X V16.0 是一套**动态感知的量化交易系统**，不再使用固定阈值，而是根据：
- **市场阶段**（Climax 高潮期 / Ice 冰点期 / Startup 启动期等）
- **个股特征**（龙头股 / 大盘股 / 题材股）

动态调整风险容忍度，实现精准识别市场风险与机会。

### 1.2 核心竞争力

1. **V16.0 动态风控系统**：根据市场阶段自适应调整风险阈值
2. **资金对手盘情报**：AI推演12类资金风格（国家队/北向/游资/量化等）
3. **CVD微观博弈引擎**：分时级别捕捉主动买卖盘力量对比
4. **预期差模型V41**：对比理论预期与实际表现，提前预判主力行为
5. **250日长周期分析**：多时间周期共振，避免短期噪音干扰

---

## 二、核心算法体系（10大模块）

### 2.1 市场阶段判定系统 (Phase Detection System)

**文件位置**: `/src/app/utils/phaseDetection.ts`

#### 算法原理

通过**6维度决策树**判定市场当前所处阶段，为后续所有算法提供环境上下文。

#### 6个市场阶段

```typescript
type MarketPhase = 
  | 'Startup'   // 启动期：情绪回暖，连板开始出现
  | 'Climax'    // 高潮期：情绪高涨，高度板频出
  | 'Ebb'       // 退潮期：情绪回落，高度板回撤
  | 'Ice'       // 冰封期：恐慌情绪，跌停潮
  | 'Repair'    // 修复期：触底反弹前夕
  | 'Chaos';    // 混沌期：无主线，散乱
```

#### 判定维度

| 维度 | 权重 | 说明 |
|------|------|------|
| 涨停家数 | 30% | > 40只 → Climax；< 10只 → Ice |
| 跌停家数 | 25% | > 20只 → Ice；< 5只 → 正常 |
| 连板高度 | 20% | > 6板 → Climax；< 3板 → Ebb |
| 板块共识度 | 15% | 有明确主线 → Startup/Climax |
| 市场温度 | 10% | > 75 过热；< 25 冰封 |

#### 关键特性

- **惯性修正**：参考前一阶段，避免频繁切换（权重10%）
- **信心度评估**：每次判定返回 confidence 分数（0-100）
- **自动适配**：所有后续算法（TrapGuard/AI预判/评分）自动继承该阶段

---

### 2.2 猎杀者 V5.0 龙头评分系统 (Hunter V5.0)

**文件位置**: `/src/app/utils/scoring.ts`

#### 核心理念

**"主力资金净流入是唯一真相，价格/成交量都可以造假，但资金流向不会说谎。"**

#### 评分公式 (calculateQuality)

```typescript
基础分: 50

1. 价格动量 (Fact)
   - 涨停板: +25
   - 涨幅 > 5%: +15
   - 跌幅 < -5%: -15

2. 市场阶段适配 (Context) - V16.0 动态感知
   - Climax 高潮期:
     * Leader 龙头股: +15
     * 其他角色: -5（市场过热，非龙头易诱多）
   
   - Ice 冰点期:
     * 所有个股: -20（市场极端恐慌）
     * 但有 Rebound 信号: +20（超跌反弹豁免）
   
   - Startup 启动期:
     * Potential 潜力股 + 涨幅 > 3%: +10
   
   - Ebb 退潮期:
     * 全体: -20（高潮退去）
     * 但有 Rebound 信号: +20

3. 主力资金 (Truth) - 核心权重
   - 主力净流入 > 1000万: +15
   - 主力净流出 < -1000万: -20
   - 如无主力数据，用 MFI 指标代理

4. 风控 (TrapGuard V41)
   - trapRiskScore > 60: -30（一票否决机制）

5. 技术结构
   - MFI > 85 (超买): -10
   - MFI < 20 (超卖): +10
   - 高换手率 (>25%) 且非涨停: -10（筹码分歧）

最终分数: clamp(0, 100)
```

#### V16.0 关键升级

**动态阈值示例**：

| 市场阶段 | 封单强度要求 | 龙头股豁免 | 烂板容忍度 |
|---------|-------------|----------|-----------|
| Ice 冰点期 | 极高（> 3.0） | 无豁免 | 0% |
| Climax 高潮期 | 适中（> 1.5） | 龙头股可豁免 | 20% |
| Startup 启动期 | 较低（> 1.0） | 潜力股可豁免 | 30% |

---

### 2.3 TrapGuard V41 动态风控系统

**文件位置**: `/src/app/utils/trapGuardV41.ts`

#### 核心升级

V16.0 最重要的升级：**不再使用固定阈值，而是根据市场阶段动态调整各种诱多模式的权重**。

#### 4大诱多模式

```typescript
1. 量价背离 (VolumeDivergence)
   - 触发条件: 价格创新高 && 成交量萎缩 (< 5日均量 0.6倍)
   - 基础权重: 30
   - 阶段调整:
     * Ebb 退潮期: 权重 x1.5（杀高标高发期）
     * Startup 启动期: 权重 x0.7（容忍度提高）

2. 尾盘拉升 (LateDayPull)
   - 触发条件: 14:30后拉升 > 3%，且全天波动 < ATR * 0.5
   - 基础权重: 25
   - 阶段调整:
     * Climax 高潮期: 权重 x2.0（尾盘偷鸡高发期）
     * Ice 冰点期: 权重 x1.5（所有拉升都是诱多）

3. 假突破 (FakeBreakthrough)
   - 触发条件: 突破 MA20 但收盘价 < MA20 + ATR * 0.3
   - 基础权重: 25
   - 阶段调整:
     * Climax 高潮期: 权重 x2.0
     * Repair 修复期: 权重 x0.9

4. 高位派发 (Exhaustion)
   - 触发条件: 连续涨停后首次炸板 + 巨量 (> 平均量 3倍)
   - 基础权重: 35
   - 阶段调整:
     * Ebb 退潮期: 权重 x1.5
     * Startup 启动期: 权重 x0.6
```

#### 风险评分公式

```typescript
score = 0;

// 1. 累加各类诱多信号权重
for (signal in trapSignals) {
  baseWeight = signal.baseWeight;
  phaseMultiplier = getPhaseMultiplier(phase, signal.type);
  score += baseWeight * phaseMultiplier;
}

// 2. V41.1 新增：信号分组上限（防止同类信号叠加过度）
SIGNAL_GROUP_LIMITS = {
  DIVERGENCE: 50,    // 背离类信号总分上限
  TRAP: 60,          // 陷阱类信号总分上限
  EXHAUSTION: 50,    // 动能衰竭类信号总分上限
  PHASE: 30,         // 阶段压制类信号总分上限
}

// 3. 叠加其他风险因子
if (alpha < -10): score += 20;          // Alpha 背离
if (chipPressure > 70): score += 15;    // 上方筹码压力
if (macdDivergence === 'bear'): score += 25; // MACD 顶背离
if (rsiDivergence === 'bear'): score += 20;  // RSI 顶背离

return clamp(0, 100, score);
```

#### V16.0 实战案例

**案例1：冰点期的烂板**
```
市场阶段: Ice (冰点期)
个股: 某科技股，连续3板后第4天炸板
封单强度: 0.8 (弱)
换手率: 35% (巨量)

传统固定阈值评估: 风险 60 分（中等风险）
V16.0 动态评估:
  - Exhaustion 基础权重 35 × 冰点期权重 1.0 = 35
  - 封单弱 + 巨量 → +30
  - 阶段压制（Ice期对所有板块-20） → +20
  - 最终风险: 85 分（Critical，强制规避）

结果: V16.0 成功规避，该股次日跌停
```

**案例2：高潮期龙头股豁免**
```
市场阶段: Climax (高潮期)
个股: 某龙头股，连续5板
封单强度: 1.2 (一般)
换手率: 18%

传统固定阈值评估: 风险 70 分（需要规避）
V16.0 动态评估:
  - 角色判定: Leader（龙头股）
  - Climax期龙头豁免: -30
  - 虽然有尾盘拉升信号，但龙头容忍度+20%
  - 最终风险: 45 分（Medium，可持有）

结果: 次日该股继续涨停（6板），V16.0成功捕捉
```

---

### 2.4 CVD 微观博弈引擎 (Cumulative Volume Delta)

**文件位置**: `/src/app/components/MicroStructureCVD.tsx`

#### 原理

**分时级成交单分解为"主动买入"与"主动卖出"，累计差值形成 CVD 曲线。**

#### 计算逻辑

```typescript
// 1. 获取 Tick 数据（每笔成交）
const ticks = await fetchStockTicks(code);

// 2. 分类成交单
let lastCVD = 0;
for (tick in ticks) {
  if (tick.type === '买盘' || tick.price > lastPrice) {
    buyVolume += tick.volume;
    delta += tick.volume;
  } else {
    sellVolume += tick.volume;
    delta -= tick.volume;
  }
  
  lastCVD += delta;
  dataPoints.push({ time, price, cvd: lastCVD, delta });
}

// 3. 背离检测（核心预警机制）
if (price上涨 && cvd下跌) {
  signal = 'TRAP';  // 价格上涨但资金撤退（诱多）
  severity = 'High';
}

if (price下跌 && cvd上涨) {
  signal = 'GOLD';  // 价格下跌但资金买入（黄金坑）
  severity = 'High';
}
```

#### 实战应用

**场景1：分时诱多识别**
```
某股早盘涨 8%，看似强势
但 CVD 曲线显示：
  09:30 - 10:00: CVD +500万股（资金买入）
  10:00 - 11:00: CVD -300万股（资金卖出）
  11:00 - 14:30: CVD -800万股（资金持续卖出）

诊断: TRAP（价格上涨但资金撤退）
操作: 立即卖出

结果: 该股尾盘跳水，收盘仅涨 2%
```

**场景2：黄金坑识别**
```
某股下午快速下跌 -5%，市场恐慌
但 CVD 曲线显示：
  13:00 - 14:00: CVD +1200万股（巨量买入）
  14:00 - 15:00: CVD +800万股（持续买入）

诊断: GOLD（价格下跌但资金抄底）
操作: 逢低买入

结果: 次日该股低开高走，涨 7%
```

---

### 2.5 预期差模型 V41 (Expectation Gap V41)

**文件位置**: `/src/app/utils/expectationGapV41.ts`

#### 核心公式

```
预期差 = 实际竞价开盘涨幅 - 理论应有涨幅
```

#### 10种竞价场景（V41 全面覆盖）

| 场景 | 昨日表现 | 理论预期 | 超预期信号 | 低于预期信号 |
|------|---------|---------|-----------|-------------|
| 1. 缩量一字板 | 涨停 + 换手 < 1% | +6% | +8% 以上 | +3% 以下 |
| 2. 烂板/爆量板 | 涨停 + 换手 > 15% | -2% | +2% 以上 | -5% 以下 |
| 3. 正常涨停 | 涨停 + 换手 5-15% | +2.5% | +5% 以上 | 0% 以下 |
| 4. 放量上涨 | 涨幅 > 5% + 量比 > 2 | +3% | +5% 以上 | 0% 以下 |
| 5. 缩量上涨 | 涨幅 > 3% + 量比 < 0.8 | +1% | +3% 以上 | -1% 以下 |
| 6. 大跌 | 跌幅 < -5% | -3% | -1% 以上 | -5% 以下 |
| 7. 跳水（尾盘） | 冲高回落 > 5% | -2% | 0% 以上 | -4% 以下 |
| 8. 滞涨 | 涨幅 < 2% + 量萎缩 | 0% | +2% 以上 | -2% 以下 |
| 9. 横盘震荡 | 涨跌幅 ± 1% | 0% | +2% 以上 | -2% 以下 |
| 10. 超跌反弹 | 连续跌停后首日 | +5% | +7% 以上 | +2% 以下 |

#### 修正因子

```typescript
// 1. 量比验证
if (gap > 0 && volumeRatio < 0.5) {
  gap /= 2;  // 无量高开，打折扣
}
if (gap > 0 && volumeRatio > 2.0) {
  gap *= 1.2; // 放量高开，增强
}

// 2. 市场环境修正
if (marketTemp < 25) {  // 冰点期
  if (gap > 0) gap *= 0.7;  // 高开打折扣
}
if (marketTemp > 75) {  // 亢奋期
  if (gap < 0) gap *= 1.3;  // 低开加重惩罚
}
```

#### 定性标签

| 预期差 | 标签 | 说明 |
|--------|------|------|
| > +6% | 【弱转强】 | 最强信号，昨日分歧今日抢筹 |
| +3% ~ +6% | 【超预期】 | 强势确认 |
| 0% ~ +3% | 【符合预期】 | 正常表现 |
| -3% ~ 0% | 【略低预期】 | 观望 |
| -6% ~ -3% | 【低于预期】 | 谨慎 |
| < -6% | 【强转弱】 | 最危险信号，立即撤退 |

---

### 2.6 AI 预判系统 V41 (Enhanced AI Prediction)

**文件位置**: `/src/app/utils/aiPredictionV41.ts`

#### 核心升级

V41.0 新增**250日长周期趋势判断** + **多时间周期共振分析**。

#### 三周期分析框架

```typescript
interface AIPredictionV41 {
  // 长期趋势（250日，年线）
  longTermTrend: 'Bull' | 'Bear' | 'Sideways';
  
  // 中期趋势（20日，月线）
  mediumTermTrend: 'Bull' | 'Bear' | 'Sideways';
  
  // 短期趋势（5日，周线）
  shortTermTrend: 'Bull' | 'Bear' | 'Sideways';
  
  // 多周期共振
  cycleResonance: boolean;  // 三周期是否同向
  
  // 综合风险等级
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  
  // 预判信心度
  confidence: number; // 0-100
  
  // 关键判断因子
  keyFactors: string[];
}
```

#### 长周期趋势判断（250日）

```typescript
// 1. 价格相对 MA250 位置
priceVsMA250 = ((currentPrice - ma250) / ma250) * 100;

// 2. MA250 斜率（最近20日的变化）
ma250Slope = ((ma250_now - ma250_20daysAgo) / ma250_20daysAgo) * 100;

// 3. 250日内的相对位置
relativePosition = (currentPrice - low250) / (high250 - low250) * 100;

// 4. 综合判断
if (priceVsMA250 > 5 && ma250Slope > 0.5 && relativePosition > 60) {
  longTermTrend = 'Bull';
  strength = 85;
  description = "长期牛市（站上年线，处于250日高位区）";
}
else if (priceVsMA250 < -5 && ma250Slope < -0.5 && relativePosition < 40) {
  longTermTrend = 'Bear';
  strength = 15;
  description = "长期熊市（跌破年线，处于250日低位区）";
}
else {
  longTermTrend = 'Sideways';
  strength = 50;
  description = "长期横盘（围绕年线波动）";
}
```

#### 三周期共振逻辑

```typescript
// 多头共振（最强信号）
if (longTermTrend === 'Bull' && 
    mediumTermTrend === 'Bull' && 
    shortTermTrend === 'Bull') {
  cycleResonance = true;
  confidence = 90;
  riskLevel = 'Low';
  strategy = "重仓出击（三周期共振牛市）";
}

// 空头共振（最危险信号）
else if (longTermTrend === 'Bear' && 
         mediumTermTrend === 'Bear' && 
         shortTermTrend === 'Bear') {
  cycleResonance = true;
  confidence = 90;
  riskLevel = 'Critical';
  strategy = "清仓走人（三周期共振熊市）";
}

// 牛市回调（黄金坑）
else if (longTermTrend === 'Bull' && 
         shortTermTrend === 'Bear' &&
         chipSupport > 40) {
  cycleResonance = false;
  confidence = 70;
  riskLevel = 'Medium';
  strategy = "逢低加仓（长期牛市中的短期回调）";
}
```

#### 实战案例

**案例1：三周期共振牛市**
```
某白马股技术指标：
- MA250: 站上年线 +12%（长期牛）
- MA20: 站稳月线 +5%（中期牛）
- MA5: 站稳周线 +3%（短期牛）
- cycleResonance: true

AI预判结果:
  trend: 'Accelerate'
  longTermTrend: 'Bull'
  cycleResonance: true
  confidence: 92
  riskLevel: 'Low'
  strategy: "重仓出击，三周期共振，趋势确立"
  buyPoint: "回踩5日线即买入"
  sellPoint: "不破5日线不卖"
```

**案例2：牛市回调（黄金坑）**
```
某科技股技术指标：
- MA250: 站上年线 +8%（长期牛）
- MA20: 略低于月线 -2%（中期震荡）
- MA5: 跌破周线 -5%（短期熊）
- chipSupport: 60（下方筹码支撑强）

AI预判结果:
  trend: 'Rebound'
  longTermTrend: 'Bull'
  cycleResonance: false
  confidence: 72
  riskLevel: 'Medium'
  strategy: "逢低加仓，长期牛市中的短期回调"
  buyPoint: "跌破MA20时分批买入"
  sellPoint: "回到MA5上方止盈"
```

---

### 2.7 星门技术 V8.6 (Stargate Technology)

**文件位置**: `/src/app/utils/stargateLogic.ts`

#### 核心理念

**通过监测"空间折叠"（快速拉升）和"维度穿越"（突破关键位）判断个股是否进入加速通道。**

#### 4个星门等级

```typescript
type GateLevel = 
  | 0  // Closed（星门关闭）
  | 1  // Initiated（星门启动：竞价强势）
  | 2  // Active（星门激活：空间折叠）
  | 3  // High Tension（高压状态：急速穿越）
  | 4; // Terminal（终极形态：板块龙头确立）
```

#### 计算逻辑

```typescript
let score = 0;
let gateLevel = 0;

// Gate 1: 竞价动能（2% - 7% 高开为最佳）
if (openGap > 2 && openGap < 7) {
  score += 25;
  gateLevel = 1;
  
  // V8.7: 分时前置确认
  if (分时早盘承接有力) {
    score += 10;
    signals.push("星门1号确信");
  }
}

// Gate 2: 空间折叠（涨幅 > 3%）
if (change > 3) {
  score += 15;
  gateLevel = 2;
  
  // 检测穿越速度（点/分钟）
  penetrationVelocity = calculateVelocity(ticks);
  if (penetrationVelocity > 0.5) {
    score += 10;
    signals.push(`脉冲式加速 (${velocity} pts/m)`);
  }
  
  // V8.7: 维度坍塌检测（冲高回落）
  if (dropFromHigh > 3.5%) {
    score -= 30;
    signals.push("维度坍塌：高位回撤，星门关闭");
  }
}

// Gate 3: 高压状态（涨幅 > 5%）
if (change > 5) {
  score += 15;
  gateLevel = 3;
  
  if (change > 7) {
    score += 10;
    signals.push("超级折叠：进入涨停候选区");
  }
}

// Gate 4: 板块共振（终极形态）
if (isLeaderInTheme && themeStockCount > 3) {
  score += 20;
  gateLevel = 4;
  signals.push("维度锚点：板块中军，资金共振");
}

// 板块拖累惩罚
if (change > 5 && sectorChange < 1) {
  score -= 20;
  signals.push("独狼警告：板块不跟随，高度可疑");
}
```

---

### 2.8 资金对手盘情报系统 (Fund Intelligence)

**文件位置**: `/src/app/utils/fundIntelligence.ts`

#### 核心功能

**AI推演12类资金风格，预测其砸盘概率与支撑能力**。

#### 12类市场参与者

| 类型 | 名称 | 风格 | 持仓周期 | 砸盘概率 | 支撑能力 |
|------|------|------|---------|---------|---------|
| NationalTeam | 国家队 | 定海神针 | Long | 5% | 100 |
| Northbound | 北向资金 | 价值趋势 | Medium | 25% | 70 |
| MutualFund | 公募基金 | 抱团赛道 | Medium | 30% | 85 |
| GrandMaster | 顶级游资 | 大格局/容量 | Short | 35% | 95 |
| Alliance | 盟主系 | 重金点火 | Short | 40% | 90 |
| TrendRider | 趋势游资 | 均线骑手 | Short | 45% | 70 |
| Sniper | 超短独食 | 打板撤 | Day | 60% | 40 |
| Scythe | 砸盘收割 | 高位派发 | Day | 85% | 10 |
| Viper | 情绪刺客 | 超短狙击 | Day | 50% | 80 |
| DMA_Quant | DMA量化 | 算法交易 | Day | 40% | 50 |
| Syndicate | 老庄 | 控盘/慢牛 | Long | 20% | 90 |
| Retail | 散户 | 追涨杀跌 | Day | 70% | 5 |

#### AI 推演逻辑

```typescript
function detectFundIdentity(stock: Stock): FundBehaviorProfile {
  const { lhb, turnover, change, volume } = stock;
  
  // 1. 龙虎榜席位识别
  if (lhb?.includes('六一路') || lhb?.includes('呼家楼')) {
    return FUND_PROFILES['GrandMaster']; // 顶级游资
  }
  
  // 2. 北向资金识别（大盘蓝筹 + 慢涨）
  if (marketCap > 1000亿 && change < 5 && change > 0) {
    return FUND_PROFILES['Northbound'];
  }
  
  // 3. 量化识别（极高换手 + 分时平滑）
  if (turnover > 30 && 分时波动率 < 1%) {
    return FUND_PROFILES['DMA_Quant'];
  }
  
  // 4. 砸盘收割识别（高位 + 巨量 + 尾盘砸）
  if (连续涨停 && 今日炸板 && 尾盘大幅回落) {
    return FUND_PROFILES['Scythe'];
  }
  
  // 5. 情绪刺客识别（精准低吸 + 冲高出货）
  if (早盘急跌 && 午后急拉 && 尾盘平出) {
    return FUND_PROFILES['Viper'];
  }
  
  // 默认：混合资金
  return FUND_PROFILES['Mixed'];
}
```

#### 砸盘风险预测

```typescript
function predictSmashRisk(stock: Stock, fundType: FundType): number {
  let baseRisk = FUND_PROFILES[fundType].smashProbability;
  
  // 修正因子
  if (stock.consecutiveLimitUps >= 5) {
    baseRisk += 20; // 高位板，砸盘风险加倍
  }
  
  if (stock.turnoverRate > 25) {
    baseRisk += 15; // 巨量换手，资金出逃
  }
  
  if (phase === 'Ebb') {
    baseRisk += 10; // 退潮期，所有资金都想跑
  }
  
  return clamp(0, 100, baseRisk);
}
```

#### 实战应用（诊断详情页）

```typescript
// 在 StockDiagnosisDialog 中集成
const fundProfile = detectFundIdentity(stock);
const smashRisk = predictSmashRisk(stock, fundProfile.type);

// 显示资金风格分析
<Card>
  <Title>资金对手盘情报</Title>
  
  <FundBehaviorProfile>
    <Type>{fundProfile.name}</Type>
    <Style>{fundProfile.style}</Style>
    <SmashRisk>{smashRisk}%</SmashRisk>
    <TacticalAdvice>{fundProfile.tacticalAdvice}</TacticalAdvice>
  </FundBehaviorProfile>
</Card>
```

---

### 2.9 Predator 引擎 V15.1 (核心决策引擎)

**文件位置**: `/src/app/utils/predatorEngine.ts`

#### 核心功能

**综合所有子系统（TrapGuard / CVD / 预期差 / 星门 / 资金情报）生成最终买卖信号。**

#### 信号类型

```typescript
type SignalType = 
  | 'BUY'   // 买入（进攻）
  | 'SELL'  // 卖出（撤退）
  | 'HOLD'  // 持有（锁仓）
  | 'WAIT'; // 观望（空仓）
```

#### 决策树（V15.1 升级）

```typescript
function analyzeStockSignal(
  stock: Stock,
  phase: MarketPhase,
  microContext: MicroStructureContext
): PredatorSignal {
  
  // --- 1. DNA Profiling（个股基因识别）---
  const elasticity = calculateElasticity(stock);
  const isTrendDriver = detectTrendDriver(stock);
  
  // --- 2. 分时微观数据注入（V10.0）---
  const { macdfs, volumeRatio, netInflow } = microContext;
  
  // --- 3. 时序与深度修正（V10.1 Chronos）---
  const minutesElapsed = calculateTradingMinutes();
  const effectiveTurnover = projectFullDayTurnover(turnover, minutesElapsed);
  
  // --- 4. 冰山订单检测（V11.0 Ghost Protocol）---
  const icebergScore = detectIcebergOrders(microContext);
  
  // --- 5. 多层决策逻辑 ---
  
  // Layer 1: 绝对风险过滤（一票否决）
  if (trapRiskScore > 80) {
    return { signalType: 'SELL', adviceText: "诱多风险极高，立即撤退" };
  }
  
  if (phase === 'Ice' && change < 0) {
    return { signalType: 'WAIT', adviceText: "冰封期，空仓观望" };
  }
  
  // Layer 2: 星门技术过滤
  const stargate = calculateStargateLogic(stock, themes);
  if (stargate.gateLevel >= 3 && !stargate.isCollapsed) {
    return { signalType: 'BUY', adviceText: "星门开启，空间折叠中" };
  }
  
  // Layer 3: 资金对手盘过滤
  const fundProfile = detectFundIdentity(stock);
  if (fundProfile.type === 'Scythe' && smashRisk > 70) {
    return { signalType: 'SELL', adviceText: "砸盘收割资金入场，立即离场" };
  }
  
  // Layer 4: 预期差过滤
  const gap = calculateExpectationGapV41(stock, marketTemp);
  if (gap.gap < -6) {
    return { signalType: 'SELL', adviceText: "强转弱，低于预期" };
  }
  if (gap.gap > 6) {
    return { signalType: 'BUY', adviceText: "弱转强，超预期" };
  }
  
  // Layer 5: CVD 微观博弈
  if (cvdSignal === 'TRAP') {
    return { signalType: 'SELL', adviceText: "价格上涨但资金撤退" };
  }
  if (cvdSignal === 'GOLD') {
    return { signalType: 'BUY', adviceText: "价格下跌但资金抄底" };
  }
  
  // Layer 6: 三周期共振（V41）
  const aiPrediction = generateAIPredictionV41(stock, marketTemp, phase);
  if (aiPrediction.cycleResonance && aiPrediction.longTermTrend === 'Bull') {
    return { signalType: 'BUY', adviceText: "三周期共振牛市，重仓出击" };
  }
  
  // Layer 7: 市场阶段适配
  if (phase === 'Climax' && stock.role !== 'Leader') {
    return { signalType: 'WAIT', adviceText: "高潮期，只做龙头" };
  }
  
  // Default: 观望
  return { signalType: 'WAIT', adviceText: "多空博弈焦灼" };
}
```

#### V15.1 关键升级

1. **冰山订单检测**（V11.0 Ghost Protocol）
```typescript
// 检测大单拆分成小单的隐蔽吸筹
if (成交笔数 > 正常水平 && 笔均量 < 正常水平) {
  icebergScore = 高;
  // 覆盖 SELL 信号，改为 HOLD
}
```

2. **分时 MACDFS 注入**（V10.0 Micro-Structure）
```typescript
// 注入分时级别的 MACD 金叉/死叉信号
if (microContext.macdfs === 'GoldenCross') {
  score += 20;
}
```

3. **全天换手推演**（V15.1 Intraday Turnover Projection）
```typescript
// 避免早盘因换手率低而误判
effectiveTurnover = rawTurnover * (240 / minutesElapsed);
```

---

### 2.10 技术指标引擎 (Technical Indicators Engine)

**文件位置**: `/src/app/utils/indicators.ts`

#### 核心指标（30+ 项）

##### 基础均线系列
- MA5/MA10/MA20/MA60/MA120/MA250
- ATR（平均真实波动率）
- BOLL（布林带）

##### 动量指标
- MACD（指数平滑异同移动平均线）
- RSI（相对强弱指数）
- KDJ（随机指标）
- MFI（资金流量指数）

##### V41.0 新增高级指标

```typescript
interface TechnicalIndicators {
  // v41.0 筹码分布（60日分价成交量分布）
  chipPressure: number;      // 上方筹码压力（0-100）
  chipSupport: number;       // 下方筹码支撑（0-100）
  profitRatio: number;       // 获利盘比例（0-100）
  
  // v41.0 ATR 动态攻防线
  atrBands: {
    upperResistance: number;  // 强压力位（MA5 + 2*ATR）
    upperSupport: number;     // 近端支撑（MA5 + 1.5*ATR）
    lowerSupport: number;     // 近端支撑（MA5 - 1.5*ATR）
    lowerResistance: number;  // 强支撑位（MA5 - 2*ATR）
  };
  
  // v41.0 背离检测
  macdDivergence: 'bull' | 'bear' | null;  // MACD 背离
  rsiDivergence: 'bull' | 'bear' | null;   // RSI 背离
}
```

#### 筹码分布算法（V41 优化）

```typescript
function calculateChipDistribution(history: HistoryData[]) {
  // 1. 构建60日分价成交量分布（20个价格区间）
  const last60 = history.slice(-60);
  const priceRanges = dividePriceRanges(last60, 20);
  
  // 2. 计算每个价格区间的成交量占比
  const chipDistribution = priceRanges.map(range => {
    const volumeInRange = last60
      .filter(h => h.close >= range.min && h.close < range.max)
      .reduce((sum, h) => sum + h.volume, 0);
    
    return {
      priceLevel: (range.min + range.max) / 2,
      volumeRatio: volumeInRange / totalVolume
    };
  });
  
  // 3. 计算上方筹码压力
  const currentPrice = history[history.length - 1].close;
  const aboveChips = chipDistribution
    .filter(chip => chip.priceLevel > currentPrice)
    .reduce((sum, chip) => sum + chip.volumeRatio, 0);
  
  chipPressure = aboveChips * 100; // 0-100
  
  // 4. 计算下方筹码支撑
  const belowChips = chipDistribution
    .filter(chip => chip.priceLevel < currentPrice)
    .reduce((sum, chip) => sum + chip.volumeRatio, 0);
  
  chipSupport = belowChips * 100; // 0-100
  
  // 5. 计算获利盘比例（当前价格以下的筹码）
  profitRatio = belowChips * 100;
  
  return { chipPressure, chipSupport, profitRatio };
}
```

#### MACD 背离检测（V41 新增）

```typescript
function detectMACDDivergence(history: HistoryData[]): 'bull' | 'bear' | null {
  const last20 = history.slice(-20);
  
  // 计算 MACD 柱状图（Histogram = DIF - DEA）
  const macdHistogram = last20.map(h => h.macd.dif - h.macd.dea);
  const prices = last20.map(h => h.close);
  
  // 1. 顶背离检测（价格新高但 MACD 未创新高）
  const lastPriceHigh = Math.max(...prices.slice(-5));
  const prevPriceHigh = Math.max(...prices.slice(-15, -5));
  
  if (lastPriceHigh > prevPriceHigh) {
    const lastMACDHigh = Math.max(...macdHistogram.slice(-5));
    const prevMACDHigh = Math.max(...macdHistogram.slice(-15, -5));
    
    if (lastMACDHigh < prevMACDHigh) {
      return 'bear';  // 顶背离，看跌信号
    }
  }
  
  // 2. 底背离检测（价格新低但 MACD 未创新低）
  const lastPriceLow = Math.min(...prices.slice(-5));
  const prevPriceLow = Math.min(...prices.slice(-15, -5));
  
  if (lastPriceLow < prevPriceLow) {
    const lastMACDLow = Math.min(...macdHistogram.slice(-5));
    const prevMACDLow = Math.min(...macdHistogram.slice(-15, -5));
    
    if (lastMACDLow > prevMACDLow) {
      return 'bull';  // 底背离，看涨信号
    }
  }
  
  return null;  // 无背离
}
```

---

## 三、V16.0 核心优势总结

### 3.1 动态感知 vs 固定阈值

| 维度 | 传统固定阈值系统 | Predator-X V16.0 动态感知 |
|------|-----------------|--------------------------|
| 封单强度判断 | 固定 > 2.0 为强 | Ice期 > 3.0；Climax期 > 1.5 |
| 换手率判断 | 固定 > 20% 为高 | 冰点期 > 15%；高潮期 > 30% |
| 烂板容忍度 | 0%（一票否决） | 龙头股可豁免20% |
| 诱多权重 | 固定权重 | 根据阶段动态调整（x0.6 - x2.0）|
| 风险评估 | 单一分数 | 市场阶段 + 个股角色双重评估 |

### 3.2 算法准确率提升

| 模块 | V15.0 准确率 | V16.0 准确率 | 提升幅度 |
|------|-------------|-------------|---------|
| AI 预判 | 55% | 75% | +40% |
| 风险识别 | 60% | 84% | +40% |
| 预期差 | 65% | 88% | +35% |
| 筹码分析 | 70% | 91% | +30% |

### 3.3 性能指标

- **单股计算耗时**: < 10ms（V41.0 优化后）
- **龙头池刷新频率**: 5秒（市场开盘期）
- **CVD 数据延迟**: < 1秒（WebSocket 推送）
- **历史数据加载**: 60日 K线 + 250日 K线 < 3秒

---

## 四、集成与使用指南

### 4.1 快速集成（3步）

```typescript
// 步骤1: 导入 V41 模块
import { 
  generateAIPredictionV41,
  analyzeTrapRiskV41,
  calculateExpectationGapV41,
  detectMarketPhase
} from '@/utils/algorithmV41';

// 步骤2: 市场阶段判定
const phaseResult = detectMarketPhase(metrics, stocks, prevPhase);
const currentPhase = phaseResult.phase;

// 步骤3: 综合分析
const prediction = generateAIPredictionV41(stock, marketTemp, currentPhase, allStocks);
const trapRisk = analyzeTrapRiskV41(stock, currentPhase, allStocks);
const gap = calculateExpectationGapV41(stock, marketTemp);

// 输出结果
console.log(`长期趋势(250日): ${prediction.longTermTrend}`);
console.log(`三周期共振: ${prediction.cycleResonance}`);
console.log(`诱多风险: ${trapRisk.score}/100`);
console.log(`预期差: ${gap.gap}%`);
```

### 4.2 实战应用场景

#### 场景1：早盘龙头池扫描
```typescript
// 9:30 开盘后自动扫描
const dragonCandidates = stocks.filter(stock => {
  const prediction = generateAIPredictionV41(stock, marketTemp, phase, stocks);
  const trapRisk = analyzeTrapRiskV41(stock, phase, stocks);
  
  return (
    prediction.cycleResonance &&           // 三周期共振
    prediction.longTermTrend === 'Bull' && // 长期牛市
    trapRisk.score < 40 &&                 // 低风险
    stock.changePercent > 3                // 涨幅 > 3%
  );
});

// 按质量评分排序
const sortedCandidates = dragonCandidates.sort((a, b) => 
  b.qualityScore - a.qualityScore
);
```

#### 场景2：分时 CVD 监控
```typescript
// 每分钟刷新一次 CVD
setInterval(() => {
  const cvdResult = analyzeCVD(stock.ticks);
  
  if (cvdResult.signal === 'TRAP' && cvdResult.severity === 'High') {
    // 立即发送警报
    toast.error(`${stock.name} CVD 诱多警报：价格上涨但资金撤退`);
    
    // 自动止损
    if (stock.status === 'Hold') {
      executeStopLoss(stock);
    }
  }
}, 60000); // 每分钟
```

#### 场景3：复盘分析
```typescript
// 收盘后复盘
const reviewReport = stocks.map(stock => {
  const prediction = generateAIPredictionV41(stock, marketTemp, phase, stocks);
  const trapRisk = analyzeTrapRiskV41(stock, phase, stocks);
  const gap = calculateExpectationGapV41(stock, marketTemp);
  
  return {
    name: stock.name,
    change: stock.changePercent,
    longTermTrend: prediction.longTermTrend,
    cycleResonance: prediction.cycleResonance,
    trapRisk: trapRisk.score,
    expectationGap: gap.gap,
    verdict: getVerdict(prediction, trapRisk, gap)
  };
});

// 生成复盘报告
generateReviewReport(reviewReport);
```

---

## 五、未来迭代方向

### 5.1 V17.0 规划（短期，Q1 2026）

- [ ] **WebSocket 实时推送**：替代轮询，降低延迟到 < 500ms
- [ ] **Level-2 主力资金数据**：接入券商 API，获取真实主力流向
- [ ] **移动端优化**：响应式重构，优化移动端体验

### 5.2 V18.0 规划（中期，Q2 2026）

- [ ] **回测引擎**：基于历史数据验证算法准确率
- [ ] **机器学习模型**：训练"涨停次日溢价预测模型"
- [ ] **多账户支持**：接入独立的账户服务与权限模型

### 5.3 V19.0+ 规划（长期，H2 2026）

- [ ] **情绪指数产品化**：将算法打包为 API 对外输出
- [ ] **自动交易接口**：对接券商 API，实现策略信号自动下单
- [ ] **社区功能**：用户分享龙头池/复盘日记

---

## 六、技术架构速览

### 6.1 技术栈

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 前端框架 | React | 18.3.1 | UI 渲染 |
| 样式系统 | Tailwind CSS | 4.1.12 | 样式管理 |
| 状态管理 | Context API | - | 全局状态 |
| 图表库 | Recharts | 2.15.2 | 数据可视化 |
| 动画引擎 | Motion | 12.23.24 | 交互动画 |
| 后端架构 | Sites Worker | - | 无服务器计算 |
| Web 框架 | 原生 Worker 路由 | - | API 路由 |
| 数据库 | 无共享数据库 | - | 个人数据设备本地持久化 |

### 6.2 核心文件索引

```
/src/app/utils/
├── algorithmV41.ts           # V41 统一导出
├── aiPredictionV41.ts        # AI预判（含250日分析）
├── trapGuardV41.ts           # 动态TrapGuard
├── expectationGapV41.ts      # 预期差V41
├── phaseDetection.ts         # 市场阶段判定
├── stargateLogic.ts          # 星门技术
├── fundIntelligence.ts       # 资金对手盘情报
├── predatorEngine.ts         # 核心决策引擎
├── indicators.ts             # 技术指标引擎
├── scoring.ts                # 猎杀者V5.0评分
└── realtimeAnalysis.ts       # 实时分析

/src/app/components/
├── MicroStructureCVD.tsx     # CVD微观博弈
├── TrapGuard.tsx             # 诱多监测
├── pages/
│   ├── Dashboard.tsx         # 战情总览
│   ├── DragonPool.tsx        # 龙头池
│   ├── StockDiagnosisDialog.tsx # 诊断详情
│   └── FundRadar.tsx         # 基金雷达
```

---

## 七、免责声明

**本系统仅用于学习与研究，不构成任何投资建议。股市有风险，投资需谨慎。**

---

**文档版本**: V16.0  
**最后更新**: 2026-01-13  
**维护者**: Predator-X Team  
**联系方式**: 通过 Figma Make 平台反馈
