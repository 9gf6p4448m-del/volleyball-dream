// 攔網時序卷 段 3 掃描harness —— 「外圍候選賭注品質降級」的幅度曲線
//
// 裁定 4 的成敗判準是**兩者兼得**，兩邊互相拉扯：
//   得：牆首手 x 的 p50 不再恆為 0.000、右翼被攔死率脫離 0.00%
//   不得失：交叉的分歧（兩名上牆者 jumpTick 相異率）不歸零、攻方得分率不出現 +15pp 崩壞
//   另加既有護欄：款 3 離地率 gap（commit − read 快攻離地率）≥ 5pp
// 幅度＝策略數值（硬規則 3）⇒ 本檔只**量曲線**，不挑數字。
//
// 掃描軸（直接改寫 BLOCK_COMMIT 的匯出物件，src 磁碟零改動）：
//   OUTER_LZ／OUTER_LX ＝外圍的兩條判準（Infinity ＝關掉該條）
//   OUTER_LAG_MUL      ＝延遲幅度倍率（× 該員 reactionTicks 6–21 tick）
//
// 款 3 離地率的口徑逐項沿用 tests/block-persona.test.mjs（同一把尺，不另編指標）。
// 跑法：node tools/block-outer-sweep.mjs [局數=20]
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { BLOCK_COMMIT } from '../src/sim/blockRead.js';
import { isFrontRow, TEAM_SIDE } from '../src/sim/rotation.js';
import { blockReach, blockTopEdge, standingReach } from '../src/sim/player.js';
import { staminaPerfMul } from '../src/sim/stamina.js';

const SETS = Number(process.argv[2] ?? 20);
const INF = Number.POSITIVE_INFINITY;

// 一臂＝一組常數。跑一整場，一次收齊全部指標（同一批 rally，指標之間可互相對照）
function runArm(persona, sets) {
  const quick = { above: 0, total: 0 };          // 款 3：快攻時 MB 的離地率
  const wallFirstX = { right: [], cross: [], quick: [], left: [] };
  const killed = { right: 0, rightN: 0 };        // 右翼被攔死（手身攔回）
  const jt = { pairs: 0, diff: 0, crossPairs: 0, crossDiff: 0 };
  let atkPts = 0;
  let rallies = 0;

  for (let s = 1; s <= sets; s += 1) {
    const game = createGame({ seed: s * 101, setTarget: 25, aiProfiles: { B: { blockPersona: persona } } });
    const ai = createAiState();
    let cur = null;
    let guard = 0;
    const settle = () => {
      if (!cur) return;
      // 口徑逐項抄 tests/block-persona.test.mjs：分母＝球有過網的快攻波，
      // 分子＝過網那一刻頂邊高於自身站立地板。**沒在窗內（topPct=null）計入分母不計分子**
      // ——那正是「來不及／已落地」，把它排除掉會讓 read 的離地率假性衝到 100%
      if (cur.kind === 'quick' && cur.crossed) {
        quick.total += 1;
        if (cur.topPct != null && cur.floorPct != null && cur.topPct > cur.floorPct) quick.above += 1;
      }
      if (cur.kind && cur.firstX != null && wallFirstX[cur.kind]) wallFirstX[cur.kind].push(cur.firstX);
      if (cur.kind === 'right') {
        killed.rightN += 1;
        if (cur.killed) killed.right += 1;
      }
      if (cur.jumps && cur.jumps.length === 2) {
        jt.pairs += 1;
        const d = cur.jumps[0] !== cur.jumps[1];
        if (d) jt.diff += 1;
        if (cur.kind === 'cross' || cur.kind === 'left_inside') {
          jt.crossPairs += 1;
          if (d) jt.crossDiff += 1;
        }
      }
      cur = null;
    };
    while (game.phase !== 'setover' && game.phase !== 'matchover' && guard < 400000) {
      guard += 1;
      const zBefore = game.ball.z;
      const events = stepGame(game, aiCollectIntents(game, ai, []));
      for (const e of events) {
        if (e.type === 'TOUCH' && e.kind === 'set' && e.team === 'A' && e.touches === 2) {
          const rot = game.match.rotations.B;
          const mb = rot.find((id) => isFrontRow(rot, id)
            && game.players[id].currentRole === 'middle') ?? null;
          cur = mb ? { mb, kind: null, crossed: false, topPct: null, floorPct: null, firstX: null, killed: false, jumps: null } : null;
          rallies += 1;
        }
        if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A' && cur && cur.kind == null) {
          cur.kind = ai.attackKind;
        }
        if (e.type === 'BLOCK_TOUCH' && e.team === 'B' && cur && !e.zone) cur.killed = true;
        if (e.type === 'SCORE' && e.team === 'A') atkPts += 1;
        if (e.type === 'DEAD_BALL') settle();
      }
      if (!cur) continue;
      // 球過網那一刻：款 3 的離地率、牆首手 x、兩名上牆者的 jumpTick
      if (!cur.crossed && zBefore > 0 && game.ball.z <= 0) {
        cur.crossed = true;
        const a = game.actors[cur.mb];
        const p = game.players[cur.mb];
        const jumpMul = staminaPerfMul(game, p);
        const inWin = a.blockUntil >= game.tick;
        const t = inWin ? game.tick - a.blockStartTick : null;
        const apex = blockReach(p, jumpMul);
        cur.topPct = apex > 0 && t != null ? blockTopEdge(p, t, jumpMul) / apex : null;
        cur.floorPct = apex > 0 ? standingReach(p) / apex : null;
        // 牆首手＝離球過網 x 最近的那名在窗內的 B 前排（sim tryBlock 用的同一批人）
        const rot = game.match.rotations.B;
        let best = null;
        for (const id of rot) {
          if (!isFrontRow(rot, id)) continue;
          const ac = game.actors[id];
          if (ac.blockUntil < game.tick) continue;
          const d = Math.abs(ac.x - game.ball.x);
          if (best === null || d < best.d) best = { d, x: ac.x };
        }
        // 牆首手的 x 取**攻方（A）視角的帶號 lx**：簡報記的是帶號 p50 恆為 0.000
        // ——取絕對值會把「牆坐在中間」與「牆左右各半」混成同一個數，量的就不是同一件事
        cur.firstX = best ? TEAM_SIDE.A * best.x : null;
        // 上牆者的 jumpTick（cover !== true 才算上牆）
        const plan = ai.blockPlan && ai.blockPlan.team === 'B' ? ai.blockPlan : null;
        if (plan) {
          const js = Object.entries(plan.byPid)
            .filter(([, c]) => c.cover !== true && c.jumpTick != null)
            .map(([, c]) => c.jumpTick);
          if (js.length === 2) cur.jumps = js;
        }
      }
    }
    settle();
  }
  const p50 = (arr) => (arr.length ? [...arr].sort((x, y) => x - y)[Math.floor(arr.length / 2)] : null);
  return {
    quickAir: quick.total ? (quick.above / quick.total) * 100 : NaN,
    quickN: quick.total,
    firstXRight: p50(wallFirstX.right),
    firstXRightN: wallFirstX.right.length,
    firstXQuick: p50(wallFirstX.quick),
    rightKill: killed.rightN ? (killed.right / killed.rightN) * 100 : NaN,
    rightKillN: killed.rightN,
    jtDiff: jt.pairs ? (jt.diff / jt.pairs) * 100 : NaN,
    jtPairs: jt.pairs,
    jtCross: jt.crossPairs ? (jt.crossDiff / jt.crossPairs) * 100 : NaN,
    jtCrossPairs: jt.crossPairs,
    atkPtsPerRally: rallies ? atkPts / rallies : NaN,
  };
}

const WIDE = BLOCK_COMMIT.DEPTH_LZ;
const ARMS = [
  { label: '卷前偵測 2.9', depth: 2.9, lz: BLOCK_COMMIT.OUTER_LZ, lx: 3.0, mul: 0 },
  { label: '純放寬 mix0', lz: INF, lx: INF, mul: 0, mix: 0 },
  { label: '純放寬 mix0.5', lz: INF, lx: INF, mul: 0, mix: 0.5 },
  { label: '純放寬 mix1', lz: INF, lx: INF, mul: 0, mix: 1 },
  { label: '卷前偵測 mix1', depth: 2.9, lz: INF, lx: INF, mul: 0, mix: 1 },
  { label: '深度判準 ×1',        lz: BLOCK_COMMIT.OUTER_LZ, lx: INF, mul: 1 },
  { label: '深度判準 ×2',        lz: BLOCK_COMMIT.OUTER_LZ, lx: INF, mul: 2 },
  { label: '橫向判準 ×1',        lz: INF, lx: 3.0, mul: 1 },
  { label: '橫向判準 ×2',        lz: INF, lx: 3.0, mul: 2 },
  { label: '兩條聯集 ×1',        lz: BLOCK_COMMIT.OUTER_LZ, lx: 3.0, mul: 1 },
  { label: '兩條聯集 ×2',        lz: BLOCK_COMMIT.OUTER_LZ, lx: 3.0, mul: 2 },
];

const f = (v, d = 2) => (v == null || Number.isNaN(v) ? '  -  ' : v.toFixed(d));

console.log(`=== 段 3 外圍降級掃描（${SETS} 局／臂，B 隊守方）===`);
console.log(`DEPTH_LZ = ${BLOCK_COMMIT.DEPTH_LZ}（放寬後；卷前 2.9）\n`);

// read 臂只跑一次（read 不吃這組常數，是款 3 的對照基準）
const readArm = runArm('read', SETS);
console.log(`read 基準：快攻離地率 ${f(readArm.quickAir, 1)}%（n=${readArm.quickN}）`
  + `／右翼牆首手|x| p50 ${f(readArm.firstXRight)}／右翼手身攔回 ${f(readArm.rightKill, 2)}%（n=${readArm.rightKillN}）\n`);

console.log('臂                  款3gap  快攻離地  右翼首手|x|p50  右翼攔回%  jt相異%  交叉jt%  攻方每球得分');
const ONLY = process.env.BOS_ARM ?? null;
for (const arm of ARMS.filter((a) => !ONLY || a.label.includes(ONLY))) {
  BLOCK_COMMIT.DEPTH_LZ = arm.depth ?? WIDE;
  BLOCK_COMMIT.OUTER_LZ = arm.lz;
  BLOCK_COMMIT.OUTER_LX = arm.lx;
  BLOCK_COMMIT.OUTER_LAG_MUL = arm.mul;
  BLOCK_COMMIT.AIM_CROSSING_MIX = arm.mix ?? 0;
  const r = runArm('commit', SETS);
  const gap = r.quickAir - readArm.quickAir;
  console.log(
    `${arm.label.padEnd(18)} ${f(gap, 1).padStart(6)}  ${f(r.quickAir, 1).padStart(7)}  `
    + `${f(r.firstXRight).padStart(12)}  ${f(r.rightKill, 2).padStart(8)}  `
    + `${f(r.jtDiff, 2).padStart(6)}  ${f(r.jtCross, 2).padStart(6)}  ${f(r.atkPtsPerRally, 3).padStart(10)}`,
  );
  console.log(`${''.padEnd(18)} （n：快攻 ${r.quickN}／右翼 ${r.rightKillN}／牆對 ${r.jtPairs}／交叉對 ${r.jtCrossPairs}）`);
}
console.log('\n門檻：款3gap ≥ 5pp／右翼首手|x| p50 ≠ 0.000／右翼攔回 > 0%／交叉 jt 不歸零');
console.log('※ 幅度為策略數值，本檔只量曲線；正式值待 Sawmah 定案。');
