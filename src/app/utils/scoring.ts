import { Stock, Theme, MarketIndex, type DailyMetrics, type MarketPhase, type SentimentPoint } from '../types';
import { calculateAlphaDivergence } from './indicators';
import { calculateExpectationGapV41, analyzeTrapRiskV41, generateAIPredictionV41 } from './algorithmV41';
import { calculateTopConceptConsensus } from './marketConcepts';
export { calculateFullMarketEntropy } from './marketCrossSection';

/**
 * 计算预期差 (Expectation Gap) - v41.0 Wrapper
 * 核心升级：委托给 v41.0 算法模块
 */
export const calculateExpectationGap = (stock: Stock, marketTemp: number): { gap: number, reason: string } => {
    const result = calculateExpectationGapV41(stock, marketTemp);
    return { gap: result.gap, reason: result.reason };
};

/**
 * AI Prediction Generator - v41.0 Wrapper
 * 核心升级：委托给 v41.0 算法模块
 * 注意：generateAIPredictionV41 需要 phase 和 allStocks 参数
 * 这里为了兼容旧接口，提供降级处理或默认值
 */
export const generateAIPrediction = (stock: Stock, marketTemp: number, phase: string): Stock['aiPrediction'] => {
    // 尝试构建最小集合，如果缺少上下文，效果可能打折
    // 注意：Store.tsx 已经切换到直接调用 v41，这里仅供其他潜在调用者兼容
    return generateAIPredictionV41(stock, marketTemp, phase as any, []) as any;
};

/**
 * 诱多风险分析 (Trap Risk Analysis) - v41.1 统一版本
 * @deprecated 使用 analyzeTrapRiskV41 替代，此函数仅供兼容旧代码
 */
export const analyzeTrapRisk = analyzeTrapRiskV41;

/**
 * 竞价数据提取与估算 (Auction Data Engine) - v29.5
 * 优先使用真实竞价快照，缺失时基于昨日成交分布与开盘表现进行物理建模
 */
export const calculateAuctionData = (stock: Stock) => {
    // 如果已有真实竞价数据，直接返回
    if (stock.auctionData && stock.auctionData.volumeRatio > 0) {
        return stock.auctionData;
    }

    const change = stock.changePercent || 0;
    const history = stock.history || [];
    const yesterday = history[history.length - 1];
    
    // 开盘涨幅：基于当前涨幅与开盘价估算
    const openGap = stock.open && stock.currentPrice 
        ? ((stock.open - (yesterday?.close || stock.open)) / (yesterday?.close || stock.open)) * 100 
        : change * 0.7;

    // 量比估算：基于今日成交量与昨日均量的比例
    const volRatio = stock.volumeRatio || (stock.volume && yesterday?.volume ? (stock.volume / yesterday.volume) * 2 : 1.0);

    return {
        openGap,
        auctionVolume: (stock.volume || 0) * 0.03, // A股典型竞价占比约 3%
        volumeRatio: Number(volRatio.toFixed(2)),
        strength: Math.min(100, Math.max(0, 50 + openGap * 5 + (volRatio - 1) * 10))
    };
};

/**
 * 弱转强判定概率 (Weak-to-Strong Probability) - v25.0
 * 逻辑：基于昨日换手、今日竞价量比、开盘涨幅及市场环境
 */
export const calculateWeakToStrongProb = (stock: Stock, marketTemp: number): number => {
    const history = stock.history || [];
    if (history.length < 2) return 0;
    
    const yesterday = history[history.length - 1];
    const dayBefore = history[history.length - 2];
    
    // 基础条件：昨日是放量板（分歧）
    const yesterdayWasLimitUp = yesterday.close >= dayBefore.close * 1.095;
    const yesterdayVolIncrease = (yesterday.volume || 0) > (dayBefore.volume || 0) * 1.5;
    
    if (!yesterdayWasLimitUp || !yesterdayVolIncrease) return 10;

    let prob = 40;
    const auction = calculateAuctionData(stock);
    
    // 竞价量比加成
    if (auction.volumeRatio >= 1 && auction.volumeRatio <= 2.5) prob += 25;
    else if (auction.volumeRatio > 2.5) prob -= 15;
    
    // 开盘涨幅加成
    if (auction.openGap >= 2 && auction.openGap <= 5) prob += 20;
    
    // 市场环境
    if (marketTemp < 45) prob += 15;

    return Math.min(95, Math.max(5, prob));
};

/**
 * 核心逻辑：区分总龙头、板龙、卡位、补涨 (Dragon Hierarchy v3.0)
 * 增加“辨识度”判定逻辑
 */
export const identifyRole = (stock: Stock, allStocks: Stock[], marketIndices: MarketIndex[]): Stock['role'] => {
    const sector = stock.concept;
    if (!sector) return 'Normal';

    const sameSector = allStocks.filter(s => s.concept === sector);
    
    const getBoardHeight = (s: Stock) => {
        const m = s.notes?.match(/(\d+)连板/);
        return m ? parseInt(m[1]) : (s.isLimitUp ? 1 : 0);
    };
    
    const heights = allStocks.map(getBoardHeight);
    const maxHeight = Math.max(...heights, 0);
    const myHeight = getBoardHeight(stock);
    
    // 1. 总龙头 (全场最高标且辨识度第一)
    // T+1 风控：如果换手率 > 60% (死亡换手)，剥夺龙头资格 (防止接盘)
    const turnover = stock.turnoverRate || 0;
    const isNew = stock.name.includes('N') || stock.name.includes('C');
    const isDeathTurnover = !isNew && turnover > 60;

    if (myHeight === maxHeight && maxHeight >= 4 && stock.isLimitUp && !isDeathTurnover) {
        return 'Leader';
    }

    // 2. 独立龙头 (无视指数、无视板块、独立走强)
    const indScore = calculateIndependenceScore(stock, marketIndices);
    if (indScore > 85 && stock.changePercent && stock.changePercent > 5) {
        return 'Independent';
    }

    // 3. 卡位标的 (在龙头断板当天逆势封板的竞争者)
    const oldLeaders = allStocks.filter(s => s.role === 'Leader' && !s.isLimitUp);
    if (oldLeaders.length > 0 && stock.isLimitUp && myHeight >= 3) {
        return 'Substitute'; // 卡位
    }

    // 4. 板块核心 (板块内强度前二)
    const sectorSorted = [...sameSector].sort((a, b) => (b.strengthScore || 0) - (a.strengthScore || 0));
    if (sectorSorted[0]?.id === stock.id) return 'Main';
    if (sectorSorted[1]?.id === stock.id) return 'Vice';

    return 'Follower';
};

/**
 * 计算独立性得分 (Independence Score) - 算法优化 v2.0
 */
export const calculateIndependenceScore = (stock: Stock, marketIndices: MarketIndex[]): number => {
    const mainIndex = marketIndices.find(i => i.code.includes('sh000001'));
    if (!mainIndex) return 50;

    const indexChange = mainIndex.changePercent || 0;
    const stockChange = stock.changePercent || 0;

    let score = 50; // 中性

    // 1. 指数大跌，个股逆势上涨 (穿越基因)
    if (indexChange < -0.8 && stockChange > 1) {
        score += Math.abs(indexChange) * 25; 
    }
    
    // 2. 负反馈对冲：市场出现多只跌停时依然坚挺
    // 此处逻辑在识别时可结合全场跌停数

    // 3. 率先拉板 (卡位指数拐点)
    if (indexChange < 0 && stock.isLimitUp) {
        score += 15;
    }

    return Math.min(100, Math.max(0, score));
};

/**
 * 计算块共振得分 (Sector Resonance Score) - V8.7
 * 逻辑：
 * 1. 板块内涨停家数占比
 * 2. 板块平均涨幅
 * 3. 连板梯度
 * 4. 共振速率 (Resonance Velocity): 判定板块爆发的紧迫度
 */
export const calculateResonance = (stock: Stock, allStocks: Stock[], marketThemes: Theme[] = []): number => {
    const sector = stock.concept;
    if (!sector) return 0;
    
    const sameSector = allStocks.filter(s => s.concept === sector);
    if (sameSector.length === 0) return 0;
    
    const localLimitUps = sameSector.filter(s => s.isLimitUp).length;
    const localAvgChange = sameSector.reduce((sum, s) => sum + (s.changePercent || 0), 0) / sameSector.length;
    
    const globalTheme = marketThemes.find(t => t.name === sector);
    const globalLimitUps = globalTheme ? (globalTheme.stockCount || 0) : 0;
    
    const heights = new Set(sameSector.filter(s => s.isLimitUp).map(s => {
        const m = s.notes?.match(/(\d+)连板/);
        return m ? parseInt(m[1]) : 1;
    }));
    
    const effectiveLimitUps = Math.max(localLimitUps, globalLimitUps);
    
    let score = (effectiveLimitUps / 10) * 40; 
    score += Math.min(30, localAvgChange * 4);
    
    if (heights.size >= 3) score += 30;
    else if (heights.size >= 2) score += 15;

    // V8.7: 共振速率加成 (Resonance Velocity)
    // 逻辑：如果板块内有超过3只个股处于"星门加速"状态，分值提升
    const stargateAccelerating = sameSector.filter(s => s.stargate && s.stargate.gateLevel >= 2).length;
    if (stargateAccelerating >= 3) {
        score += 20;
    }
    
    return Math.round(Math.min(100, score));
};

/**
 * 计算次日溢价预期 (Premium Expectation)
 * 逻辑：
 * 1. 封板强度 (越高溢价越高)
 * 2. 板块共振 (集群效应增加溢价)
 * 3. 封单比与封板时间 (封死程度)
 * 4. 市场温度 (环境加成)
 * 5. 题材定性修正
 * 6. 风险对冲：如果处于退潮期且属于缩量板，降低溢价预期
 */
export const calculatePremiumExpectation = (stock: Stock, marketTemp: number): number => {
    if (!stock.isLimitUp) return 0;
    
    const strength = stock.strengthScore || 50;
    const resonance = stock.resonanceScore || 30;
    
    // 核心公式：溢价 = 强度权重 * 0.4 + 共振权重 * 0.3 + 市场环境加成
    let basePremium = (strength * 0.04) + (resonance * 0.03); 
    
    // 市场温度加成 (30-100)
    const tempFactor = (marketTemp - 50) / 10; 
    basePremium += tempFactor;
    
    // 题材定性修正
    if (stock.role === 'Leader') basePremium += 1.5; // 龙头有独立溢价
    if (stock.role === 'Substitute') basePremium -= 1.0; // 补涨溢价消失快
    
    // 风险对冲：如果处于退潮期且属于缩量板，降低溢价预期
    const turnover = stock.turnoverRate || 0;
    if (turnover < 2 && marketTemp < 45) {
        basePremium = Math.max(0, basePremium - 3);
    }
    
    return Number(Math.max(-3, basePremium).toFixed(1));
};

/**
 * 计算背离指数 (Divergence Index)
 * 逻辑：指数涨跌与市场情绪能量的差值。差值越大，说明市场处于“赚指数不赚钱”或“亏指数赚情绪”的背离状态。
 */
export const calculateDivergenceIndex = (indexChange: number, sentimentScore: number): number => {
    // 归一化处理：通常指数 1% 波动对应 10 个单位情绪分
    const diff = (sentimentScore * 10) - (indexChange * 10);
    return Number(diff.toFixed(1));
};

/**
 * 计算封板强度 (Limit-Up Strength) - v9.0 T+1 Optimized
 * 核心指标：封单比、换手率、封板时间
 * 优化目标：识别适合 T+1 隔日套利的“硬板”
 */
export const calculateLimitUpStrength = (stock: Stock): number => {
    if (!stock.isLimitUp) return 0;
    
    let score = 60;
    const turnover = stock.turnoverRate || 5; // 绝对换手率
    const notes = stock.notes || "";
    
    // V16.4 Deep Volume Analysis (基于历史均量的深度量能分析)
    // 逻辑升级：不再仅对比昨日，而是对比 MA5 (5日均量) 以平滑波动
    let volRatio = 1.0;
    let volStatus = 'Normal'; // 'ExtremeShrink' | 'Shrink' | 'Normal' | 'Overheat' | 'ExtremeHeat'

    if (stock.history && stock.history.length >= 5 && stock.volume) {
        // 计算 5日均量 (MA5 Volume)
        // 注意：history 通常按时间升序排列，取最后5个
        const recentHistory = stock.history.slice(-5);
        const totalVol5 = recentHistory.reduce((sum, h) => sum + (h.volume || 0), 0);
        const avgVol5 = totalVol5 / recentHistory.length;
        
        if (avgVol5 > 0) {
            // 标准量比 (Volume Ratio) = 今日量 / 5日均量
            volRatio = stock.volume / avgVol5;
            
            if (volRatio < 0.5) volStatus = 'ExtremeShrink'; // 极致缩量 (<0.5)
            else if (volRatio < 0.8) volStatus = 'Shrink';   // 缩量 (<0.8)
            else if (volRatio > 3.0) volStatus = 'ExtremeHeat'; // 异常天量 (>3.0)
            else if (volRatio > 2.0) volStatus = 'Overheat';    // 明显放量 (>2.0)
            // 0.8 ~ 2.0 之间视为正常/温和放量
        }
    } else {
        // Fallback: 数据不足时，退化为相对昨日对比
        if (stock.history && stock.history.length > 0 && stock.volume) {
            const lastVol = stock.history[stock.history.length - 1].volume || 1;
            const dayRatio = stock.volume / lastVol;
             if (dayRatio < 0.6) volStatus = 'ExtremeShrink';
             else if (dayRatio > 2.5) volStatus = 'ExtremeHeat';
        }
    }

    // 1. 量能评分逻辑 (Volume Score)
    if (volStatus === 'ExtremeShrink') {
        // 极致缩量：通常是一字板或加速秒板，强度极高
        score += 25; 
    } 
    else if (volStatus === 'Shrink') {
        // 缩量涨停：锁仓惜售，强势特征
        score += 15;
    }
    else if (volStatus === 'Normal') {
        // 温和放量 (0.8~2.0)：最健康的T+1接力形态
        // 既有换手洗盘，又没有筹码失控
        score += 10;
    }
    else if (volStatus === 'Overheat') {
        // 明显放量：分歧加大
        // 如果是首板，可能是好事；如果是高位连板，扣分
        const height = parseInt(notes.match(/(\d+)连板/)?.[1] || '1');
        if (height >= 3) score -= 10; 
    }
    else if (volStatus === 'ExtremeHeat') {
        // 异常天量：通常是顶部特征或主力出货
        score -= 20;
        // 如果同时还是烂板 (封单少)，重罚
        // 注意：这里无法直接获取封单量，但可以从 notes 推断
        if (notes.includes('烂板') || notes.includes('回封')) score -= 15;
    }
    
    // 2. 绝对死亡红线 (Absolute Safety Line)
    // 无论股性如何，换手率超过 50% 都是极高危的 (死亡换手)
    if (turnover > 50) score -= 50; 
    else if (turnover > 35) score -= 20;

    // 3. 封板时间逻辑 (Time Decay)
    // 早盘板 = 全天无抛压 = 明日溢价高
    // 尾盘板 = 资金偷袭/勉强回封 = 明日分歧大
    if (notes.includes('09:') || notes.includes('早盘')) score += 20; // 黄金时间
    else if (notes.includes('10:') || notes.includes('11:')) score += 10; // 白银时间
    else if (notes.includes('13:') || notes.includes('14:')) score -= 5; // 午后板，强度一般
    else if (notes.includes('尾盘')) score -= 15; // 尾盘偷袭，非奸即盗
    
    return Math.min(100, Math.max(0, score));
};

/**
 * 计算风险对冲因子 (Hedge Factor)
 */
export const calculateHedgeFactor = (metrics: any): number => {
    const limitDowns = metrics.limitDownCount || 0;
    const marketTemp = metrics.marketTemp || 50;
    
    let factor = (limitDowns * 5) + (100 - marketTemp) / 2;
    return Math.min(100, Math.max(0, factor));
};

/**
 * 计算相对板块强弱 (Relative Sector Strength)
 */
export const calculateRelativeSectorStrength = (stock: Stock, allStocks: Stock[]): number => {
    const sector = stock.concept;
    if (!sector) return 50;
    
    const sameSector = allStocks.filter(s => s.concept === sector);
    const avgSectorChange = sameSector.reduce((a, b) => a + (b.changePercent || 0), 0) / (sameSector.length || 1);
    
    const diff = (stock.changePercent || 0) - avgSectorChange;
    return 50 + (diff * 5); // 50 为基准
};

/**
 * 拟竞价数据 (Simulate Auction Data)
 * 仅用于补全实时性要求极高的数空缺
 */
export const simulateAuctionData = (stock: Stock) => {
    return calculateAuctionData(stock);
};

/**
 * 识别情绪拐点 (Inflection Point Detection) - v25.0 强化版
 * 逻辑：监测冰点崩溃后的衰竭信号 (Bottom) 与 亢奋一致后的衰减信号 (Peak)
 */
export const detectInflection = (metrics: DailyMetrics, sentimentHistory: SentimentPoint[]): 'None' | 'Bottom' | 'Peak' => {
    if (sentimentHistory.length < 4) return 'None';
    
    const latest = sentimentHistory[sentimentHistory.length - 1];
    const prev = sentimentHistory[sentimentHistory.length - 2];
    const old = sentimentHistory[sentimentHistory.length - 3];
    
    // 底部拐点检测 (冰点衰竭)：
    // 1. 市场温度处于极低区间 (< 35)
    // 2. 跌停数开始见顶回落
    // 3. 情绪分出现“底背离”或“勾头向上”
    if (metrics.marketTemp! < 35 && latest.score > prev.score && prev.score <= old.score) {
        if (metrics.limitDownCount < 15) return 'Bottom';
    }
    
    // 顶部拐点检测 (一致衰竭)：
    // 1. 市场温度处于极高区间 (> 85)
    // 2. 情绪分 (score) 连续走平或开始下行
    if (metrics.marketTemp! > 85 && latest.score < prev.score) {
        return 'Peak';
    }
    
    return 'None';
};

/**
 * 计算板块强度数据 (用于主题列表) - v30.0
 * 核心升级：基于内部结构生成动态战术定性文案 (Tactical Copy)
 * 修复：stockCount 统计逻辑
 */
export const analyzeThemes = (themes: Theme[], stocks: Stock[], marketThemes: Theme[] = []): Theme[] => {
    return themes.map(theme => {
        // v42.1 Fix: Merge Local Insight with Global Market Truth
        const globalTheme = marketThemes.find(mt => mt.name === theme.name);
        
        const relatedStocks = stocks.filter(s => s.concept === theme.name);
        const localCount = relatedStocks.length;
        
        // 1. 结构统计 (优先使用全市场数据)
        const globalLimitUpCount = globalTheme ? globalTheme.stockCount : 0;
        const localLimitUpStocks = relatedStocks.filter(s => s.isLimitUp);
        const localLimitUpCount = localLimitUpStocks.length;
        
        // 核心修正：取大值，避免漏统计
        // V43.0 Optimization: Use Fuzzy Matching for Local Count to capture multi-tag stocks
        const fuzzyLocalLimitUps = stocks.filter(s => s.isLimitUp && s.concept?.includes(theme.name)).length;
        const effectiveLimitUpCount = Math.max(globalLimitUpCount || 0, fuzzyLocalLimitUps);

        const avgChange = localCount > 0 
            ? relatedStocks.reduce((sum, s) => sum + (s.changePercent || 0), 0) / localCount 
            : 0;
            
        // 2. 领涨股识别 (优先连板高度，其次涨幅)
        const leader = relatedStocks.sort((a, b) => {
            if (a.isLimitUp && !b.isLimitUp) return -1;
            if (!a.isLimitUp && b.isLimitUp) return 1;
            return (b.changePercent || 0) - (a.changePercent || 0);
        })[0];
        
        const leaderName = leader?.name || '--';
        const leaderHeight = leader?.notes?.match(/(\d+)连板/)?.[1] || (leader?.isLimitUp ? '1' : '0');

        // 3. 动态战术定性生成 (Dynamic Tactical Copy)
        let logic = theme.logic || "观察中";
        let type: Theme['type'] = 'Hidden'; // Default to Hidden

        // 风险因子计算 (Risk Factors for Decline Detection)
        // 基于全市场实时数据与历史形态的负反馈计算
        const limitDowns = relatedStocks.filter(s => (s.changePercent || 0) < -9.5).length;
        const bigLosses = relatedStocks.filter(s => (s.changePercent || 0) < -5 && (s.currentPrice || 0) < (s.high || 0) * 0.92).length;
        const leaderCrash = leader && (parseInt(leaderHeight) >= 3 || (leader.role === 'Leader')) && (leader.changePercent || 0) < -5;

        // 状态判定逻辑 (State Machine)
        if (limitDowns >= 2 || (limitDowns >= 1 && bigLosses >= 3) || leaderCrash) {
             logic = `【退潮预警】${leaderCrash ? `核心龙头${leaderName}重挫` : '板块出现亏钱效应'}，${limitDowns}家跌停，资金坚决出逃，注意规避。`;
             type = 'Decline';
        } else if (effectiveLimitUpCount >= 8) {
            logic = `【绝对主线】${leaderName} ${leaderHeight}板领衔，全市场${effectiveLimitUpCount}家涨停，高潮确立。`;
            type = 'Main';
        } else if (effectiveLimitUpCount >= 4) {
            logic = `【强势板块】${leaderName} 领涨，梯队完整，全市场${effectiveLimitUpCount}家涨停助攻。`;
            type = 'Main';
        } else if (effectiveLimitUpCount >= 2) {
             logic = `【局部活跃】${leaderName} 率先封板，板块内${effectiveLimitUpCount}家涨停，关注持续性。`;
             type = 'Sub';
        } else if (avgChange > 2) {
            logic = `【异动观察】${leaderName} 领涨 ${leader?.changePercent?.toFixed(1)}%，板块整体趋强。`;
            type = 'Sub';
        } else if (avgChange < -1.5) {
             logic = `【调整压力】板块承压，${leaderName} 逆势表现，需警惕补跌。`;
             type = 'Hidden'; // Hidden but negative
        } else {
             logic = `【震荡整理】${leaderName} 相对强势，板块轮动效应不明显。`;
             type = 'Hidden';
        }

        // v41.3 Solo Run Detection (中军独行/梯队脱节)
        // 逻辑：核心大涨，但板块整体并不强，且缺乏涨停梯队助攻
        if (type === 'Hidden' || type === 'Sub') {
             const strongLeader = relatedStocks.find(s => (s.changePercent || 0) > 6 && !s.isLimitUp); // 大涨但未封板，或者封板了但没带动小弟
             const isSectorWeak = avgChange < 1.0;
             const lowLimitUps = effectiveLimitUpCount <= 1;

             if (strongLeader && isSectorWeak && lowLimitUps) {
                 logic = `【中军独行】${strongLeader.name} 大涨${strongLeader.changePercent?.toFixed(1)}%，但后排分歧严重(均幅${avgChange.toFixed(1)}%)，谨防拉高出货。`;
                 type = 'Sub'; // 强制提升为 Sub 以便看见，但文案提示风险
             }
        }

        // v41.4 Leaderless Rally (群龙无首/高低切)
        // 逻辑：板块整体均幅不错(>1.5%)，看似红火，但核心龙头却是绿的(<0%)
        if (type === 'Main' || type === 'Sub') {
             const isLeaderWeak = leader && (leader.changePercent || 0) < -0.5;
             const isSectorStrong = avgChange > 1.5;

             if (isLeaderWeak && isSectorStrong) {
                  logic = `【群龙无首】后排补涨掩护，核心龙头${leaderName}反而收绿，警惕高位退潮。`;
                  // 这种通常是诱多，虽然看起来像 Main，但其实很脆弱
             }
        }

        // v41.2 PreLaunch Detection (蓄势待发)
        // 逻辑：板块尚未高潮(Main/Sub)，且未处于退潮期(Decline)，但整体均涨且有资金试盘
        if (type === 'Hidden') {
            const hasPioneer = relatedStocks.some(s => (s.changePercent || 0) > 4.5 && !s.isLimitUp);
            const upRatio = localCount > 0 ? relatedStocks.filter(s => (s.changePercent || 0) > 0).length / localCount : 0;
            const isHeavyVolume = relatedStocks.some(s => (s.volumeRatio || 0) > 1.5 && (s.changePercent || 0) > 2);

            if (avgChange > 0.3 && (hasPioneer || upRatio > 0.6 || isHeavyVolume)) {
                logic = `【蓄势待发】${hasPioneer ? `资金点火${leaderName}试盘` : '板块呈普涨态势'}，量能温和放大，密切关注首板启动。`;
                type = 'PreLaunch';
            }
        }

        // Special Override: High strength score implies Main/Sub (but Decline has priority)
        const strength = Math.min(100, (effectiveLimitUpCount * 15) + (avgChange * 4) + (localCount > 20 ? 10 : 0));
        if (strength > 80 && type !== 'Decline') type = 'Main';

        return {
            ...theme,
            type: type, // Dynamically update type
            stockCount: effectiveLimitUpCount, // Ensure this aligns with Type definition (Limit Up Count)
            strength: strength,
            leaderName: leaderName,
            logic: logic // Override static logic with dynamic tactical copy
        };
    });
};

/**
 * 计算市场熵值 (Market Entropy / Chaos Index) - v24.0
 * 逻辑：衡量市场波动的无序度。
 * 熵值高 = 混沌期，逻辑轮动极快，中位股极其危险。
 * 熵值低 = 秩序期，龙头效应明显，适合重仓核心。
 * 
 * 修正 (v6.1)：引入“多空撕裂度 (Polarization)”因子
 * 当涨停与跌停同时涌现时，虽然标准差大，但这代表“剧烈分歧”而非简单的无序。
 */
export const calculateMarketEntropy = (stocks: Stock[]): number => {
    if (stocks.length < 5) return 50;
    
    // 1. 涨跌分布的离散度 (Dispersion)
    const changes = stocks.map(s => s.changePercent || 0);
    const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
    const variance = changes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / changes.length;
    const stdDev = Math.sqrt(variance);

    // 2. 逻辑一致性 (Consistency)
    const consistency = calculateTopConceptConsensus(stocks).consensus * 100;
    
    // 3. 多空撕裂度 (Polarization) - New v6.1
    const limitUps = stocks.filter(s => s.isLimitUp).length;
    const limitDowns = stocks.filter(s => (s.changePercent || 0) < -9).length;
    const polarization = (Math.min(limitUps, limitDowns) / (Math.max(limitUps, limitDowns) || 1)) * 100;

    // 熵值核心公式 v6.1：
    // 基础熵 (离散度) + 无序惩罚 (1 - 一致性) + 撕裂惩罚 (Polarization)
    // 如果一致性高 (Consistency > 60)，熵值大幅降低
    let entropy = (stdDev * 5) + (100 - consistency) * 0.8 + (polarization * 0.4);
    
    // 极端修正
    if (limitDowns > limitUps * 1.5) entropy += 15; // 恐慌盘主导，视为高熵(不可控)

    return Math.min(100, Math.max(0, entropy * 0.65)); 
};

/**
 * 龙头生存概率模型 (Dragon Survival Model) - v24.0
 * 逻辑：基于空间高度、量价关系、市场温度及 Alpha 背离，预判当前最高标次日晋级概率
 * v7.1 优化：加入板块共振因子
 */
export const calculateDragonSurvival = (leader: Stock, marketTemp: number, phase: string, allStocks?: Stock[]): number => {
    if (leader.role !== 'Leader' && leader.role !== 'Main') return 0;
    
    const height = parseInt(leader.notes?.match(/(\d+)连板/)?.[1] || '0');
    if (height === 0) return 50;

    let probability = 60; // 基础概率

    // 1. 空间压制 (V16.5 动态天花板)
    // 逻辑升级：不再死板规定 7 板为大顶，而是参考历史妖股极限 (通常 9-11 板)
    // 如果是创业板(300)/科创板(688)，天花板天然低 (通常 4-5 板)
    const is20cm = leader.code.startsWith('sz300') || leader.code.startsWith('sh688');
    const ceiling = is20cm ? 5 : 9;
    
    if (height >= ceiling) probability -= (height - ceiling + 1) * 15; // 接近天花板，概率指数级下降

    // 2. 能量衰减：Alpha 背离 + MFI
    // V16.5 引入 ATR 波动率修正：高波动股允许更大的 Alpha 偏离
    const { alpha } = calculateAlphaDivergence(leader.history || []);
    // 简易 ATR 模拟：振幅 > 10% 视为高波，容忍度翻倍
    const volatility = ((leader.high || 0) - (leader.low || 0)) / (leader.prevClose || 1) * 100;
    const alphaThreshold = volatility > 10 ? -20 : -10;
    
    if (alpha < alphaThreshold) probability -= Math.abs(alpha) * 1.5;

    const mfi = leader.technicals?.mfi;
    const rsi = leader.technicals?.rsi?.rsi6;

    // MFI (Institutional Activity) Validation
    // If stock is high but MFI is low (< 40), it means "Price Up, Money Down" (Empty Rally)
    if (mfi !== undefined && mfi < 40 && height >= 3) {
        probability -= 15; 
    }
    // If MFI is high (> 70), strong institutional support
    if (mfi !== undefined && mfi > 70) {
        probability += 10;
    }

    // RSI Extreme Risk
    if (rsi !== undefined && rsi > 95) {
        probability -= 10; // Extreme overbought risk
    }

    // 3. 市场环境加成
    if (marketTemp > 75) probability += 15; // 亢奋期溢价
    if (marketTemp < 35) probability -= 20; // 冰点期恐慌

    // 4. 周期位置
    if (phase === 'Ebb') probability -= 25; // 退潮期"杀高标"
    if (phase === 'Startup') probability += 20; // 启动期"龙抬头"

    // 5. 获利盘缓冲 (Profit Cushion) - v6.1
    // 逻辑：如果标的近期涨幅巨大 (>35%)：
    // - 在主升期 (Climax/Startup) 代表人气极旺，是加分项
    // - 在退潮期 (Ebb/Ice) 代表获利盘兑现压力大是减分项
    const recentGain = (leader.currentPrice && leader.history && leader.history.length > 5) 
        ? ((leader.currentPrice - leader.history[leader.history.length - 5].close) / leader.history[leader.history.length - 5].close) * 100 
        : 0;

    if (recentGain > 35) {
        if (phase === 'Climax' || phase === 'Startup') probability += 10;
        else if (phase === 'Ebb') probability -= 15;
    }

    // 6. 主力/机构资金态度 (V16.5 深度修正：净流入占比)
    // 抛弃绝对金额判断，改用 "净流入 / 成交额" (Net Inflow Ratio)
    // 逻辑：小盘股流入 2000万 可能占比 30% (控盘)，大盘股流入 1亿 可能占比 1% (散户)
    if (leader.mainForceInflow && leader.turnoverAmount) {
        const flowRatio = leader.mainForceInflow / leader.turnoverAmount; // 净额 / 总成交
        
        if (flowRatio > 0.15) probability += 15; // 净买入 > 15%，绝对控筹
        else if (flowRatio > 0.05) probability += 8; // 净买入 > 5%，积极做多
        else if (flowRatio < -0.10) probability -= 15; // 净流出 > 10%，大举出货
        else if (flowRatio < -0.05) probability -= 5;
    } 
    // Fallback: 如果没有 turnoverAmount，使用估算值
    else if (leader.mainForceInflow && leader.volume && leader.currentPrice) {
         const estTurnover = leader.volume * leader.currentPrice;
         const flowRatio = leader.mainForceInflow / estTurnover;
         
         if (flowRatio > 0.1) probability += 10;
         else if (flowRatio < -0.1) probability -= 10;
    }

    // 7. 换手稳定性 (Turnover Stability) - v8.0 New
    // 逻辑：防止死亡换手 (除新股外，换手过高意味着筹码松动)
    const turnover = leader.turnoverRate || 0;
    const isNewStock = leader.name.includes('N') || leader.name.includes('C');
    if (!isNewStock) {
        if (turnover > 60) probability -= 30; // 绝对死亡换手，必死无疑
        else if (turnover > 50) probability -= 20; // 死亡换手
        else if (turnover > 30 && height >= 4) probability -= 10; // 高位放量分歧
    }

    // v7.1 新增：板块共振因子
    // 如果龙头所在板块有多只涨停（板块共振强），生存概率提升
    if (allStocks && leader.concept) {
        const sectorStocks = allStocks.filter(s => s.concept === leader.concept);
        const sectorLimitUps = sectorStocks.filter(s => s.isLimitUp).length;
        
        // 板块涨停数 >= 3：+10%
        // 板块涨停数 >= 5：+20%
        // 板块涨停数 >= 8：+30%（绝对主线）
        if (sectorLimitUps >= 8) probability += 30;
        else if (sectorLimitUps >= 5) probability += 20;
        else if (sectorLimitUps >= 3) probability += 10;
        
        // 如果龙头是板块内唯一涨停（孤岛效应），危险信号
        if (sectorLimitUps === 1 && height >= 3) probability -= 15;
    }

    return Math.round(Math.min(95, Math.max(5, probability)));
};

/**
 * 计算 T+1 隔夜安全模型 (Overnight Safety Model) - v10.0
 * 预测次日开盘溢价与持仓安全性
 */
export const calculateOvernightPotential = (stock: Stock, localMetrics: any, phase: string): {
    score: number,             // 综合评分 (0-100)
    probability: string,       // 连板/溢价概率 (High/Med/Low)
    expectedOpen: string,      // 预期开盘幅度
    riskType: string,          // 风险类型 (炸板/低开/核按钮)
    strategy: string           // 操作指引
} => {
    // 0. 基础随机熵 (Entropy) - 让不同股票即使数据缺失也有不同表现
    // 使用股票代码作为种子，确保同一股票每次推演结果一致
    const codeSeed = parseInt(stock.code.replace(/\D/g, '') || "0") % 100;
    const entropy = (codeSeed / 100) - 0.5; // -0.5 ~ +0.5
    
    let score = 50 + (entropy * 20); // 基础分引入 +/- 10分波动
    
    const isLimitUp = stock.isLimitUp;
    const change = stock.changePercent || 0;
    const turnover = stock.turnoverRate || (5 + entropy * 5); // 模拟换手率
    const sealStrength = localMetrics?.sealStrength || (isLimitUp ? 60 + entropy * 20 : 0);
    const moneyInflow = stock.mainForceInflow || (entropy * 10000000); 
    
    // 1. 基础分：基于涨幅状态
    if (isLimitUp) score = 80; // 涨停板基础分提高
    else if (change > 7) score = 70;
    else if (change > 3) score = 60;
    else if (change < -5) score = 30;
    else if (change < -9) score = 10;
    
    // 修正：根据代码种子微调，避免同质化
    score += (codeSeed % 10) - 5; 

    // 2. 封板质量修正 (Seal Quality)
    // 尝试从 localMetrics 或 stock 原生数据中获取封单力度
    let finalSealStrength = localMetrics?.sealStrength || 0;
    
    if (isLimitUp && finalSealStrength === 0) {
        // Fallback: 基于封单金额估算强度
        // 假设 bid1Amount 是手 (后端 data[10])
        const bidVol = stock.bid1Amount || 0; 
        const bidMoney = bidVol * 100 * (stock.currentPrice || 10); // 元
        
        if (bidMoney > 100000000) finalSealStrength = 90; // > 1亿
        else if (bidMoney > 50000000) finalSealStrength = 75; // > 5000万
        else if (bidMoney > 10000000) finalSealStrength = 60; // > 1000万
        else finalSealStrength = 40; // 烂板
        
        // 加上随机扰动
        finalSealStrength += (entropy * 10);
    }

    if (isLimitUp) {
        // 封单越强，溢价越高
        score += (finalSealStrength - 50) * 0.5; // +/- 15分波动
        
        // 封板时间修正 (Time Decay)
        // 越早封板，第二天溢价越高
        if (stock.notes?.includes('09:')) score += 15;
        else if (stock.notes?.includes('10:')) score += 10;
        else if (stock.notes?.includes('14:')) score -= 10;
        else if (stock.notes?.includes('尾盘')) score -= 20;
    } else {
        // 非涨停股，看承接
        if (change > 0 && change < 5) {
             score += 5; // 温和上涨，加分
        }
    }

    // 3. 换手率博弈 (Turnover Game)
    // 死亡换手 (>50%) 极大概率低开或核按钮
    if (turnover > 55) score -= 40;
    else if (turnover > 40) score -= 20;
    else if (turnover < 5 && isLimitUp) score += 15; // 缩量一字/秒板
    else if (turnover > 15 && change > 5) score += 5; // 高换手高涨幅，有人气

    // 4. 主力资金态度 (Main Force Attitude)
    if (moneyInflow > 10000) score += 10; // 大举流入 > 1亿
    else if (moneyInflow < -5000) score -= 15; // 主力出逃
    
    // 额外因子：量比
    if ((stock.volumeRatio || 1) > 2) score += 5;

    // --- V49.6 FIX: STRUCTURAL OVERRIDES (形态修正) ---
    // Prevent "Limit Down Exit" panic for healthy consolidations (Ambush/Refuel)
    
    // A. Ambush/Low-Suck Structure (潜伏/低吸)
    // Criteria: Shrinking volume + Price stable + Money In (or at least not fleeing)
    const isShrinking = turnover < 3.0; 
    const isStable = change > -3.5 && change < 3.5;
    const isMoneySafe = moneyInflow > -2000; 
    
    if (isShrinking && isStable && isMoneySafe) {
        // If score was nuked by "low price change", restore it to "Safe Observation" level
        if (score < 50) score = 55 + (entropy * 10);
    }

    // B. Refueling Structure (空中加油)
    // Criteria: Trend Up (implied by MA alignment, here simplified) + RSI healthy
    // Since we don't have full tech indicators here, we rely on change/vol profile
    if (change > 0 && change < 5 && turnover > 5 && turnover < 15) {
         // Healthy turnover with mild rise -> Good T+1 expectation
         score += 10;
    }

    // C. Deep Bear Protection (防止错杀跌停)
    // Only trigger "Nuclear Button" (Score < 30) if change is ACTUALLY deep red
    if (score < 30 && change > -6) {
        score = 35; // Lift to "Low Probability" but not "Nuclear"
    }

    // 5. 情绪周期修正
    if (phase === 'Climax') score += 10;
    if (phase === 'Ebb') score -= 15;

    // --- Output Generation ---
    let probability = "中性";
    let expectedOpen = "平盘 (0%)";
    let riskType = "正常分歧";
    let strategy = "观察竞价";

    // 归一化分数
    score = Math.min(99, Math.max(10, score));

    if (score >= 85) {
        probability = "极高";
        expectedOpen = "+5% ~ 一字";
        riskType = "踏空风险";
        strategy = "必须隔夜排板，甚至可打板确认";
    } else if (score >= 75) {
        probability = "高";
        expectedOpen = "+3% ~ +5%";
        riskType = "高开低走";
        strategy = "持股待涨，不破均线不走";
    } else if (score >= 60) {
        probability = "中高";
        expectedOpen = "+1% ~ +3%";
        riskType = "冲高回落";
        strategy = "去弱留强，冲高止盈";
    } else if (score >= 45) {
        probability = "中";
        expectedOpen = "-1% ~ +1%";
        riskType = "震荡洗盘";
        strategy = "低吸高抛，切勿追高";
    } else if (score >= 30) {
        probability = "低";
        expectedOpen = "-2% ~ -4%";
        riskType = "低开闷杀";
        strategy = "竞价不及预期直接抢跑";
    } else {
        probability = "极低";
        expectedOpen = "跌停开盘";
        riskType = "核按钮";
        strategy = "挂跌停出货，保命第一";
    }

    return {
        score: Math.floor(score),
        probability,
        expectedOpen,
        riskType,
        strategy
    };
};

/**
 * 战术决策矩阵 (War Room Matrix) - v41.2
 * 逻辑：由算法深计算，而非模拟。基于 (情绪周期 x 市场熵值 x 诱多风险 x 题材共振) 四维空间坐标。
 * v41.2 Update: 引入 TrapGuard 诱多阻断与 ThemeResonance 题材共振因子
 * 输出：决定当前的战术方针、仓位上限及核心博弈点。
 */
export interface TacticalDecision {
    mode: 'Attack' | 'Defend' | 'Observe' | 'Retreat';
    positionLimit: number; // 0-100
    riskThreshold: number; // 风险容忍度
    tacticalFocus: string;
    warningSignal: string;
}

export const calculateTacticalMatrix = (
    phase: MarketPhase,
    temp: number,
    entropy: number,
    metrics: DailyMetrics,
    trapContext: { riskLevel: 'Critical' | 'High' | 'Medium' | 'Low', riskCount: number } = { riskLevel: 'Low', riskCount: 0 },
    resonanceContext: { mainThemeCount: number, strongestThemeScore: number } = { mainThemeCount: 0, strongestThemeScore: 0 }
): TacticalDecision => {
    let mode: 'Attack' | 'Defend' | 'Observe' | 'Retreat' = 'Observe';
    // V8.0 Adaptive: Start with Temperature as the base for Position Sizing
    // Logic: If market is hot (80), you should be heavy (80%). If cold (20), light (20%).
    let positionLimit = Math.max(10, Math.min(90, temp));
    
    // V8.0 Adaptive: Risk Threshold based on Entropy (Uncertainty)
    // Logic: High Entropy = High Risk. 
    let riskThreshold = Math.max(10, Math.min(90, entropy)); 

    let tacticalFocus = '寻找主线';
    let warningSignal = '正常波动';

    // 1. Phase-based Bias (Shift the base temperature logic)
    // 周期修正：不仅仅看温度，还要看温度的“方向”
    switch (phase) {
        case 'Startup': // 启动期：虽然温度可能还低，但预期高，仓位激进
            mode = 'Attack';
            positionLimit = Math.max(positionLimit, 60); 
            riskThreshold -= 20; // 容忍风险
            tacticalFocus = '试错先锋/进攻龙头';
            break;
        case 'Climax': // 高潮期：温度高，但危险也开始累积
            mode = 'Observe'; // 盛极而衰，转为持仓观察
            positionLimit = 80; // 允许满仓持有，但不开新仓
            riskThreshold += 10; // 风险敏感度提高
            tacticalFocus = '锁仓龙头/只出不进';
            warningSignal = '谨防情绪一致性崩塌';
            break;
        case 'Ebb': // 退潮期：温度下降，风险剧增
            mode = 'Retreat';
            positionLimit = Math.min(positionLimit, 30); // 强制降仓
            riskThreshold = 20; // 极度厌恶风险
            tacticalFocus = '防守/空仓/卖出杂毛';
            warningSignal = '杀高标/亏钱效应扩散';
            break;
        case 'Ice': // 冰点期：温度极低，风险释放完毕
            mode = 'Observe'; 
            positionLimit = Math.min(positionLimit, 20); // 试错仓位
            // 冰点期的风险其实不高（跌不动了），但胜率低
            tacticalFocus = '寻找破局点/首板试错';
            warningSignal = '情绪极度低迷';
            break;
        case 'Repair': // 修复期
            mode = 'Attack';
            tacticalFocus = '做多反核/弱转强';
            break;
        case 'Chaos': // 混沌期
        default:
            mode = 'Observe';
            positionLimit = Math.min(positionLimit, 40);
            tacticalFocus = '控制回撤/轻仓套利';
            warningSignal = '无序轮动';
            break;
    }

    // 2. 熵值动态修正 (Entropy Penalty)
    // 熵值代表混乱度。熵值 > 65 时，即使温度高也是“乱炒”，容易亏钱。
    if (entropy > 65) {
        positionLimit *= 0.7; // 混乱期打7折
        if (mode === 'Attack') mode = 'Observe'; // 降级
        warningSignal = `高熵混沌 (${entropy.toFixed(0)})`;
    }

    // 3. 指数背离一票否决 (Index Veto)
    if (metrics.divergenceIndex && Math.abs(metrics.divergenceIndex) > 15) {
        positionLimit *= 0.6; // 背离严重，打6折
        warningSignal = '指数与情绪严重背离';
    }
    
    // 4. TrapGuard 诱多阻断修正 (v41.2)
    if (trapContext.riskCount > 5 || trapContext.riskLevel === 'Critical') {
        positionLimit *= 0.5; // 诱多高发，直接减半
        mode = 'Defend';
        tacticalFocus = '严防诱多/只卖不买';
        warningSignal = `TrapGuard: 高危 (${trapContext.riskCount}信号)`;
    } 
    
    // 5. 题材共振奖励 (Resonance Bonus)
    // 如果有强主线，可以无视部分风险
    if (resonanceContext.mainThemeCount > 0) {
        const bonus = Math.min(20, resonanceContext.strongestThemeScore / 5);
        positionLimit += bonus;
        if (phase === 'Chaos' || phase === 'Repair') {
            mode = 'Attack'; // 共振确立，混沌转进攻
            tacticalFocus = `聚焦核心: 主线共振强`;
        }
    }

    // 6. 恐慌熔断器 (Panic Veto) - v42.1 NEW
    // 逻辑：全市场跌停数 > 40 时，系统性风险爆发，强制空仓避险
    // 无论局部龙头多强，大概率补跌
    if (metrics.limitDownCount > 40) {
        mode = 'Retreat';
        positionLimit = 0; // 强制归零
        tacticalFocus = '⛔ 系统性崩盘/空仓避险';
        warningSignal = `全市场跌停爆发 (${metrics.limitDownCount}家)`;
    }

    return {
        mode,
        positionLimit: Math.round(Math.min(100, Math.max(0, positionLimit))),
        riskThreshold: Math.round(Math.min(100, Math.max(0, riskThreshold))),
        tacticalFocus,
        warningSignal
    };
};

/**
 * 大面值/大亏损统计 (Big Loss / Facial Slap Counter) - v28.0
 * 逻辑：监测从涨幅 > 7% 回落至 < -2% 的标的数量，这是情绪退潮的最直接指标。
 */
export const calculateBigLossContagion = (stocks: Stock[]): { count: number, severity: 'Low' | 'Medium' | 'High' } => {
    const bigLosses = stocks.filter(s => {
        // V59.4 FIX: "大面" = stock that once surged >7% intraday but closed below -2%.
        // Previous code only checked (changePercent < -2 && price < open*0.92),
        // missing the critical "had a high point" condition.
        const prevClose = s.prevClose || s.open || 0;
        const hadHighPoint = prevClose > 0 && (s.high || 0) > prevClose * 1.07; // 日内曾涨超7%
        const closedDeepRed = (s.changePercent || 0) < -2; // 最终收跌超2%
        const intradayDrop = hadHighPoint && closedDeepRed;
        return intradayDrop;
    });

    const count = bigLosses.length;
    let severity: 'Low' | 'Medium' | 'High' = 'Low';
    if (count >= 5) severity = 'High';
    else if (count >= 2) severity = 'Medium';

    return { count, severity };
};

/**
 * 封板质量评分 (Limit Seal Quality) - v28.0
 * 因素：封板时间、炸板次数、封单额/流通盘比
 */
export const calculateSealQuality = (stock: Stock): number => {
    if (!stock.isLimitUp) return 0;
    
    let score = 80;
    
    // 1. 时间惩罚：10:30 后封板每半小时扣 5 分
    const sealTime = stock.notes?.match(/(\d{2}:\d{2})封板/)?.[1];
    if (sealTime) {
        const [hour, minute] = sealTime.split(':').map(Number);
        const timeVal = hour * 60 + minute;
        if (timeVal > 630) { // After 10:30
             score -= Math.floor((timeVal - 630) / 30) * 8;
        }
    } else if (stock.notes?.includes('午后') || stock.notes?.includes('尾盘')) {
        score -= 25;
    }

    // 2. 稳定性惩罚：炸板次数
    const brokenCount = parseInt(stock.notes?.match(/炸板(\d+)次/)?.[1] || '0');
    score -= brokenCount * 15;

    // 3. 封单力道 (如有)
    if (stock.strengthScore) score = (score + stock.strengthScore) / 2;

    return Math.max(0, Math.min(100, score));
};

/**
 * 板块拥挤度分析 (Sector Crowdedness) - v26.0
 * 逻辑：分析一个题材内跟风盘的比例。跟风盘越多，说明资金已经过度拥挤，容易发生踩踏。
 */
export const calculateCrowdedness = (themeName: string, stocks: Stock[]): number => {
    const sectorStocks = stocks.filter(s => s.concept === themeName);
    if (sectorStocks.length === 0) return 0;

    const limitUps = sectorStocks.filter(s => s.isLimitUp).length;
    const followers = sectorStocks.filter(s => s.role === 'Follower' || s.role === 'Normal').length;
    const leaders = sectorStocks.filter(s => s.role === 'Leader' || s.role === 'Main').length;

    // 拥挤度 = (涨停比例 * 0.4) + (跟风/领涨比例 * 0.6)
    const limitUpRate = limitUps / sectorStocks.length;
    const clusterRatio = followers / (leaders || 1);

    const score = (limitUpRate * 50) + (Math.min(clusterRatio, 10) * 5);
    return Math.min(100, score);
};

/**
 * 资金诚意评分 (Money Quality Score) - v29.0
 * 逻辑：基于分时量价关系、封单强度、以及相对于全场流动性的占比。
 * 真实逻辑：不仅看涨幅，更看“有效成交”与“订单流压力”。
 */
export const calculateMoneyQuality = (stock: Stock): number => {
    const change = stock.changePercent || 0;
    const turnover = stock.turnoverRate || 0;
    const current = stock.currentPrice || 0;
    const open = stock.open || current;
    const high = stock.high || current;
    
    if (change <= 0) return 30; // 负反馈标的诚意不足

    let score = 50;

    // 1. 量价配合因子：高位缩量是风，低位放量是诚意
    // 如果涨幅 > 7% 但换手极低 (< 2%)，可能是“缩量加速”，诚意分降低（风险增加）
    if (change > 7 && turnover < 2) score -= 20; 
    // 如果换手适中 (5-10%) 且涨停，是黄金换手
    if (stock.isLimitUp && turnover > 5 && turnover < 15) score += 30;

    // 2. 承接力因子：从最高点回落的比例
    const dropFromHigh = high > 0 ? ((high - current) / high) * 100 : 0;
    score -= (dropFromHigh * 10); // 每一平点回落扣 10 分

    // 3. 价格站位：收盘接近开盘（假阳线）惩罚
    if (current > open && (current - open) / open < 0.01 && change > 3) {
        score -= 15; // 诱多嫌疑
    }

    return Math.max(0, Math.min(100, score));
};

/**
 * 流动性熵值计算 (Liquidity Entropy) - v29.0
 * 逻辑：监测资金在标的内的活跃度与“撤单压力”。基于成交量分布。
 */
export const calculateLiquidityEntropy = (stock: Stock): number => {
    const volume = stock.volume || 0;
    const turnover = stock.turnoverRate || 0;
    
    if (volume === 0) return 0;
    
    // 简化版熵值：反映资金参与的广度
    // 实际上应基于 L2 逐笔，此处用成交量与换手的比例仿真
    const entropy = Math.log10(volume) * (turnover / 10);
    return Math.min(100, entropy * 5);
};

/**
 * 筹码结构压力计算 (Chip Structure Pressure) - v33.1 (Enhanced Safety)
 * 逻辑：计算当前价格上方的套牢盘比例。
 * 核心原理：过去 120 个交易日（半年）中，成交在当前价格上方（>3%）的筹码视为“潜在抛压”。
 * 升级：从 60 天扩展至 120 天，以覆盖更长周期的“老鸭头”或“双顶”套牢盘。
 */
export const calculateChipPressure = (history: { close: number; volume?: number }[], currentPrice: number): number => {
    if (!history || history.length < 5) return 0;
    
    const recent = history.slice(-120); // Last 120 days (Half Year)
    let totalWeightedVol = 0;
    let trappedWeightedVol = 0;
    
    recent.forEach((day, index) => {
        const vol = day.volume || 0;
        // Time Decay Factor: Recent chips are more "Active", old chips might be "Dead" (Long-term holders)
        // Weight = 0.3 (oldest) -> 1.0 (newest)
        // Adjusted decay to give some respect to 4-month old traps but prioritize recent 2 months
        const weight = 0.3 + (0.7 * (index / recent.length));
        
        const weightedVol = vol * weight;
        totalWeightedVol += weightedVol;
        
        // If Close > Current Price * 1.03, assume these buyers are trapped and want to sell on rebound
        if (day.close > currentPrice * 1.03) {
            trappedWeightedVol += weightedVol;
        }
    });
    
    if (totalWeightedVol === 0) return 0;
    
    const ratio = trappedWeightedVol / totalWeightedVol;
    
    // If > 40% chips are trapped above, Score -> 80 (High Pressure)
    // If 0% trapped, Score -> 0 (Blue Sky)
    return Math.min(100, ratio * 200); 
};

/**
 * 动能衰减监测 (Exhaustion Radar) - v27.0
 * 逻辑：识别“放量滞涨”与“高位缩量强撑”的陷阱
 */
export const detectExhaustion = (stock: Stock): { isExhausted: boolean; reason: string } => {
    const history = stock.history || [];
    if (history.length < 3) return { isExhausted: false, reason: '' };
    
    const today = { price: stock.currentPrice || 0, volume: stock.volume || 0 };
    const yesterday = history[history.length - 1];
    const prev = history[history.length - 2];

    // 1. 放量滞涨 (Volume up, Price flat/down)
    if (today.volume > yesterday.volume * 1.5 && (stock.changePercent || 0) < 2 && (stock.changePercent || 0) > -2) {
        return { isExhausted: true, reason: '放量滞涨：筹码高度松动，主力派发嫌疑' };
    }

    // 2. 缩量高位连板 (Hidden Divergence)
    // Only flag as exhaustion if not a "strong seal" (Time check would be better, but simplified here)
    // If it's a T-formatted limit up (huge volume then seal), it's not exhaustion.
    // If it's pure shrinking volume (volume < 0.2 * prev), it might be danger.
    if (stock.isLimitUp && today.volume < yesterday.volume * 0.4) {
        // Reduced severity: Shrinking volume on limit up is often GOOD (Locking).
        // Only warn if it's extreme and market phase is bad.
        // We defer to the Alpha engine for the real "Divergence" check.
        // return { isExhausted: true, reason: '缩量加速：极度一致后的风险，谨防次日断板踩踏' };
    }

    return { isExhausted: false, reason: '' };
};

/**
 * 利润保卫算法 (Profit Guard Algorithm) - v27.0 -> v7.6
 * 逻辑：根据当前盈利比例、市场阶段及波动率自动计算动态止损位
 * v7.6 针对“中军容量票”优化：增加呼吸空间，防止大市值标的被震仓出局
 */
export const calculateTrailingStop = (stock: Stock, phase: MarketPhase): number => {
    const current = stock.currentPrice || 0;
    const cost = stock.costPrice || 0;
    if (current === 0 || cost === 0) return 0;

    const profit = ((current - cost) / cost) * 100;
    const isMain = stock.role === 'Main'; // 中军容量票标识
    const isHyper = stock.code.includes('sh688') || stock.code.includes('sz300') || stock.code.includes('bj'); // 20cm/30cm
    const atr = stock.technicals?.atr || (current * 0.03); // Fallback to 3% if ATR missing
    const volWeight = Math.min(2.0, Math.max(1.0, atr / (current * 0.03))); // 波动率加权因子

    // 基础回撤阈值 (根据盈利阶梯调整)
    let maxDrawdown = 3.5; // 默认 3.5% 止损
    
    if (profit > 30) maxDrawdown = 10.0;      // 妖股利润丰厚，容忍 10% 回撤
    else if (profit > 20) maxDrawdown = 7.5;   // 盈利 > 20%，容忍 7.5% 回撤
    else if (profit > 10) maxDrawdown = 5.0;   // 盈利 > 10%，容忍 5% 回撤
    else if (profit > 5) maxDrawdown = 3.5;    // 盈利 > 5%，容忍 3.5% 回撤
    else if (profit > 0) maxDrawdown = 2.5;    // 微利，容忍 2.5% 回撤 (保本优先)
    else maxDrawdown = 4.0;                    // 亏损态，基础止损放宽至 4.0% 以抗洗盘

    // v9.4 Adaptive Volatility Scaling (波动率自适应)
    // 根据板块与 ATR 动态调整
    if (isHyper) {
        maxDrawdown *= 1.6; // 20cm/30cm 标的，回撤阈值放大 1.6 倍
    } else {
        maxDrawdown *= volWeight; // 主板标的，基于 ATR 波动率进行加权
    }

    // v7.6 中军容量票优化：增加 1.0% - 2.0% 的额外呼吸空间
    if (isMain) {
        maxDrawdown += profit > 10 ? 2.0 : 1.0;
    }

    // 市场阶段修正
    if (phase === 'Ebb' || phase === 'Ice') {
        maxDrawdown *= 0.7; // 退潮期收紧回撤，保护本金
    } else if (phase === 'Climax') {
        maxDrawdown *= 1.2; // 高潮期适当放宽，避免洗盘
    }

    const calculatedStop = current * (1 - maxDrawdown / 100);
    
    // 如果是盈利状态，保卫价不能低于成本价（保本原则），除非是微利
    if (profit > 3) {
        return Math.max(calculatedStop, cost * 1.01); 
    }

    return calculatedStop;
};

/**
 * 识别题材掉队 (Theme Dropout Analysis) - v27.0
 * 逻辑：当板块龙头封死，但 80% 的跟风股开始回落时，判定题材掉队
 */
export const analyzeThemeDropout = (themeName: string, stocks: Stock[]): boolean => {
    const sectorStocks = stocks.filter(s => s.concept === themeName);
    // 增加容错：只有当样本量足够时才判定掉队，需排除"双龙戏珠"等强势情况
    if (sectorStocks.length < 4) return false;

    // 如果板块内有 >= 2 只涨停股，说明板块具有协同效应，并非"孤掌难鸣"
    const limitUps = sectorStocks.filter(s => s.isLimitUp).length;
    if (limitUps >= 2) return false;

    const leader = sectorStocks.find(s => s.role === 'Leader' || s.role === 'Main');
    if (!leader || !leader.isLimitUp) return false;

    const followers = sectorStocks.filter(s => s !== leader);
    // 过滤掉停牌或未开盘的
    const validFollowers = followers.filter(s => s.currentPrice && s.currentPrice > 0);
    if (validFollowers.length === 0) return false;

    const droppingFollowers = validFollowers.filter(s => (s.changePercent || 0) < (leader.changePercent || 0) - 5);
    
    // 如果超过 60% 的跟风盘掉队，风险极高
    return droppingFollowers.length / validFollowers.length > 0.6;
};

/**
 * 实时连板数计算 (Real-time Consecutive Limit Ups) - v33.0
 * 逻辑：基于历史数据（昨日连板数）+ 今日实时表现
 * 解决“Board Stairs”数据不实时更新的问题
 */
export const calculateConsecutiveLimitUps = (stock: Stock): number => {
    if (!stock.isLimitUp) return 0;
    
    // 1. Calculate from history if reliable
    if (stock.history && stock.history.length >= 2) {
        let count = 1; // Start with today (already verified isLimitUp=true)
        // Check yesterday and beyond
        for (let i = stock.history.length - 1; i >= 0; i--) {
            const day = stock.history[i];
            const prev = stock.history[i - 1];
            if (!prev) break;
            
            // Standard limit up check (Approx > 9.5%)
            // Note: For ST stocks it's 5%, but we simplify here for Main Board A-shares
            if (day.close >= prev.close * 1.095) {
                count++;
            } else {
                break;
            }
        }
        return count;
    }
    
    // 2. Fallback to notes (Legacy / Static Data)
    // If no history is available, we rely on the manual notes.
    // However, if the note says "2连板" and today is limit up, it's ambiguous whether
    // the note was updated today or yesterday. 
    // Usually notes are "Current State". 
    // But to be safe, if we have NO history, we trust the note.
    const noteMatch = stock.notes?.match(/(\d+)连板/);
    if (noteMatch) {
        return parseInt(noteMatch[1]);
    }
    
    // Default for new limit up without history or notes
    return 1;
};
