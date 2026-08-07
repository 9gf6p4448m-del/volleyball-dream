// 夾塞窗（2026-08-07）— 真實開窗率與關窗原因分佈
//
// 為什麼要有這支：`tandemStateOf.open` 若在真實遊玩中幾乎永不為真，那顆鈕等於不存在
//（`02 §6.1` 條 6 的不變量掃描要求「量出來」，不是推導出來就算）。
// 順帶產出 `TANDEM_FEEDBACK` 的文案清單——**只寫實際印得出來的**，避免死文案。
//
// 跑法：node tools/tandem-window-probe.mjs [局數]
//   快速比賽（createDefaultTeams，comboScale 未注入＝1）＋生涯（第 2 屆＝戰術已開）兩臂。
//
// 量測位置（誠實標註）：取樣的是「玩家若操這名 OPP 會看到什麼」——
// 逐 tick 呼叫 `tandemStateOf`，**不按**（observe 臂）⇒ 零 src 改動、零行為擾動。
import { createGame, stepGame, createDefaultTeams } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, tandemStateOf } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';

const SETS = Number.parseInt(process.argv[2] ?? '12', 10);

function oppIdOf(game, team = 'A') {
  return Object.values(game.players)
    .find((p) => p.teamId === team && p.currentRole === 'opposite')?.id ?? null;
}

// 一局：逐 tick 取樣。窗＝我方第二觸窗（possession===A && touches===1 && approach 已排）。
function playSet(game, pid) {
  const ai = createAiState();
  const reasons = {};
  const tally = { ticks: 0, open: 0, waves: 0, waveOpen: 0, waveFrontRow: 0 };
  let wave = null;
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    const rot = game.match.rotations[game.players[pid].teamId];
    const onCourt = rot.includes(pid);
    const r = game.rally;
    const inWave = game.phase === 'rally' && r && r.possession === 'A' && r.touches === 1
      && ai.approach?.team === 'A';
    if (inWave) {
      if (!wave || wave.flightId !== r.flightId) {
        wave = { flightId: r.flightId, open: false, front: onCourt && isFrontRow(rot, pid) };
        tally.waves += 1;
        if (wave.front) tally.waveFrontRow += 1;
      }
    } else if (wave) {
      if (wave.open) tally.waveOpen += 1;
      wave = null;
    }
    // 取樣範圍＝這顆鈕的觀眾（在場的前排 OPP，rally 中的任何一格）
    if (game.phase === 'rally' && onCourt && isFrontRow(rot, pid)) {
      const st = tandemStateOf(game, ai, pid);
      tally.ticks += 1;
      if (st.open) {
        tally.open += 1;
        if (wave) wave.open = true;
      } else if (st.reason) reasons[st.reason] = (reasons[st.reason] ?? 0) + 1;
    }
    // 後排輪次另計一桶：只為回答「`nopool` 這條分支是不是死碼」——
    // 它不在鈕的觀眾範圍內（鈕有 isFrontRow 閘），所以不進上面那份文案清單。
    if (game.phase === 'rally' && onCourt && !isFrontRow(rot, pid)) {
      const st = tandemStateOf(game, ai, pid);
      if (!st.open && st.reason) {
        const k = `後排:${st.reason}`;
        reasons[k] = (reasons[k] ?? 0) + 1;
      }
    }
    stepGame(game, intents);
  }
  if (wave?.open) tally.waveOpen += 1;
  return { reasons, tally };
}

function merge(dst, src) {
  for (const [k, v] of Object.entries(src)) dst[k] = (dst[k] ?? 0) + v;
}

const arms = [
  {
    name: '快速比賽',
    make: (i) => {
      const game = createGame({
        seed: 500000 + i * 7919, teams: createDefaultTeams(), setTarget: 25,
      });
      return { game, pid: oppIdOf(game) };
    },
  },
  {
    name: '生涯第 2 屆',
    make: (i) => {
      const seed = 900000 + i * 7919;
      const career = createCareer({ seed });
      const player = createCareerPlayer('探針', { seed });
      const members = buildStarterMembers();
      const lineup = defaultLineup(members, player.id, player.currentRole);
      const roster = { capacity: 12, members, alumni: [] };
      // seasonIndex 2＝戰術已開（comboScale > 0）
      const setup = careerMatchSetup(
        career, player, { id: 'group-1', opponentId: 'north-tech' }, roster, lineup, 2,
      );
      const game = createGame({
        seed: setup.seed,
        teams: setup.teams,
        aiProfiles: setup.aiProfiles,
        liberos: setup.liberos,
        comboScale: setup.comboScale,
      });
      return { game, pid: oppIdOf(game) };
    },
  },
];

for (const arm of arms) {
  const reasons = {};
  const total = { ticks: 0, open: 0, waves: 0, waveOpen: 0, waveFrontRow: 0 };
  for (let i = 0; i < SETS; i += 1) {
    const { game, pid } = arm.make(i);
    if (!pid) { console.log(`${arm.name}：找不到 OPP，跳過`); break; }
    const r = playSet(game, pid);
    merge(reasons, r.reasons);
    merge(total, r.tally);
  }
  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
  console.log(`\n== ${arm.name}（${SETS} 局）==`);
  console.log(`  逐 tick 取樣 ${total.ticks} 筆　OPEN ${total.open}（${pct(total.open, total.ticks)}）`);
  console.log(`  第二觸窗 ${total.waves} 波　其中玩家在前排 ${total.waveFrontRow}`
    + `（${pct(total.waveFrontRow, total.waves)}）`);
  console.log(`  ★真實開窗率★ 前排波裡曾經開窗 ${total.waveOpen}`
    + `（${pct(total.waveOpen, total.waveFrontRow)}　全部波 ${pct(total.waveOpen, total.waves)}）`);
  const rows = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of rows) console.log(`    ${k.padEnd(12)} ${String(v).padStart(7)}  ${pct(v, total.ticks)}`);
}
