// Phase 2 stage 5 — 情蒐錄影帶（賽前備戰）：對手預演的關鍵球回放素材
// 決定論預生成：同兩隊、種子位移的無頭模擬，收「對手得分」的回合快照＋Intent 流，
// 交給現成 VCR 回放機制重演。不顯示風格標籤——特徵讓玩家自己從回放讀出來。
import { createGame, stepGame } from '../sim/game.js';
import { createAiState, aiCollectIntents } from '../sim/ai.js';

const TAPE_SEED_OFFSET = 7777; // 錄影帶種子位移（與正賽不同場、但同生涯可重現）
const MAX_SIM_TICKS = 30000;   // 預演上限（約半局；生成耗時 ~百毫秒級）
const MAX_CLIPS = 3;
const MIN_RALLY_STEPS = 90;    // 太短的球（發球直接墜地類）不值得播

// 回傳 [{ snapshot, steps }...]（至多 3 段，優先多拍精彩球）；素材不足回空陣列
export function buildScoutTape(seed, teams, aiProfiles, liberos = null) {
  const g = createGame({
    seed: (seed + TAPE_SEED_OFFSET) % 1000000007,
    teams,
    ...(aiProfiles ? { aiProfiles } : {}),
    ...(liberos ? { liberos } : {}),
  });
  const ai = createAiState();
  const clips = [];
  let current = null;
  while (g.phase !== 'set_over' && g.tick < MAX_SIM_TICKS) {
    if (g.phase === 'serve' && current === null) {
      current = { snapshot: structuredClone({ ...g, events: [] }), steps: [] };
    }
    const intents = aiCollectIntents(g, ai);
    if (current) current.steps.push({ intents });
    const ev = stepGame(g, intents);
    for (const e of ev) {
      if (e.type === 'SCORE') {
        if (e.team === 'B' && current && current.steps.length >= MIN_RALLY_STEPS) {
          clips.push(current);
        }
        current = null;
      }
    }
  }
  // 多拍優先（最精彩），取前 3；播放序照長度遞減
  clips.sort((a, b) => b.steps.length - a.steps.length);
  return clips.slice(0, MAX_CLIPS);
}
