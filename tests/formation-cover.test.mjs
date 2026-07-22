// 稽核修復三件套：①接發陣型 v0（S/前排 MB 排除）②Cover 系統（貼網/周邊/深位）
// ③同隊避讓（不穿模）——皆為決定論 sim 層行為
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, coverPosition } from '../src/sim/ai.js';
import { rotateLineup } from '../src/sim/rotation.js';
import { velocityForApex } from '../src/sim/flight.js';

// 佈置：B 隊來球（profile 可指定）飛向 A 半場指定落點
function rigIncoming(seed, profile, tx, tz) {
  const g = createGame({ seed });
  g.phase = 'rally';
  const r = g.rally;
  r.profile = profile;
  r.possession = 'B';
  r.touches = 0;
  r.lastTouchTeam = 'B';
  r.lastToucherId = 'B1';
  const b = g.ball;
  b.x = tx * 0.3; b.y = 3.0; b.z = -4;
  const v = velocityForApex(b, { x: tx, y: 0.105, z: tz }, 5);
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  r.flightId += 1;
  return g;
}

test('接發陣型 v0：發球落 S 基準位附近，S 仍不得接（稽核 §0 情境）', () => {
  // 輪 1 格：A1(S) 到 6 號位（後中，基準 (0,7)）；發球落 (0, 7.5)
  const g = rigIncoming(3, 'serve', 0, 7.5);
  g.match.rotations.A = rotateLineup(g.match.rotations.A);
  const ai = createAiState();
  aiCollectIntents(g, ai);
  assert.notEqual(ai.claimId, 'A1', 'S 不得接發（陣型排除）');
  assert.ok(ai.claimId, '必須有人接（寧搶錯）');
  assert.equal(ai.letDrop, false);
});

test('接發陣型 v0：短球落前排 MB 面前，前排 MB 不得接發', () => {
  // 初始輪轉：A3(MB) 前排 3 號位基準 (0,3)；發短球落 (0.3, 3.2)
  const g = rigIncoming(4, 'serve', 0.3, 3.2);
  const ai = createAiState();
  aiCollectIntents(g, ai);
  assert.notEqual(ai.claimId, 'A3', '前排 MB 不得接發');
  assert.ok(ai.claimId);
});

test('free ball 也排除 S：對方回長球（arc）落 S 區附近，S 不接（他要舉球）', () => {
  const g = rigIncoming(5, 'arc', 0, 7.5);
  g.match.rotations.A = rotateLineup(g.match.rotations.A); // S 到 6 號位
  const ai = createAiState();
  aiCollectIntents(g, ai);
  assert.notEqual(ai.claimId, 'A1', 'free ball 的第一球不得由 S 接');
  assert.ok(ai.claimId);
});

test('殺球 dig 不受排除影響：對方殺球落 S 腳邊，S 仍可救球（權重制）', () => {
  const g = rigIncoming(5, 'spike', 0, 7.5);
  g.match.rotations.A = rotateLineup(g.match.rotations.A); // S 到 6 號位
  const ai = createAiState();
  aiCollectIntents(g, ai);
  assert.equal(ai.claimId, 'A1', '殺球 dig：S 責任區內仍該他救（×3 權重下最近）');
});

test('cover 站位原則：後排攻擊時前排貼網、不被拉到攻擊者身後（試玩實證修復）', () => {
  const g = createGame({ seed: 6 });
  // 後排攻擊者：A5 打 pipe，站攻擊線後 (world −1, 3.9)
  g.actors.A5.x = -1; g.actors.A5.z = 3.9;
  for (const pid of ['A2', 'A3', 'A4']) { // 前排三人（OH/MB/OPP）
    const c = coverPosition(g, 'A', pid, 'A5');
    assert.ok(c.z <= 1.5, `前排 ${pid} 應貼網 cover（z 實得 ${c.z.toFixed(2)}）`);
    assert.ok(c.z < g.actors.A5.z, `前排 ${pid} 不得在攻擊者身後`);
  }
  // 後排非攻擊手：MB 深位保險、S 在攻擊者周邊（非正後方遠處）
  const cMb = coverPosition(g, 'A', 'A6', 'A5');
  assert.ok(cMb.z > 6, `後排 MB 應留深位（z 實得 ${cMb.z.toFixed(2)}）`);
  const cS = coverPosition(g, 'A', 'A1', 'A5');
  assert.ok(Math.hypot(cS.x - -1, cS.z - 3.9) < 2.5, 'S 應在攻擊者周邊補位');
});

test('AI 全隊 cover：二傳下墜時非攻擊手就掩護位（前排收網前）', () => {
  // 一傳完成 → 讓 AI 規劃攻擊手
  const g = createGame({ seed: 7 });
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'arc';
  r.possession = 'A';
  r.touches = 1;
  r.lastTouchTeam = 'A';
  r.lastToucherId = 'A6';
  const b = g.ball;
  b.x = 0; b.y = 2.0; b.z = 6;
  let v = velocityForApex(b, { x: 1.2, y: 0.105, z: 1.2 }, 4.8);
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  r.flightId += 1;
  const ai = createAiState();
  aiCollectIntents(g, ai);
  const atk = ai.attackerId;
  assert.ok(atk, '前置條件：已選定攻擊手');
  // 模擬二傳出手後的下墜球（touches=2、vy<0）
  r.touches = 2;
  r.lastToucherId = 'A1';
  b.x = -2; b.y = 4.5; b.z = 2; b.vx = 0; b.vy = -2; b.vz = 0;
  r.flightId += 1;
  const intents = aiCollectIntents(g, ai);
  const frontA = g.match.rotations.A.slice(1, 4).filter((id) => id !== atk);
  for (const pid of frontA) {
    const it = intents.find((i) => i.playerId === pid);
    assert.ok(it?.aim, `${pid} 應有走位目標`);
    assert.ok(Math.abs(it.aim.z) <= 1.5,
      `前排非攻擊手 ${pid} 應貼網 cover（aim.z 實得 ${it.aim.z?.toFixed(2)}）`);
  }
});

test('Dig 收縮：對方組織進攻時後排向球側收縮（左右對稱）', () => {
  // B 隊持球在其半場組織（球偏 world x=+3）→ A 後排防守位應向 +x 收縮、收前 0.8m
  const rigOrganize = (ballX) => {
    const g = createGame({ seed: 12 });
    g.phase = 'rally';
    const r = g.rally;
    r.profile = 'arc';
    r.possession = 'B';
    r.touches = 1;
    r.lastTouchTeam = 'B';
    r.lastToucherId = 'B5';
    const b = g.ball;
    b.x = ballX; b.y = 2.5; b.z = -5;
    const v = velocityForApex(b, { x: ballX * 0.4, y: 0.105, z: -1.5 }, 4.8);
    b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
    b.px = b.x; b.py = b.y; b.pz = b.z;
    r.flightId += 1;
    return g;
  };
  for (const ballX of [3, -3]) {
    const g = rigOrganize(ballX);
    const ai = createAiState();
    const intents = aiCollectIntents(g, ai);
    const backA = [g.match.rotations.A[0], g.match.rotations.A[4], g.match.rotations.A[5]];
    for (const pid of backA) {
      const it = intents.find((i) => i.playerId === pid);
      assert.ok(it?.aim, `${pid} 應有防守走位`);
      assert.ok(it.aim.z < 6.9, `後排 ${pid} 應收前（z 實得 ${it.aim.z.toFixed(2)}）`);
    }
    // 後中（OH，職責位 x=0）的側移方向必須跟球側
    const midBack = backA.find((pid) => g.players[pid].currentRole === 'outside');
    const it = intents.find((i) => i.playerId === midBack);
    if (ballX > 0) assert.ok(it.aim.x > 0.4, `球在 +x 時後中應右移（實得 ${it.aim.x.toFixed(2)}）`);
    else assert.ok(it.aim.x < -0.4, `球在 -x 時後中應左移（實得 ${it.aim.x.toFixed(2)}）`);
  }
});

test('AI 攻擊分支：整局中出現輕吊（power<0.6 的扣球）——不被讀死', () => {
  const g = createGame({ seed: 15, setTarget: 15 });
  const ai = createAiState();
  let tips = 0;
  let spikes = 0;
  while (g.phase !== 'set_over' && g.tick < 400000) {
    for (const e of stepGame(g, aiCollectIntents(g, ai))) {
      if (e.type === 'TOUCH' && e.kind === 'spike') {
        spikes += 1;
        if ((e.power ?? 1) < 0.6) tips += 1;
      }
    }
  }
  assert.equal(g.phase, 'set_over');
  assert.ok(tips >= 1, `整局 ${spikes} 次扣球中應至少一次輕吊（實得 ${tips}）`);
  assert.ok(tips / Math.max(spikes, 1) < 0.5, '輕吊不得成為主體（重扣為主）');
});

test('S 二次球：S 前排且一傳到位時，決定論小機率直接處理第二球', () => {
  // 輪 3 格：A1(S) 到 4 號位（前排）；一傳飛向網前舉球點
  const mk = (flightId) => {
    const g = createGame({ seed: 16 });
    for (let i = 0; i < 3; i += 1) g.match.rotations.A = rotateLineup(g.match.rotations.A);
    g.phase = 'rally';
    const r = g.rally;
    r.profile = 'arc';
    r.possession = 'A';
    r.touches = 1;
    r.lastTouchTeam = 'A';
    r.lastToucherId = 'A6';
    const b = g.ball;
    b.x = 0; b.y = 2.0; b.z = 6;
    const v = velocityForApex(b, { x: 1.2, y: 0.105, z: 1.2 }, 4.8);
    b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
    b.px = b.x; b.py = b.y; b.pz = b.z;
    r.flightId = flightId;
    return g;
  };
  let dumps = 0;
  for (let f = 1; f <= 300; f += 1) {
    const g = mk(f);
    const ai = createAiState();
    aiCollectIntents(g, ai);
    assert.equal(ai.claimId, 'A1', '前置條件：S 是二傳者');
    if (ai.setterDump) dumps += 1;
  }
  assert.ok(dumps >= 5 && dumps <= 50,
    `300 個 flight 中二次球旗標應約 7%（實得 ${dumps}）`);
  // 後排 S 不得二次球（旗標必為 false）
  const g2 = mk(1);
  g2.match.rotations.A = [...g2.match.rotations.A.slice(3), ...g2.match.rotations.A.slice(0, 3)];
  const ai2 = createAiState();
  aiCollectIntents(g2, ai2);
  assert.equal(ai2.setterDump, false, '後排 S 不得二次球');
});

test('同隊避讓：兩人重疊後自動分開（≥0.5m）、決定論', () => {
  const g = createGame({ seed: 8 });
  g.phase = 'rally';
  g.ball.y = 6; g.ball.vy = 1; // 球在高空，無人觸球
  g.actors.A5.x = 1.0; g.actors.A5.z = 5.0;
  g.actors.A6.x = 1.0; g.actors.A6.z = 5.0; // 完全重合
  for (let i = 0; i < 30; i += 1) stepGame(g, []); // 無 intent：純避讓作用
  const d = Math.hypot(g.actors.A5.x - g.actors.A6.x, g.actors.A5.z - g.actors.A6.z);
  assert.ok(d >= 0.5, `重疊隊友應被分開（實得 ${d.toFixed(2)}m）`);
  // 決定論：同 seed 重跑逐值一致
  const g2 = createGame({ seed: 8 });
  g2.phase = 'rally';
  g2.ball.y = 6; g2.ball.vy = 1;
  g2.actors.A5.x = 1.0; g2.actors.A5.z = 5.0;
  g2.actors.A6.x = 1.0; g2.actors.A6.z = 5.0;
  for (let i = 0; i < 30; i += 1) stepGame(g2, []);
  assert.deepEqual(
    [g.actors.A5.x, g.actors.A5.z, g.actors.A6.x, g.actors.A6.z],
    [g2.actors.A5.x, g2.actors.A5.z, g2.actors.A6.x, g2.actors.A6.z],
  );
});
