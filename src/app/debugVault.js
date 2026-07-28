// 試玩輔助（`?debugVault=1`）——不是遊戲功能：造一份「高中三年打完、典藏牆四槽有料」
// 的**記憶體存檔**，直接進生涯畫面按「▶ 生涯結算」即可驗 4.6 主交付
// （典藏牆入口卡→重演舞台）與 4.5B 遺留的「生涯結算開場序列未經實跑」。
//
// **零污染**：storage 是 Map 假體（careerStore 支援注入，tests 同一路徑），
// 完全不碰 localStorage 的真實存檔；關掉分頁就消失。
import { createGame, stepGame } from '../sim/game.js';
import { createAiState, aiCollectIntents } from '../sim/ai.js';
import { createCareer, createCareerPlayer, careerStage } from '../career/careerState.js';
import { createCareerStore } from '../career/careerStore.js';
import { ensureStarterRoster } from '../career/roster.js';
import { ENGINEERED_OPEN } from '../career/positionFlags.js';
import { settleCareerMatch } from './matchCareer.js';
import { createRallyRecorder } from './rallyTape.js';

const SEED = 20260728;

// 一顆真球（全 AI 對打）：走與正賽同一條錄製管線，產 v2 卷。
// **先把比分推到賽末再開錄**——典藏的是勝負點，重演標題會顯示發球前比分；
// 從 0:0 錄第一顆球會標成「0 – 0」，那比沒有脈絡更糟
function recordDemoRally(seed) {
  const game = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const rec = createRallyRecorder();
  let guard = 0;
  // 階段一：空跑到有一方進入賽末區（不錄）
  while (guard < 200000 && game.phase !== 'set_over'
    && Math.max(game.match.score.A, game.match.score.B) < 23) {
    guard += 1;
    stepGame(game, aiCollectIntents(game, ai));
  }
  // 階段二：錄下一顆完整的球
  while (guard < 220000 && game.phase !== 'set_over') {
    guard += 1;
    if (game.phase === 'serve') rec.begin(game, ai);
    rec.step(game, ai, null, []);
    const events = stepGame(game, aiCollectIntents(game, ai));
    if (events.some((e) => e.type === 'DEAD_BALL')) break;
  }
  return rec.end();
}

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 假的終局 game（settleCareerMatch 只吃比分/勝方/事件流）
function fakeGame(won) {
  return {
    players: { A2: { teamId: 'A' } },
    match: { score: won ? { A: 25, B: 18 } : { A: 19, B: 25 }, winner: won ? 'A' : 'B' },
    events: [],
    scoutTally: {},
  };
}

// 一屆：小組全勝、國賽依 loseAt 停在指定場（null＝全勝奪冠）
function playSeason(store, loseAt) {
  for (;;) {
    const career = store.loadCareer();
    if (careerStage(career) === 'eliminated' || careerStage(career) === 'champion') break;
    const next = career.schedule.find((x) => !career.results.some((r) => r.matchId === x.id));
    if (!next) break;
    settleCareerMatch({
      careerCtx: {
        store, career, player: store.loadPlayer(), matchEntry: next,
        seasonIndex: store.seasonIndex?.() ?? 1,
      },
      game: fakeGame(next.id !== loseAt),
      playerId: 'A2',
    });
  }
}

// 三年份劇本：第 1 屆決賽敗給天鷹（幕一碾壓）→ 第 2 屆準決賽敗給天鷹 → 第 3 屆奪冠。
// 四槽因此是「敗・敗・勝＋冠軍點」＝入口卡的勝敗混排最能看出版面問題
export function buildVaultDemoStore() {
  const store = createCareerStore(memStorage(), 1);
  store.saveCareer(createCareer({ seed: SEED, playerName: '試玩' }));
  store.savePlayer(createCareerPlayer('試玩', { heightCm: 175, aspiration: 'outside', seed: SEED }));
  ensureStarterRoster(store);
  for (const p of ENGINEERED_OPEN) { store.markPositionReady(p); store.approveOpenPosition(p); }

  playSeason(store, 'national-final');   // 第 1 屆：決賽（天鷹）敗
  store.advanceSeason({ invitedId: null });
  playSeason(store, 'national-sf');      // 第 2 屆：準決賽（天鷹）敗
  store.advanceSeason({ invitedId: null });
  playSeason(store, null);               // 第 3 屆：全勝奪冠

  // 典藏牆四槽（真卷、真的能播）。這四個 seed 已驗過：錄到的賽末比分方向與下面的
  // 勝敗劇本一致（勝場領先、敗場落後）——sim 參數若動過導致對不上，換 seed 即可
  const tapes = [11, 23, 37, 51].map((s) => recordDemoRally(s));
  store.recordVaultRally(1, {
    matchId: 'national-final', seasonIndex: 1, opponentId: 'sky-hawk',
    label: '決賽', won: false, tape: tapes[0],
  });
  store.recordVaultRally(2, {
    matchId: 'national-sf', seasonIndex: 2, opponentId: 'sky-hawk',
    label: '準決賽', won: false, tape: tapes[1],
  });
  store.recordVaultRally(3, {
    matchId: 'national-final', seasonIndex: 3, opponentId: 'sky-hawk',
    label: '決賽', won: true, tape: tapes[2],
  });
  store.recordVaultRally('champion', {
    matchId: 'national-final', seasonIndex: 3, opponentId: 'sky-hawk',
    label: '決賽', won: true, tape: tapes[3],
  });
  return store;
}
