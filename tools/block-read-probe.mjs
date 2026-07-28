// Phase 5 W1 §7 C2 獨立驗證探針（§12-10「選封直線後，後排陣型可見偏斜線」）
//
// 量的是**實際世界座標**，不是意圖、不是測試斷言：把受控玩家（A 隊前排）
// 分別釘在「直線過網點」與「斜線過網點」上，各跑同樣的 tick 數，
// 印出 A 隊後排三人的 x/z 與兩情境的差值。
//
// 跑法：node tools/block-read-probe.mjs
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { spikeAimsFor, netCrossingX } from '../src/sim/blockRead.js';
import { isFrontRow } from '../src/sim/rotation.js';

const TICKS = 90;

function setup() {
  // 與 tests/l2-scheme.test.mjs「blockScheme 站位幾何」同一組佈景：
  // B 隊持球第二擊佈陣中、球高飛不落地 → A 隊前排貼網攔網、後排走 dig 收縮
  const g = createGame({ seed: 11 });
  g.phase = 'rally';
  g.rally.possession = 'B';
  g.rally.touches = 1;
  g.ball.x = 2.5;
  g.ball.z = -3;
  g.ball.y = 3;
  g.ball.vy = 8;
  g.ball.vx = 0;
  g.ball.vz = -0.5;
  return g;
}

// mode: 'none'（無受控者）｜'line'（釘在直線過網點）｜'cross'（釘在斜線過網點）
function run(mode) {
  const g = setup();
  const ai = createAiState();
  // 先跑一 tick 讓協調層指派 B 的攻擊手（blockRead 要有攻擊手才讀得出線）
  aiCollectIntents(g, ai);
  const atkId = ai.attackerId;
  const me = g.match.rotations.A.find((id) => isFrontRow(g.match.rotations.A, id));
  // 過網點會隨攻擊手走位而動——玩家封線也是跟著攻擊手移動的，故逐 tick 重算
  const crossingsNow = () => {
    const a = ai.attackerId ? g.actors[ai.attackerId] : null;
    if (!a) return null;
    const aims = spikeAimsFor(g, ai.attackerId);
    return { lineX: netCrossingX(a, aims.line), crossX: netCrossingX(a, aims.cross) };
  };
  const first = crossingsNow();
  let last = first;
  for (let i = 0; i < TICKS; i += 1) {
    const c = crossingsNow();
    if (c) last = c;
    if (mode !== 'none' && c) { // 受控玩家＝玩家自己用搖桿站的位置（探針用釘的）
      g.actors[me].x = mode === 'line' ? c.lineX : c.crossX;
      g.actors[me].vx = 0;
    }
    stepGame(g, aiCollectIntents(g, ai, mode === 'none' ? [] : [me]));
    if (g.phase !== 'rally') break;
  }
  const lineX = last?.lineX ?? first?.lineX ?? 0;
  const crossX = last?.crossX ?? first?.crossX ?? 0;
  const backRow = g.match.rotations.A.filter((id) => !isFrontRow(g.match.rotations.A, id));
  return {
    atkId, me, lineX, crossX, read: ai.blockRead,
    backRow: backRow.map((id) => ({
      id, role: g.players[id].currentRole,
      x: g.actors[id].x, z: g.actors[id].z,
    })),
  };
}

const none = run('none');
const line = run('line');
const cross = run('cross');

console.log('== 佈景 ==');
console.log(`B 隊攻擊手 ${none.atkId}（世界座標 x=${none.lineX.toFixed(2)} 為其直線過網點、`
  + `x=${none.crossX.toFixed(2)} 為斜線過網點）`);
console.log(`受控玩家（A 隊前排）＝ ${line.me}`);
console.log(`釘直線過網點時的推論：${JSON.stringify(line.read)}`);
console.log(`釘斜線過網點時的推論：${JSON.stringify(cross.read)}`);
console.log('');
console.log('== A 隊後排三人實際座標（tick 90）==');
console.log('id   role      無受控者          玩家封直線        玩家封斜線        Δx(直線→斜線)');
for (let i = 0; i < none.backRow.length; i += 1) {
  const n = none.backRow[i];
  const l = line.backRow[i];
  const c = cross.backRow[i];
  const dx = c.x - l.x;
  console.log(
    `${n.id.padEnd(4)} ${n.role.padEnd(9)} `
    + `(${n.x.toFixed(2)}, ${n.z.toFixed(2)})`.padEnd(18)
    + `(${l.x.toFixed(2)}, ${l.z.toFixed(2)})`.padEnd(18)
    + `(${c.x.toFixed(2)}, ${c.z.toFixed(2)})`.padEnd(18)
    + `${dx >= 0 ? '+' : ''}${dx.toFixed(2)} m`,
  );
}
