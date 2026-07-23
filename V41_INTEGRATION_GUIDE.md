# v41.0 集成指南

## 快速集成（3步）

### 步骤1: 导入v41模块

```typescript
import { 
  generateAIPredictionV41,
  analyzeTrapRiskV41,
  calculateExpectationGapV41,
  detectMarketPhase
} from '@/utils/algorithmV41';
```

### 步骤2: 替换旧版函数

在 `/src/app/utils/scoring.ts` 中：

```typescript
// 替换AI预判
// 旧: generateAIPrediction(stock, marketTemp, phase)
// 新: generateAIPredictionV41(stock, marketTemp, phase, allStocks)

// 替换TrapGuard  
// 旧: analyzeTrapRisk(stock, phase, allStocks)
// 新: analyzeTrapRiskV41(stock, phase, allStocks)

// 替换预期差
// 旧: calculateExpectationGap(stock, marketTemp)
// 新: calculateExpectationGapV41(stock, marketTemp)
```

### 步骤3: 使用新字段

```typescript
const prediction = generateAIPredictionV41(stock, marketTemp, phase, allStocks);

// v41新增字段
prediction.longTermTrend     // 250日趋势: Bull/Bear/Sideways
prediction.cycleResonance    // 三周期共振: true/false
prediction.confidence        // 信心度: 0-100
prediction.riskLevel         // 风险等级: Low/Medium/High/Critical
prediction.keyFactors        // 关键因子: string[]
```

## 新增指标（自动计算）

```typescript
const technicals = calculateIndicators(stock.history);

// v41自动新增的字段
technicals.chipPressure      // 筹码压力
technicals.chipSupport       // 筹码支撑  
technicals.profitRatio       // 获利盘比例
technicals.atrBands          // ATR动态防线
technicals.macdDivergence    // MACD背离
technicals.rsiDivergence     // RSI背离
```

## 文件说明

| 文件 | 用途 |
|------|------|
| aiPredictionV41.ts | AI预判v41（含250日分析） |
| phaseDetection.ts | 市场阶段判定 |
| trapGuardV41.ts | 动态TrapGuard |
| expectationGapV41.ts | 预期差v41（10场景） |
| algorithmV41.ts | 统一导出 |

完整文档: `/ALGORITHM_V41_SUMMARY.md`
