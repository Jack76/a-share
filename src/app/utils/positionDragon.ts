import { Stock, MarketPhase, Theme } from '../types';

/**
 * POSITION DRAGON RECOGNITION ENGINE V63.0 (P2)
 * 卡位龙识别引擎 — 识别"候补龙头"和"卡位接力"机会
 *
 * 核心逻辑：
 * 当市场总龙/板龙出现以下情况时，资金会寻找"卡位龙"进行接力：
 *   1. 龙头断板 → 资金寻找同板块/同高度的"备选龙头"
 *   2. 龙头加速(4板+) → 资金畏高，卡位低位同题材的"卡位龙"
 *   3. 板块轮动 → 新板块龙头接力旧板块龙头
 *
 * 卡位龙的特征：
 *   - 同板块或相关板块
 *   - 连板高度 = 当前龙头高度 - 1 或 - 2
 *   - 封板质量好（硬板、缩量）
 *   - 市值/流动性匹配（不能太小太冷门）
 *
 * 输出：识别出的卡位龙候选人，附带接力策略建议
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type DragonType = 
  | 'SPACE_DRAGON'      // 空间龙 — 全场最高连板
  | 'SECTOR_DRAGON'     // 板块龙 — 某板块内最强
  | 'POSITION_DRAGON'   // 卡位龙 — 候补/接力龙头
  | 'RELAY_CANDIDATE'   // 接力候选 — 可能成为下一个龙头
  | 'SECOND_WAVE'       // 二波启动 — 断板后反包的前龙头
  | 'ROTATION_DRAGON';  // 轮动龙 — 新板块冒头的领涨股

export interface DragonCandidate {
  stock: Stock;
  dragonType: DragonType;
  dragonLabel: string;          // 人类可读标签
  
  // Scoring
  positionScore: number;        // 卡位得分 (0-100)
  relayProbability: number;     // 接力成功概率 (0-100)
  
  // Context
  relatedDragon: string | null; // 关联的当前龙头名称
  relatedDragonCode: string | null;
  relatedDragonHeight: number;  // 关联龙头连板高度
  heightDiff: number;           // 与龙头的高度差
  
  // Board Info
  boardHeight: number;          // 自身连板高度
  concept: string;              // 所属板块
  
  // Quality Metrics
  sealQuality: 'HARD' | 'NORMAL' | 'SOFT'; // 封板质量
  volumePattern: 'SHRINK' | 'NORMAL' | 'HEAVY'; // 量能模式
  
  // Strategy
  strategy: string;             // 操作策略
  entryTiming: string;          // 介入时机
  stopLoss: string;             // 止损策略
  
  // Tags
  tags: string[];
}

export interface PositionDragonResult {
  // Current market structure
  spaceDragon: DragonCandidate | null;     // 当前空间龙
  sectorDragons: DragonCandidate[];        // 板块龙们
  
  // Position dragon candidates
  positionDragons: DragonCandidate[];      // 卡位龙候选
  relayCandidates: DragonCandidate[];      // 接力候选
  
  // Market structure summary
  maxBoardHeight: number;                   // 全场最高连板
  boardLadder: Record<number, number>;     // 连板梯队分布 {1: 15, 2: 5, 3: 2, 4: 1}
  isLadderHealthy: boolean;                // 梯队是否健康
  ladderAdvice: string;                    // 梯队结构建议
  
  // Global advice
  globalAdvice: string;
  
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════
// CORE ENGINE
// ═══════════════════════════════════════════════════════════════

export function identifyPositionDragons(
  stocks: Stock[],
  phase: MarketPhase,
  themes: Theme[] = [],
): PositionDragonResult {
  
  // ── Step 1: Build board height ladder ──
  const limitUpStocks = stocks.filter(s => s.isLimitUp);
  const boardLadder: Record<number, number> = {};
  
  limitUpStocks.forEach(s => {
    const h = s.consecutiveLimitUps || 1;
    boardLadder[h] = (boardLadder[h] || 0) + 1;
  });
  
  const maxBoardHeight = Math.max(0, ...limitUpStocks.map(s => s.consecutiveLimitUps || 1));
  
  // Check ladder health: Need stocks at multiple height levels
  const heights = Object.keys(boardLadder).map(Number).sort((a, b) => a - b);
  const isLadderHealthy = heights.length >= 3 && (boardLadder[1] || 0) >= 3;
  
  let ladderAdvice = '';
  if (!isLadderHealthy && limitUpStocks.length > 0) {
    if (heights.length < 2) {
      ladderAdvice = '连板梯队断层严重，仅有单一高度层级，接力风险极高。';
    } else if ((boardLadder[1] || 0) < 3) {
      ladderAdvice = '首板数量不足，后续梯队接力乏力，谨慎参与高位板。';
    } else {
      ladderAdvice = '梯队尚可，但缺少中间层(2-3板)，存在断档风险。';
    }
  } else if (isLadderHealthy) {
    ladderAdvice = `梯队健康：${heights.map(h => `${h}板(${boardLadder[h]}只)`).join(' → ')}，生态完整。`;
  } else {
    ladderAdvice = '当日无涨停，市场极度冷清。';
  }

  // ── Step 2: Identify Space Dragon (空间龙) ──
  let spaceDragon: DragonCandidate | null = null;
  const highestStocks = limitUpStocks
    .filter(s => (s.consecutiveLimitUps || 1) === maxBoardHeight && maxBoardHeight >= 2)
    .sort((a, b) => (b.strengthScore || 0) - (a.strengthScore || 0));
  
  if (highestStocks.length > 0) {
    const s = highestStocks[0];
    spaceDragon = buildCandidate(s, 'SPACE_DRAGON', `${maxBoardHeight}板空间龙`, {
      positionScore: 95,
      relayProbability: 0, // 自己就是龙，不需要接力概率
      relatedDragon: null,
      relatedDragonCode: null,
      relatedDragonHeight: maxBoardHeight,
      heightDiff: 0,
      strategy: maxBoardHeight >= 5 
        ? `当前为全场最高${maxBoardHeight}板，纯空间博弈。只看情绪和封单，技术指标失效。断板即走。`
        : `${maxBoardHeight}板空间龙，关注能否继续加速突破。缩量加速继续持有，放量分歧警惕。`,
      entryTiming: '不建议追高，已有仓位锁仓',
      stopLoss: '断板即止损',
      tags: ['空间龙', `${maxBoardHeight}连板`],
    });
  }

  // ── Step 3: Identify Sector Dragons (板块龙) ──
  const sectorDragons: DragonCandidate[] = [];
  const conceptGroups: Record<string, Stock[]> = {};
  
  limitUpStocks.forEach(s => {
    const concept = s.concept || '未分类';
    if (!conceptGroups[concept]) conceptGroups[concept] = [];
    conceptGroups[concept].push(s);
  });

  for (const [concept, sectorStocks] of Object.entries(conceptGroups)) {
    if (concept === '自动发现' || concept === '未分类') continue;
    if (sectorStocks.length === 0) continue;
    
    // 板块龙 = 该板块内最高连板
    const sorted = sectorStocks.sort((a, b) => 
      (b.consecutiveLimitUps || 1) - (a.consecutiveLimitUps || 1) 
      || (b.strengthScore || 0) - (a.strengthScore || 0)
    );
    const leader = sorted[0];
    const leaderHeight = leader.consecutiveLimitUps || 1;
    
    if (leaderHeight >= 2 || sectorStocks.length >= 2) {
      sectorDragons.push(buildCandidate(leader, 'SECTOR_DRAGON', `${concept}板龙`, {
        positionScore: 80 + leaderHeight * 3,
        relayProbability: 0,
        relatedDragon: null,
        relatedDragonCode: null,
        relatedDragonHeight: leaderHeight,
        heightDiff: 0,
        strategy: `${concept}板块龙头，${leaderHeight}连板。板块${sectorStocks.length > 2 ? '多只跟涨' : '效应一般'}。${leaderHeight >= 3 ? '格局持有' : '观察明日能否晋级'}。`,
        entryTiming: leaderHeight >= 3 ? '已有仓位锁仓' : '明日竞价确认后排板',
        stopLoss: '断板止损',
        tags: ['板块龙', concept],
      }));
    }
  }

  // ── Step 4: Identify Position Dragons (卡位龙) ──
  const positionDragons: DragonCandidate[] = [];
  const relayCandidates: DragonCandidate[] = [];

  if (spaceDragon && maxBoardHeight >= 3) {
    const dragonStock = spaceDragon.stock;
    const dragonConcept = dragonStock.concept;
    
    // 寻找卡位龙：连板高度 = 龙头 - 1 或 - 2，且封板质量好
    const candidateStocks = limitUpStocks.filter(s => {
      if (s.id === dragonStock.id) return false;
      const h = s.consecutiveLimitUps || 1;
      const diff = maxBoardHeight - h;
      return diff >= 1 && diff <= 2 && h >= 2;
    });

    for (const cs of candidateStocks) {
      const csHeight = cs.consecutiveLimitUps || 1;
      const heightDiff = maxBoardHeight - csHeight;
      const isSameSector = cs.concept === dragonConcept;
      
      // 卡位得分计算
      let posScore = 50;
      
      // 1. 高度接近龙头 → 高分
      if (heightDiff === 1) posScore += 20;
      else if (heightDiff === 2) posScore += 10;
      
      // 2. 同板块 → 更高概率接力
      if (isSameSector) posScore += 15;
      
      // 3. 封板质量
      const sealScore = cs.strengthScore || 50;
      if (sealScore > 75) posScore += 15;
      else if (sealScore > 50) posScore += 5;
      
      // 4. 角色加成
      if (cs.role === 'Dragon' || cs.role === 'Leader' || cs.role === 'Vice') posScore += 10;
      if (cs.role === 'Follower') posScore -= 10;
      
      // 5. 板块共振
      const resonance = cs.resonanceScore || 0;
      if (resonance > 60) posScore += 10;
      
      posScore = Math.min(95, Math.max(0, posScore));
      
      // 接力概率
      let relayProb = 30;
      if (heightDiff === 1 && isSameSector) relayProb = 65;
      else if (heightDiff === 1) relayProb = 50;
      else if (heightDiff === 2 && isSameSector) relayProb = 40;
      
      if (phase === 'Climax') relayProb += 10;
      if (phase === 'Ebb' || phase === 'Ice') relayProb -= 15;
      
      relayProb = Math.min(80, Math.max(10, relayProb));
      
      // Volume pattern
      const volPattern: DragonCandidate['volumePattern'] = 
        cs.turnoverRate && cs.turnoverRate < 5 ? 'SHRINK' :
        cs.turnoverRate && cs.turnoverRate > 15 ? 'HEAVY' : 'NORMAL';
      
      const sealQuality: DragonCandidate['sealQuality'] = 
        sealScore > 75 ? 'HARD' : sealScore > 40 ? 'NORMAL' : 'SOFT';

      const candidate = buildCandidate(cs, 'POSITION_DRAGON', `卡位龙(${csHeight}→${csHeight + 1})`, {
        positionScore: posScore,
        relayProbability: relayProb,
        relatedDragon: dragonStock.name,
        relatedDragonCode: dragonStock.code,
        relatedDragonHeight: maxBoardHeight,
        heightDiff,
        sealQuality,
        volumePattern: volPattern,
        strategy: generatePositionStrategy(cs, dragonStock, csHeight, maxBoardHeight, isSameSector, phase),
        entryTiming: `明日竞价高开>3%且缩量 → 排板接力。竞价低于预期 → 放弃。`,
        stopLoss: `断板止损，或回撤超过-5%止损。`,
        tags: [
          '卡位龙',
          `${csHeight}板`,
          isSameSector ? '同板块' : '跨板块',
          volPattern === 'SHRINK' ? '缩量' : volPattern === 'HEAVY' ? '放量' : '',
          sealQuality === 'HARD' ? '硬板' : '',
        ].filter(Boolean),
      });

      positionDragons.push(candidate);
    }
  }

  // ── Step 5: Identify relay candidates from broken dragons ──
  // 寻找断板后有反包迹象的前龙头
  const brokenDragons = stocks.filter(s => {
    if (s.isLimitUp) return false;
    if (!s.history || s.history.length < 2) return false;
    const yBar = s.history[s.history.length - 1];
    const y2Bar = s.history[s.history.length - 2];
    if (y2Bar.close <= 0) return false;
    const wasLimitUp = (yBar.close - y2Bar.close) / y2Bar.close >= 0.095;
    return wasLimitUp && (s.role === 'Dragon' || s.role === 'Leader');
  });

  for (const bd of brokenDragons) {
    const change = bd.changePercent || 0;
    if (change > 2) {
      // 断板反包 → 二波启动
      relayCandidates.push(buildCandidate(bd, 'SECOND_WAVE', '二波启动', {
        positionScore: 70 + change * 2,
        relayProbability: 55,
        relatedDragon: null,
        relatedDragonCode: null,
        relatedDragonHeight: 0,
        heightDiff: 0,
        strategy: `前龙头断板后阳线反包(+${change.toFixed(1)}%)，出现"二波启动"迹象。若能涨停确认反包，可博弈第二波主升。`,
        entryTiming: '涨停确认后排板，或回踩均价线低吸',
        stopLoss: '今日最低价下方止损',
        tags: ['二波启动', '前龙头反包'],
      }));
    }
  }

  // ── Step 6: Rotation dragon detection (板块轮动龙) ──
  // 寻找新冒头的板块中的领涨股
  const hotThemes = themes
    .filter(t => t.type === 'Main' || t.type === 'Vice')
    .filter(t => (t.stockCount || 0) >= 2)
    .slice(0, 5);
  
  for (const theme of hotThemes) {
    const themeStocks = limitUpStocks.filter(s => s.concept === theme.name);
    if (themeStocks.length >= 2) {
      const leader = themeStocks.sort((a, b) => 
        (b.consecutiveLimitUps || 1) - (a.consecutiveLimitUps || 1)
      )[0];
      
      const leaderHeight = leader.consecutiveLimitUps || 1;
      
      // 如果不是当前空间龙的板块，且有连板，可能是轮动龙
      if (spaceDragon && leader.concept !== spaceDragon.stock.concept && leaderHeight >= 2) {
        const existing = positionDragons.find(p => p.stock.id === leader.id);
        if (!existing) {
          relayCandidates.push(buildCandidate(leader, 'ROTATION_DRAGON', `轮动龙(${theme.name})`, {
            positionScore: 65 + leaderHeight * 5,
            relayProbability: 45,
            relatedDragon: spaceDragon.stock.name,
            relatedDragonCode: spaceDragon.stock.code,
            relatedDragonHeight: maxBoardHeight,
            heightDiff: maxBoardHeight - leaderHeight,
            strategy: `${theme.name}板块新冒头的龙头，${leaderHeight}连板。板块跟涨${themeStocks.length}只，有板块效应。若当前空间龙(${spaceDragon.stock.name})断板，此票可能接力成为新龙头。`,
            entryTiming: '板块持续发酵+当前龙头衰弱时介入',
            stopLoss: '板块退潮止损',
            tags: ['轮动龙', theme.name, `${leaderHeight}板`],
          }));
        }
      }
    }
  }

  // Sort position dragons by score
  positionDragons.sort((a, b) => b.positionScore - a.positionScore);
  relayCandidates.sort((a, b) => b.positionScore - a.positionScore);

  // Global advice
  let globalAdvice = '';
  if (maxBoardHeight >= 5) {
    globalAdvice = `市场最高板${maxBoardHeight}板(${spaceDragon?.stock.name})，空间充裕。`;
  } else if (maxBoardHeight >= 3) {
    globalAdvice = `市场最高板${maxBoardHeight}板，关注能否突破${maxBoardHeight + 1}板。`;
  } else if (maxBoardHeight >= 1) {
    globalAdvice = `市场高度仅${maxBoardHeight}板，情绪低迷，不宜追高。`;
  } else {
    globalAdvice = '当日无涨停，极端冰点行情，空仓观望。';
  }
  
  if (positionDragons.length > 0) {
    globalAdvice += ` 发现${positionDragons.length}只卡位龙候选，最强: ${positionDragons[0].stock.name}(${positionDragons[0].boardHeight}板)。`;
  }
  if (relayCandidates.length > 0) {
    globalAdvice += ` ${relayCandidates.length}只接力候选待命。`;
  }

  return {
    spaceDragon,
    sectorDragons,
    positionDragons,
    relayCandidates,
    maxBoardHeight,
    boardLadder,
    isLadderHealthy,
    ladderAdvice,
    globalAdvice,
    timestamp: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function buildCandidate(
  stock: Stock,
  dragonType: DragonType,
  dragonLabel: string,
  overrides: Partial<DragonCandidate>,
): DragonCandidate {
  return {
    stock,
    dragonType,
    dragonLabel,
    positionScore: 50,
    relayProbability: 30,
    relatedDragon: null,
    relatedDragonCode: null,
    relatedDragonHeight: 0,
    heightDiff: 0,
    boardHeight: stock.consecutiveLimitUps || (stock.isLimitUp ? 1 : 0),
    concept: stock.concept || '未分类',
    sealQuality: (stock.strengthScore || 50) > 75 ? 'HARD' : (stock.strengthScore || 50) > 40 ? 'NORMAL' : 'SOFT',
    volumePattern: stock.turnoverRate && stock.turnoverRate < 5 ? 'SHRINK' : stock.turnoverRate && stock.turnoverRate > 15 ? 'HEAVY' : 'NORMAL',
    strategy: '',
    entryTiming: '',
    stopLoss: '',
    tags: [],
    ...overrides,
  };
}

function generatePositionStrategy(
  candidate: Stock,
  dragon: Stock,
  csHeight: number,
  dragonHeight: number,
  isSameSector: boolean,
  phase: MarketPhase,
): string {
  const heightDiff = dragonHeight - csHeight;
  const dragonName = dragon.name;
  const csName = candidate.name;
  
  if (heightDiff === 1 && isSameSector) {
    return `[同板块卡位] ${csName}(${csHeight}板)紧追${dragonName}(${dragonHeight}板)。同板块梯队结构紧凑，若${dragonName}明日加速，${csName}大概率跟进晋级。策略：明日竞价缩量高开直接排板。`;
  }
  
  if (heightDiff === 1 && !isSameSector) {
    return `[跨板块卡位] ${csName}(${csHeight}板)与${dragonName}(${dragonHeight}板)高度仅差1板。若${dragonName}断板，${csName}有望成为新的空间龙。策略：关注${dragonName}走势，其断板日即${csName}的进攻日。`;
  }
  
  if (heightDiff === 2) {
    return `[次级卡位] ${csName}(${csHeight}板)距离空间龙差2板，属于梯队后备。需要持续加速2天才能接棒。策略：${phase === 'Climax' ? '市场高潮期可博弈' : '保守观望，追涨风险大'}。`;
  }
  
  return `${csName}(${csHeight}板)为${dragonName}(${dragonHeight}板)的卡位候选。关注明日竞价表现。`;
}
