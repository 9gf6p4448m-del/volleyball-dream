// 組合攻擊「屆數閘」驗收探針（2026-08-01）
//
// 用法：node tools/season-combo-probe.mjs [每臂局數=6]
//
// ★ 要回答的三件事（驗收 ①②③）★
//   ① 生涯第 1 屆：三型組合次數皆 0
//   ② 生涯第 2 屆：恢復非零（交叉／時間差；夾塞出廠 0＝裁定丙，本探針不當作退步）
//   ③ 快速比賽：不吃屆數，組合照常發生
//
// ★ 取得路徑（`02 §6.1` 條 4）★ 三條臂全部走**真實路徑**：
//   career 臂＝createCareer → careerMatchSetup(…, seasonIndex) → createGame({ comboScale })
//   ——與 matchConfig.js 的生涯分支同構（該檔只是把同一個欄位遞下去）。
//   quick 臂＝createGame() 不傳 comboScale（＝matchConfig 的快速比賽分支）。
//   計數讀 sim 自己寫的 `aiState.attackCombo`，不重刻任何判斷式。
import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { COMBO_TYPES } from '../src/sim/approach.js';

const SETS = Number(process.argv[2] ?? 6);
const MAX_TICKS = 400000;
const OPP = 'north-tech'; // 小組首戰對手（三條 career 臂固定同一隊＝只有屆數是自變數）

// 一場的組合計數：規劃點（aiState.approach 換新）出現時看 attackCombo
function countOne(makeGame) {
  const g = makeGame();
  const ai = createAiState();
  const byType = Object.fromEntries(COMBO_TYPES.map((t) => [t, 0]));
  let plans = 0;
  let prevApproach = null;
  while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    const intents = aiCollectIntents(g, ai);
    if (ai.approach && ai.approach !== prevApproach) {
      prevApproach = ai.approach;
      plans += 1;
      if (ai.attackCombo) byType[ai.attackCombo.type] += 1;
    }
    stepGame(g, intents);
  }
  return { byType, plans };
}

function careerArm(seasonIndex, seed) {
  const career = createCareer({ seed });
  const player = createCareerPlayer('探針', { seed });
  const members = buildStarterMembers();
  const lineup = defaultLineup(members, player.id, player.currentRole);
  const roster = { capacity: 12, members, alumni: [] };
  const setup = careerMatchSetup(
    career, player, { id: 'group-1', opponentId: OPP }, roster, lineup, seasonIndex,
  );
  return () => createGame({
    seed: setup.seed,
    teams: setup.teams,
    aiProfiles: setup.aiProfiles,
    liberos: setup.liberos,
    comboScale: setup.comboScale, // ← matchConfig.js 生涯分支遞的就是這個欄位
  });
}

function run(label, makeGameFor) {
  const total = Object.fromEntries(COMBO_TYPES.map((t) => [t, 0]));
  let plans = 0;
  for (let i = 0; i < SETS; i += 1) {
    const r = countOne(makeGameFor(1000 + i * 101));
    for (const t of COMBO_TYPES) total[t] += r.byType[t];
    plans += r.plans;
  }
  const sum = COMBO_TYPES.reduce((s, t) => s + total[t], 0);
  const parts = COMBO_TYPES.map(
    (t) => `${t}=${String(total[t]).padStart(4)}（${plans ? ((total[t] / plans) * 100).toFixed(1) : '0.0'}%）`,
  ).join('　');
  console.log(`  ${label.padEnd(22)} 規劃點 ${String(plans).padStart(5)}　${parts}　合計 ${sum}`);
  return { total, plans, sum };
}

console.log(`== 組合攻擊屆數閘探針 ==  每臂 ${SETS} 局（對手 ${OPP}）\n`);
const s1 = run('生涯 第1屆', (seed) => careerArm(1, seed));
const s2 = run('生涯 第2屆', (seed) => careerArm(2, seed));
const s3 = run('生涯 第3屆', (seed) => careerArm(3, seed));
const q = run('快速比賽（無屆數）', (seed) => () => createGame({ seed, setTarget: 25 }));

console.log('');
const ok1 = s1.sum === 0;
const ok2 = s2.total.cross > 0 && s2.total.delay > 0;
const ok3 = q.sum > 0;
console.log(`  ① 第1屆三型全 0        ${ok1 ? '✅' : '❌'}（合計 ${s1.sum}）`);
console.log(`  ② 第2屆恢復非零        ${ok2 ? '✅' : '❌'}（cross ${s2.total.cross}／delay ${s2.total.delay}／tandem ${s2.total.tandem}＝出廠 0）`);
console.log(`  ③ 快速比賽不受影響     ${ok3 ? '✅' : '❌'}（合計 ${q.sum}）`);
process.exit(ok1 && ok2 && ok3 ? 0 : 1);
