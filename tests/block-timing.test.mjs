// CRITICAL 迴歸（冷審發現）：攔網與落地判定不得同 tick 交錯；低於網的球不可被攔
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { AIR_TICKS } from '../src/sim/approach.js';

// 佈置：A 隊已完成第三擊（扣球球路），低平球飛向 B 半場，B2 在網前持續開攔網窗
function rigLowSpike(seed, y, vy) {
  const g = createGame({ seed });
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'spike';
  r.possession = 'A';
  r.touches = 3;
  r.lastTouchTeam = 'A';
  r.lastToucherId = 'A2';
  g.actors.B2.x = 0; g.actors.B2.z = -0.6; // P2 前排攔網位
  const b = g.ball;
  b.x = 0; b.y = y; b.z = 0.6;
  b.vx = 0; b.vy = vy; b.vz = -12;
  b.px = b.x; b.py = b.y; b.pz = b.z + 0.2;
  return g;
}

function runUntilDead(g, maxTicks = 900) {
  for (let i = 0; i < maxTicks && g.phase === 'rally'; i += 1) {
    stepGame(g, [
      createIntent({ playerId: 'B2', tick: g.tick, action: 'block', aim: { x: 0, z: 0 } }),
    ]);
  }
}

test('低於網的球不可被攔：網下穿越只會落地判分，無 BLOCK_TOUCH', () => {
  const g = rigLowSpike(11, 0.8, -1.5);
  runUntilDead(g);
  assert.ok(!g.events.some((e) => e.type === 'BLOCK_TOUCH'), '網下球被攔到了');
  assert.ok(g.events.some((e) => e.type === 'DEAD_BALL'));
  assert.equal(g.match.score.A, 1); // 球落 B 半場界內 → A 得分
});

test('掃描各高度/速度組合：BLOCK_TOUCH 不得與 DEAD_BALL/SCORE 同 tick', () => {
  let blockedCases = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    for (const y of [0.5, 0.9, 1.4, 2.0, 2.35, 2.5, 2.7, 2.9]) {
      const g = rigLowSpike(seed * 7, y, -0.8 - (seed % 5) * 0.7);
      runUntilDead(g);
      if (g.events.some((e) => e.type === 'BLOCK_TOUCH')) blockedCases += 1;
      const byTick = new Map();
      for (const e of g.events) {
        if (!byTick.has(e.tick)) byTick.set(e.tick, new Set());
        byTick.get(e.tick).add(e.type);
      }
      for (const [tick, types] of byTick) {
        if (types.has('BLOCK_TOUCH')) {
          assert.ok(
            !types.has('DEAD_BALL') && !types.has('SCORE'),
            `y=${y} seed=${seed} tick=${tick} 攔網與判分同 tick 交錯`,
          );
        }
      }
    }
  }
  assert.ok(blockedCases > 0, '掃描組合中應存在真的攔到球的案例（測試才有覆蓋力）');
});

// ==== 攔網時序卷 段 1（Sawmah 2026-08-01 裁定 1）：攔網接觸資格＝物理滯空 ====

// 真載體：整場實跑、真實 AI、commit 人格（落地攔網 76.9% 的那個載體）。
// 修復前這條會紅在行為斷言「有 N 次攔網接觸發生在攔網手落地之後」。
test('段1 真載體：AI 的攔網接觸一律發生在滯空窗內（落地＝資格結束）', () => {
  const landedTicks = [];
  let total = 0;
  for (let s = 1; s <= 10; s += 1) {
    const g = createGame({ seed: s * 101, setTarget: 25, aiProfiles: { B: { blockPersona: 'commit' } } });
    const ai = createAiState();
    let guard = 0;
    while (g.phase !== 'setover' && g.phase !== 'matchover' && guard < 400000) {
      guard += 1;
      for (const e of stepGame(g, aiCollectIntents(g, ai, []))) {
        if (e.type !== 'BLOCK_TOUCH') continue;
        total += 1;
        const airT = e.tick - g.actors[e.playerId].blockStartTick;
        if (airT > AIR_TICKS) landedTicks.push(airT);
      }
    }
  }
  // 分母閘：樣本不足時「零落地」沒有鑑別力（修復前同樣的 10 局有 ~40 次 commit 接觸，
  // 其中約四分之三是落地後擦到的）
  assert.ok(total >= 40, `攔網接觸樣本 ${total} < 40：這組樣本分不出有沒有落地攔網`);
  assert.equal(
    landedTicks.length, 0,
    `${landedTicks.length}/${total} 次攔網接觸發生在落地之後`
    + `（airT=${landedTicks.slice(0, 5).join(',')}…）——攔網退回成站著擦球`,
  );
});

// 記債釘子：玩家手動窗（48-tick 計時器）的落地段 tick 25–48 **刻意保留**
//（裁定書「記債不處理」）。這條同時是段 1 那道閘的鑑別力對照——同一組幾何，
// 只差 intent 帶不帶 `manual`：帶的攔得到、不帶的攔不到。
test('段1 記債：玩家手動攔網窗的落地段保留；同幾何的自動起跳則已失效', () => {
  const rigManualOrAuto = (seed, y0, vy, manual) => {
    const g = createGame({ seed });
    g.phase = 'rally';
    const r = g.rally;
    r.profile = 'spike'; r.possession = 'A'; r.touches = 3;
    r.lastTouchTeam = 'A'; r.lastToucherId = 'A2';
    g.actors.B2.x = 0; g.actors.B2.z = -0.6;
    const b = g.ball;
    // 慢球從 A 深區飛來：過網時球已在攔網手起跳後約 30 tick（> AIR_TICKS 24），
    // 高度落在「站立摸高搆得到、跳躍頂點以下」的那條帶——正是落地擦球的原始情境
    b.x = 0; b.y = y0; b.z = 6.0; b.vx = 0; b.vy = vy; b.vz = -12;
    b.px = b.x; b.py = b.y; b.pz = b.z + 12 / 60;
    const airTs = [];
    for (let i = 0; i < 900 && g.phase === 'rally'; i += 1) {
      const it = createIntent({ playerId: 'B2', tick: g.tick, action: 'block', aim: { x: 0, z: 0 } });
      if (manual) it.manual = true;
      for (const e of stepGame(g, [it])) {
        if (e.type === 'BLOCK_TOUCH') airTs.push(e.tick - g.actors[e.playerId].blockStartTick);
      }
    }
    return airTs;
  };
  let manualLanded = 0;
  let autoLanded = 0;
  for (const y0 of [2.40, 2.45, 2.50, 2.55, 2.60]) {
    for (const vy of [2.40, 2.45, 2.50, 2.55]) {
      for (let s = 1; s <= 6; s += 1) {
        manualLanded += rigManualOrAuto(s * 13, y0, vy, true).filter((t) => t > AIR_TICKS).length;
        autoLanded += rigManualOrAuto(s * 13, y0, vy, false).filter((t) => t > AIR_TICKS).length;
      }
    }
  }
  assert.ok(manualLanded > 0, '玩家手動窗的落地段被砍掉了——那是記債項目，本卷不動它');
  assert.equal(autoLanded, 0, `自動起跳仍有 ${autoLanded} 次落地攔網＝段 1 那道閘沒生效`);
});
