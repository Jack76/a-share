    const predictStock = (s: Stock): Stock['aiPrediction'] => {
        const change = s.changePercent || 0;
        const isLimitUp = s.isLimitUp;
        const currentPrice = s.currentPrice || 0;
        const ma5 = s.technicals?.ma5;
        const ma10 = s.technicals?.ma10;
        const avgVol5 = s.technicals?.avgVol5;
        
        // Volume Analysis
        const currentVolShares = (s.volume || 0) * 100; 
        let volTag = '';
        
        if (avgVol5 && avgVol5 > 0) {
             const ratio = currentVolShares / avgVol5;
             if (ratio > 1.5) volTag = '放量';
             else if (ratio < 0.7) volTag = '缩量';
        }

        // --- Buy/Sell Logic based on MA ---
        let buyPoint = '';
        let sellPoint = '';
        let trend: 'Accelerate' | 'Divergence' | 'Top' | 'Rebound' | 'Neutral' = 'Neutral';

        // Calculate dynamic MA5 support price (rough estimate)
        if (ma5) {
             const distToMA5 = ((currentPrice - ma5) / ma5) * 100;
             if (distToMA5 > 5) {
                 // Too far from MA5
                 // If trend is super strong, this is not a buy point, but if it drops, it is.
                 buyPoint = `等待回踩5日线 (${ma5.toFixed(2)})`;
             } else {
                 buyPoint = `5日线附近 (${ma5.toFixed(2)}) 低吸`;
             }
        }

        if (isLimitUp) {
            trend = 'Accelerate';
            return {
                trend,
                summary: `${volTag}封板，情绪加速`,
                strategy: '锁仓持有，去弱留强',
                positionAdvice: '满仓',
                buyPoint: '排板确认 (极高风险)',
                sellPoint: '炸板出局'
            };
        }
        
        // > 5% Logic (Refined for "Halfway" Chasing)
        if (change > 5 && !isLimitUp) {
             trend = 'Accelerate'; // Changed from Divergence to Accelerate if aiming for Limit Up
             // Determine if it's "about to seal" or "stuck"
             
             return {
                trend,
                summary: `冲击涨停，${volTag}进攻`,
                strategy: '激进者半路追涨，稳健者放弃',
                positionAdvice: '半仓/轻仓',
                buyPoint: '突破前高/扫板',
                sellPoint: '高位滞涨/回落止盈'
            };
        }
        
        // 0% - 5% Logic (Refined for Trend Following)
        if (change > 0 && change <= 5) {
             trend = 'Neutral';
             let maCheck = '';
             if (ma5 && currentPrice > ma5) maCheck = '站稳5日线';
             if (ma5 && currentPrice < ma5) maCheck = '跌破5日线';

             // If consistent volume and steady rise
             const strategy = ma5 && currentPrice > ma5 ? '沿5日线持股/低吸' : '多看少动，等待企稳';

             return {
                trend,
                summary: `趋势向上，${volTag}${maCheck}`,
                strategy: strategy,
                positionAdvice: '轻仓/半仓',
                buyPoint: ma5 ? `5日线 (${ma5.toFixed(2)}) 低吸` : '分时均线支撑',
                sellPoint: ma5 ? `有效跌破5日线 (${ma5.toFixed(2)})` : ''
            };
        }
        
        if (change <= 0 && change > -5) {
             trend = 'Rebound';
             return {
                trend,
                summary: `首阴${volTag}调整，关注承接`,
                strategy: '低吸博弈反包',
                positionAdvice: '1-2成仓试错',
                buyPoint: ma10 ? `10日线支撑 (${ma10.toFixed(2)})` : (ma5 ? `5日线 (${ma5.toFixed(2)})` : ''),
                sellPoint: '反抽无力离场'
            };
        }
        
        if (change <= -5) {
             trend = 'Top';
             return {
                trend,
                summary: `大幅${volTag}杀跌，见顶风险`,
                strategy: '反抽离场，禁止接盘',
                positionAdvice: '空仓',
                buyPoint: '暂无 (风险大)',
                sellPoint: '立即止损'
            };
        }
        
        return undefined;
    };