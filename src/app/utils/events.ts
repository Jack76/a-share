import { Stock, DailyMetrics, MarketPhase, MarketEvent } from '../types';

/**
 * Event Detection System v6.0 - Tactical Sentinel
 * Generates tactical events based on market data patterns
 */
export const detectMarketEvents = (stocks: Stock[], metrics: DailyMetrics, phase: MarketPhase, entropy: number): MarketEvent[] => {
    const events: MarketEvent[] = [];
    const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });

    // 1. Chaos Alert (High Entropy)
    if (entropy > 75) {
        events.push({
            id: `chaos-${Date.now()}`,
            time: now,
            type: 'Warning',
            message: `【混沌预警】市场熵值过高 (${entropy.toFixed(1)})，题材轮动无序，严禁追涨中位股。`
        });
    }

    // 2. Leader Flash Crash (Dragon Killing)
    const crashingLeaders = stocks.filter(s => s.role === 'Leader' && (s.changePercent || 0) < -7);
    crashingLeaders.forEach(s => {
        events.push({
            id: `crash-${s.id}-${Date.now()}`,
            time: now,
            type: 'Danger',
            message: `【杀龙头】${s.name} 触发负反馈崩盘，警惕全场退潮风险！`,
            stockName: s.name
        });
    });

    // 2.5 Risk Contagion Alert (New)
    const highRiskStocks = stocks.filter(s => s.trapRiskScore && s.trapRiskScore > 80);
    if (highRiskStocks.length >= 3) {
        events.push({
            id: `contagion-${Date.now()}`,
            time: now,
            type: 'Danger',
            message: `【风险传染】全场多点触发诱多陷阱信号，警惕系统性退潮风险。`
        });
    }

    // 3. Sector Resonance
    const themes = Array.from(new Set(stocks.filter(s => s.isLimitUp).map(s => s.concept).filter(Boolean)));
    themes.forEach(t => {
        const themeLimitUps = stocks.filter(s => s.concept === t && s.isLimitUp).length;
        if (themeLimitUps >= 4) {
            events.push({
                id: `theme-${t}-${Date.now()}`,
                time: now,
                type: 'Info',
                message: `【板块共振】${t} 题材爆发，当前已涌现 ${themeLimitUps} 只涨停标的。`
            });
        }
    });

    // 4. Divergence Warning
    if (metrics.divergenceIndex && Math.abs(metrics.divergenceIndex) > 15) {
        events.push({
            id: `div-${Date.now()}`,
            time: now,
            type: 'Warning',
            message: `【背离预警】指数与情绪背离度过高 (${metrics.divergenceIndex})，谨防指数虚假繁荣。`
        });
    }

    return events.slice(0, 5); // Keep only latest 5
};
