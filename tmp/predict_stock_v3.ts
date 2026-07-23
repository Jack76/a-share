    // --- 2.5 AI Leader Prediction (Enhanced with Technicals) ---
    const predictStock = (s: Stock): Stock['aiPrediction'] => {
        const change = s.changePercent || 0;
        const isLimitUp = s.isLimitUp;
        const currentPrice = s.currentPrice || 0;
        
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
            if (macd.dif < macd.dea && macd.macd < 0) macdSignal = 'MACD死叉向下';
            if (macd.macd > 0 && macd.dif > 0) macdSignal = 'MACD水上强势';
        }

        let bollSignal = '';
        if (boll) {
            if (currentPrice > boll.upper) bollSignal = '突破布林上轨';
            else if (currentPrice < boll.lower) bollSignal = '触及布林下轨';
            else if (currentPrice > boll.mid && currentPrice < boll.upper) bollSignal = '布林通道向上';
        }

        // --- Buy/Sell Logic based on Dragon Strategy + Technicals ---
        let buyPoint = '';
        let sellPoint = '';
        let trend: 'Accelerate' | 'Divergence' | 'Top' | 'Rebound' | 'Neutral' = 'Neutral';

        // 1. LIMIT UP
        if (isLimitUp) {
            return {
                trend: 'Accelerate',
                summary: `${volTag}封板，${macdSignal || '情绪一致'}`,
                strategy: '锁仓持有 / 排板确认',
                positionAdvice: '满仓',
                buyPoint: '排板 (确认封单)',
                sellPoint: '炸板出局'
            };
        }

        // 2. STRONG ATTACK (>5%)
        if (change > 5) {
             trend = 'Accelerate'; 
             // Logic: If breaking BOLL Upper or High Volume -> Chase
             const strongSignal = (boll && currentPrice > boll.upper) ? '突破上轨加速' : '强势进攻';
             
             return {
                trend,
                summary: `${strongSignal}，${volTag}${macdSignal}`,
                strategy: '激进者半路扫板，稳健者观望',
                positionAdvice: '半仓/轻仓',
                buyPoint: '突破前高 / 扫板',
                sellPoint: '涨停未果 / 回落止盈'
            };
        }
        
        // 3. TREND FOLLOWING (0-5%)
        if (change > 0 && change <= 5) {
             trend = 'Neutral';
             let maCheck = '';
             if (ma5 && currentPrice > ma5) maCheck = '站稳5日线';
             else if (ma5 && currentPrice < ma5) maCheck = '跌破5日线';
             
             // Combined Technical Check
             const isHealthy = (ma5 && currentPrice > ma5) && (!macd || macd.dif > macd.dea);
             
             return {
                trend,
                summary: `趋势向上，${maCheck}，${bollSignal}`,
                strategy: isHealthy ? '沿5日线持股 / 低吸' : '多看少动，等待企稳',
                positionAdvice: isHealthy ? '半仓' : '轻仓',
                buyPoint: ma5 ? `回踩5日线 (${ma5.toFixed(2)}) 低吸` : '均线支撑',
                sellPoint: ma5 ? `有效跌破5日线 (${ma5.toFixed(2)})` : ''
            };
        }
        
        // 4. ADJUSTMENT / REBOUND (-5% to 0%)
        if (change <= 0 && change > -5) {
             trend = 'Rebound';
             // Check if it's a "Golden Pit" (Support at MA10/MA20 or BOLL Lower)
             const supportPrice = ma10 || ma20 || (boll ? boll.lower : null);
             const nearSupport = supportPrice && Math.abs(currentPrice - supportPrice) / supportPrice < 0.02;
             
             const summary = nearSupport ? '缩量回调获支撑' : `调整中，${macdSignal}`;
             
             return {
                trend,
                summary: `${summary}，${volTag}`,
                strategy: nearSupport ? '低吸博弈反包' : '观望，等待止跌',
                positionAdvice: nearSupport ? '1-2成仓试错' : '空仓',
                buyPoint: supportPrice ? `支撑位 (${supportPrice.toFixed(2)}) 低吸` : '5日线/10日线',
                sellPoint: '反抽无力 / 破位'
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
                buyPoint: '暂无 (风险大)',
                sellPoint: '立即止损'
            };
        }
        
        return undefined;
    };