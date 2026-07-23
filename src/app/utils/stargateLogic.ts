import { Stock, MarketPhase } from '../types';

/**
 * 星门技术 (Stargate Technology) V8.7
 * 
 * 核心逻辑升级：
 * 1. 竞价动能 (Gate 1): 增加对开盘分时趋势的前置研判。
 * 2. 空间折叠 (Gate 2 & 3): 如果提供分时数据(ticks)，计算“穿越速度”。
 * 3. 维度锚点 (Gate 4): 引入“板块拖累”模型，防止个股虚假繁荣。
 * 4. 能量脉冲 (New): 监测瞬间量比爆发。
 */

export interface StargateResult {
  gateLevel: 0 | 1 | 2 | 3 | 4; // 0: Closed, 1: Initiated, 2: Active, 3: High Tension, 4: Terminal
  stargateScore: number;
  signals: string[];
  resonanceScore: number;
  isLoneWolf: boolean;
  penetrationVelocity?: number; // 空间穿越速度 (点/分钟)
  isCollapsed?: boolean; // v8.7: 是否发生维度坍塌 (冲高回落)
}

/**
 * 计算星门评分
 * @param stock 目标股票
 * @param themes 全市场题材数据
 */
export const calculateStargateLogic = (
  stock: Stock,
  themes: any[] = [],
  manualVelocity?: number // New: Allow external velocity injection
): StargateResult => {
  let score = 0;
  const signals: string[] = [];
  let gateLevel: 0 | 1 | 2 | 3 | 4 = 0;

  const change = stock.changePercent || 0;
  const turnover = stock.turnoverRate || 0;
  const prevClose = stock.prevClose || 0;
  const open = stock.open || prevClose;
  const current = stock.currentPrice || 0;
  const high = stock.high || current;
  const ticks = stock.ticks || [];

  // --- 0. 维度坍塌判定 (冲高回落) ---
  const dropFromHigh = high > 0 ? ((high - current) / high) * 100 : 0;
  const isCollapsed = dropFromHigh > 3.5 && change < 7; // 封板的不算坍塌

  // --- 1. 竞价动能与早盘确信 (Gate 1) ---
  const openGap = prevClose > 0 ? (open - prevClose) / prevClose * 100 : 0;
  
  // V8.7: 增加分时前置确认
  let isEarlyConfirmed = false;
  if (ticks.length > 5) {
      const firstTick = ticks[0].price;
      const recentTick = ticks[Math.min(ticks.length - 1, 15)].price;
      if (recentTick > firstTick) isEarlyConfirmed = true;
  }

  if (openGap > 2 && openGap < 7) {
    score += isEarlyConfirmed ? 35 : 25;
    gateLevel = 1;
    signals.push(isEarlyConfirmed ? "星门1号确信：竞价强势且分时承接有力" : "星门1号开启：竞价强势，动能充沛");
  } else if (openGap >= 7) {
    score += 15; 
    gateLevel = 1;
    signals.push("星门1号过热：开盘过高，谨防兑现");
  }

  // --- 2. 空间折叠与穿越速度 (Gate 2 & 3) ---
  let penetrationVelocity = manualVelocity || 0; // Default to manual input if provided
  
  if (!manualVelocity && ticks.length > 10) {
      // 计算最近10分钟的涨幅斜率
      const windowSize = 10;
      const latestPrice = ticks[ticks.length - 1].price;
      const oldPrice = ticks[ticks.length - windowSize]?.price || ticks[0].price;
      const pointChange = ((latestPrice - oldPrice) / prevClose) * 100;
      penetrationVelocity = pointChange / windowSize; // 点/分钟
  }

  if (change > 3) {
    score += 15;
    gateLevel = 2;
    
    // V8.7: 脉冲折叠判定
    if (penetrationVelocity > 0.5) { // 每分钟涨0.5个点以上视为极速穿越
        score += 10;
        signals.push(`空间折叠：检测到脉冲式加速 (${penetrationVelocity.toFixed(2)} pts/m)`);
    } else {
        signals.push("星门2号开启：进入空间折叠区，动能平稳释放");
    }

    if (isCollapsed) {
        score -= 30;
        signals.push(`维度坍塌：高位回撤 ${dropFromHigh.toFixed(1)}%，触发星门关闭程序`);
    }

    if (change > 5) {
      score += 15;
      gateLevel = 3;
      signals.push("星门3号连破：高动能穿越完成，进入主升波");
    }
  }

  // --- 3. 能量守恒 (Volume/Turnover Logic) ---
  // 如果涨幅 > 5% 但换手率 < 1% (缩量拉升)，在启动初期是好事，在高位是隐患
  if (change > 5 && turnover < 2) {
    score += 10;
    signals.push("能量锁定：锁仓拉升，主力控盘度高");
  } else if (change > 5 && turnover > 15) {
    score -= 20;
    signals.push("能量过载：换手过高，分歧巨大");
  }

  // --- 4. 维度锚点与板块拖累 (Gate 4) ---
  const stockThemes = themes.filter(t => t.stocks && t.stocks.includes(stock.code));
  const myTheme = stockThemes[0]; // 假设第一个是主概念
  const topThemes = themes.slice(0, 10); 
  
  const isResonating = stockThemes.some(st => topThemes.some(tt => tt.name === st.name));
  
  // V8.7: 引入“板块拖累”判定
  // 如果板块平均跌幅 > 1.5% 但个股大涨 > 5%，属于极端背离
  const globalTheme = themes.find(t => t.name === stock.concept);
  const sectorAvgChange = globalTheme?.avgChange || 0;
  const sectorDrag = (change > 5 && sectorAvgChange < -1.0);

  const resonanceScore = isResonating ? 30 : (sectorDrag ? -20 : 0);
  
  // 孤狼惩罚 (Lone Wolf Punishment)
  const isLoneWolf = (change > 7 && !isResonating) || sectorDrag;

  if (isResonating) {
    score += 30;
    signals.push("维度锚点确认：板块共振，系统性机会");
  } else if (sectorDrag) {
    score -= 50;
    signals.push("逆势孤狼：板块严重拖累，极高炸板风险");
  } else if (isLoneWolf) {
    score -= 40;
    signals.push("孤狼警报：无板块支撑的独立走势");
  }

  // --- 5. 终极门径 (Board Adaptive Limit Up Check) ---
  const isST = stock.name.includes('ST') || stock.name.includes('st');
  const isHyper = stock.code.includes('sh688') || stock.code.includes('sz300') || stock.code.includes('bj'); 
  const limitThreshold = isHyper ? 19.8 : (isST ? 4.8 : 9.8);

  if (stock.isLimitUp || change >= limitThreshold) {
    gateLevel = 4;
    score += 20;
    signals.push("终极星门：封板确认，维度跨越成功");
  } else if (change > (limitThreshold * 0.8)) {
    // v9.7: 临界态判定
    score += 10;
    signals.push(`星门跃迁中：接近${isHyper ? '20cm' : '10cm'}临界点，能量剧烈波动`);
  }

  return {
    gateLevel: isCollapsed ? 0 : gateLevel,
    stargateScore: Math.min(100, Math.max(0, score + resonanceScore)),
    signals,
    resonanceScore,
    isLoneWolf,
    penetrationVelocity,
    isCollapsed
  };
};