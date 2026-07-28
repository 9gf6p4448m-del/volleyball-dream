// Phase 5 W1 §2-2「Transition 拉開」先量再做：我方取得球權（第一擊完成）到二傳觸球
// 之間，各攻擊手離網距離（lz）到底有沒有從攔網站位退開、退到多遠、花幾 tick。
// 用法：node tools/transition-probe.mjs [rallies]
//   （預設掃 seed 1..40 的整局，樣本遠超工單要求的 30 個 rally）
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isFrontRow, isBackRow, TEAM_SIDE } from '../src/sim/rotation.js';

const SEEDS = Number(process.argv[2] ?? 40);

// 每個「取得球權 → 二傳觸球」窗口，逐 tick 記錄該隊六人的離網距離 lz
const windows = [];
let open = null; // { team, t0, rows: Map<pid, {role, front, lz0, lzMin, lzMax, series[]}> }

const lzOf = (game, team, pid) => TEAM_SIDE[team] * game.actors[pid].z;

function snapshot(game, team) {
  const rot = game.match.rotations[team];
  const rows = new Map();
  for (const pid of rot) {
    const lz = lzOf(game, team, pid);
    rows.set(pid, {
      pid,
      role: game.players[pid].currentRole,
      front: isFrontRow(rot, pid),
      back: isBackRow(rot, pid),
      lz0: lz,
      lzMin: lz,
      lzMax: lz,
      lzEnd: lz,
      // 首次達到「離網 ≥ 2.4m」（≈ 三步）的 tick 偏移；null＝整段沒到
      tTo24: lz >= 2.4 ? 0 : null,
    });
  }
  return rows;
}

for (let seed = 1; seed <= SEEDS; seed += 1) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    // 窗口開著就逐 tick 更新軌跡
    if (open) {
      for (const r of open.rows.values()) {
        const lz = lzOf(g, open.team, r.pid);
        r.lzMin = Math.min(r.lzMin, lz);
        r.lzMax = Math.max(r.lzMax, lz);
        r.lzEnd = lz;
        if (r.tTo24 === null && lz >= 2.4) r.tTo24 = g.tick - open.t0;
      }
    }
    const prevProfile = g.rally.profile; // TOUCH 事件後 profile 已被改寫，先存本 tick 的來球型態
    const ev = stepGame(g, aiCollectIntents(g, ai));
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.touches === 1) {
        // 一擊完成瞬間：我方取得球權。profile＝這一擊接的是什麼球
        // （spike＝剛擋/挖對方扣球，前排原本貼網＝真正的 transition；serve/free＝接發局面）
        open = {
          team: e.team, t0: e.tick, rows: snapshot(g, e.team), receiverId: e.playerId,
          profile: prevProfile,
        };
      } else if (e.type === 'TOUCH' && e.touches === 2 && open && e.team === open.team) {
        // 二傳觸球瞬間：窗口關閉
        windows.push({
          team: open.team,
          profile: open.profile,
          ticks: e.tick - open.t0,
          receiverId: open.receiverId,
          setterId: e.playerId,
          attackerId: ai.attackerId,
          attackKind: ai.attackKind,
          rows: [...open.rows.values()],
        });
        open = null;
      } else if (e.type === 'DEAD_BALL' || (e.type === 'TOUCH' && e.touches >= 3)) {
        open = null;
      }
    }
  }
}

const q = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const f2 = (n) => (Number.isNaN(n) ? '  n/a' : n.toFixed(2));

console.log(`樣本：${windows.length} 個「取得球權 → 二傳觸球」窗口（seed 1..${SEEDS}）`);

console.log('\n── ③ 時間預算：一擊完成 → 二傳觸球 幾個 tick ──');
const durs = windows.map((w) => w.ticks);
console.log(`n=${durs.length}：p10=${q(durs, 0.1)}  p50=${q(durs, 0.5)}  p90=${q(durs, 0.9)}  max=${Math.max(...durs)} tick`
  + `　（p50=${(q(durs, 0.5) / 60).toFixed(2)}s）`);
console.log(`   不足 30 tick（0.5s）的比例：${((durs.filter((t) => t < 30).length / durs.length) * 100).toFixed(1)}%`);

// 分組：前排三名（依角色）＋後排 pipe（後排 OH）＋後排 D 球（後排 OPP）
const groups = new Map();
const addRow = (key, r, w) => {
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ ...r, ticks: w.ticks, isAttacker: r.pid === w.attackerId });
};
for (const w of windows) {
  for (const r of w.rows) {
    if (r.role === 'libero') continue;
    const zone = r.front ? '前排' : '後排';
    addRow(`${zone} ${r.role}`, r, w);
  }
}

const report = (title, rows) => {
  if (!rows.length) { console.log(`${title}：無樣本`); return; }
  const lz0 = rows.map((r) => r.lz0);
  const lzEnd = rows.map((r) => r.lzEnd);
  const lzMax = rows.map((r) => r.lzMax);
  const delta = rows.map((r) => r.lzEnd - r.lz0);
  const reached = rows.filter((r) => r.tTo24 !== null);
  console.log(`${title.padEnd(16)} n=${String(rows.length).padStart(5)}`
    + `｜lz起 p50=${f2(q(lz0, 0.5))} p90=${f2(q(lz0, 0.9))}`
    + `｜lz到二傳 p50=${f2(q(lzEnd, 0.5))} p90=${f2(q(lzEnd, 0.9))}`
    + `｜lz最遠 p50=${f2(q(lzMax, 0.5))}`
    + `｜Δ p50=${f2(q(delta, 0.5))}`
    + `｜達 2.4m 比例 ${((reached.length / rows.length) * 100).toFixed(0)}%`
    + (reached.length ? ` (耗時 p50=${q(reached.map((r) => r.tTo24), 0.5)}t p90=${q(reached.map((r) => r.tTo24), 0.9)}t)` : ''));
};

console.log('\n── ①② 各位置離網距離軌跡（lz＝離網公尺；攔網站位 BLOCK_LZ=0.6）──');
for (const key of [...groups.keys()].sort()) report(key, groups.get(key));

// 真正的 transition：第一擊接的是對方扣球（前排本來在攔網線上）
console.log('\n── ★ 只看真 transition（第一擊＝挖對方扣球，前排原本貼網攔網）──');
const digGroups = new Map();
const svGroups = new Map();
for (const w of windows) {
  const target = w.profile === 'spike' ? digGroups : svGroups;
  for (const r of w.rows) {
    if (r.role === 'libero') continue;
    const key = `${r.front ? '前排' : '後排'} ${r.role}`;
    if (!target.has(key)) target.set(key, []);
    target.get(key).push({ ...r, ticks: w.ticks, isAttacker: r.pid === w.attackerId });
  }
}
const digDur = windows.filter((w) => w.profile === 'spike').map((w) => w.ticks);
console.log(`窗口數 ${digDur.length}／時間預算 p10=${q(digDur, 0.1)} p50=${q(digDur, 0.5)} p90=${q(digDur, 0.9)} tick`);
for (const key of [...digGroups.keys()].sort()) report(key, digGroups.get(key));
console.log('\n── 對照：接發／自由球局面（前排本就不在攔網線上）──');
const svDur = windows.filter((w) => w.profile !== 'spike').map((w) => w.ticks);
console.log(`窗口數 ${svDur.length}／時間預算 p10=${q(svDur, 0.1)} p50=${q(svDur, 0.5)} p90=${q(svDur, 0.9)} tick`);
for (const key of [...svGroups.keys()].sort()) report(key, svGroups.get(key));

console.log('\n── 只看「本球實際被選中的攻擊手」──');
const atkRows = [];
for (const w of windows) {
  const r = w.rows.find((x) => x.pid === w.attackerId);
  if (r) atkRows.push({ ...r, kind: w.attackKind });
}
const byKind = new Map();
for (const r of atkRows) {
  if (!byKind.has(r.kind)) byKind.set(r.kind, []);
  byKind.get(r.kind).push(r);
}
for (const k of [...byKind.keys()].sort()) report(String(k), byKind.get(k));

console.log('\n── 前排「起跑時就已離網 ≥2.4m」的比例（＝根本不需要拉開的球）──');
for (const key of [...groups.keys()].filter((k) => k.startsWith('前排')).sort()) {
  const rows = groups.get(key);
  const already = rows.filter((r) => r.lz0 >= 2.4).length;
  console.log(`${key.padEnd(16)} ${((already / rows.length) * 100).toFixed(1)}%`);
}
