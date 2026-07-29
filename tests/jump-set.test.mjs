// Phase 5 W1 §5 A3 跳舉 —— **純資訊武器**（憲法 §三 A3：不增加球威力，只壓縮
// 攔網判讀時間窗）
//
// 驗收（工單「新增測試」③④⑤）：
//   ③ 不增加球威力：同一顆球、同一個出手，jump 旗標開／關的**球速與落點散佈逐值相同**
//      ＋ 靜態掃描：扣球路徑上不得出現 jump／jumpSet
//   ④ 確實壓縮判讀時間窗：可量的 tick 差異（二傳觸球高度上移、二傳→扣球的窗變短）
//   ⑤ 決定論；外加 VCR v2 重演相容（jumpSet 是新增的協調層欄位）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, AI } from '../src/sim/ai.js';
import { createIntent } from '../src/sim/intent.js';
import { createRallyRecorder, createRallyPlayer, TAPE_VERSION } from '../src/app/rallyTape.js';
import { standingReach, spikeReach } from '../src/sim/player.js';

const SIM = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'sim');

// ---------------- ③-a 球威力：同一顆球、開關旗標，逐值相同 ----------------

// 第二擊（舉球）的治具：球在 A1 頭上、可及高度以內＝jump 開關都能觸到，
// 於是「觸得到的那一刻」相同，唯一的變因就只剩旗標本身
function rigSet(seed, y) {
  const g = createGame({ seed });
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'arc';
  r.possession = 'A';
  r.touches = 1;
  r.lastTouchTeam = 'A';
  r.lastToucherId = 'A6';
  g.actors.A1.x = -1.2; g.actors.A1.z = 1.2;
  const b = g.ball;
  b.x = -1.2; b.y = y; b.z = 1.2;
  b.vx = 0.4; b.vy = -3.2; b.vz = 0.1;
  b.px = b.x; b.py = b.y + 0.05; b.pz = b.z;
  return g;
}

function doTouch(g, action, jump, aim, timing) {
  const ev = stepGame(g, [createIntent({
    playerId: action === 'set' ? 'A1' : 'A2', tick: g.tick, action, aim, timing, jump,
  })]);
  const touch = ev.find((e) => e.type === 'TOUCH');
  return { touch, v: { vx: g.ball.vx, vy: g.ball.vy, vz: g.ball.vz } };
}

test('A3 ③ 舉球彈道：同一顆球下，跳舉與站舉的出球速度逐值相同（不增加球威力）', () => {
  for (const seed of [1, 7, 42]) {
    // y 選在站立可及以內＝兩種旗標都觸得到；差別只剩旗標
    const stand = doTouch(rigSet(seed, 2.4), 'set', false, { x: -3, z: 1.3 }, 0.75);
    const jump = doTouch(rigSet(seed, 2.4), 'set', true, { x: -3, z: 1.3 }, 0.75);
    assert.ok(stand.touch && jump.touch, '舉球未成立');
    assert.deepEqual(jump.v, stand.v,
      `跳舉改變了出球速度＝那是威力不是資訊：${JSON.stringify(jump.v)} vs ${JSON.stringify(stand.v)}`);
    // 散佈同源：落點（scatterTarget 的輸出）逐值相同才可能速度相同，這裡再驗一次品質欄
    assert.equal(jump.touch.power, stand.touch.power);
    assert.equal(jump.touch.dist, stand.touch.dist);
    // 只差在標記
    assert.equal(jump.touch.jumpSet, true);
    assert.equal(stand.touch.jumpSet, undefined);
  }
});

test('A3 ③ 扣球彈道：jump 旗標對扣球零作用（球速／落點逐值相同）', () => {
  for (const seed of [2, 11]) {
    const rig = () => {
      const g = createGame({ seed });
      g.phase = 'rally';
      const r = g.rally;
      r.profile = 'arc'; r.possession = 'A'; r.touches = 2;
      r.lastTouchTeam = 'A'; r.lastToucherId = 'A1';
      g.actors.A2.x = 0; g.actors.A2.z = 1.2;
      const b = g.ball;
      b.x = 0; b.y = 3.0; b.z = 1.2;
      b.vx = 0; b.vy = -0.5; b.vz = 0;
      b.px = b.x; b.py = b.y + 0.05; b.pz = b.z;
      return g;
    };
    const off = doTouch(rig(), 'spike', false, { x: 0, z: -6.5 }, 1);
    const on = doTouch(rig(), 'spike', true, { x: 0, z: -6.5 }, 1);
    assert.ok(off.touch && on.touch, '扣球未成立');
    assert.deepEqual(on.v, off.v, 'jump 旗標不得改變扣球彈道');
    assert.equal(on.touch.jumpSet, undefined, 'jumpSet 標記只屬於舉球');
  }
});

test('A3 ③ 靜態掃描：sim 的扣球／散佈路徑不得讀 jump 或 jumpSet', () => {
  const game = readFileSync(join(SIM, 'game.js'), 'utf8');
  // game.js 只准在兩處看到 intent.jump：觸球高度上緣（maxY）與 TOUCH 事件標記
  const code = game.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const hits = code.match(/intent\.jump/g) ?? [];
  assert.equal(hits.length, 2,
    `game.js 出現 ${hits.length} 處 intent.jump——只准兩處（maxY 與 TOUCH 標記）`);
  // 扣球分支（spikeVelocity 那一段）與散佈（scatterTarget 呼叫）附近不得出現
  const spikeBlock = game.slice(game.indexOf('if (intent.action === \'spike\') {'),
    game.indexOf('ball.vx = v.vx;'));
  assert.ok(!/jump/i.test(spikeBlock), '扣球彈道區出現 jump');
  const ai = readFileSync(join(SIM, 'ai.js'), 'utf8');
  const scan = ai.slice(ai.indexOf('A3-SCAN-BEGIN'), ai.indexOf('A3-SCAN-END'));
  assert.ok(scan.includes('touchCeiling'), 'A3-SCAN 區未涵蓋 touchCeiling');
  // ai.js 的 jumpSet 只准出現在：狀態宣告、抽選、消費點與掃描區註解
  const lines = ai.split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)) // 註解不算（本檔的說明就提到扣球）
    .map((l, i) => [i + 1, l]).filter(([, l]) => /jumpSet/.test(l));
  for (const [, l] of lines) {
    // spikeReach＝「起跳摸得到的高度」，是跳舉的可及高度來源、不是威力來源，故排除
    assert.ok(!/spikeSpeed|spikeVelocity|scatterTarget|'spike'/.test(l),
      `jumpSet 出現在扣球威力相關的一行：${l.trim()}`);
  }
});

// ---------------- ④ 壓縮判讀時間窗（實跑量測） ----------------

// 跑整局，把每次「二傳觸球 → 扣球觸球」的 tick 依跳舉／站舉分桶
function runSet(seed) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const win = { jump: [], stand: [] };
  const setY = { jump: [], stand: [] };
  const recvToHit = { jump: [], stand: [] };
  const log = [];
  let setTick = null;
  let recvTick = null;
  let bucket = null;
  let setTotal = 0;
  let setJump = 0;
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const ev = stepGame(g, aiCollectIntents(g, ai));
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.touches === 1) recvTick = g.tick;
      if (e.type === 'TOUCH' && e.kind === 'set') {
        setTotal += 1;
        bucket = e.jumpSet ? 'jump' : 'stand';
        if (e.jumpSet) setJump += 1;
        setTick = g.tick;
        setY[bucket].push(e.ballY);
        log.push(`${g.tick}:set:${bucket}:${e.ballY}`);
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.touches === 3 && setTick != null) {
        win[bucket].push(g.tick - setTick);
        if (recvTick != null) recvToHit[bucket].push(g.tick - recvTick);
        log.push(`${g.tick}:hit:${bucket}:${g.tick - setTick}`);
        setTick = null;
      }
      if (e.type === 'DEAD_BALL') { setTick = null; recvTick = null; }
    }
  }
  return { win, setY, recvToHit, log, setTotal, setJump };
}

const runs = [1, 2, 3, 4, 5, 6].map(runSet);
const pool = (sel) => {
  const out = { jump: [], stand: [] };
  for (const r of runs) for (const b of ['jump', 'stand']) out[b].push(...sel(r)[b]);
  return out;
};
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

test('A3 ④ 觸發率：跳舉真的會發生，且比例貼近名目（一傳恆到位＝條件恆成立）', () => {
  const total = runs.reduce((s, r) => s + r.setTotal, 0);
  const jump = runs.reduce((s, r) => s + r.setJump, 0);
  assert.ok(total > 200, `舉球樣本不足（${total}）`);
  const rate = jump / total;
  assert.ok(Math.abs(rate - AI.JUMP_SET_RATE) < 0.08,
    `跳舉觸發率 ${(rate * 100).toFixed(1)}%（名目 ${AI.JUMP_SET_RATE * 100}%）`);
});

test('A3 ④ 跳舉的二傳觸球點確實更高（這是壓縮的來源，不是威力）', () => {
  const y = pool((r) => r.setY);
  assert.ok(y.jump.length > 60 && y.stand.length > 60, '樣本不足');
  const dy = med(y.jump) - med(y.stand);
  assert.ok(dy >= 0.2,
    `跳舉觸球高度只高了 ${dy.toFixed(2)}m（站舉 ${med(y.stand).toFixed(2)}／跳舉 ${med(y.jump).toFixed(2)}）`);
  // 上限：不得超過**全場最高**球員的起跳可及／站立可及＋0.35
  // （舉球者不固定是同一個人——S 剛接了一傳時由 OPP 代舉）
  const ps = Object.values(createGame({ seed: 1 }).players);
  const maxJump = Math.max(...ps.map((p) => spikeReach(p)));
  const maxStand = Math.max(...ps.map((p) => standingReach(p) + 0.35));
  assert.ok(Math.max(...y.jump) <= maxJump + 0.01,
    `跳舉觸球高度 ${Math.max(...y.jump)} 超過最高球員的起跳可及 ${maxJump.toFixed(2)}`);
  assert.ok(Math.max(...y.stand) <= maxStand + 0.01,
    `站舉觸球高度 ${Math.max(...y.stand)} 超過站立可及上緣 ${maxStand.toFixed(2)}`);
  assert.ok(maxJump > maxStand, '跳舉的可及高度必須高於站舉，否則此機制無效');
});

test('A3 ④ 判讀時間窗：跳舉的「二傳觸球 → 扣球」比站舉短（可量的 tick 差）', () => {
  const w = pool((r) => r.win);
  assert.ok(w.jump.length > 60 && w.stand.length > 60, '樣本不足');
  const dm = mean(w.stand) - mean(w.jump);
  assert.ok(dm >= 1,
    `攔網判讀窗沒有被壓縮：站舉 ${mean(w.stand).toFixed(2)} tick vs 跳舉 ${mean(w.jump).toFixed(2)} tick`);
  // commit 人格從一擊完成就開始讀——那一段窗也要短
  const rh = pool((r) => r.recvToHit);
  const dr = mean(rh.stand) - mean(rh.jump);
  assert.ok(dr >= 2,
    `一傳→扣球的整段窗沒有被壓縮：站舉 ${mean(rh.stand).toFixed(2)} vs 跳舉 ${mean(rh.jump).toFixed(2)} tick`);
});

// ---------------- ⑤ 決定論 ＋ VCR v2 重演相容 ----------------

test('A3 ⑤ 決定論：同 seed 兩次整局，跳舉的抽選與時序逐值相同', () => {
  const a = runSet(4);
  const b = runSet(4);
  assert.ok(a.log.length > 150, `樣本足夠（${a.log.length}）`);
  assert.deepEqual(a.log, b.log);
});

// VCR v2 只錄玩家 Intent、AI 那份重演時重算。jumpSet 是本輪新增的協調層欄位，
// 若它不是「純函式重算得出的」，重演就會跟當初不同——本測試證明它是。
function playOneRally(seed) {
  const game = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const rec = createRallyRecorder();
  const truth = [];
  let guard = 0;
  while (guard < 20000) {
    guard += 1;
    if (game.phase === 'serve') rec.begin(game, ai);
    rec.step(game, ai, null, []);
    const intents = aiCollectIntents(game, ai, []);
    truth.push(`${ai.jumpSet ? 1 : 0}${intents.some((i) => i.jump) ? 'J' : '-'}`);
    const events = stepGame(game, intents);
    if (events.some((e) => e.type === 'DEAD_BALL')) break;
  }
  return { tape: rec.end(), truth };
}

test('A3 ⑤ VCR v2 重演相容：jumpSet 純由種子重算，不必進錄影白名單', () => {
  // 掃到一顆「這一波真的跳舉了」的球，否則測不到東西
  let found = null;
  for (let seed = 1; seed <= 40 && !found; seed += 1) {
    const r = playOneRally(seed);
    if (r.truth.some((t) => t.startsWith('1'))) found = r;
  }
  assert.ok(found, '40 顆球內找不到跳舉樣本');
  assert.equal(found.tape.v, TAPE_VERSION);
  // 卷裡不得夾帶 jumpSet 的逐 tick patch（那才叫「錄下來」）
  const patched = (found.tape.steps ?? []).filter((s) => s.a && 'jumpSet' in s.a);
  assert.equal(patched.length, 0, 'jumpSet 不該進玩家欄位白名單');

  const player = createRallyPlayer(found.tape);
  const replay = [];
  while (!player.done) {
    player.step();
    replay.push(`${player.aiState?.jumpSet ? 1 : 0}${player.lastIntents.some((i) => i.jump) ? 'J' : '-'}`);
  }
  const from = found.truth.length - found.tape.steps.length;
  assert.ok(replay.length > 0 && from >= 0);
  // createRallyPlayer 沒有公開 aiState 時退回只比 Intent 流（jump 旗標在 Intent 上）
  const truthTail = found.truth.slice(from).map((t) => t.slice(-1));
  assert.deepEqual(replay.map((t) => t.slice(-1)), truthTail,
    '重演時的跳舉旗標與當初那顆球不一致＝jumpSet 沒被正確重建');
  assert.ok(truthTail.includes('J'), '這顆球的重演樣本裡沒有跳舉，測不到東西');
});
