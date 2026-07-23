/**
 * v41.0 核心阶段判定算法 (完整决策树)
 * 
 * 输入：
 * - metrics: 市场基础指标（涨停/跌停数、连板高度等）
 * - stocks: 所有股票数据
 * - prevPhase: 上一个阶段（用于惯性修正）
 * 
 * 输出：
 * - phase: 当前市场阶段
 * - confidence: 判定信心度 (0-100)
 * - reason: 判定理由
 */
export const detectMarketPhase = (
  metrics: DailyMetrics,
  stocks: Stock[],
  prevPhase?: MarketPhase,
  prevMetrics?: DailyMetrics // V59.6: Optional previous day metrics for velocity calculation
): PhaseScore => {
  
  // === 边界检查：防止空数据导致系统崩溃 ===
  if (!stocks || stocks.length === 0) {
    return {
      phase: 'Chaos',
      confidence: 0,
      reason: '【数据不足】无股票数据，无法判定市场阶段'
    };
  }
  
  if (!metrics) {
    return {
      phase: 'Chaos',
      confidence: 0,
      reason: '【数据不足】无市场指标，无法判定市场阶段'
    };
  }
  
  const limitUpCount = metrics.limitUpCount || 0;
  const limitDownCount = metrics.limitDownCount || 0;
  const height = metrics.spaceHeight || 0;
  const temp = metrics.marketTemp || 50;
  const entropy = metrics.marketEntropy || 50;
  
  // 计算涨停质量（缩量板占比）
  const limitUpStocks = stocks.filter(s => s.isLimitUp);
  const qualityLimitUps = limitUpStocks.filter(s => (s.turnoverRate || 100) < 5).length;
  const qualityRatio = limitUpCount > 0 ? qualityLimitUps / limitUpCount : 0;
  
  // V59.6: Velocity Calculation (变化速率)
  // 从60家涨停骤降到20家 vs 稳定在20家 — 含义完全不同，前者是退潮，后者是震荡
  const prevLimitUpCount = prevMetrics?.limitUpCount || limitUpCount;
  const prevLimitDownCount = prevMetrics?.limitDownCount || limitDownCount;
  const prevTemp = prevMetrics?.marketTemp || temp;
  const limitUpVelocity = limitUpCount - prevLimitUpCount;    // 负值 = 涨停数萎缩
  const limitDownVelocity = limitDownCount - prevLimitDownCount; // 正值 = 跌停数增加
  const tempVelocity = temp - prevTemp;                        // 负值 = 温度下降
  
  // 计算板块一致性（前10涨幅股中同板块占比）
  const top10 = [...stocks].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0)).slice(0, 10);
  const conceptCounts: Record<string, number> = {};
  top10.forEach(s => {
    if (s.concept) {
      conceptCounts[s.concept] = (conceptCounts[s.concept] || 0) + 1;
    }
  });
  const maxConceptCount = Math.max(...Object.values(conceptCounts), 0);
  const consensus = maxConceptCount / 10; // 0-1
  
  // 1. 冰封期 (Ice) - 最优先判定
  // 特征：跌停潮、市场温度极低、恐慌情绪
  if (limitDownCount > 20 && temp < 25) {
    return {
      phase: 'Ice',
      confidence: 95,
      reason: `【冰封期】跌停${limitDownCount}家，市场温度${temp}，极度恐慌`
    };
  }
  
  // 2. 修复期 (Repair) - 冰点反弹前夕
  // 特征：跌停数开始回落、温度仍然低迷、但出现零星涨停
  if (limitDownCount >= 10 && limitDownCount < 20 && temp < 35 && limitUpCount >= 3 && limitUpCount < 15) {
    return {
      phase: 'Repair',
      confidence: 80,
      reason: `【修复期】跌停${limitDownCount}家见顶回落，涨停${limitUpCount}家萌芽，市场筑底中`
    };
  }
  
  // 3. 启动期 (Startup) - 情绪回暖
  // 特征：连板高度回升、涨停数稳步增加、温度从低位回升
  if (height >= 3 && limitUpCount >= 15 && limitUpCount < 50 && temp >= 35 && temp < 75 && consensus > 0.4) {
    return {
      phase: 'Startup',
      confidence: 85,
      reason: `【启动期】连板${height}板出现，涨停${limitUpCount}家，板块共识${(consensus * 100).toFixed(0)}%，主线明确`
    };
  }
  
  // 4. 高潮期 (Climax) - 情绪亢奋
  // 特征：连板高度极高、涨停数爆发、市场温度过热
  if (height >= 6 && limitUpCount >= 50 && temp >= 75) {
    return {
      phase: 'Climax',
      confidence: 90,
      reason: `【高潮期】${height}板空间龙领衔，涨停${limitUpCount}家，市场温度${temp}，情绪达到顶点`
    };
  }
  
  // 5. 退潮期 (Ebb) - 高位杀跌
  // 特征：连板高度骤降、涨停数锐减、但跌停数激增
  // V59.6 FIX: Use velocity to detect rapid deterioration even without prevPhase context.
  // Previously, prevHeight required prevPhase to be Climax/Startup, but if prevPhase was undefined,
  // Ebb from unknown states was impossible to detect.
  const prevHeight = (prevPhase === 'Climax' || prevPhase === 'Startup') ? true : false;
  const isHeightDrop = height < 4 && prevHeight; // 如果前一阶段是高潮/启动，现在连板高度回落
  // V59.6: Velocity-based ebb detection — 涨停数骤降(>15家)或温度骤降(>15度)也是退潮信号
  const isRapidDeterioration = limitUpVelocity < -15 || (tempVelocity < -15 && limitDownVelocity > 3);
  
  if ((isHeightDrop || isRapidDeterioration || limitUpCount < 15) && limitDownCount >= 5 && limitDownCount < 20 && temp < 55) {
    const velocityNote = isRapidDeterioration ? `，涨停骤降${Math.abs(limitUpVelocity)}家` : '';
    return {
      phase: 'Ebb',
      confidence: isRapidDeterioration ? 90 : 85,
      reason: `【退潮期】连板高度回落至${height}板，涨停${limitUpCount}家萎缩${velocityNote}，跌停${limitDownCount}家抬头，高标集体杀跌`
    };
  }
  
  // 6. 混沌期 (Chaos) - 无主线乱战
  // 特征：熵值极高、无明确板块逻辑、涨跌分散
  if (entropy > 70 && consensus < 0.3 && limitUpCount < 30) {
    return {
      phase: 'Chaos',
      confidence: 75,
      reason: `【混沌期】市场熵值${entropy.toFixed(0)}，板块共识仅${(consensus * 100).toFixed(0)}%，逻辑混乱无主线`
    };
  }
  
  // 7. 边界情况处理（默认判定）
  
  // V59.4 FIX: Added 7.0 "Pre-Climax" catch-all to close the gap between Startup and Climax.
  // Example gap: height=5, limitUpCount=45, temp=73, consensus=0.5 previously fell to Chaos.
  // This is clearly a strong Startup approaching Climax, not Chaos.
  if (height >= 4 && limitUpCount >= 30 && temp >= 65 && consensus >= 0.3) {
    // Determine if closer to Startup or Climax based on momentum
    const isNearClimax = temp >= 72 && limitUpCount >= 40 && height >= 5;
    return {
      phase: isNearClimax ? 'Climax' : 'Startup',
      confidence: isNearClimax ? 70 : 75,
      reason: isNearClimax 
        ? `【高潮期】${height}板龙头引领，涨停${limitUpCount}家，温度${temp}逼近亢奋阈值，情绪加速中`
        : `【启动期】${height}板龙头稳健，涨停${limitUpCount}家，温度${temp}，板块共识${(consensus * 100).toFixed(0)}%，主升浪蓄力中`
    };
  }
  
  // 7.1 弱启动期（涨停家数适中，但缺乏高度板）
  if (limitUpCount >= 20 && limitUpCount < 50 && height < 3 && temp >= 45 && temp < 70) {
    return {
      phase: 'Startup',
      confidence: 60,
      reason: `【启动期】涨停${limitUpCount}家，但缺乏高度龙头（仅${height}板），试探性启动`
    };
  }
  
  // 7.2 强势震荡（温度偏高，但高度板与涨停数不足）
  if (temp >= 60 && temp < 75 && limitUpCount >= 15 && limitUpCount < 50 && height >= 3 && height < 6) {
    return {
      phase: 'Startup',
      confidence: 70,
      reason: `【启动期】市场温度${temp}，涨停${limitUpCount}家，${height}板龙头承接稳定`
    };
  }
  
  // 7.3 持续高潮（温度极高，即使高度略降也仍然属于高潮尾声）
  if (temp >= 85 && height >= 4 && limitUpCount >= 35) {
    return {
      phase: 'Climax',
      confidence: 75,
      reason: `【高潮期】市场温度${temp}极度亢奋，涨停${limitUpCount}家，${height}板高标尚存`
    };
  }
  
  // V59.4: 7.4 温和放量期 (Mild Recovery) — 温度中性、涨停适中但跌停不多
  // 防止 limitUpCount=18, temp=50, height=2 这种"弱复苏"也落入 Chaos
  if (limitUpCount >= 10 && limitUpCount < 20 && limitDownCount < 5 && temp >= 35 && temp < 60) {
    return {
      phase: 'Repair',
      confidence: 55,
      reason: `【修复期】涨停${limitUpCount}家温和回暖，跌停${limitDownCount}家可控，市场底部修复中`
    };
  }
  
  // 8. 惯性修正（如果无法明确判定，参考前一阶段）
  if (prevPhase) {
    // 如果当前指标模棱两可，倾向于维持前一阶段（市场有惯性）
    const inertiaConfidence = 50;
    
    if (prevPhase === 'Startup' && limitUpCount >= 15 && temp >= 40) {
      return {
        phase: 'Startup',
        confidence: inertiaConfidence,
        reason: `【启动期】延续前期趋势，涨停${limitUpCount}家，温度${temp}`
      };
    }
    
    if (prevPhase === 'Climax' && limitUpCount >= 30 && temp >= 65) {
      return {
        phase: 'Climax',
        confidence: inertiaConfidence,
        reason: `【高潮期】惯性维持，涨停${limitUpCount}家，温度${temp}`
      };
    }
    
    if (prevPhase === 'Ebb' && limitUpCount < 20 && limitDownCount >= 3) {
      return {
        phase: 'Ebb',
        confidence: inertiaConfidence,
        reason: `【退潮期】惯性维持，涨停${limitUpCount}家萎缩，跌停${limitDownCount}家`
      };
    }
  }
  
  // 9. 最终兜底（常规震荡期，归类为混沌期）
  return {
    phase: 'Chaos',
    confidence: 40,
    reason: `【混沌期】未识别明确趋势，涨停${limitUpCount}家，跌停${limitDownCount}家，温度${temp}`
  };
};

/**
 * v41.0 市场温度重新计算 (Enhanced Market Temperature)
 * 综合多维度因素，更精准地反映市场热度
 */
export const calculateMarketTemperature = (
  limitUpCount: number,
  limitDownCount: number,
  avgChange: number,
  height: number,
  qualityRatio: number // 缩量板占比
): number => {
  // 基础温度（涨停数主导）
  let temp = 50;
  
  // 1. 涨停数加成（核心权重 40%）
  temp += Math.min(30, limitUpCount * 0.6);
  
  // 2. 跌停数惩罚（权重 30%）
  temp -= Math.min(30, limitDownCount * 1.2);
  
  // 3. 平均涨幅加成（权重 15%）
  temp += avgChange * 3;
  
  // 4. 连板高度加成（权重 10%）
  if (height >= 7) temp += 15;
  else if (height >= 5) temp += 10;
  else if (height >= 3) temp += 5;
  
  // 5. 质量修正（权重 5%）
  // 缩量板占比高 = 筹码锁定好 = 温度加成
  temp += qualityRatio * 10;
  
  return Math.round(Math.min(100, Math.max(0, temp)));
};