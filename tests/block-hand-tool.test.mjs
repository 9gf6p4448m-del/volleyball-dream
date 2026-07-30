// §十-4b 意圖層三機制（retract 縮手／press 壓網手／tool 打手出界）＋ toolBlockerFor 牆手辨識
// 的行為鎖定測試（2026-07-31 新增，這三個機制落地時零專屬測試）。
// 手態來源：game.js 的 block intent 處理（`actor.blockHand = intent.hand ?? 'vertical'`，
// 見 src/sim/game.js:461）——sim 消費端只讀 actor.blockHand，本檔一律用「在 intent 上帶
// hand 欄位」這條真實路徑（createIntent 本身不收 hand 參數，比照 ai.js:1052/1254 的做法，
// 建好 intent 物件後再手動補一個 `.hand` 屬性）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

function blockIntent(playerId, tick, hand) {
  const it = createIntent({ playerId, tick, action: 'block' });
  it.hand = hand;
  return it;
}

// ---- 治具一：side 區（dx=0.45，抄 block-graze.test.mjs 的 blockRig）----
// 幾何上 vertical 必為擦側（見 block-graze.test.mjs 註解），拿來當 retract 的對照組：
// 同一顆球、同一站位，唯一變因是 blockHand。
function sideBlockRig(seed, hand, bx = 0.45) {
  const g = createGame({ seed });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'spike', possession: 'B', touches: 3, lastTouchTeam: 'B', lastToucherId: 'B2',
  });
  const b = g.ball;
  b.x = bx; b.y = 2.75; b.z = -0.35; b.vx = 0; b.vy = -1.5; b.vz = 9;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.actors.A3.x = 0; g.actors.A3.z = 0.5;
  stepGame(g, [blockIntent('A3', g.tick, hand)]);
  for (let i = 0; i < 20 && !g.events.some((e) => e.type === 'BLOCK_TOUCH') && g.phase === 'rally'; i += 1) {
    stepGame(g, [blockIntent('A3', g.tick, hand)]);
    if (g.ball.z > 1.5 || g.ball.vz < 0) break;
  }
  return g;
}

// ---- 治具二：top 區（擦頂帶，press 只在 zone==='top' 才會壓球）----
// classifyBlockContact 的 top 判準吃「球過網瞬間高度 vs 接觸者當下手頂邊」，兩者都隨
// tick 動態變化，非幾何常數，抓不到像 dx 那樣的固定值可以直接代。改用真跑 sim 實測
// （見任務對話紀錄）：dx=0（帶正中心）、開窗後第 2 個 tick 把球逼近網（z→-0.01）並把
// 球高釘在 2.75，之後正常步進——handTop 此時落在 [2.757, 2.897] 的擦頂窄條內，
// 5 個離散種子（1/2/42/100/999）全部命中 zone:'top'，故視為穩定值而非碰運氣。
function topBlockRig(seed, hand) {
  const g = createGame({ seed });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'spike', possession: 'B', touches: 3, lastTouchTeam: 'B', lastToucherId: 'B2',
  });
  const b = g.ball;
  b.x = 0; b.y = 2.75; b.z = -0.35; b.vx = 0; b.vy = -1.5; b.vz = 9;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.actors.A3.x = 0; g.actors.A3.z = 0.5;
  stepGame(g, [blockIntent('A3', g.tick, hand)]);
  for (let i = 0; i < 40 && g.phase === 'rally'; i += 1) {
    if (g.tick === 2) {
      g.ball.z = -0.01;
      g.ball.px = g.ball.x; g.ball.py = g.ball.y; g.ball.pz = g.ball.z;
      g.ball.y = 2.75;
    }
    const evs = stepGame(g, [blockIntent('A3', g.tick, hand)]);
    if (evs.some((e) => e.type === 'BLOCK_TOUCH')) return g;
    if (g.ball.z > 1.5 || g.ball.vz < 0) return g;
  }
  return g;
}

// ==================== 1. retract（縮手）====================
test('retract：同一顆會被 vertical 擦到的帶內球，retract 手態零 BLOCK_TOUCH、球直接過網', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const gv = sideBlockRig(seed, 'vertical');
    const btV = gv.events.find((e) => e.type === 'BLOCK_TOUCH');
    assert.ok(btV && btV.graze && btV.zone === 'side', `對照組 vertical 種子 ${seed} 應擦側`);

    const gr = sideBlockRig(seed, 'retract');
    assert.ok(!gr.events.some((e) => e.type === 'BLOCK_TOUCH'),
      `retract 種子 ${seed} 不應出現任何 BLOCK_TOUCH`);
    assert.ok(gr.ball.z > 1.5, `retract 種子 ${seed} 球應直接過網（z=${gr.ball.z}）`);
    assert.ok(gr.ball.vz > 8.9, `retract 種子 ${seed} 球速不應被攔網手改變（vz=${gr.ball.vz}）`);
  }
});

// ==================== 2. press（壓網手）====================
test('press：top 區接觸＋press 手態＝壓球（pressed:true、vz 反向、vy 向下、記攔網方觸球）', () => {
  for (const seed of [1, 2, 42, 100, 999]) {
    // 對照組：同一 rig 換成 vertical＝一般擦頂（續入攔網方半場，非壓球）
    const gv = topBlockRig(seed, 'vertical');
    const btV = gv.events.find((e) => e.type === 'BLOCK_TOUCH');
    assert.ok(btV, `種子 ${seed} vertical 對照組應有 BLOCK_TOUCH`);
    assert.equal(btV.zone, 'top', `種子 ${seed} 對照組應落在 top 區`);
    assert.ok(btV.graze, '對照組 vertical 屬於擦手（graze）');
    assert.ok(!btV.pressed, '對照組 vertical 不應帶 pressed');
    assert.ok(gv.ball.vz > 0, `對照組 vertical 球應續入攔網方半場（vz=${gv.ball.vz}）`);

    // 實驗組：press
    const gp = topBlockRig(seed, 'press');
    const btP = gp.events.find((e) => e.type === 'BLOCK_TOUCH');
    assert.ok(btP, `種子 ${seed} press 應有 BLOCK_TOUCH`);
    assert.equal(btP.zone, 'top', `種子 ${seed} press 應落在 top 區`);
    assert.equal(btP.pressed, true, 'press 事件應帶 pressed:true');
    assert.equal(btP.team, 'A', 'BLOCK_TOUCH 記在攔網方（toTeam）');
    assert.ok(gp.ball.vz < 0, `press 球應反向彈回攻方半場（vz=${gp.ball.vz}）`);
    assert.ok(gp.ball.vy < 0, `press 球應向下壓（vy=${gp.ball.vy}）`);
    assert.equal(gp.rally.lastTouchTeam, 'A', '壓球歸因 lastTouchTeam=攔網方');
    assert.equal(gp.rally.touches, 0, '壓球與擦手一樣不計 3 次觸球');
  }
});

// ==================== 3. tool 路線（真 sim 掃描）====================
// 真跑 AI 對打（比照 tests/block-persona.test.mjs 的 runSet 手法），逐 tick 追蹤
// TOUCH tool:true 事件，往後看這一球的結局：
//   - 沒被 BLOCK_TOUCH 就死球（reason===OUT）＝自打出界，失分方必為攻方（otherTeam(spikerTeam) 得分）
//   - 被 BLOCK_TOUCH（graze）之後死球、贏家＝原扣球隊＝失分方是攔網方
// 期間若又出現一次普通 TOUCH（球被正常接起），代表這球的直接後果已不可歸因給這次 tool
// 扣球，歸因鏈斷開，不計入任何一類（寧可漏記也不誤記）。
function scanToolOutcomes(sets, aiProfiles = undefined) {
  let toolTouches = 0;
  let caseAttackerOut = 0; // 未被攔到、打出界＝攻方失分
  let caseBlockerLost = 0; // 被擦到（graze）後，原扣球隊反而得分＝攔網方失分
  for (let s = 1; s <= sets; s += 1) {
    const seed = s * 37;
    const g = createGame({ seed, setTarget: 25, aiProfiles });
    const ai = createAiState();
    let pending = null;
    let guard = 0;
    while (g.phase !== 'set_over' && g.phase !== 'matchover' && guard < 200000) {
      guard += 1;
      const evs = stepGame(g, aiCollectIntents(g, ai, []));
      for (const e of evs) {
        if (e.type === 'TOUCH' && e.tool) {
          pending = { team: e.team };
          toolTouches += 1;
          continue;
        }
        if (!pending) continue;
        if (e.type === 'BLOCK_TOUCH') {
          pending.blocked = true;
          pending.graze = !!e.graze;
        } else if (e.type === 'DEAD_BALL') {
          const scoreEv = evs.find((ev2) => ev2.type === 'SCORE');
          const winner = scoreEv ? scoreEv.team : null;
          if (!pending.blocked && e.reason === 'OUT' && winner && winner !== pending.team) {
            caseAttackerOut += 1;
          }
          if (pending.blocked && pending.graze && winner === pending.team) {
            caseBlockerLost += 1;
          }
          pending = null;
        } else if (e.type === 'TOUCH') {
          pending = null; // 歸因鏈斷開，不計
        }
      }
    }
  }
  return { toolTouches, caseAttackerOut, caseBlockerLost, setsScanned: sets };
}

// 2026-07-31 Sawmah 裁定乙：tool 意圖**出廠關閉**（TOOL_CHANCE=0）——三種瞄法×兩種
// 牆判實測連結率 <10%（攔網起跳時序為正常球路而生，tool 弧線與手的相位結構性對不上，
// 紀錄見 kickoff 十-4b §七.5）。機制與測試保留，重開條件＝未來攔網時序卷。
// 本測試改守兩件事：①出廠確實關閉（預設掃描零 tool）②機制仍在（patch 開啟會發射、
// 自打出界歸因正確）。「被擦手後攔網方失分」不再是閘（連結率低是已裁定的已知）。
test('tool 路線：出廠關閉零觸發；patch 開啟後會發射且自打出界歸因攻方', () => {
  assert.equal(TUNING.TOOL_CHANCE, 0, '出廠值應為 0（裁定乙）——若已重開，本測試該改回結局雙閘版');
  const off = scanToolOutcomes(10);
  assert.equal(off.toolTouches, 0,
    `TOOL_CHANCE=0 掃 ${off.setsScanned} 局仍有 ${off.toolTouches} 次 tool＝關閉失效`);
  TUNING.TOOL_CHANCE = 1;
  try {
    // tool 只對「出手瞬間已在窗內」的牆發射（窗 gate）＝commit 早跳牆才看得見；
    // 雙 read 對打天然零觸發，機制臂要掃 commit 對手
    const on = scanToolOutcomes(40, { B: { blockPersona: 'commit' } });
    assert.ok(on.toolTouches > 0,
      `patch TOOL_CHANCE=1 掃 ${on.setsScanned} 局（B=commit）tool 觸發為零＝機制死亡（非僅關閉）`);
    assert.ok(on.caseAttackerOut >= 1,
      `tool 觸發 ${on.toolTouches} 次，找不到「未被攔到、打出界、攻方失分」案例＝出界保證量閘或歸因壞掉`);
  } finally {
    TUNING.TOOL_CHANCE = 0;
  }
});

// ==================== 4. 決定論 ====================
test('意圖層決定論：retract／press 同種子重跑逐值一致', () => {
  for (let seed = 1; seed <= 5; seed += 1) {
    const a1 = sideBlockRig(seed, 'retract');
    const a2 = sideBlockRig(seed, 'retract');
    assert.equal(a1.ball.vx, a2.ball.vx, `retract 種子 ${seed} vx 不一致`);
    assert.equal(a1.ball.vy, a2.ball.vy, `retract 種子 ${seed} vy 不一致`);
    assert.equal(a1.ball.vz, a2.ball.vz, `retract 種子 ${seed} vz 不一致`);
    assert.deepEqual(
      a1.events.filter((e) => e.type === 'BLOCK_TOUCH'),
      a2.events.filter((e) => e.type === 'BLOCK_TOUCH'),
      `retract 種子 ${seed} 事件不一致`,
    );
  }
  for (const seed of [1, 2, 42, 100, 999]) {
    const b1 = topBlockRig(seed, 'press');
    const b2 = topBlockRig(seed, 'press');
    assert.equal(b1.ball.vx, b2.ball.vx, `press 種子 ${seed} vx 不一致`);
    assert.equal(b1.ball.vy, b2.ball.vy, `press 種子 ${seed} vy 不一致`);
    assert.equal(b1.ball.vz, b2.ball.vz, `press 種子 ${seed} vz 不一致`);
    const bt1 = b1.events.find((e) => e.type === 'BLOCK_TOUCH');
    const bt2 = b2.events.find((e) => e.type === 'BLOCK_TOUCH');
    assert.deepEqual(bt1, bt2, `press 種子 ${seed} BLOCK_TOUCH 事件不一致`);
  }
});
