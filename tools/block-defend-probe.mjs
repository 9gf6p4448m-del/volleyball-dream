// 攔網／退防行為探針（回答試玩提問：①開了攔網窗真的攔得到嗎 ②退下來防守是接球模式嗎）
// 做法：node 直跑 sim，鏡像 matchControls 的自動規則（自動開攔網窗、到位自動接球），
// 主角走位分三種模式對照——量「窗開了幾次 vs 真的碰到球幾次」與「退防時第一觸型別」。
// 用法：node tools/block-defend-probe.mjs [場數=12]
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { createIntent } from '../src/sim/intent.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { standingReach } from '../src/sim/player.js';

const ME = 'A2';
const RUNS = Number.parseInt(process.argv[2] ?? '12', 10);
const AUTO_RECEIVE_DIST = 1.25; // 鏡像 matchControls

// mode：'stand'＝站原地不動（新手：只靠自動跳攔）
//       'track'＝橫向跟著球走（老手：走位＝攔網技術表達）
//       'retreat'＝退到 z=3 防守（測「退下來是不是接球模式」）
function runMatch(seed, mode) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const stat = {
    windowOpened: 0, blockTouch: 0, blockKill: 0, graze: 0,
    firstTouchByMe: 0, receiveByMe: 0, diveByMe: 0, spikeToUs: 0,
  };
  let windowOpenFlight = -1;
  for (let i = 0; i < 60000 && g.phase !== 'set_over'; i += 1) {
    const intents = aiCollectIntents(g, ai, [ME]);
    const a = g.actors[ME];
    const me = g.players[ME];
    const r = g.rally;
    const b = g.ball;
    const front = isFrontRow(g.match.rotations.A, ME);
    let move = { x: 0, z: 0 };
    let action = null;
    let aim = { x: 0, z: 6.5 };
    let timing = 0.6;

    if (g.phase === 'rally') {
      // 走位模式
      if (mode === 'track' && front) {
        const dx = b.x - a.x;
        const dz = 0.8 - a.z;
        const d = Math.hypot(dx, dz) || 1;
        move = { x: dx / d, z: dz / d };
      } else if (mode === 'retreat') {
        const dx = b.x - a.x;
        const dz = 3 - a.z;
        const d = Math.hypot(dx, dz) || 1;
        move = { x: dx / d, z: dz / d };
      }
      // 自動接球（鏡像 matchControls：球近＋下墜＋站立可及＋本波未觸）
      const near = Math.hypot(b.x - a.x, b.z - a.z) <= AUTO_RECEIVE_DIST;
      const reachable = near && b.vy < 0 && b.y <= standingReach(me) + 0.3;
      const canTouch = r.touches < 3 && r.lastToucherId !== ME &&
        !(r.profile === 'serve' && r.lastTouchTeam === 'A');
      if (canTouch && reachable && r.touches === 0) {
        action = 'receive';
        timing = 0.6;
      } else if (
        // 自動跳攔（鏡像 matchControls：前排網前 |z|<2.2＋對方扣球飛向我方）
        front && Math.abs(a.z) < 2.2 && r.profile === 'spike' &&
        ai.landingTeam === 'A' && r.possession === 'B'
      ) {
        action = 'block';
        if (windowOpenFlight !== r.flightId) {
          windowOpenFlight = r.flightId;
          stat.windowOpened += 1;
        }
      }
    }
    intents.push(createIntent({ playerId: ME, tick: g.tick, move, action, aim, timing }));
    const evs = stepGame(g, intents);
    for (const e of evs) {
      if (e.type === 'BLOCK_TOUCH' && e.playerId === ME) {
        stat.blockTouch += 1;
        if (e.graze) stat.graze += 1; else stat.blockKill += 1;
      }
      if (e.type === 'TOUCH' && e.playerId === ME && e.touches === 1) {
        stat.firstTouchByMe += 1;
        if (e.kind === 'receive') stat.receiveByMe += 1;
        if (e.kind === 'dive') stat.diveByMe += 1;
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'B') stat.spikeToUs += 1;
    }
  }
  return stat;
}

const sum = (list) => list.reduce((acc, s) => {
  for (const k of Object.keys(s)) acc[k] = (acc[k] ?? 0) + s[k];
  return acc;
}, {});

for (const mode of ['stand', 'track', 'retreat']) {
  const runs = [];
  for (let i = 0; i < RUNS; i += 1) runs.push(runMatch(1000 + i * 37, mode));
  const t = sum(runs);
  const rate = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
  const label = { stand: '站原地（只靠自動跳攔）', track: '橫向跟球走位（老手）', retreat: '退到 z=3 防守' }[mode];
  console.log(`\n=== ${label}｜${RUNS} 場 ===`);
  console.log(`對方扣球 ${t.spikeToUs} 次；攔網窗開啟 ${t.windowOpened} 次`);
  console.log(`  → 主角碰到球 ${t.blockTouch} 次（攔死 ${t.blockKill}／擦手 ${t.graze}）`
    + `＝開窗命中率 ${rate(t.blockTouch, t.windowOpened)}`);
  console.log(`主角第一觸 ${t.firstTouchByMe} 次：接球 ${t.receiveByMe}／魚躍 ${t.diveByMe}`);
}
