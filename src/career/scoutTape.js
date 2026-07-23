// Phase 2 stage 5 — 情蒐錄影帶（賽前備戰）：對手預演的關鍵球回放素材
// 決定論預生成：同兩隊、種子位移的無頭模擬，收「對手得分」的回合快照＋Intent 流，
// 交給現成 VCR 回放機制重演。不顯示風格標籤——特徵讓玩家自己從回放讀出來。
// W5+ 學招預告連動（Sawmah 07-23 拍板）：本場要教的招＝剪輯偏好——情蒐帶是「剪過的
// 重點影片」，放大對手該招使用率＋優先收錄含該招的得分球（正賽 profile 不動）。
import { createGame, stepGame } from '../sim/game.js';
import { createAiState, aiCollectIntents } from '../sim/ai.js';
import { isBackRow } from '../sim/rotation.js';

const TAPE_SEED_OFFSET = 7777; // 錄影帶種子位移（與正賽不同場、但同生涯可重現）
const TAPE_SET_TARGET = 10;    // 預演用短局（技術債審查：25 分制生成實測 732ms 阻塞開賽）
const MAX_SIM_TICKS = 15000;   // 預演上限（短局內綽綽有餘）
const MAX_CLIPS = 3;
const MIN_RALLY_STEPS = 90;    // 太短的球（發球直接墜地類）不值得播
const FEATURED_MIN_STEPS = 40; // 含教學招的球放寬門檻（輕吊得分本就短，不能全被濾掉）
const TIP_POWER = 0.45;        // 輕吊判定（與 commentary 同值）

// 可在情蒐帶突顯的教學技術（假動作不在列：AI 不做假動作；跳發＝決賽賽前傳授不預告）
export const TAPE_FEATURE_KEYS = new Set(['tip', 'dive', 'pipe', 'floatServe']);

// 本步事件是否命中要突顯的招（g＝生成側完整 game 狀態；export 供單元測試）
export function featureHit(feature, ev, g) {
  for (const e of ev) {
    if (feature === 'tip' && e.type === 'TOUCH' && e.team === 'B'
      && e.kind === 'spike' && (e.power ?? 1) <= TIP_POWER) return true;
    if (feature === 'dive' && e.type === 'TOUCH' && e.team === 'B' && e.kind === 'dive') return true;
    if (feature === 'pipe' && e.type === 'TOUCH' && e.team === 'B' && e.kind === 'spike'
      && isBackRow(g.match.rotations.B, e.playerId)) return true;
    if (feature === 'floatServe' && e.type === 'SERVE' && e.team === 'B'
      && g.rally?.serveStyle === 'float') return true;
  }
  return false;
}

// 剪輯偏好：放大對手 B 的該招使用率（只影響帶子生成的無頭模擬，不碰正賽 profile）。
// pipe 無 rate 參數（後排攻擊本就在 AI 攻擊池）＝不注入、純靠偵測挑片。
function biasProfiles(aiProfiles, feature) {
  if (!feature || !aiProfiles?.B) return aiProfiles;
  const b = { ...aiProfiles.B };
  if (feature === 'tip') b.tipRate = Math.max(b.tipRate ?? 0, 0.45);
  else if (feature === 'dive') b.diveRate = Math.max(b.diveRate ?? 0, 0.5);
  else if (feature === 'floatServe') {
    b.floatServeRate = Math.max(b.floatServeRate ?? 0, 0.8);
    b.jumpServeRate = 0; // 讓開發球式競爭，帶子裡飄浮球夠多
  }
  return { ...aiProfiles, B: b };
}

// 回傳 [{ snapshot, steps, featured }...]（至多 3 段）；素材不足回空陣列。
// 排序：含教學招的球優先（學招預告對得上畫面），再按多拍精彩度遞減
export function buildScoutTape(seed, teams, aiProfiles, liberos = null, feature = null) {
  const g = createGame({
    seed: (seed + TAPE_SEED_OFFSET) % 1000000007,
    setTarget: TAPE_SET_TARGET,
    teams,
    ...(aiProfiles ? { aiProfiles: biasProfiles(aiProfiles, feature) } : {}),
    ...(liberos ? { liberos } : {}),
  });
  const ai = createAiState();
  const clips = [];
  let current = null;
  while (g.phase !== 'set_over' && g.tick < MAX_SIM_TICKS) {
    if (g.phase === 'serve' && current === null) {
      current = { snapshot: structuredClone({ ...g, events: [] }), steps: [], featured: false };
    }
    const intents = aiCollectIntents(g, ai);
    if (current) current.steps.push({ intents });
    const ev = stepGame(g, intents);
    if (current && feature && !current.featured && featureHit(feature, ev, g)) {
      current.featured = true;
    }
    for (const e of ev) {
      if (e.type === 'SCORE') {
        const minSteps = current?.featured ? FEATURED_MIN_STEPS : MIN_RALLY_STEPS;
        if (e.team === 'B' && current && current.steps.length >= minSteps) {
          clips.push(current);
        }
        current = null;
      }
    }
  }
  // 含招優先→多拍優先，取前 3
  clips.sort((a, b) => (b.featured - a.featured) || (b.steps.length - a.steps.length));
  return clips.slice(0, MAX_CLIPS);
}
