import { Stock } from '../types';
import { getDirectLargeOrderNetYuan } from './capitalFlow';

// V15.0 FUND PANTHEON: 12 Types of Market Participants
export type FundType = 
    | 'NationalTeam' // 国家队
    | 'Northbound'   // 北向外资
    | 'MutualFund'   // 公募基金
    | 'GrandMaster'  // 顶级游资 (六一路/呼家楼)
    | 'Alliance'     // 盟主系 (章盟主)
    | 'TrendRider'   // 趋势游资 (方新侠)
    | 'Sniper'       // 超短独食 (佛山)
    | 'Scythe'       // 砸盘收割 (上塘路)
    | 'Viper'        // 情绪刺客 (养家)
    | 'DMA_Quant'    // DMA量化
    | 'Syndicate'    // 老庄
    | 'Retail'       // 散户 (拉萨)
    | 'Mixed';       // 混合/未知

export interface FundBehaviorProfile {
    type: FundType;
    name: string;
    style: string;
    holdingPeriod: 'Day' | 'Short' | 'Medium' | 'Long';
    smashProbability: number; // 0-100
    supportCapability: number; // 0-100
    riskDescription: string;
    tacticalAdvice: string;
    historicalWinRate?: string;
    icon?: string; // For UI display
}

/**
 * PREDATOR V15.0 FUND PROFILES (资金风格画像库)
 * The definitive guide to A-share market participants
 */
const FUND_PROFILES: Record<string, FundBehaviorProfile> = {
    // --- Tier 1: The Rulers ---
    'NationalTeam': {
        type: 'NationalTeam',
        name: 'G-Force (国家队)',
        style: '定海神针',
        holdingPeriod: 'Long',
        smashProbability: 5,
        supportCapability: 100,
        riskDescription: '为了控制指数可能会压盘，但绝不恶意砸盘',
        tacticalAdvice: '【跟随】G队进场意味着政策底。跟随大资金做ETF或权重股，安全第一。',
        historicalWinRate: '99% (无限子弹)',
        icon: '🛡️'
    },
    'Northbound': {
        type: 'Northbound',
        name: 'Smart Money (北向)',
        style: '价值趋势',
        holdingPeriod: 'Medium',
        smashProbability: 25,
        supportCapability: 70,
        riskDescription: '受汇率和全球市场影响大，流出时会对核心资产造成抛压',
        tacticalAdvice: '【趋势】北向偏好业绩白马。沿 20日线 低吸，破位止损。',
        historicalWinRate: '60%',
        icon: '🌏'
    },
    'MutualFund': {
        type: 'MutualFund',
        name: 'Institution (公募)',
        style: '抱团赛道',
        holdingPeriod: 'Medium',
        smashProbability: 30,
        supportCapability: 85,
        riskDescription: '调仓缓慢，但一旦趋势坏了会持续阴跌（赎回潮）',
        tacticalAdvice: '【配置】适合中长线。机构票不追高，只在关键均线支撑处低吸。',
        historicalWinRate: '55%',
        icon: '🏦'
    },

    // --- Tier 2: Apex Predators ---
    'GrandMaster': {
        type: 'GrandMaster',
        name: 'Apex (六一路/呼家楼)',
        style: '容量核心/大格局',
        holdingPeriod: 'Short', // 虽是游资，但格局大
        smashProbability: 35,
        supportCapability: 95,
        riskDescription: '高位一致转分歧时波动剧烈',
        tacticalAdvice: '【突击】顶级游资点火，格局极大。只在断板或逻辑证伪时离场，不要轻易下车。',
        historicalWinRate: '85%+',
        icon: '👑'
    },
    'Alliance': {
        type: 'Alliance',
        name: 'Warlord (章盟主)',
        style: '重金点火/多席位',
        holdingPeriod: 'Short',
        smashProbability: 40,
        supportCapability: 90,
        riskDescription: '资金体量太大，出货时容易造成拥堵',
        tacticalAdvice: '【跟随】盟主进场通常不仅是套利，而是发动一波行情。可积极跟随。',
        historicalWinRate: '75%',
        icon: '⚔️'
    },
    'TrendRider': {
        type: 'TrendRider',
        name: 'Trend (方新侠)',
        style: '大票主升浪',
        holdingPeriod: 'Medium', // 偏好波段
        smashProbability: 30,
        supportCapability: 80,
        riskDescription: '相对稳健，很少核按钮',
        tacticalAdvice: '【锁仓】方新侠在场，说明个股进入主升浪阶段。可多拿一会。',
        historicalWinRate: '70%',
        icon: '🌊'
    },

    // --- Tier 3: Opportunists ---
    'Sniper': {
        type: 'Sniper',
        name: 'One-Day (佛山)',
        style: '吃独食/一日游',
        holdingPeriod: 'Day',
        smashProbability: 99, // 必砸
        supportCapability: 10,
        riskDescription: '次日竞价即巅峰，开盘无差别核按钮，不仅不护盘还抢跑',
        tacticalAdvice: '【快跑】遇到佛山系独食板，次日竞价不涨停直接走，一秒都别留。',
        historicalWinRate: '80% (吃独食)',
        icon: '🗡️'
    },
    'Scythe': {
        type: 'Scythe',
        name: 'Reaper (上塘路)',
        style: '砸盘收割',
        holdingPeriod: 'Day',
        smashProbability: 90,
        supportCapability: 20,
        riskDescription: '擅长在情绪高潮时反手做空，破坏市场合力',
        tacticalAdvice: '【警惕】上塘路在场，必须时刻准备跑路。不要对其抱有格局幻想。',
        historicalWinRate: '70%',
        icon: '☠️'
    },
    'Viper': {
        type: 'Viper',
        name: 'Mastermind (养家)',
        style: '情绪理解/一字板',
        holdingPeriod: 'Short',
        smashProbability: 45, // 格局较好，但也会止损
        supportCapability: 60,
        riskDescription: '通道党，散户买不进，买进就是接盘',
        tacticalAdvice: '【观察】养家老师的心法主要是情绪。若他锁仓，可博弈弱转强。',
        historicalWinRate: '80%',
        icon: '🧠'
    },

    // --- Tier 4: Dark Matter ---
    'DMA_Quant': {
        type: 'DMA_Quant',
        name: 'Hive Mind (量化)',
        style: '机器蜂群',
        holdingPeriod: 'Day',
        smashProbability: 95,
        supportCapability: 30,
        riskDescription: '助涨助跌，早盘集中砸盘，触发止损线集体踩踏',
        tacticalAdvice: '【低吸】严禁追高量化票。等它们砸完出现深坑后再低吸。',
        historicalWinRate: '60%',
        icon: '🤖'
    },
    'Syndicate': {
        type: 'Syndicate',
        name: 'Syndicate (庄股)',
        style: '独立走势',
        holdingPeriod: 'Long',
        smashProbability: 20, // 平时不动
        supportCapability: 50,
        riskDescription: '闪崩风险，流动性枯竭',
        tacticalAdvice: '【规避】看不懂的操盘手法，建议远离。',
        historicalWinRate: 'Unknown',
        icon: '🐊'
    },
    'Retail': {
        type: 'Retail',
        name: 'Leeks (散户/拉萨)',
        style: '乌合之众',
        holdingPeriod: 'Short',
        smashProbability: 60,
        supportCapability: 10,
        riskDescription: '羊群效应，踩踏',
        tacticalAdvice: '【博弈】拉萨榜意味着人气高但筹码烂。适合做T，不适合锁仓。',
        historicalWinRate: '<40%',
        icon: '🌱'
    }
};

/**
 * 席位映射表 (Seat Mapping) - V15.0 Updated
 * 包含最新的游资席位信息 (2024-2025)
 */
const SEAT_MAPPING: Record<string, string> = {
    // --- G-Force ---
    '中信证券总部': 'NationalTeam', // 国家队常用
    '中国银河北京金融街': 'NationalTeam',
    
    // --- Northbound ---
    '深股通': 'Northbound',
    '沪股通': 'Northbound',
    '香港中央结算': 'Northbound',

    // --- Apex (六一路/呼家楼) ---
    '国泰君安咸宁': 'GrandMaster', // 六一路
    '中信北京总部': 'GrandMaster', // 呼家楼
    '广发天津水上公园': 'GrandMaster', // 呼家楼分仓

    // --- Alliance (盟主) ---
    '国泰君安上海江苏路': 'Alliance',
    '中信上海分公司': 'Alliance', // 孙哥
    '国泰君安宁波彩虹北路': 'Alliance', // 关联席位

    // --- Trend (方新侠/小鳄鱼) ---
    '中信西安朱雀大街': 'TrendRider', // 方新侠
    '兴业陕西分公司': 'TrendRider', // 方新侠
    '南京证券大钟亭': 'TrendRider', // 小鳄鱼

    // --- Sniper (佛山) ---
    '光大佛山绿景路': 'Sniper',
    '光大佛山季华六路': 'Sniper',
    '长江佛山南海大道': 'Sniper',
    
    // --- Scythe (上塘路/桑田路) ---
    '财通杭州上塘路': 'Scythe',
    '国盛宁波桑田路': 'Scythe',
    '华林上海昨溪北路': 'Scythe', // 砸盘王

    // --- Viper (养家) ---
    '华鑫上海宛平南路': 'Viper',
    '华鑫上海茅台路': 'Viper',
    '华鑫上海松江': 'Viper', // 量化+养家混合，算Viper或Quant

    // --- Retail (拉萨) ---
    '东方财富拉萨': 'Retail',
    '拉萨团结路': 'Retail',
    '拉萨东环路': 'Retail'
};

/**
 * 资金身份推演引擎 (V15.1 Robust Edition)
 * 增加容错机制，处理缺失的市值/成交额数据
 */
export const detectFundIdentity = (stock: Stock): { profile: FundBehaviorProfile, detectedName: string } => {
    const notes = stock.notes || '';
    const name = stock.name || '';
    const currentPrice = stock.currentPrice || 0;
    const volume = stock.volume || 0;
    const turnoverRate = stock.turnoverRate || 0;
    
    // 1. Estimate Data if Missing (Robustness)
    // 修正：stock.turnover 通常单位为“万”，转换为“元”
    let turnoverAmount = 0;
    if (stock.turnover) {
        turnoverAmount = stock.turnover * 10000;
    } else {
        // 如果没有成交额数据，用 成交量(手) * 100 * 价格 估算
        turnoverAmount = volume * 100 * currentPrice;
    }
    
    // Estimate Market Cap (Float)
    let mktCap = stock.marketValue || 0;
    if (mktCap === 0 && turnoverRate > 0 && turnoverAmount > 0) {
        // TurnoverRate = TurnoverAmount / MarketCap * 100
        // MarketCap = TurnoverAmount / (TurnoverRate / 100)
        mktCap = turnoverAmount / (turnoverRate / 100);
    }

    // 2. 席位精确匹配 (Seat Matching) - Highest Priority
    for (const [key, val] of Object.entries(SEAT_MAPPING)) {
        if (notes.includes(key)) {
            // Mapping Logic
            let profileKey = 'Retail';
            switch (val) {
                case 'NationalTeam': profileKey = 'NationalTeam'; break;
                case 'Northbound': profileKey = 'Northbound'; break;
                case 'GrandMaster': profileKey = 'GrandMaster'; break;
                case 'Alliance': profileKey = 'Alliance'; break;
                case 'TrendRider': profileKey = 'TrendRider'; break;
                case 'Sniper': profileKey = 'Sniper'; break;
                case 'Scythe': profileKey = 'Scythe'; break;
                case 'Viper': profileKey = 'Viper'; break;
                case 'Retail': profileKey = 'Retail'; break;
            }
            return { profile: FUND_PROFILES[profileKey], detectedName: key };
        }
    }

    // 3. 行为特征识别 (Behavior Profiling)

    // A. G-Force: 权重股 + 逆势 (or Bank/Securities)
    // 80 Billion check or Name check
    const isWeightStock = mktCap > 80000000000 || (name.startsWith('中') && !name.includes('中小')) || notes.includes('银行') || notes.includes('证券') || notes.includes('保险');
    if (isWeightStock && turnoverAmount > 500000000) {
        return { profile: FUND_PROFILES['NationalTeam'], detectedName: 'G队/权重' };
    }

    // B. DMA Quant: 微盘 + 高换手
    // < 5 Billion or Name check (ST? / 300?)
    const isMicroCap = (mktCap > 0 && mktCap < 5000000000) || (stock.code && stock.code.startsWith('300') && turnoverRate > 10);
    const isHighTurnover = turnoverRate > 15;
    if (isMicroCap && isHighTurnover && stock.volumeRatio && stock.volumeRatio > 1.8) {
        return { profile: FUND_PROFILES['DMA_Quant'], detectedName: 'DMA量化' };
    }

    // C. Apex Hot Money: 大成交 + 连板龙头 (or Dragon Role)
    if ((turnoverAmount > 2000000000 && stock.role === 'Dragon') || stock.role === 'Dragon') {
        return { profile: FUND_PROFILES['GrandMaster'], detectedName: '顶级游资(龙头)' };
    }
    if (stock.role === 'Leader') {
        return { profile: FUND_PROFILES['GrandMaster'], detectedName: '领涨游资' };
    }

    // D. Institution: 机构风格 (大单流入 + 低换手涨停 or Main Role)
    const largeOrderNetYuan = getDirectLargeOrderNetYuan(stock);
    if (notes.includes('机构') || (stock.role === 'Main' && turnoverRate < 10) || ((largeOrderNetYuan || 0) > 50_000_000 && turnoverRate < 5)) {
        return { profile: FUND_PROFILES['MutualFund'], detectedName: '机构/公募' };
    }

    // E. Syndicate: 庄股 (缩量一字 or Independent Role with weird volume)
    if ((stock.isLimitUp && turnoverRate < 1) || stock.role === 'Independent') {
        return { profile: FUND_PROFILES['Syndicate'], detectedName: '强庄/一字' };
    }
    
    // F. Fallback based on Tags
    if (stock.tags?.includes('HotMoney')) return { profile: FUND_PROFILES['GrandMaster'], detectedName: '活跃游资' };
    if (stock.tags?.includes('Quant')) return { profile: FUND_PROFILES['DMA_Quant'], detectedName: '量化' };

    // Fallback
    return { profile: FUND_PROFILES['Retail'], detectedName: '散户/混合' };
};

/**
 * 砸盘风险预判 (V15.0)
 */
export const predictSmashRisk = (stock: Stock, marketPhase: string): { riskScore: number, warning: string } => {
    const { profile, detectedName } = detectFundIdentity(stock);
    let risk = profile.smashProbability;
    let warning = `${profile.icon || ''} ${detectedName}: ${profile.riskDescription}`;

    // Environmental Modifiers
    if (marketPhase === 'Ebb' || marketPhase === 'Ice') { // 退潮/冰点
        if (['Sniper', 'Scythe', 'DMA_Quant'].includes(profile.type)) {
            risk = 100;
            warning = `⚠️【极度危险】退潮期 ${detectedName} 几乎必砸，请立即规避！`;
        }
        if (profile.type === 'GrandMaster') {
            risk += 15; // 顶级游资也会补跌
        }
    }

    if (profile.type === 'NationalTeam' && (stock.changePercent || 0) < -2) {
        risk = 0;
        warning = '🛡️ G队护盘预期，下跌空间有限';
    }

    return { 
        riskScore: Math.min(100, risk), 
        warning 
    };
};
