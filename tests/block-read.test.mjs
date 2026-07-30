// Phase 5 W1 §7 C2 — 後排防守跟著攔網走（07-28 Sawmah 拍板 A 案：零新面板，
// 後排讀的是受控玩家「實際站到哪條過網線」，不是他按了什麼）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import {
  spikeAimsFor, netCrossingX, blockLaneRead, digForBlock, BLOCK_READ,
} from '../src/sim/blockRead.js';
import { attackZonesFor } from '../src/input/attackZones.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { COURT } from '../src/sim/constants.js';

// 佈景：B 隊持球佈陣中、球高飛不落地 → A 隊前排貼網攔網、後排走 dig 收縮
// （與 tests/l2-scheme.test.mjs「blockScheme 站位幾何」同一組）
function setup() {
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

const backRowIds = (g) => g.match.rotations.A.filter((id) => !isFrontRow(g.match.rotations.A, id));
const snap = (g) => backRowIds(g).map((id) => ({
  id, x: +g.actors[id].x.toFixed(4), z: +g.actors[id].z.toFixed(4),
}));

// mode: 'none'｜'line'｜'cross'｜'neutral'（在死區內來回微調）
// digBias：明確指令（要驗優先序時傳）
function run(mode, { ticks = 90, digBias = null, jitter = 0 } = {}) {
  const g = setup();
  const ai = createAiState();
  aiCollectIntents(g, ai); // 第一 tick 讓協調層指派 B 的攻擊手
  const me = g.match.rotations.A.find((id) => isFrontRow(g.match.rotations.A, id));
  const reads = [];
  for (let i = 0; i < ticks; i += 1) {
    if (digBias) ai.digBias = digBias; // 面板指令（matchLoop 平時的注入點）
    if (mode !== 'none' && ai.attackerId) {
      // 過網點隨攻擊手走位而動——玩家封線也是跟著攻擊手移動的，逐 tick 重算
      const a = g.actors[ai.attackerId];
      const aims = spikeAimsFor(g, ai.attackerId);
      const lineX = netCrossingX(a, aims.line);
      const crossX = netCrossingX(a, aims.cross);
      const mid = (lineX + crossX) / 2;
      const half = (lineX - crossX) / 2;
      const wobble = jitter ? (i % 2 ? jitter : -jitter) : 0;
      g.actors[me].x = mode === 'line' ? lineX + wobble * half
        : mode === 'cross' ? crossX + wobble * half
          : mid + wobble * half;
      g.actors[me].vx = 0;
    }
    stepGame(g, aiCollectIntents(g, ai, mode === 'none' ? [] : [me]));
    reads.push(ai.blockRead ? ai.blockRead.block : null);
    if (g.phase !== 'rally') break;
  }
  return { g, ai, me, back: snap(g), reads };
}

test('幾何單一真相：攻擊瞄準點上移至 sim 後，input/attackZones 讀的是同一份（數值零漂移）', () => {
  const g = setup();
  const atk = 'A4';
  const aims = spikeAimsFor(g, atk);
  const zones = attackZonesFor(g, atk);
  for (const z of zones) assert.deepEqual(z.aim, aims[z.key], `${z.key} 瞄準點須同源`);
  // canon 值守衛：這四組數字是遷移前 attackZones.js 的原文，改動須是刻意的
  const a = g.actors[atk];
  const sign = a.x >= 0 ? 1 : -1;
  assert.deepEqual(aims.line, { x: sign * 4.15, z: -5.2 });
  assert.deepEqual(aims.cross, { x: -sign * 3.9, z: -6.3 });
  assert.deepEqual(aims.middle, { x: 0, z: -5.0 });
  assert.deepEqual(aims.tip, { x: -sign * 1.2, z: -1.9 });
  // 過網點算法：aim 與 from 同 z 側時線性內插到 z=0
  assert.equal(netCrossingX({ x: 0, z: 2 }, { x: 4, z: -2 }), 2);
});

test('站位推論：站直線過網點＝封直線、站斜線過網點＝封斜線、站中間＝中性不動陣型', () => {
  const g = setup();
  const ai = createAiState();
  aiCollectIntents(g, ai);
  const atk = ai.attackerId;
  assert.ok(atk && g.players[atk].teamId === 'B', 'B 隊應已指派攻擊手');
  const me = g.match.rotations.A.find((id) => isFrontRow(g.match.rotations.A, id));
  const aims = spikeAimsFor(g, atk);
  const lineX = netCrossingX(g.actors[atk], aims.line);
  const crossX = netCrossingX(g.actors[atk], aims.cross);
  const mid = (lineX + crossX) / 2;
  const half = (lineX - crossX) / 2;
  const at = (lean) => {
    g.actors[me].x = mid + lean * half;
    return blockLaneRead(g, me, atk);
  };
  assert.equal(at(1), 'line', '站在直線過網點上＝封直線');
  assert.equal(at(-1), 'cross', '站在斜線過網點上＝封斜線');
  assert.equal(at(0), null, '正中間＝讀不出傾向');
  assert.equal(at(BLOCK_READ.ENTER - 0.05), null, '未過門檻＝維持中性');
  assert.equal(at(BLOCK_READ.ENTER + 0.05), 'line', '過門檻才算明確封線');
  // 配對表＝liberoRead 的 DIG_SCHEMES（封 X・收 Y）
  assert.equal(digForBlock('line'), 'cross');
  assert.equal(digForBlock('cross'), 'line');
  assert.equal(digForBlock(null), null);
});

test('遲滯：已判定後要掉回 EXIT 以下才回中性，翻面要走完整個 ENTER（網前微調不抖）', () => {
  const g = setup();
  const ai = createAiState();
  aiCollectIntents(g, ai);
  const atk = ai.attackerId;
  const me = g.match.rotations.A.find((id) => isFrontRow(g.match.rotations.A, id));
  const aims = spikeAimsFor(g, atk);
  const lineX = netCrossingX(g.actors[atk], aims.line);
  const crossX = netCrossingX(g.actors[atk], aims.cross);
  const mid = (lineX + crossX) / 2;
  const half = (lineX - crossX) / 2;
  const read = (lean, prev) => {
    g.actors[me].x = mid + lean * half;
    return blockLaneRead(g, me, atk, prev);
  };
  const mid2 = (BLOCK_READ.ENTER + BLOCK_READ.EXIT) / 2; // 0.325：死區內
  assert.equal(read(mid2, null), null, '中性起步：死區內不判定');
  assert.equal(read(mid2, 'line'), 'line', '已封直線：同樣位置維持判定（不抖）');
  assert.equal(read(BLOCK_READ.EXIT - 0.05, 'line'), null, '掉破 EXIT 才回中性');
  assert.equal(read(-BLOCK_READ.EXIT - 0.05, 'line'), null, '往反向只到 EXIT＝還不算改封');
  assert.equal(read(-BLOCK_READ.ENTER - 0.05, 'line'), 'cross', '走完整個 ENTER 才翻面');
  assert.ok(BLOCK_READ.EXIT < BLOCK_READ.ENTER, '遲滯必須是不對稱門檻');
});

test('§12-10 連動：玩家封直線 → 後排陣型可見偏斜線（實跑世界座標，非意圖）', () => {
  const none = run('none');
  const line = run('line');
  const cross = run('cross');
  assert.equal(line.reads.at(-1), 'line');
  assert.equal(cross.reads.at(-1), 'cross');
  // 球在 x=+2.5（＝攻擊手的直線側），故封直線＝後排讓開直線、整體往 −x（斜線側）收
  //
  // D-1（Phase 5 W2 掃尾-11，07-30）：digTargetFor 現在會把收縮目標夾在場地內
  // （clampCourtX；修前 A1 在本情境會被叫到 x≈5.2，出界）。貼邊球員（如 A1）被夾住後，
  // 移動量會小於未夾限時的量——只要目標真的已經頂到邊界，視為「已盡力收到底」也算過，
  // 不強求跨過場地邊界的位移量
  const lim = COURT.WIDTH / 2 - 0.4;
  const atLim = (x) => Math.abs(Math.abs(x) - lim) < 1e-6;
  for (let i = 0; i < none.back.length; i += 1) {
    const n = none.back[i];
    const l = line.back[i];
    const c = cross.back[i];
    assert.equal(n.id, l.id);
    assert.ok(l.x < n.x - 1.0 || atLim(l.x),
      `${n.id} 封直線時後排應往斜線側收，或已頂到場地邊界（${l.x.toFixed(2)} vs 基準 ${n.x.toFixed(2)}）`);
    assert.ok(c.x > n.x + 1.0 || atLim(c.x),
      `${n.id} 封斜線時後排應往直線側收，或已頂到場地邊界（${c.x.toFixed(2)} vs 基準 ${n.x.toFixed(2)}）`);
    assert.ok(c.x - l.x > 2.0 || atLim(l.x) || atLim(c.x),
      `${n.id} 兩情境的實際座標差應肉眼可見，或至少一側已頂到場地邊界（Δx=${(c.x - l.x).toFixed(2)}m）`);
  }
});

test('優先序：L 面板的明確指令壓過身體站位推論', () => {
  // 玩家站在「直線過網點」（站位推論＝封直線→後排收斜線），
  // 但同時存在明確指令「攔手讓開・收吊球」（tip＝前壓短區，與左右收縮完全不同型）
  const bias = { team: 'A', choice: 'tip', block: 'off', override: false };
  const withBoth = run('line', { digBias: bias });
  const explicitOnly = run('none', { digBias: bias });
  const readOnly = run('line');
  assert.equal(withBoth.ai.blockRead?.block, 'line', '推論值照樣算出來（只是不被消費）');
  assert.deepEqual(withBoth.back, explicitOnly.back, '有明確指令時＝完全照指令走');
  assert.notDeepEqual(withBoth.back, readOnly.back, '且與純站位推論的結果不同');
  // tip 指令的特徵＝後排前壓（z 明顯小於左右收縮版）
  assert.ok(withBoth.back[0].z < readOnly.back[0].z - 1.0,
    `明確指令 tip 應前壓短區（z=${withBoth.back[0].z} vs ${readOnly.back[0].z}）`);
});

test('門檻內微調不造成陣型跳動：死區內來回＝後排座標與「無受控者」逐值相同', () => {
  const none = run('none');
  // 死區內以 ±0.3（ENTER 0.45 之下）逐 tick 來回擺
  const wobble = run('neutral', { jitter: 0.3 });
  assert.ok(wobble.reads.every((r) => r === null), '死區內不得判出任何封線');
  assert.deepEqual(wobble.back, none.back, '陣型零抖動（與無指令基準逐值相同）');
});

test('決定論：同輸入逐值相同；無受控者（治具/AI 對打）＝零行為改變', () => {
  assert.deepEqual(run('line').back, run('line').back);
  assert.deepEqual(run('cross').reads, run('cross').reads);
  // 回歸閘：excludeIds 為空時 blockRead 恆 null——balance-sim 與既有治具的行為不受本輪影響
  const none = run('none');
  assert.equal(none.ai.blockRead, null);
  assert.ok(none.reads.every((r) => r === null));
});
