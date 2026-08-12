// 分步關卡卷驗收探針（2026-08-13）——`docs/kickoffs/tutorial-drill-stage-kickoff.md` §四
// 的 A1／A2／A3／A5 逐條量測。A4／A6 由測試檔（純函式與反向對照）負責。
//
// ★ 走真實路徑 ★ practiceMatchSetup 建隊、createGame 建局、aiCollectIntents+stepGame 逐 tick，
// 教學局的推進與重擺場景走 matchLoop 的 updateTutorial（不重刻一份，重刻＝循環論證）。
// 假物件只替換「畫面」（commentary/practiceHud），判定與狀態機全是真的。
//
// 用法：node tools/tutorial-stage-probe.mjs [seeds=50]
import { createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import {
  practiceMatchSetup, tutorialDrills, createTutorialState, currentTutorialDrill,
  TUTORIAL_DRILL_STAGE, TUTORIAL_DRILL_IDS,
} from '../src/career/practiceMatch.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { updateTutorial } from '../src/app/matchLoop.js';
import { positionOf } from '../src/sim/rotation.js';

const SEEDS = Number.parseInt(process.argv[2] ?? '50', 10);
const PID = 'A2';
const MAX_TICKS = 400000;

function runOne(seed) {
  const setup = practiceMatchSetup({
    player: createCareerPlayer('探針', { seed }),
    members: buildStarterMembers(),
    lineup: null,
    drills: tutorialDrills(),
    seasonIndex: 1,
    seed,
    tutorial: true,
  });
  const game = createGame({
    seed: setup.seed,
    setTarget: 999, // 同 matchConfig 的 TUTORIAL_SET_TARGET（教學局不靠比分結束）
    teams: setup.teams,
    aiProfiles: setup.aiProfiles,
    liberos: setup.liberos,
    benches: setup.benches,
    comboScale: setup.comboScale,
    stamina: { A: {}, B: {} },
    momentum: true,
  });
  const ai = createAiState();
  // matchLoop 的 s：只有 stage（畫面）是假的，其餘全真
  const s = {
    game,
    playerId: PID,
    tutorial: createTutorialState(0),
    stage: { commentary: { coach() {} }, practiceHud: { update() {} } },
  };

  const stageChecks = [];   // A1：每一步開打時的實際槽位與發球方
  const blockFirstBall = []; // A2：tut-block 第一球對方有沒有進攻
  const handleFirstBall = []; // A3：tut-handle 第一球有沒有舉給玩家
  let faults = 0;            // A5

  let prevPhase = null;
  let prevDrillId = null;
  let armed = null;    // 這一步剛擺好、等著看第一球的狀態
  let cursor = 0;
  let done = false;

  while (!done && game.tick < MAX_TICKS && game.phase !== 'set_over') {
    done = updateTutorial(s, game.tick * 16.7) || s.tutorial.done;
    const drill = currentTutorialDrill(s.tutorial);
    const drillId = drill?.id ?? null;
    // 每一步「擺好之後、球還沒發」的那一刻採樣（phase 進入 serve 且場景已套用）
    if (drillId && game.phase === 'serve' && prevPhase !== 'serve') {
      const want = TUTORIAL_DRILL_STAGE[drillId];
      if (want) {
        const myTeam = game.players[PID]?.teamId ?? 'A';
        const other = myTeam === 'A' ? 'B' : 'A';
        stageChecks.push({
          drillId,
          slotOk: positionOf(game.match.rotations[myTeam], PID) === want.slot + 1,
          servingOk: game.match.servingTeam === (want.serving === 'A' ? myTeam : other),
        });
        armed = { drillId, mark: game.events.length };
      }
    }
    prevPhase = game.phase;
    prevDrillId = drillId;
    stepGame(game, aiCollectIntents(game, ai));
    // 這一球打完 ⇒ 結算 armed 的觀測
    if (armed && game.phase !== 'rally' && prevPhase === 'rally') {
      const slice = game.events.slice(armed.mark);
      if (armed.drillId === 'tut-block') {
        // 進攻不是獨立事件型別——是 TOUCH 帶 kind（game.js:831-832 `kind: intent.action`）
        blockFirstBall.push(slice.some((e) => e.type === 'TOUCH' && e.team === 'B'
          && (e.kind === 'spike' || e.kind === 'tip')));
      }
      if (armed.drillId === 'tut-handle') {
        // 我方三擊組織中，第二觸（舉球）的目標是玩家＝玩家拿到出手機會
        handleFirstBall.push(slice.some((e) => e.type === 'TOUCH' && e.team === 'A'
          && e.playerId === PID && (e.kind === 'set' || e.kind === 'spike')));
      }
      armed = null;
    }
    for (; cursor < game.events.length; cursor += 1) {
      const t = game.events[cursor].type;
      if (t === 'ROTATION_FAULT' || t === 'POSITIONAL_FAULT') faults += 1;
    }
  }
  return { stageChecks, blockFirstBall, handleFirstBall, faults, finished: s.tutorial.done };
}

const all = { stageChecks: [], blockFirstBall: [], handleFirstBall: [], faults: 0, finished: 0 };
for (let seed = 1; seed <= SEEDS; seed += 1) {
  const r = runOne(seed);
  all.stageChecks.push(...r.stageChecks);
  all.blockFirstBall.push(...r.blockFirstBall);
  all.handleFirstBall.push(...r.handleFirstBall);
  all.faults += r.faults;
  if (r.finished) all.finished += 1;
}

const pct = (a, b) => (b === 0 ? 'NA' : `${((a / b) * 100).toFixed(1)}%`);
const badSlot = all.stageChecks.filter((c) => !c.slotOk);
const badServe = all.stageChecks.filter((c) => !c.servingOk);
const blockOk = all.blockFirstBall.filter(Boolean).length;
const handleOk = all.handleFirstBall.filter(Boolean).length;

console.log(`=== 分步關卡卷驗收（seeds=${SEEDS}）===`);
console.log(`跑法：node tools/tutorial-stage-probe.mjs ${SEEDS}`);
console.log(`六步走完的場次：${all.finished}/${SEEDS}`);
console.log('');
console.log(`[A1] 場景必然性：採樣 ${all.stageChecks.length} 次`);
console.log(`  槽位不符：${badSlot.length}（要 0）${badSlot.length ? ` ← ${[...new Set(badSlot.map((c) => c.drillId))].join(',')}` : ''}`);
console.log(`  發球方不符：${badServe.length}（要 0）${badServe.length ? ` ← ${[...new Set(badServe.map((c) => c.drillId))].join(',')}` : ''}`);
console.log(`  ⇒ A1 ${badSlot.length === 0 && badServe.length === 0 ? '通過' : '失敗'}`);
console.log('');
console.log(`[A2] tut-block 第一球對方有進攻：${blockOk}/${all.blockFirstBall.length}＝${pct(blockOk, all.blockFirstBall.length)}（要 ≥90%）`);
console.log(`  ⇒ A2 ${all.blockFirstBall.length > 0 && blockOk / all.blockFirstBall.length >= 0.9 ? '通過' : '失敗'}`);
console.log('');
console.log(`[A3] tut-handle 第一球玩家拿到出手：${handleOk}/${all.handleFirstBall.length}＝${pct(handleOk, all.handleFirstBall.length)}（要 ≥80%）`);
console.log(`  ⇒ A3 ${all.handleFirstBall.length > 0 && handleOk / all.handleFirstBall.length >= 0.8 ? '通過' : '失敗'}`);
console.log('');
console.log(`[A5] 違序／站位犯規事件：${all.faults}（要恆為 0）`);
console.log(`  ⇒ A5 ${all.faults === 0 ? '通過' : '失敗'}`);
console.log('');
console.log(`（科目順序：${TUTORIAL_DRILL_IDS.join(' → ')}）`);
