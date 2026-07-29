// Phase 5 §十「讓 sim 誠實」量測探針 ②——屬性生成器與身高的實際相關
//
// ★ 用途 ★
// 讀碼說「屬性生成不吃 height」不代表**實際分佈**獨立：level／attrBias／roleBias／
// heights 陣列與角色的對應，都可能在人口層面把身高與屬性綁在一起。本探針對
// **生涯全部 86 名球員**（七隊去重、走真實建隊路徑）算實際 Pearson 相關係數。
//
// ★ 怎麼跑 ★
//   node tools/phase5-attr-height-probe.mjs
//   純函式建隊、零隨機（招募生的 jitter 不在此人口內）——同版本同輸出。
//
// ★ 人口定義（86 人）★
//   我方遊隼高中 8 人 ＝ 先發 6（含主角 A2）＋自由人小守 1 ＋板凳阿遠 1
//   對手 7 隊 78 人   ＝ 每隊先發 6 ＋自由人 1 ＋板凳 reserves 4（天鷹 5）
//   建隊路徑＝careerMatchSetup（與 tools/balance-sim.mjs 基準臂同一條），
//   我方跨七場是同一批人 → 以 teamId+id 去重只計一次。
//
// ★ 輸出欄位的意思 ★
//   r(全體)     ＝86 人的 Pearson 相關係數（身高 m vs 該屬性 0-100）
//   r(不含L)    ＝排除 8 名自由人後的 78 人（自由人身高恆 1.72、屬性走 buildLibero
//                 另一條公式，是明顯的離群族群——列出「有沒有他們」的差別）
//   r(隊內)     ＝把每隊的身高與屬性**各自減去該隊均值**後再算（＝控制掉「隊伍 level
//                 越高、身高陣列也越高」的隊際耦合，只看隊內的關係）
//   n           ＝各欄的樣本數
import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';
import { OPPONENTS } from '../src/career/opponents.js';
import { ATTRIBUTE_KEYS } from '../src/sim/player.js';

// ---- 建出 86 人 ----
const career = createCareer({ seed: 1 });
const player = createCareerPlayer('探針', { seed: 1 });
const members = buildStarterMembers();
const lineup = defaultLineup(members, player.id, player.currentRole);
const roster = { capacity: 12, members, alumni: [] };

const seen = new Map(); // key = teamId + ':' + id + ':' + name
const add = (p, teamKey) => {
  const key = `${p.teamId}:${p.id}:${p.name}`;
  if (seen.has(key)) return;
  seen.set(key, {
    name: p.name,
    team: teamKey,
    role: p.currentRole,
    height: p.height.current,
    attributes: { ...p.attributes },
  });
};

for (const opp of OPPONENTS) {
  const setup = careerMatchSetup(
    career, player, { id: 'group-1', opponentId: opp.id }, roster, lineup, 1,
  );
  for (const p of setup.teams.A) add(p, 'A');
  for (const p of setup.teams.B) add(p, opp.id);
  if (setup.liberos.A) add(setup.liberos.A, 'A');
  if (setup.liberos.B) add(setup.liberos.B, opp.id);
  for (const p of setup.benches.A ?? []) add(p, 'A');
  for (const p of setup.benches.B ?? []) add(p, opp.id);
}

const pop = [...seen.values()];

// ---- 統計 ----
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return NaN;
  return sxy / Math.sqrt(sxx * syy);
}

// 隊內去均值（控制隊際耦合）
function withinTeam(rows, key) {
  const byTeam = new Map();
  for (const p of rows) {
    if (!byTeam.has(p.team)) byTeam.set(p.team, []);
    byTeam.get(p.team).push(p);
  }
  const xs = [];
  const ys = [];
  for (const group of byTeam.values()) {
    const mh = group.reduce((a, p) => a + p.height, 0) / group.length;
    const ma = group.reduce((a, p) => a + p.attributes[key], 0) / group.length;
    for (const p of group) {
      xs.push(p.height - mh);
      ys.push(p.attributes[key] - ma);
    }
  }
  return pearson(xs, ys);
}

const noL = pop.filter((p) => p.role !== 'libero');
const f = (v) => (Number.isNaN(v) ? '   n/a' : (v >= 0 ? ' ' : '') + v.toFixed(3));

console.log('== 人口 ==');
const teams = new Map();
for (const p of pop) teams.set(p.team, (teams.get(p.team) ?? 0) + 1);
console.log(`總人數＝${pop.length}（自由人 ${pop.length - noL.length} 名）`);
console.log(`分隊：${[...teams.entries()].map(([t, n]) => `${t}=${n}`).join('  ')}`);
const hs = pop.map((p) => p.height);
console.log(`身高（m）：min=${Math.min(...hs).toFixed(2)}  max=${Math.max(...hs).toFixed(2)}  `
  + `平均=${(hs.reduce((a, b) => a + b, 0) / hs.length).toFixed(3)}`);
console.log('');

console.log('== 身高 vs 各屬性 的 Pearson 相關係數 ==');
console.log(`屬性        r(全體 n=${pop.length})   r(不含L n=${noL.length})   `
  + `r(隊內去均值 n=${pop.length})   r(隊內·不含L n=${noL.length})`);
for (const k of ATTRIBUTE_KEYS) {
  const rAll = pearson(pop.map((p) => p.height), pop.map((p) => p.attributes[k]));
  const rNoL = pearson(noL.map((p) => p.height), noL.map((p) => p.attributes[k]));
  console.log(`${k.padEnd(10)}  ${f(rAll)}            ${f(rNoL)}            `
    + `${f(withinTeam(pop, k))}                ${f(withinTeam(noL, k))}`);
}
console.log('');

// 角色 × 身高／屬性（讀碼發現的耦合管道：heights 陣列的槽序＝角色序、roleBias 吃角色）
console.log('== 分角色（人口平均；耦合管道的原始資料）==');
const roles = [...new Set(pop.map((p) => p.role))];
console.log(`role       n     身高均值   ${ATTRIBUTE_KEYS.map((k) => k.padEnd(8)).join('')}`);
for (const r of roles) {
  const g = pop.filter((p) => p.role === r);
  const mh = g.reduce((a, p) => a + p.height, 0) / g.length;
  const cells = ATTRIBUTE_KEYS
    .map((k) => (g.reduce((a, p) => a + p.attributes[k], 0) / g.length).toFixed(1).padEnd(8))
    .join('');
  console.log(`${r.padEnd(10)} ${String(g.length).padStart(3)}   ${mh.toFixed(3)}    ${cells}`);
}
console.log('');

// 隊際：level 與身高陣列的關係（隊際耦合的來源；每隊一筆）
console.log('== 隊際（每隊一筆：level 對上該隊平均身高／平均 reaction／平均 speed）==');
console.log('team          n   level  身高均值  reaction  speed');
const teamRows = [];
for (const [t, n] of teams) {
  const g = pop.filter((p) => p.team === t);
  const def = OPPONENTS.find((o) => o.id === t);
  const mh = g.reduce((a, p) => a + p.height, 0) / g.length;
  const mr = g.reduce((a, p) => a + p.attributes.reaction, 0) / g.length;
  const ms = g.reduce((a, p) => a + p.attributes.speed, 0) / g.length;
  teamRows.push({ t, n, level: def?.level ?? null, mh, mr, ms });
  console.log(`${t.padEnd(13)} ${String(n).padStart(2)}   ${String(def?.level ?? '—').padStart(4)}   `
    + `${mh.toFixed(3)}    ${mr.toFixed(1)}      ${ms.toFixed(1)}`);
}
const withLevel = teamRows.filter((r) => r.level != null);
console.log(`隊際 r(level, 平均身高) = ${f(pearson(withLevel.map((r) => r.level), withLevel.map((r) => r.mh)))}`
  + `　（n=${withLevel.length} 隊，我方 A 隊無 level 參數故不計）`);
