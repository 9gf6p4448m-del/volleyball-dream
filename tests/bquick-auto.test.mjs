// B 快自動排程（2026-08-09 Sawmah 裁定：「接上 AI 排程，讓台詞成真」）
//
// 起因是一句**遊戲裡對 MB 說過、但程式從來沒兌現過**的台詞：
//   「你不是被叫的那個——你是幌子。……當然，偶爾我是真的給你，B快。」
// `bquick` 自 `83892ec`（08-02）落地起就只有玩家當 S 叫得出來（那個 commit 自己寫著
// 「AI 永遠抽不到 B 快」），於是玩家站 MB 時 B 快恆為 0：AI 不排、他也沒面板可以要。
//
// ★ 本檔守的四件事 ★
//  ① **不白跑**：只在球本來就要給他時才升級他的線。夾塞的窗只問幾何不問球權，
//     實測 73% 的波球不是按鈕的人打的——B 快不得重演，而且要由**結構**保證，
//     不是靠防禦性程式碼。
//  ② **屆數閘**：`comboScale <= 0`（第 1 屆）一律不排。
//  ③ **組合優先**：三型（cross／tandem／delay）的既有機率不得被稀釋——B 快只吃它們
//     讓出來的波。
//  ④ **決定論**：同 flightId／seed 逐值相同（純 hash，不耗 game rng）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  planSoloPlay, applySoloRoute, BQUICK_PLAY_RATE, COMBO_RATE,
} from '../src/sim/approach.js';

// 攻擊池的最小形狀（只有 kind 與 pid 被本函式讀到）
const POOL = [
  { pid: 'A2', kind: 'quick' },   // MB（玩家）
  { pid: 'A3', kind: 'left' },    // OH
  { pid: 'A4', kind: 'right' },   // OPP
];
// 骰得中的 flightId（BQUICK_PLAY_RATE=0.25 ⇒ 掃一小段必有命中；掃出來當 fixture）
const hit = (() => {
  for (let f = 0; f < 400; f += 1) {
    if (planSoloPlay(POOL, 'A2', { flightId: f, seed: 7 })) return f;
  }
  return null;
})();
const miss = (() => {
  for (let f = 0; f < 400; f += 1) {
    if (!planSoloPlay(POOL, 'A2', { flightId: f, seed: 7 })) return f;
  }
  return null;
})();

test('骰子兩態都取得到（本檔其餘斷言的前提，否則全是恆真）', () => {
  assert.ok(hit != null, '400 個 flightId 裡一次都沒骰中＝機率或 hash 壞了');
  assert.ok(miss != null, '400 個 flightId 裡沒有一次落空＝這條線恆開');
});

test('① 不白跑：攻擊手本人不是跑 A 快的那個，就一律不排（結構保證）', () => {
  // 球要給 OH，卻把 MB 的線升級成 B 快＝MB 跑了一條沒有球的線（夾塞 73% 白跑的形狀）
  for (let f = 0; f < 400; f += 1) {
    assert.equal(planSoloPlay(POOL, 'A3', { flightId: f, seed: 7 }), null,
      `flightId=${f}：球給 OH 時不得排 B 快`);
    assert.equal(planSoloPlay(POOL, 'A4', { flightId: f, seed: 7 }), null,
      `flightId=${f}：球給 OPP 時不得排 B 快`);
  }
  // 不在池子裡的人同理
  assert.equal(planSoloPlay(POOL, 'A9', { flightId: hit, seed: 7 }), null);
});

test('① 排出來時，主攻者就是被升級的那個人（不可能分岔）', () => {
  const solo = planSoloPlay(POOL, 'A2', { flightId: hit, seed: 7 });
  assert.deepEqual(solo, { mainId: 'A2', kind: 'bquick' });
  const after = applySoloRoute(POOL, solo);
  assert.equal(after.find((p) => p.pid === 'A2').kind, 'bquick', '他的線要真的被改');
  // 其他人一格未動（單人型沒有配合者——動到別人就是把它寫成組合了）
  assert.deepEqual(after.filter((p) => p.pid !== 'A2'), POOL.filter((p) => p.pid !== 'A2'));
});

test('② 屆數閘：comboScale <= 0（第 1 屆）一律不排', () => {
  for (let f = 0; f < 400; f += 1) {
    assert.equal(planSoloPlay(POOL, 'A2', { flightId: f, seed: 7, comboScale: 0 }), null,
      `flightId=${f}：這場沒有戰術時不得排 B 快`);
  }
  // 反向：同一組 flightId 在 comboScale=1 下要排得出來（否則上面那條是恆真）
  assert.ok(planSoloPlay(POOL, 'A2', { flightId: hit, seed: 7, comboScale: 1 }));
});

test('② comboScale 是倍率不是開關：0.5 時命中數要少於 1.0（同一組 flightId）', () => {
  const count = (scale) => {
    let n = 0;
    for (let f = 0; f < 400; f += 1) {
      if (planSoloPlay(POOL, 'A2', { flightId: f, seed: 7, comboScale: scale })) n += 1;
    }
    return n;
  };
  const full = count(1);
  const half = count(0.5);
  assert.ok(full > 0 && half > 0, '兩檔都要有樣本');
  assert.ok(half < full, `倍率沒作用：0.5 命中 ${half}、1.0 命中 ${full}`);
});

test('④ 決定論：同 flightId／seed 兩次逐值相同；換 seed 會變（不是寫死）', () => {
  assert.deepEqual(
    planSoloPlay(POOL, 'A2', { flightId: hit, seed: 7 }),
    planSoloPlay(POOL, 'A2', { flightId: hit, seed: 7 }),
  );
  const bySeed = [];
  for (let s = 0; s < 40; s += 1) bySeed.push(!!planSoloPlay(POOL, 'A2', { flightId: hit, seed: s }));
  assert.ok(new Set(bySeed).size === 2, 'seed 完全不影響結果＝salt 沒接上');
});

test('起始率＝既有組合型同值域（改動時要看得見，不是埋一個魔術數字）', () => {
  assert.equal(BQUICK_PLAY_RATE, COMBO_RATE.cross,
    'B 快的起始率是「比照既有組合型量級」的裁定；要調就連同這條斷言一起改，別靜默漂移');
});

test('③ 組合優先：ai.js 只在 combo 為 null 時才骰 solo（靜態接線，防日後被改成並行）', () => {
  const src = readFileSync(new URL('../src/sim/ai.js', import.meta.url), 'utf8');
  const m = src.match(/const solo = ([^;]*?)planSoloPlay\(/s);
  assert.ok(m, '找不到 planSoloPlay 的呼叫點——接線被搬走了，本條要跟著更新');
  assert.match(m[1], /combo\s*\?\s*null\s*:/,
    'solo 必須掛在「combo 為 null」的條件下，否則三型的既有機率會被稀釋');
});

// ════════════════════════════════════════════════════════════
// 「🖐 要 B 快」浮鈕（MB 專屬；2026-08-09 Sawmah 裁定）
// ════════════════════════════════════════════════════════════
// ★ 這顆鈕與另外兩顆的差別是**會要球** ★ 內切／夾塞都只改自己跑的線：
// 實測白跑率 45.1%／73.0%。要球型的鈕白跑率結構上為 0——本段守的就是那個「結構上」。
test('鈕：AI 對局零漂移——沒有 bquickCall 時 applyBquickCall 是 no-op', () => {
  const src = readFileSync(new URL('../src/sim/ai.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('function applyBquickCall'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body.split('\n').slice(1, 4).join('\n'), /if \(!call\) return;/,
    '第一行就要在沒有指令時返回——那是 AI vs AI 逐值不變的唯一保證');
});

test('鈕：指令與結算有三個清空點（漏一個＝按一次之後整個 rally 都在要球）', () => {
  // ★ 這條是實際踩過才補的 ★ 上線當天漏了「窗已結束」那個清空點，探針量到
  // 15 次按壓變成 25 次生效＋293 次「沒趕上」——內切當年一字不差的同型錯誤。
  const ai = readFileSync(new URL('../src/sim/ai.js', import.meta.url), 'utf8');
  const loop = readFileSync(new URL('../src/app/matchLoop.js', import.meta.url), 'utf8');
  const clears = (s) => (s.match(/aiState\.bquickCall = null/g) ?? []).length
    + (s.match(/s\.aiState\.bquickCall = null/g) ?? []).length;
  assert.equal(clears(ai), 2, 'sim 端要有兩個清空點（死球＋窗已結束），與 cutCall／tandemCall 同');
  assert.ok(clears(loop) >= 1, 'matchLoop 死球收尾也要清一次（浮鈕與回饋旗同一拍歸零）');
});

test('鈕：指令槽有登記進 rallyTape（否則重播會吃掉玩家按過的 B 快）', () => {
  const tape = readFileSync(new URL('../src/app/rallyTape.js', import.meta.url), 'utf8');
  assert.match(tape, /'bquickCall'/,
    '玩家寫、重演算不出來的欄位一律要進 PLAYER_AI_FIELDS——內切／夾塞都為此絆過線');
});

test('鈕：回饋文案沒有 decoy 分版（有的話代表它被改成不改球權了）', () => {
  const loop = readFileSync(new URL('../src/app/matchLoop.js', import.meta.url), 'utf8');
  const start = loop.indexOf('export const BQUICK_FEEDBACK');
  assert.ok(start > 0, '找不到 BQUICK_FEEDBACK');
  const block = loop.slice(start, loop.indexOf('};', start));
  assert.ok(!block.includes('decoy'),
    '夾塞要 decoy 版是因為它 73% 白跑；B 快按成功＝球一定給他，只有一種真相要講');
});
