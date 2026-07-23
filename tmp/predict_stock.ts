    const predictStock = (s: Stock): Stock['aiPrediction'] => {
        const change = s.changePercent || 0;
        const isLimitUp = s.isLimitUp;
        const currentPrice = s.currentPrice || 0;
        const ma5 = s.technicals?.ma5;
        const ma10 = s.technicals?.ma10;

        // --- Buy/Sell Logic based on MA ---
        let buyPoint = '';
        let sellPoint = '';
        let trend: 'Accelerate' | 'Divergence' | 'Top' | 'Rebound' | 'Neutral' = 'Neutral';

        // Calculate dynamic MA5 support price (rough estimate)
        if (ma5) {
             const distToMA5 = ((currentPrice - ma5) / ma5) * 100;
             if (distToMA5 > 5) {
                 // Too far from MA5
                 buyPoint = `等待回踩5日线 (${ma5.toFixed(2)})`;
             } else {
                 buyPoint = `5日线附近 (${ma5.toFixed(2)}) 低吸`;
             }
        }

        if (isLimitUp) {
            trend = 'Accelerate';
            return {
                trend,
                summary: '强势封板，情绪加速',
                strategy: '锁仓持有，去弱留强',
                positionAdvice: '满仓',
                buyPoint: '排板确认',
                sellPoint: '炸板出局'
            };
        }
        
        if (change > 5 && !isLimitUp) {
             trend = 'Divergence';
             return {
                trend,
                summary: '高位未封板，分歧加大',
                strategy: '减仓一半，观察回封',
                positionAdvice: '半仓',
                buyPoint: '暂不接力',
                sellPoint: '不回封出局'
            };
        }
        
        if (change > 0 && change <= 5) {
             trend = 'Neutral';
             // Check if it's holding MA5
             let maCheck = '';
             if (ma5 && currentPrice > ma5) maCheck = '站稳5日线';
             if (ma5 && currentPrice < ma5) maCheck = '跌破5日线';

             return {
                trend,
                summary: `高位震荡，${maCheck}，承接一般`,
                strategy: '多看少动，破均线走',
                positionAdvice: '轻仓观察',
                buyPoint: ma5 ? `回踩5日线 (${ma5.toFixed(2)})` : '',
                sellPoint: ma5 ? `有效跌破5日线 (${ma5.toFixed(2)})` : ''
            };
        }
        
        if (change <= 0 && change > -5) {
             trend = 'Rebound';
             return {
                trend,
                summary: '首阴调整，关注承接',
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
                summary: '大幅杀跌，见顶风险',
                strategy: '反抽离场，禁止接盘',
                positionAdvice: '空仓',
                buyPoint: '暂无 (风险大)',
                sellPoint: '立即止损'
            };
        }
        
        return undefined;
    };