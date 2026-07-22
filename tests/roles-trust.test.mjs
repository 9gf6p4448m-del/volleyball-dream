// 職責分工×信任參數化（Phase 1 回合 AI 修正）：
// 二傳歸屬（S 固定/OPP 備援）、攻擊點池站位合法性、trust 權重分配（無硬寫比例）、
// updateTrust 介面存在但遊戲內不呼叫、舉球員插上跑位
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGame, stepGame } from '../src/sim/game.js';
import {
  createAiState, aiCollectIntents, attackPointsOf, setAimFor, dutyPosition, passTierOf,
} from '../src/sim/ai.js';
import { rotateLineup } from '../src/sim/rotation.js';
import { trustToWeights, pickByWeights, updateTrust } from '../src/sim/trust.js';
import { velocityForApex } from '../src/sim/flight.js';

// 佈置：A 隊一傳已完成（touches=1），球在 A 半場飛向舉球點 → AI 規劃二傳歸屬與攻擊分配
function rigAfterFirstTouch(seed, lastToucherId) {
  const g = createGame({ seed });
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'arc';
  r.possession = 'A';
  r.touches = 1;
  r.lastTouchTeam = 'A';
  r.lastToucherId = lastToucherId;
  const b = g.ball;
  b.x = 0; b.y = 2.0; b.z = 6;
  const v = velocityForApex(b, { x: 1.2, y: 0.105, z: 1.2 }, 4.8);
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  r.flightId += 1;
  return g;
}

// 預設輪轉：A1=S(P1後) A2=OH(P2前,玩家槽) A3=MB(P3前) A4=OPP(P4前) A5=OH(P5後) A6=MB(P6後)

test('二傳歸屬：S 固定執行（一傳非 S 時，claim 必為 A1）', () => {
  for (const last of ['A2', 'A5', 'A6']) {
    const g = rigAfterFirstTouch(1, last);
    const ai = createAiState();
    aiCollectIntents(g, ai);
    assert.equal(ai.claimId, 'A1', `一傳 ${last} 時二傳應為 S(A1)，實得 ${ai.claimId}`);
  }
});

test('二傳備援：S 剛接一傳 → OPP(A4) 代舉', () => {
  const g = rigAfterFirstTouch(2, 'A1');
  const ai = createAiState();
  aiCollectIntents(g, ai);
  assert.equal(ai.claimId, 'A4');
});

test('攻擊點池站位合法性：S 與後排 MB 不進池；前排三點＋後排 pipe/dball', () => {
  const g = createGame({ seed: 3 });
  const pts = attackPointsOf(g, 'A', 'A1');
  const byId = Object.fromEntries(pts.map((p) => [p.pid, p]));
  assert.ok(!byId.A1, 'S 不得進攻擊點池');
  assert.ok(!byId.A6, '後排 MB 不得進池（無後排快攻）');
  assert.equal(byId.A2?.kind, 'left');
  assert.equal(byId.A3?.kind, 'quick');
  assert.equal(byId.A4?.kind, 'right');
  assert.equal(byId.A5?.kind, 'pipe');
  assert.equal(byId.A5?.rowFactor, 0.5, '後排點需帶 rowFactor 折減');
});

test('trust 權重映射：正規化正確、全零退化為均分', () => {
  const entries = [
    { pid: 'a', trust: 60, rowFactor: 1 },
    { pid: 'b', trust: 20, rowFactor: 1 },
    { pid: 'c', trust: 20, rowFactor: 0.5 },
  ];
  const w = trustToWeights(entries);
  assert.ok(Math.abs(w[0] - 60 / 90) < 1e-9);
  assert.ok(Math.abs(w[2] - 10 / 90) < 1e-9);
  const wz = trustToWeights(entries.map((e) => ({ ...e, trust: 0 })));
  assert.ok(wz.every((v) => Math.abs(v - 1 / 3) < 1e-9));
  assert.equal(pickByWeights(entries, w, 0.99).pid, 'c');
});

// 分配統計：權重全來自 trust 正規化（玩家 60／前排隊友 20／後排 pipe 20×0.5=10 → 60/110≈0.545）
function tallyDistribution(g, ai, n) {
  const counts = {};
  for (let i = 1; i <= n; i += 1) {
    g.rally.flightId = i;
    aiCollectIntents(g, ai);
    counts[ai.attackerId] = (counts[ai.attackerId] ?? 0) + 1;
  }
  return counts;
}

test('攻擊分配 ≈ trust 正規化權重（無任何硬寫 60/40）', () => {
  const g = rigAfterFirstTouch(4, 'A6');
  const ai = createAiState();
  const N = 2000;
  const counts = tallyDistribution(g, ai, N);
  // 合法性：不得分配給 S(A1) 或後排 MB(A6)
  assert.ok(!counts.A1 && !counts.A6, `違法分配：${JSON.stringify(counts)}`);
  const share = (id) => (counts[id] ?? 0) / N;
  assert.ok(Math.abs(share('A2') - 60 / 110) < 0.04,
    `玩家(A2)分配率 ${share('A2').toFixed(3)} 偏離 ${(60 / 110).toFixed(3)}`);
  assert.ok(Math.abs(share('A3') - 20 / 110) < 0.04);
  assert.ok(Math.abs(share('A5') - 10 / 110) < 0.04, '後排 pipe 應吃 rowFactor 折減');
});

test('手動調高隊友 trust → 分配明顯偏向該隊友（參數化生效）', () => {
  const g = rigAfterFirstTouch(5, 'A6');
  updateTrust(g.players.A3, 60); // 20 → 80（用介面調，不直接改欄位）
  const ai = createAiState();
  const counts = tallyDistribution(g, ai, 2000);
  const shareA3 = (counts.A3 ?? 0) / 2000;
  assert.ok(Math.abs(shareA3 - 80 / 170) < 0.04,
    `A3 trust=80 後分配率 ${shareA3.toFixed(3)} 應≈${(80 / 170).toFixed(3)}`);
});

test('updateTrust 介面：存在、夾限 0–100、且遊戲內（trust.js 之外）無任何呼叫', () => {
  const p = { trust: { fromSetter: 95 } };
  assert.equal(updateTrust(p, 20), 100);
  assert.equal(updateTrust(p, -300), 0);
  // 靜態掃描：src/ 全樹除 trust.js 外不得出現 updateTrust 呼叫（Phase 1 不驅動行為）
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const offenders = [];
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name.endsWith('.js') && ent.name !== 'trust.js') {
        const src = readFileSync(full, 'utf8');
        if (/\bupdateTrust\s*\(/.test(src)) offenders.push(full);
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], 'Phase 1 遊戲內不得呼叫 updateTrust');
});

test('站位交換：前排 OH左/MB中/OPP右、後排 OH後中/S右後/MB左後，不隨輪轉漂移', () => {
  const g = createGame({ seed: 7 });
  // 前排（初始輪轉 A2 在 P2 右前——職責位仍是左翼）
  assert.deepEqual(dutyPosition(g, 'A', 'A2'), { x: -3, z: 3 }, '前排 OH 職責位應在左翼');
  assert.deepEqual(dutyPosition(g, 'A', 'A3'), { x: 0, z: 3 });  // MB 中
  assert.deepEqual(dutyPosition(g, 'A', 'A4'), { x: 3, z: 3 });  // OPP 右
  // 後排：OH(A5) 後中（pipe 準備位）、S(A1) 右後（插上起點）、MB(A6) 左後（自由人預留位）
  assert.deepEqual(dutyPosition(g, 'A', 'A5'), { x: 0, z: 7 });
  assert.deepEqual(dutyPosition(g, 'A', 'A1'), { x: 3, z: 7 });
  assert.deepEqual(dutyPosition(g, 'A', 'A6'), { x: -3, z: 7 });
  // B 隊鏡像（+0/-0 用數值比較）
  assert.deepEqual(dutyPosition(g, 'B', 'B2'), { x: 3, z: -3 });
  const b5 = dutyPosition(g, 'B', 'B5');
  assert.ok(Math.abs(b5.x) < 1e-9 && b5.z === -7, `B5 應在後中，實得 ${JSON.stringify(b5)}`);
});

test('換位制攻擊點：前排高球固定翼側（OH 左、OPP 右），不隨輪轉變', () => {
  const g = createGame({ seed: 7 });
  assert.equal(setAimFor(g, 'A', 'A2', 'left').lx, -3);
  assert.equal(setAimFor(g, 'A', 'A4', 'right').lx, 3);
  g.match.rotations.A = rotateLineup(g.match.rotations.A); // 輪轉後仍固定
  assert.equal(setAimFor(g, 'A', 'A5', 'left').lx, -3);
});

test('接發不貼網：發球/高球飛向我方時，前排非接球者跑職責位而非網前', () => {
  // B 發深球到 A：A2(OH,P2 右前) 應往左翼職責位移動（x 往負向），不是貼網 z→0.6
  const g = createGame({ seed: 9 });
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'arc';
  r.possession = 'B';
  r.touches = 0;
  r.lastTouchTeam = 'B';
  r.lastToucherId = 'B1';
  const b = g.ball;
  b.x = 0; b.y = 2.5; b.z = -5;
  const v = velocityForApex(b, { x: 0, y: 0.105, z: 7.5 }, 5);
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  r.flightId += 1;
  const ai = createAiState();
  for (let i = 0; i < 55 && g.phase === 'rally'; i += 1) {
    stepGame(g, aiCollectIntents(g, ai));
  }
  const a2 = g.actors.A2;
  assert.ok(a2.x < 1.5, `A2 應向左翼換位（x 實得 ${a2.x.toFixed(2)}）`);
  assert.ok(a2.z > 2.0, `A2 接發時不該貼網（z 實得 ${a2.z.toFixed(2)}）`);
});

test('後排攻擊點固定（換位制）：pipe 中路偏左、D 球右路，皆壓攻擊線後、不隨輪轉變', () => {
  const g = createGame({ seed: 8 });
  const pipe = setAimFor(g, 'A', 'A2', 'pipe');
  assert.ok(pipe.lx < 0 && Math.abs(pipe.lx) < 2 && pipe.lz > 3.0,
    `pipe 應在中路偏左攻擊線後，實得 ${JSON.stringify(pipe)}`);
  const dball = setAimFor(g, 'A', 'A4', 'dball');
  assert.ok(dball.lx > 1.5 && dball.lz > 3.0, `D 球應在右路攻擊線後，實得 ${JSON.stringify(dball)}`);
  // 輪轉後仍固定（攻擊手已換位到職責位，落點不跟輪轉格）
  g.match.rotations.A = rotateLineup(g.match.rotations.A);
  assert.deepEqual(setAimFor(g, 'A', 'A2', 'pipe'), pipe);
});

test('一傳品質戰術分支：到位=全池、可用=無快攻、勉強=只剩兩翼高球', () => {
  const g = createGame({ seed: 21 });
  // 分檔函式本體（距舉球點 (1.2,1.2) 的距離）
  assert.equal(passTierOf('A', { x: 1.2, z: 1.2 }), 'perfect');
  assert.equal(passTierOf('A', { x: 1.2, z: 3.6 }), 'ok');     // 2.4m
  assert.equal(passTierOf('A', { x: -1.5, z: 4.5 }), 'poor');  // >3m
  // 池組成隨分檔收縮
  const kinds = (tier) => attackPointsOf(g, 'A', 'A1', tier).map((p) => p.kind).sort();
  assert.deepEqual(kinds('perfect'), ['left', 'pipe', 'quick', 'right']);
  assert.deepEqual(kinds('ok'), ['left', 'pipe', 'right'], '可用一傳：快攻出池');
  assert.deepEqual(kinds('poor'), ['left', 'right'], '勉強一傳：只剩兩翼高球');
});

test('爛一傳整案：AI 分配只出兩翼高球、S 不二次球（行為級驗證）', () => {
  // 一傳飛向遠離舉球點的落點（poor）——掃多個 flight 驗證分配收縮
  for (let f = 1; f <= 40; f += 1) {
    const g = createGame({ seed: 22 });
    g.phase = 'rally';
    const r = g.rally;
    r.profile = 'arc';
    r.possession = 'A';
    r.touches = 1;
    r.lastTouchTeam = 'A';
    r.lastToucherId = 'A6';
    const b = g.ball;
    b.x = -2; b.y = 2.0; b.z = 7;
    const v = velocityForApex(b, { x: -1.5, y: 0.105, z: 4.5 }, 4.8); // poor 落點
    b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
    b.px = b.x; b.py = b.y; b.pz = b.z;
    r.flightId = f;
    const ai = createAiState();
    aiCollectIntents(g, ai);
    assert.ok(['left', 'right'].includes(ai.attackKind),
      `爛一傳只能舉兩翼高球（flight ${f} 實得 ${ai.attackKind}）`);
    assert.equal(ai.setterDump, false, '爛一傳 S 不得二次球');
  }
});

test('舉球員插上：我方受球階段 S 從 P1 後場跑向網前舉球點', () => {
  // B 發深球到 A 半場；A1（S，P1 後排）不接一傳、直奔舉球點（2.2, 1.2）
  const g = createGame({ seed: 6 });
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'arc';
  r.possession = 'B';
  r.touches = 0;
  r.lastTouchTeam = 'B';
  r.lastToucherId = 'B1';
  const b = g.ball;
  b.x = 0; b.y = 2.5; b.z = -5;
  const v = velocityForApex(b, { x: 0, y: 0.105, z: 7.5 }, 5);
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  r.flightId += 1;

  const ai = createAiState();
  const start = { ...g.actors.A1 };
  for (let i = 0; i < 60 && g.phase === 'rally'; i += 1) {
    stepGame(g, aiCollectIntents(g, ai));
  }
  assert.notEqual(ai.claimId, 'A1', 'S 不該被派去接一傳（豁免權重）');
  const a1 = g.actors.A1;
  assert.ok(a1.z < start.z - 1.5, `S 應向網前插上（z ${start.z}→${a1.z.toFixed(2)}）`);
});
