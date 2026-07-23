    // --- 2.5 AI Leader Prediction (V5: Context-Aware Strategy) ---
    const predictStock = (s: Stock): Stock['aiPrediction'] => {
        const change = s.changePercent || 0;
        const isLimitUp = s.isLimitUp;
        const currentPrice = s.currentPrice || 0;
        const limitUpPrice = s.limitUpPrice || (s.prevClose ? s.prevClose * 1.1 : 0);
        const turnoverRate = s.turnoverRate || 0;
        const isLeader = s.role === 'Leader' || s.role === 'Main';

        // Context Factors
        const marketSentiment = sentimentHistory.length > 0 ? sentimentHistory[sentimentHistory.length - 1].score : 0;
        const isEbbPhase = phase === 'Ebb';
        const isClimaxPhase = phase === 'Climax';

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
             if (ratio > 2.5) volTag = '爆量';
             else if (ratio > 1.5) volTag = '放量';
             else if (ratio < 0.6) volTag = '缩量';
        }

        // Turnover Check
        let turnoverTag = '';
        if (turnoverRate > 50) turnoverTag = '死亡换手';
        else if (turnoverRate > 20) turnoverTag = '充分换手';
        else if (turnoverRate < 3 && change > 5) turnoverTag = '缩量加速';

        // Confidence Score Calculation (0-100)
        let confidence = 50; 
        if (isLeader) confidence += 15;
        if (isClimaxPhase) confidence += 10;
        if (isEbbPhase) confidence -= 20;
        if (macd && macd.dif > macd.dea) confidence += 10; // Gold Cross
        if (boll && currentPrice > boll.upper) confidence += 10; // Breakout
        if (turnoverTag === '死亡换手') confidence -= 30; // High risk

        const p = (val?: number) => val ? val.toFixed(2) : '--';

        let trend: 'Accelerate' | 'Divergence' | 'Top' | 'Rebound' | 'Neutral' = 'Neutral';

        // 1. LIMIT UP (涨停)
        if (isLimitUp) {
            trend = 'Accelerate';
            const isWeak = turnoverTag === '死亡换手' || (s.alerts?.includes('broken'));
            
            return {
                trend,
                summary: `${volTag}封板，${turnoverTag || '筹码稳定'}`,
                strategy: isWeak ? '排板需谨慎，随时准备撤单' : '锁仓持有 / 排板确认',
                positionAdvice: isWeak ? '减仓/止盈' : '满仓',
                buyPoint: `排板: ${p(limitUpPrice)} (封单确认)`,
                sellPoint: `炸板卖出: < ${p(limitUpPrice)}`
            };
        }

        // 2. STRONG ATTACK (>5%)
        if (change > 5) {
             trend = 'Accelerate'; 
             // Phase Check: If Ebb, don't chase high
             if (isEbbPhase && !isLeader) {
                 return {
                     trend: 'Divergence',
                     summary: `逆势拉升，${volTag}，谨防诱多`,
                     strategy: '退潮期不追高，只看不动',
                     positionAdvice: '空仓',
                     buyPoint: '无 (退潮避险)',
                     sellPoint: `止损: < ${p(currentPrice * 0.97)}`
                 };
             }

             const strongSignal = (boll && currentPrice > boll.upper) ? '突破上轨加速' : '强势进攻';
             const chasePrice = currentPrice; 
             const stopLoss = ma5 ? Math.max(ma5, currentPrice * 0.95) : currentPrice * 0.95;

             const canChase = confidence > 60;

             return {
                trend,
                summary: `${strongSignal}，${turnoverTag}，${volTag}`,
                strategy: canChase ? '激进者半路扫板，龙头首选' : '高位风险，放弃追涨',
                positionAdvice: canChase ? '半仓' : '轻仓',
                buyPoint: canChase ? `扫板: ${p(currentPrice)} - ${p(limitUpPrice)}` : '暂无',
                sellPoint: `止损: < ${p(stopLoss)}`
            };
        }
        
        // 3. TREND FOLLOWING (0-5%)
        if (change > 0 && change <= 5) {
             trend = 'Neutral';
             let maCheck = '';
             if (ma5 && currentPrice > ma5) maCheck = '站稳5日线';
             else if (ma5 && currentPrice < ma5) maCheck = '跌破5日线';
             
             // Gap Analysis
             const open = s.open || 0;
             const prevClose = s.prevClose || 0;
             const isGapUp = open > prevClose * 1.01;
             
             const isHealthy = (ma5 && currentPrice > ma5) || (macd && macd.dif > macd.dea);
             
             // Buy at MA5 or MA10
             const buyTarget = ma5 || ma10 || currentPrice * 0.98;
             // Sell at BOLL Upper 
             const sellTarget = boll?.upper || limitUpPrice;
             
             return {
                trend,
                summary: `趋势向上，${isGapUp ? '跳空高开' : maCheck}，${turnoverTag}`,
                strategy: isHealthy ? '沿5日线持股 / 低吸做T' : '多看少动，等待企稳',
                positionAdvice: isHealthy ? '半仓' : '轻仓',
                buyPoint: `低吸: ${p(buyTarget)}`,
                sellPoint: `目标: ${p(sellTarget)}`
            };
        }
        
        // 4. ADJUSTMENT / REBOUND (-5% to 0%)
        if (change <= 0 && change > -5) {
             trend = 'Rebound';
             const supportPrice = ma10 || ma20 || (boll ? boll.lower : null);
             const nearSupport = supportPrice && Math.abs(currentPrice - supportPrice) / supportPrice < 0.02;
             
             // Volume shrinkage check
             const isShrinking = volTag === '缩量' || (avgVol5 && currentVolShares < avgVol5 * 0.8);

             const summary = nearSupport ? '缩量回调获支撑' : '震荡调整中';
             const pressurePrice = ma5 || (boll ? boll.mid : null) || currentPrice * 1.03;
             
             // Only buy if shrinking volume near support AND not in pure downtrend
             const buySignal = nearSupport && isShrinking && !isEbbPhase;

             return {
                trend,
                summary: `${summary}，${isShrinking ? '缩量洗盘' : '放量下跌'}`,
                strategy: buySignal ? '低吸博弈反包 (黄金坑)' : '观望，等待止跌',
                positionAdvice: buySignal ? '1-2成仓' : '空仓',
                buyPoint: buySignal ? `支撑低吸: ${p(supportPrice)}` : '暂不操作',
                sellPoint: `反抽压力: ${p(pressurePrice)}`
            };
        }
        
        // 5. DEEP DROP (<-5%)
        if (change <= -5) {
             trend = 'Top';
             const isLimitDown = s.changePercent && s.changePercent < -9.5;
             
             return {
                trend,
                summary: `大幅杀跌${isLimitDown ? '封死跌停' : ''}，形态破坏`,
                strategy: '反抽离场，禁止接盘',
                positionAdvice: '空仓',
                buyPoint: '观望 (无买点)',
                sellPoint: `立即止损: ${p(currentPrice)}`
            };
        }
        
        return undefined;
    };