import type { Stock } from '../types.ts';

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
        icon: '🌱'
    },
    'Mixed': {
        type: 'Mixed',
        name: '未识别资金',
        style: '证据不足',
        holdingPeriod: 'Short',
        smashProbability: 50,
        supportCapability: 50,
        riskDescription: '没有可核验的龙虎榜席位证据，不能识别参与者身份',
        tacticalAdvice: '仅依据价格、成交和明确的数据源进行判断，不推测资金身份。',
        icon: '◌'
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
export const detectFundIdentity = (stock: Stock): {
    profile: FundBehaviorProfile;
    detectedName: string;
    evidence: 'DIRECT_SEAT' | 'UNAVAILABLE';
} => {
    const verifiedSeatNames = (stock.dragonTigerBoard || []).flatMap(board => [
        ...board.buySeats.map(seat => seat.name),
        ...board.sellSeats.map(seat => seat.name),
    ]);

    // 只有明确的龙虎榜席位名称才允许套用行为画像；不再根据股票名称、
    // 市值、成交额、角色或标签猜测“国家队/游资/公募”等参与者身份。
    for (const [key, val] of Object.entries(SEAT_MAPPING)) {
        if (verifiedSeatNames.some(name => name.includes(key))) {
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
            return { profile: FUND_PROFILES[profileKey], detectedName: key, evidence: 'DIRECT_SEAT' };
        }
    }
    return { profile: FUND_PROFILES['Mixed'], detectedName: '未识别', evidence: 'UNAVAILABLE' };
};

/**
 * 砸盘风险预判 (V15.0)
 */
export const predictSmashRisk = (stock: Stock, marketPhase: string): { riskScore: number, warning: string } => {
    const { detectedName, evidence } = detectFundIdentity(stock);
    const phaseRisk = marketPhase === 'Ebb' || marketPhase === 'Ice' ? 15 : 0;
    const priceRisk = (stock.changePercent || 0) <= -5 ? 15 : (stock.changePercent || 0) <= -2 ? 8 : 0;
    const trapRisk = Math.max(0, (stock.trapRiskScore || 50) - 50) * 0.35;
    const risk = 50 + phaseRisk + priceRisk + trapRisk;
    const warning = evidence === 'DIRECT_SEAT'
        ? `已核验龙虎榜席位“${detectedName}”。席位名称不直接推导未来砸盘概率；风险分仅由市场阶段、价格与 TrapGuard 指标计算。`
        : '没有可核验的龙虎榜席位数据，不推测资金身份；风险分仅使用市场阶段、价格与 TrapGuard 指标。';

    return { 
        riskScore: Math.min(100, Math.round(risk)),
        warning 
    };
};
