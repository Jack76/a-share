/**
 * v41.0 预期差模型精细化 (Enhanced Expectation Gap Model)
 * 新增更多竞价场景，提升预判准确性
 */

import { Stock } from '../types';

export interface ExpectationGapResult {
  gap: number;           // 预期差值 (%)
  expected: number;      // 理论预期 (%)
  actual: number;        // 实际表现 (%)
  reason: string;        // 定性分析
  confidence: number;    // 信心度 (0-100)
  scenario: string;      // 场景类型
}

/**
 * v41.0 核心预期差计算（10种场景）
 */
export const calculateExpectationGapV41 = (
  stock: Stock,
  marketTemp: number
): ExpectationGapResult => {
  
  const history = stock.history || [];
  if (history.length < 2) {
    return {
      gap: 0,
      expected: 0,
      actual: 0,
      reason: '数据不足',
      confidence: 0,
      scenario: 'Insufficient'
    };
  }
  
  const yesterday = history[history.length - 1];
  const dayBefore = history[history.length - 2];
  const auction = stock.auctionData || { openGap: 0, volumeRatio: 1 };
  
  const actualOpen = auction.openGap;
  const volumeRatio = auction.volumeRatio;
  
  let expectedOpen = 0;
  let reason = '';
  let confidence = 50;
  let scenario = 'Normal';
  
  // 计算昨日涨幅
  const yesterdayChange = ((yesterday.close - dayBefore.close) / dayBefore.close) * 100;
  const isYesterdayLimitUp = yesterdayChange >= 9.5;
  
  // 计算昨日换手率（简化估算）
  const yesterdayTurnover = stock.turnoverRate || 0; // 使用最近换手率作为参考
  
  // V41.1 相对量能修正 (Relative Volume Correction)
  // 解决绝对换手率对大盘股/冷门股偏高或偏低的问题
  let yesterdayVolRatio = 1.0;
  if (history.length >= 3) {
      const vol = yesterday.volume || 0;
      // 取前5日（或可用数据）作为基准
      const startIndex = Math.max(0, history.length - 6);
      const endIndex = history.length - 1;
      const prevData = history.slice(startIndex, endIndex);
      if (prevData.length > 0) {
          const avg = prevData.reduce((acc, h) => acc + (h.volume || 0), 0) / prevData.length;
          if (avg > 0) yesterdayVolRatio = vol / avg;
      }
  }

  // ========== 场景判定决策树 ==========
  
  // 场景1: 昨日缩量一字板
  if (isYesterdayLimitUp && yesterdayTurnover < 1) {
    expectedOpen = 6.0; // 预期必须高开 > 6%
    scenario = 'SealedBoard';
    confidence = 90;
    
    if (actualOpen > expectedOpen) {
      reason = '【超预期】一字板次日竞价强势，龙头延续性确认';
    } else if (actualOpen > 2) {
      reason = '【符合预期】一字板次日高开承接，但略弱于预期';
    } else {
      reason = '【强转弱】一字板次日竞价不及预期，警惕核按钮';
    }
  }
  
  // 场景2: 昨日烂板/爆量板（换手 > 15%）
  else if (isYesterdayLimitUp && yesterdayTurnover > 15) {
    expectedOpen = -2.0; // 预期低开消化分歧
    scenario = 'HeavyTurnover';
    confidence = 85;
    
    if (actualOpen > 3) {
      reason = '【弱转强】昨日分歧今日抢筹，超预期（最强信号）';
    } else if (actualOpen > 0) {
      reason = '【强于预期】烂板次日平开或小幅高开，资金回流';
    } else if (actualOpen > -3) {
      reason = '【符合预期】烂板次日低开消化，正常回调';
    } else {
      reason = '【恐慌杀跌】烂板次日大幅低开，一致性崩溃';
    }
  }
  
  // 场景3: 昨日正常涨停（换手 3-15%）
  else if (isYesterdayLimitUp) {
    expectedOpen = 2.5; // 预期正常高开
    scenario = 'NormalLimitUp';
    confidence = 75;
    
    if (actualOpen > 5) {
      reason = '【超预期】涨停次日大幅高开，一致性强';
    } else if (actualOpen > 0) {
      reason = '【符合预期】涨停次日高开承接，正常溢价';
    } else {
      reason = '【弱于预期】涨停次日低开，获利盘抛压';
    }
  }
  
  // 场景4: 昨日放量上涨（涨幅 5-9%，换手 > 10% 或 相对爆量 > 2.5倍）
  // V41.1 优化：引入相对量比判定，涵盖大盘股放量场景
  else if (yesterdayChange >= 5 && yesterdayChange < 9.5 && (yesterdayTurnover > 10 || yesterdayVolRatio > 2.5)) {
    expectedOpen = 1.0; // 预期小幅高开
    scenario = 'HeavyRise';
    confidence = 70;
    
    if (actualOpen > 3) {
      reason = '【超预期】放量大涨次日继续高开，加速迹象';
    } else if (actualOpen > -1 && volumeRatio > 0.8) {
      reason = '【符合预期】放量上涨次日承接良好';
    } else if (actualOpen < -2 && volumeRatio < 0.5) {
      reason = '【虚假突破】无量高开，预期差打折';
    } else {
      reason = '【弱于预期】放量上涨次日承接不力';
    }
  }
  
  // 场景5: 昨日缩量上涨（涨幅 3-7%，换手 < 5% 且 量比 < 1.0）
  // V41.1 优化：增加相对缩量确认，避免大盘股小幅放量被误判
  else if (yesterdayChange >= 3 && yesterdayChange < 9.5 && yesterdayTurnover < 5 && yesterdayVolRatio < 1.0) {
    expectedOpen = 0.5; // 预期平开或小幅高开
    scenario = 'LowVolumeRise';
    confidence = 65;
    
    if (actualOpen > 2 && volumeRatio > 1.5) {
      reason = '【超预期】缩量上涨次日放量高开，主力抢筹';
    } else if (actualOpen > -0.5) {
      reason = '【符合预期】缩量上涨次日平稳承接';
    } else if (volumeRatio < 0.5) {
      reason = '【无量空涨】缩量上涨次日无量高开，虚假突破';
    } else {
      reason = '【弱于预期】缩量上涨次日回调';
    }
  }
  
  // 场景6: 昨日大跌（跌幅 > 5%）
  else if (yesterdayChange < -5) {
    expectedOpen = -3.5; // 预期惯性低开
    scenario = 'HeavyDrop';
    confidence = 80;
    
    if (actualOpen > 0) {
      reason = '【V型反转】大跌次日反包，超预期（抄底信号）';
    } else if (actualOpen > -2) {
      reason = '【强于预期】大跌次日止跌企稳，恐慌缓解';
    } else if (actualOpen > -5) {
      reason = '【符合预期】大跌次日惯性低开，正常回调';
    } else {
      reason = '【恐慌蔓延】大跌次日继续杀跌，踩踏风险';
    }
  }
  
  // 场景7: 昨日跳水（盘中冲高但收盘转绿）
  else if (yesterdayChange < 0 && yesterdayChange > -3 && (yesterday.high || yesterday.close) > dayBefore.close * 1.03) {
    expectedOpen = -1.5; // 预期低开
    scenario = 'IntradayDive';
    confidence = 75;
    
    if (actualOpen > 1) {
      reason = '【低开高走】跳水次日低开高走，V型反转预期';
    } else if (actualOpen > -1) {
      reason = '【符合预期】跳水次日平开整理，等待方向';
    } else {
      reason = '【惯性杀跌】跳水次日继续低开，弱势延续';
    }
  }
  
  // 场景8: 昨日缩量滞涨（换手 < 3%，量比 < 0.8）
  // V41.1 优化：低换手阈值结合相对量比，防止活跃大票被误判
  else if (Math.abs(yesterdayChange) < 2 && yesterdayTurnover < 3 && yesterdayVolRatio < 0.8) {
    expectedOpen = 0; // 预期平开
    scenario = 'LowActivity';
    confidence = 60;
    
    if (actualOpen > 2 && volumeRatio > 2) {
      reason = '【突然启动】缩量盘整后放量高开，主力进场';
    } else if (actualOpen > -1 && actualOpen < 1) {
      reason = '【符合预期】继续缩量盘整，等待催化';
    } else {
      reason = '【破位下行】缩量盘整后低开，支撑失效';
    }
  }
  
  // 场景9: 昨日放量滞涨（换手 > 10% 或 相对爆量 > 2.5倍）
  // V41.1 优化：涵盖低换手但爆量的异常情况
  else if (Math.abs(yesterdayChange) < 2 && (yesterdayTurnover > 10 || yesterdayVolRatio > 2.5)) {
    expectedOpen = -0.5; // 预期小幅低开
    scenario = 'HighVolumeFlat';
    confidence = 70;
    
    if (actualOpen > 1) {
      reason = '【强于预期】放量整理后高开，主力吸筹完成';
    } else if (actualOpen > -2) {
      reason = '【符合预期】放量整理后继续震荡，筹码交换';
    } else {
      reason = '【量化绞肉机】放量滞涨次日低开，机器做T收割';
    }
  }
  
  // 场景10: 其他常规震荡
  else {
    expectedOpen = yesterdayChange * 0.3; // 预期为昨日涨幅的30%
    scenario = 'Normal';
    confidence = 50;
    
    if (actualOpen - expectedOpen > 2) {
      reason = '【超预期】竞价强于预期，市场情绪转暖';
    } else if (Math.abs(actualOpen - expectedOpen) < 1) {
      reason = '【符合预期】正常波动';
    } else {
      reason = '【弱于预期】竞价承接不力';
    }
  }
  
  // 计算最终预期差
  let gap = actualOpen - expectedOpen;
  
  // 量比验证修正
  if (gap > 0 && volumeRatio < 0.5) {
    gap *= 0.6; // 无量高开，预期差打折
    reason += ' (但量能不足，打折扣)';
    confidence -= 15;
  } else if (gap > 0 && volumeRatio > 2) {
    gap *= 1.2; // 放量高开，预期差增强
    reason += ' (放量确认，信心增强)';
    confidence += 10;
  }
  
  // 市场环境修正
  if (marketTemp < 35 && gap > 2) {
    // 冰点期的高开需要谨慎对待
    confidence -= 20;
    reason += ' (但市场冰点，谨慎对待)';
  } else if (marketTemp > 75 && gap < -2) {
    // 亢奋期的低开可能是机会
    confidence += 10;
    reason += ' (亢奋期回调，可能是机会)';
  }
  
  // V41.2 Alpha 趋势否决 (Alpha Trend Veto)
  // 悲观风控核心：在长期下行趋势中(Alpha < -15)，任何短期"弱转强"都应首先被视为诱多
  // 只有极少数能真正反转，大部分是"死猫跳"
  const alpha = stock.technicals?.alpha ?? 0;
  if (alpha < -15) {
      // 只有在出现正向预期差（看似机会/弱转强）时才进行打击
      if (gap > 0) {
          // 强制压低信心上限，无论之前判定多高
          confidence = Math.min(confidence, 40); 
          // 覆盖或追加理由
          reason = `【趋势否决】Alpha极低(${alpha})，弱转强疑似诱多`;
          gap *= 0.5; // 预期收益值打折，降低吸引力
      }
  }

  return {
    gap: Number(gap.toFixed(2)),
    expected: Number(expectedOpen.toFixed(2)),
    actual: Number(actualOpen.toFixed(2)),
    reason,
    confidence: Math.max(0, Math.min(100, confidence)),
    scenario
  };
};
