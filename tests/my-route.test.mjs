// Phase 5 W1 收尾（07-29）— 受控者「我這球跑哪條線」資料面（`src/input/myRoute.js`）
//
// 這一輪的拍板是「給資訊、不代跑」：助跑本來就是玩家自己操作，自由度才是價值，
// 缺的只是「玩家不知道系統指派給他哪一條線」。所以本組測試驗的是**資料**：
//   ① 真實整局裡確實報得出線，且與協調層的 route 表逐值同源（不是另算一份）
//   ② 標籤與分配面板同一份 KIND_LABELS（同一條線不得有兩種叫法）
//   ③ 不在攻擊池／接發階段／防守回合＝誠實回 null
//   ④ 對手的線不外洩、不回傳 attackerId（誠實性同憲法 §六 那把尺）
//   ⑤ 純函式：零副作用、同 seed 逐值相同
//   ⑥ **走位零改動**：與「沒有人呼叫過本檔」的同 seed 整局逐值相同
//      （這條就是「不得改變任何自動帶位行為」的機械證據）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { approachRouteOf, routePhaseAt } from '../src/sim/approach.js';
import { ACTION_PHASE } from '../src/sim/actionPhase.js';
import { KIND_LABELS } from '../src/input/setOptions.js';
import { myRouteFor, TEMPO_LABELS } from '../src/input/myRoute.js';

const PID = 'A2'; // 生涯主角＝受控者的槽位

// 回傳物件的欄位白名單（排序後比對）——這份清單就是「表現層拿得到什麼」的契約，
// 也是誠實性的閘：要新增欄位得先確認它不是未來值
const FIELDS = [
  'distToStart', 'kind', 'kindLabel', 'label', 'phase', 'pid', 'start', 'startTick',
  'steps', 'takeoff', 'takeoffTick', 'tempo', 'tempoLabel', 'ticksToStart',
].sort();

// 跑一局，逐 tick 收集受控者的 myRouteFor 結果與當下的協調層真值
function runSet(seed, { call = true } = {}) {
  const game = createGame({ seed });
  const aiState = createAiState();
  const samples = [];
  const positions = [];
  for (let i = 0; i < 12000 && !game.match.winner; i += 1) {
    stepGame(game, aiCollectIntents(game, aiState));
    if (call) {
      const mine = myRouteFor(game, aiState, PID);
      if (mine) {
        samples.push({
          tick: game.tick,
          mine,
          truth: approachRouteOf(aiState.approach?.routes, PID),
        });
      }
    }
    const a = game.actors[PID];
    positions.push(`${a.x.toFixed(6)},${a.z.toFixed(6)}`);
  }
  return { game, aiState, samples, positions };
}

test('①資料同源：整局都報得出線，且 kind／tempo／起點／起跳點與協調層 route 逐值相同', () => {
  const { samples } = runSet(11);
  assert.ok(samples.length > 300, `樣本不足（${samples.length}）——受控者根本沒進過攻擊池`);
  for (const s of samples) {
    assert.ok(s.truth, `tick ${s.tick} 報了線但協調層沒有這條 route`);
    assert.equal(s.mine.pid, PID);
    assert.equal(s.mine.kind, s.truth.kind);
    assert.equal(s.mine.tempo, s.truth.tempo);
    assert.equal(s.mine.steps, s.truth.start.steps);
    assert.equal(s.mine.start.x, s.truth.start.x);
    assert.equal(s.mine.start.z, s.truth.start.z);
    assert.equal(s.mine.takeoff.x, s.truth.takeoff.x);
    assert.equal(s.mine.takeoff.z, s.truth.takeoff.z);
    assert.equal(s.mine.startTick, s.truth.startTick);
    assert.equal(s.mine.takeoffTick, s.truth.takeoffTick);
    assert.equal(s.mine.phase, routePhaseAt(s.truth, s.tick));
    assert.ok(Object.values(ACTION_PHASE).includes(s.mine.phase));
  }
  // 線別要真的有變化，否則上面只是驗了一條線
  const kinds = new Set(samples.map((s) => s.mine.kind));
  assert.ok(kinds.size >= 2, `只看到一種線（${[...kinds]}）——這樣的資料給玩家沒有意義`);
});

test('②標籤同源：與分配面板讀同一份 KIND_LABELS，且節奏標籤三檔齊全', () => {
  const { samples } = runSet(11);
  for (const s of samples) {
    assert.equal(s.mine.kindLabel, KIND_LABELS[s.mine.kind]);
    assert.equal(s.mine.tempoLabel, TEMPO_LABELS[s.mine.tempo]);
    assert.equal(s.mine.label, `${s.mine.kindLabel}·${s.mine.tempoLabel}`);
    assert.ok(/[一-鿿]/.test(s.mine.label), `標籤未落中文：${s.mine.label}`);
  }
  assert.deepEqual(Object.keys(TEMPO_LABELS).sort(), ['one', 'three', 'two']);
});

test('③沒有線就誠實回 null：接發階段／防守回合／不在攻擊池的人', () => {
  const game = createGame({ seed: 11 });
  const aiState = createAiState();
  // 開賽（phase='serve'）＝還沒有任何進攻組織
  assert.equal(myRouteFor(game, aiState, PID), null);

  let sawReceive = false;
  let sawDefend = false;
  let sawOutOfPool = false;
  for (let i = 0; i < 12000 && !game.match.winner; i += 1) {
    stepGame(game, aiCollectIntents(game, aiState));
    const r = game.rally;
    const mine = myRouteFor(game, aiState, PID);
    if (game.phase === 'rally' && r.possession === 'A' && r.touches === 0) {
      assert.equal(mine, null, `接發/第一擊前不該有線（tick ${game.tick}）`);
      sawReceive = true;
    }
    if (game.phase === 'rally' && r.possession === 'B') {
      assert.equal(mine, null, `對方持球時不該有線（tick ${game.tick}）`);
      sawDefend = true;
    }
    // 不在攻擊池的人（同一 tick 的 B 隊某人／我方後排 S）＝null
    if (mine === null && game.phase === 'rally' && aiState.approach?.team === 'A'
        && r.possession === 'A' && r.touches >= 1) {
      assert.equal(approachRouteOf(aiState.approach.routes, PID), null);
      sawOutOfPool = true;
    }
  }
  assert.ok(sawReceive && sawDefend && sawOutOfPool,
    `三種情境未全部取樣：接發 ${sawReceive}／防守 ${sawDefend}／不在池 ${sawOutOfPool}`);
});

test('④不外洩：對手隊的線讀不到，且回傳物件不含 attackerId 這類未來值', () => {
  const game = createGame({ seed: 11 });
  const aiState = createAiState();
  let checkedOpp = 0;
  for (let i = 0; i < 12000 && !game.match.winner; i += 1) {
    stepGame(game, aiCollectIntents(game, aiState));
    if (aiState.approach?.team === 'A' && (aiState.approach.routes ?? []).length) {
      // A 隊在組織時，站在 B 隊任一人的立場都不該讀到 A 的線
      for (const pid of game.match.rotations.B) {
        assert.equal(myRouteFor(game, aiState, pid), null,
          `B 隊 ${pid} 讀到了 A 隊的 route 表（tick ${game.tick}）`);
      }
      checkedOpp += 1;
    }
    const mine = myRouteFor(game, aiState, PID);
    if (mine) {
      // 欄位白名單：多出任何一欄都得先確認它不是未來值（例如二傳最後選了誰）
      assert.deepEqual(Object.keys(mine).sort(), FIELDS);
      // 物件裡出現的 playerId 只能是自己——不得夾帶「誰在跑哪條線」的全隊真值
      const ids = [...new Set(JSON.stringify(mine).match(/[AB](?:[LR]\d*|\d+)/g) ?? [])];
      assert.deepEqual(ids, [PID], `夾帶了別人的 id：${ids}`);
    }
  }
  assert.ok(checkedOpp > 100, `對手視角取樣不足（${checkedOpp}）`);
});

test('⑤純函式：零副作用（game／aiState 逐值不變）＋同 seed 逐值相同', () => {
  const game = createGame({ seed: 11 });
  const aiState = createAiState();
  for (let i = 0; i < 900; i += 1) stepGame(game, aiCollectIntents(game, aiState));
  const beforeGame = JSON.stringify(game);
  const beforeAi = JSON.stringify(aiState);
  const first = myRouteFor(game, aiState, PID);
  const second = myRouteFor(game, aiState, PID);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(game), beforeGame, 'myRouteFor 動到了 game');
  assert.equal(JSON.stringify(aiState), beforeAi, 'myRouteFor 動到了 aiState');

  const a = runSet(7).samples.map((s) => `${s.tick}|${s.mine.label}|${s.mine.phase}`);
  const b = runSet(7).samples.map((s) => `${s.tick}|${s.mine.label}|${s.mine.phase}`);
  assert.ok(a.length > 200, `樣本不足（${a.length}）`);
  assert.deepEqual(a, b);
});

test('⑥走位零改動：呼叫本檔與完全不呼叫，受控者的整局座標逐值相同', () => {
  // 拍板要求「不得改變任何自動帶位行為」——本檔既然是純讀取，最直接的機械證據就是
  // 「有沒有人在讀」對世界沒有任何影響
  const withCall = runSet(11, { call: true }).positions;
  const without = runSet(11, { call: false }).positions;
  assert.ok(withCall.length > 1000, `樣本不足（${withCall.length}）`);
  assert.deepEqual(withCall, without);
});
