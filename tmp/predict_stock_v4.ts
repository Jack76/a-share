    // --- 2.5 AI Leader Prediction (Enhanced with Price Targets) ---
    const predictStock = (s: Stock): Stock['aiPrediction'] => {
        const change = s.changePercent || 0;
        const isLimitUp = s.isLimitUp;
        const currentPrice = s.currentPrice || 0;
        const limitUpPrice = s.limitUpPrice || (s.prevClose ? s.prevClose * 1.1 : 0);
        
        // Technicals
        const t = s.technicals;
        const ma5 = t?.ma5;
        const ma10 = t?.ma10;
        const ma20 = t?.ma20;
        const avgVol5 = t?.avgVol5;
        const macd = t?.macd;
        const boll = t?.boll;
        
        // Volume Analysis
        const currentVolShares = (s.volume || 0) * 100; 
        let volTag = '';
        if (avgVol5 && avgVol5 > 0) {
             const ratio = currentVolShares / avgVol5;
             if (ratio > 2.0) volTag = '倍量';
             else if (ratio > 1.5) volTag = '放量';
             else if (ratio < 0.6) volTag = '缩量';
        }

        // Indicator Signals
        let macdSignal = '';
        if (macd) {
            if (macd.dif > macd.dea && macd.macd > 0) macdSignal = 'MACD金叉发散';
            else if (macd.dif < macd.dea && macd.macd < 0) macdSignal = 'MACD死叉向下';
            else if (macd.macd > 0 && macd.dif > 0) macdSignal = 'MACD水上强势';
            else if (macd.macd > 0 && macd.dif < macd.dea) macdSignal = 'MACD红柱缩短';
            else macdSignal = 'MACD弱势';
        }

        let bollSignal = '';
        if (boll) {
            if (currentPrice > boll.upper) bollSignal = '突破上轨';
            else if (currentPrice < boll.lower) bollSignal = '触及下轨';
            else if (currentPrice > boll.mid) bollSignal = '通道向上';
        }

        // Helper for Price Formatting
        const p = (val?: number) => val ? val.toFixed(2) : '--';

        // --- Buy/Sell Logic based on Dragon Strategy + Technicals ---
        let trend: 'Accelerate' | 'Divergence' | 'Top' | 'Rebound' | 'Neutral' = 'Neutral';

        // 1. LIMIT UP (涨停)
        if (isLimitUp) {
            return {
                trend: 'Accelerate',
                summary: `${volTag}封板，${macdSignal || '情绪一致'}`,
                strategy: '锁仓持有 / 排板确认',
                positionAdvice: '满仓',
                buyPoint: `排板买入: ${p(limitUpPrice)}`,
                sellPoint: `炸板卖出: < ${p(limitUpPrice)}`
            };
        }

        // 2. STRONG ATTACK (>5%)
        if (change > 5) {
             trend = 'Accelerate'; 
             const strongSignal = (boll && currentPrice > boll.upper) ? '突破上轨加速' : '强势进攻';
             const chasePrice = currentPrice; 
             const stopLoss = ma5 ? Math.max(ma5, currentPrice * 0.95) : currentPrice * 0.95;

             return {
                trend,
                summary: `${strongSignal}，${volTag}`,
                strategy: '激进者半路扫板，稳健者观望',
                positionAdvice: '半仓',
                buyPoint: `追涨/扫板: ${p(currentPrice)} - ${p(limitUpPrice)}`,
                sellPoint: `止损/止盈: < ${p(stopLoss)}`
            };
        }
        
        // 3. TREND FOLLOWING (0-5%)
        if (change > 0 && change <= 5) {
             trend = 'Neutral';
             let maCheck = '';
             if (ma5 && currentPrice > ma5) maCheck = '站稳5日线';
             else if (ma5 && currentPrice < ma5) maCheck = '跌破5日线';
             
             const isHealthy = (ma5 && currentPrice > ma5) || (macd && macd.dif > macd.dea);
             
             // Buy at MA5 or MA10
             const buyTarget = ma5 || ma10 || currentPrice * 0.98;
             // Sell at BOLL Upper or Previous High (simplified as Limit Up for potential)
             const sellTarget = boll?.upper || limitUpPrice;
             
             return {
                trend,
                summary: `趋势向上，${maCheck}，${bollSignal}`,
                strategy: isHealthy ? '沿5日线持股 / 低吸' : '多看少动，等待企稳',
                positionAdvice: isHealthy ? '半仓' : '轻仓',
                buyPoint: `低吸区间: ${p(buyTarget)} - ${p(buyTarget * 1.01)}`,
                sellPoint: `第一目标: ${p(sellTarget)}`
            };
        }
        
        // 4. ADJUSTMENT / REBOUND (-5% to 0%)
        if (change <= 0 && change > -5) {
             trend = 'Rebound';
             const supportPrice = ma10 || ma20 || (boll ? boll.lower : null);
             const nearSupport = supportPrice && Math.abs(currentPrice - supportPrice) / supportPrice < 0.02;
             
             const summary = nearSupport ? '缩量回调获支撑' : `调整中，${macdSignal}`;
             const pressurePrice = ma5 || (boll ? boll.mid : null) || currentPrice * 1.03;
             
             return {
                trend,
                summary: `${summary}，${volTag}`,
                strategy: nearSupport ? '低吸博弈反包' : '观望，等待止跌',
                positionAdvice: nearSupport ? '1-2成仓' : '空仓',
                buyPoint: supportPrice ? `支撑低吸: ${p(supportPrice)}` : '暂不操作',
                sellPoint: `反抽压力: ${p(pressurePrice)}`
            };
        }
        
        // 5. DEEP DROP (<-5%)
        if (change <= -5) {
             trend = 'Top';
             return {
                trend,
                summary: `大幅杀跌，${macdSignal || '趋势破坏'}`,
                strategy: '反抽离场，禁止接盘',
                positionAdvice: '空仓',
                buyPoint: '观望 (无买点)',
                sellPoint: `立即止损: ${p(currentPrice)}`
            };
        }
        
        return undefined;
    };