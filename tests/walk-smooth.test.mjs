// 07-28 追修：球員「原地跳舞」的根因＝走位到位邏輯的 stop-go 極限環
// 舊版 moveIntent 恆送單位向量（滿速一步 0.0715m）＋到位帶 0.06m：步長比到位半徑還大
// ⇒ 走位目標每 tick 的微移被死區吃掉、累積到帶外才一次全速釋放，速度在 4.29↔0 之間
// 每 3–4 tick 交替（瀏覽器逐幀實測），表現層據此算出的踏步就在原地開合＝跳舞。
// 這裡守的是 sim 側的行為：不過衝、精準停、整場不出現滿速↔靜止的交替。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { basePosition, positionOf } from '../src/sim/rotation.js';

const SIM_HZ = 60;
const STILL = 0.25; // m/s：以下視為靜止（＝表現層驅動踏步的門檻）
const FAST = 2.0;   // m/s：以上視為滿速

// 發球階段把某球員推離輪轉基準位，讓他走回去＝「走向固定目標」的乾淨樣本
// （走的是真實路徑：aiCollectIntents → stepGame，沒有任何邏輯被測試重抄一份）
function walkHomeTrack(pid, team, ticks = 40) {
  const g = createGame({ seed: 7 });
  const ai = createAiState();
  const actor = g.actors[pid];
  const home = basePosition(team, positionOf(g.match.rotations[team], pid));
  actor.x = home.x - 0.9;
  actor.z = home.z - 0.3;
  const track = [];
  for (let t = 0; t < ticks; t += 1) {
    stepGame(g, aiCollectIntents(g, ai));
    assert.equal(g.phase, 'serve', '取樣期間必須都在發球階段（走位目標固定）');
    track.push({
      speed: Math.hypot(actor.x - actor.px, actor.z - actor.pz) * SIM_HZ,
      dist: Math.hypot(home.x - actor.x, home.z - actor.z),
    });
  }
  return track;
}

test('走向固定目標：不過衝＋精準停（停在 5mm 內；修前死區讓人停在 19.6mm 外）', () => {
  const track = walkHomeTrack('A4', 'A');
  for (let i = 1; i < track.length; i += 1) {
    assert.ok(
      track[i].dist <= track[i - 1].dist + 1e-9,
      `第 ${i} tick 離目標變遠了（過衝）：${track[i - 1].dist} → ${track[i].dist}`,
    );
  }
  assert.ok(
    track[track.length - 1].dist <= 0.005,
    `最終應停在目標 5mm 內，實際 ${track[track.length - 1].dist.toFixed(4)}m`,
  );
});

// 註（誠實揭露）：**固定**目標這一情境修前本來就不震盪（人只是停在 2cm 外），
// 這條測試在修前也是綠的——真正會紅的是下一條「整場實跑」（目標逐 tick 微移才誘發極限環）
test('接近目標的最後 20 tick：不得出現「靜止→滿速→靜止」或「滿速→靜止→滿速」的交替', () => {
  const track = walkHomeTrack('A4', 'A');
  const tail = track.slice(-20);
  for (let i = 1; i < tail.length - 1; i += 1) {
    const [p, c, n] = [tail[i - 1].speed, tail[i].speed, tail[i + 1].speed];
    assert.ok(
      !(c < STILL && p > FAST && n > FAST),
      `末段第 ${i} tick 出現「滿速→靜止→滿速」：${p} / ${c} / ${n}`,
    );
    assert.ok(
      !(c > FAST && p < STILL && n < STILL),
      `末段第 ${i} tick 出現「靜止→滿速→靜止」：${p} / ${c} / ${n}`,
    );
  }
});

test('整場實跑：滿速↔靜止的 stop-go 交替率 < 0.5%（修前 5.92%）', () => {
  let stopGo = 0;
  let samples = 0;
  for (const seed of [3, 11]) {
    const g = createGame({ seed, setTarget: 15 });
    const ai = createAiState();
    const hist = {};
    let guard = 0;
    while (g.phase !== 'set_over' && guard < 200000) {
      guard += 1;
      stepGame(g, aiCollectIntents(g, ai));
      for (const [pid, a] of Object.entries(g.actors)) {
        const h = (hist[pid] ??= []);
        h.push(Math.hypot(a.x - a.px, a.z - a.pz) * SIM_HZ);
        if (h.length > 3) h.shift();
        if (h.length < 3) continue;
        samples += 1;
        const [p, c, n] = h;
        if (c < STILL && p > FAST && n > FAST) stopGo += 1;
        if (c > FAST && p < STILL && n < STILL) stopGo += 1;
      }
    }
  }
  const rate = (stopGo / samples) * 100;
  assert.ok(samples > 100000, `樣本太少：${samples}`);
  assert.ok(rate < 0.5, `stop-go 交替率 ${rate.toFixed(3)}% 應 < 0.5%`);
});

test('決定論：同 seed 兩次整場逐 tick 位置逐值相同（幅值化走位不引入浮點分岔）', () => {
  const run = () => {
    const g = createGame({ seed: 5, setTarget: 15 });
    const ai = createAiState();
    const trace = [];
    let guard = 0;
    while (g.phase !== 'set_over' && guard < 200000) {
      guard += 1;
      stepGame(g, aiCollectIntents(g, ai));
      for (const id of [...g.match.rotations.A, ...g.match.rotations.B]) {
        const a = g.actors[id];
        trace.push(a.x, a.z);
      }
    }
    return trace;
  };
  const a = run();
  const b = run();
  assert.ok(a.length > 10000, `軌跡樣本太少：${a.length}`);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i += 1) {
    assert.equal(a[i], b[i], `第 ${i} 個值不同：${a[i]} vs ${b[i]}`);
  }
});
