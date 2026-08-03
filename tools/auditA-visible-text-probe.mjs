// A 路審視（2026-08-03）——玩家可見層「死活」高樣本探針
//
// ★ 動機 ★ 真人試玩連續踩到「已上線但從沒運作過」的 UI（遠段戰術入口從落地起 0 次、
// 立即攔網純損、一批失敗理由文案 0 次觸發）。共同形狀＝**驗收量的不是玩家會遇到的那件事**。
// 本探針只回答一個問題：**在真實對局裡，每一條玩家看得到的字／每一個面板，到底會不會出現？**
//
// ★ 取得路徑（`02 §6.1` 條 4）★ 全部走**真實函式**，不重刻任何判斷式：
//   · 播報 → 真的 `createCommentary()` 實例，真的事件流餵進去，真的 `line()` 取出來
//   · 得分面板 → 真的 `derivePointInfo`
//   · 主角字卡／氣勢字卡 → 真的 `heroCardFor` / `momentumCardFor`
//   · 面板標題 → 真的 `setPanelTitle` / `setPreviewTitle` / `noCallHintOf` / `mbPanelTitle`
//   · 助跑提示 → 真的 `myRouteFor` → 真的 `routeCueTextOf`
//   · 攔網站位提示 → 真的 `blockStepHint`
//   · 局間教練詞 → 真的 `setBreakCoachLine`
// 唯一被複製的是 matchLoop 的 lastTouch 追蹤（matchLoop.js:1292-1296，四行），
// 因為它是 loop 的區域狀態、沒有 export。複製處已標註。
//
// ⚠ 本探針量的是「**條件會不會成立**」，不是「DOM 有沒有畫出來」。DOM 那半由瀏覽器實測負責。
//
// 跑法：node tools/auditA-visible-text-probe.mjs [每對手場數=2]
import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';
import { OPPONENTS } from '../src/career/opponents.js';
import { createGame, stepGame, startNextSet, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { serverId } from '../src/sim/match.js';
import { createCommentary, blockStepHint } from '../src/ui/commentary.js';
import { derivePointInfo } from '../src/ui/pointBanner.js';
import { heroCardFor, momentumCardFor } from '../src/ui/heroCards.js';
import { routeCueTextOf } from '../src/ui/routeCue.js';
import { setBreakCoachLine } from '../src/ui/setBreakOverlay.js';
import { myRouteFor } from '../src/input/myRoute.js';
import {
  setOptionsFor, setPanelTitle, setPreviewTitle, noCallHintOf, setEtaOf, setStageOf,
} from '../src/input/setOptions.js';
import { mbReadFor, mbPanelTitle, blockReadAllowedFor } from '../src/input/blockRead.js';
import { callOptionsFor } from '../src/input/callPlay.js';
import { callFeasibilityOf } from '../src/sim/ai.js';

const PER_OPPONENT = Number(process.argv[2] ?? 2);
const MAX_TICKS = 400000;

// ---- 計數器 ----
const tally = {
  commentaryLine: new Map(),   // 播報泡泡實際顯示過的每一行
  commentaryKind: new Map(),   // action / beat / ambient
  banner: new Map(),           // 得分面板標題
  heroCard: new Map(),         // 主角字卡（逐 controlledId 掃）
  momentumCard: new Map(),
  routeCue: new Map(),         // 助跑提示的 action 段
  routeCueLead: new Map(),     // 「S 要你跑」vs「你的線」
  blockStepHint: new Map(),    // 「往前一步，把牆補上」條件成立的 tick 數
  setPanelTitle: new Map(),    // 近段分配面板標題
  setPreviewTitle: new Map(),  // 遠段戰術面板標題
  noCallHint: new Map(),       // 空清單四條理由
  mbPanelTitle: new Map(),
  callItemsN: new Map(),       // 遠段能列出幾個戰術（0＝空清單）
  setBreakCoach: new Map(),
  eventTypes: new Map(),
};
const bump = (m, k, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

let matches = 0;
let ticks = 0;
let setWindows = 0;      // 分配窗開啟過的波數（以 flightId 計）
let previewWindows = 0;  // 其中曾走到「遠段」的波數
let readyWindows = 0;    // 其中曾走到「近段」的波數
let mbWindows = 0;

function playOne(seed, opponentId, heroRole, bestOf) {
  const career = createCareer({ seed });
  const player = createCareerPlayer('探針', { seed });
  player.currentRole = heroRole;
  const members = buildStarterMembers();
  const lineup = defaultLineup(members, player.id, heroRole);
  const roster = { capacity: 12, members, alumni: [] };
  const setup = careerMatchSetup(
    career, player, { id: 'group-1', opponentId }, roster, lineup, 1,
  );
  const g = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos, momentum: true, stamina: { A: {}, B: { costMul: 1.0 } },
    comboScale: setup.comboScale ?? 1,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    ...(bestOf > 1 ? { series: { bestOf } } : {}),
  });
  const ai = createAiState();
  const heroId = player.id;
  const allIds = [...g.match.rotations.A, ...g.match.rotations.B];
  const commentary = createCommentary(setup.opponent ?? null, setup.revenge ?? []);

  // matchLoop.js:1292-1296 的 lastTouch 追蹤（loop 區域狀態、無 export ⇒ 只能複製四行）
  let lastTouch = null;
  let pendingDead = null;
  let prevMomentum = g.momentum?.value ?? 0;
  let now = 0; // commentary 的時間軸（ms）；60Hz ⇒ 每 tick +16.67ms
  const seenSetFlights = new Set();
  const seenPreviewFlights = new Set();
  const seenReadyFlights = new Set();
  const seenMbFlights = new Set();
  let prevSetsA = 0;
  let prevSetsB = 0;

  while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    stepGame(g, aiCollectIntents(g, ai));
    ticks += 1;
    now += 1000 / 60;
    const events = g.events ?? [];
    for (const e of events) {
      bump(tally.eventTypes, e.type);
      // --- matchLoop 的 lastTouch（複製）---
      if (e.type === 'TOUCH' || e.type === 'SERVE') {
        lastTouch = { team: e.team, playerId: e.playerId, kind: e.kind ?? 'serve', power: e.power };
      } else if (e.type === 'BLOCK_TOUCH') {
        lastTouch = { team: e.team, playerId: e.playerId, kind: 'block' };
      }
      if (e.type === 'DEAD_BALL') pendingDead = { reason: e.reason };
      if (e.type === 'SCORE' && pendingDead) {
        const info = derivePointInfo({
          reason: pendingDead.reason, winner: e.team,
          myTeam: g.players[heroId]?.teamId,
          lastTouch, controlledId: heroId, score: e.score,
        });
        bump(tally.banner, `${info.icon} ${info.title}`);
        pendingDead = null;
        lastTouch = null;
      }
      if (e.type === 'MOMENTUM') {
        const c = momentumCardFor(prevMomentum, e.value, TUNING.MOMENTUM_MAX);
        if (c) bump(tally.momentumCard, c.text);
        prevMomentum = e.value;
      }
      // 主角字卡：逐一把每個可能的受控者當成主角掃一次（涵蓋全角色）
      for (const id of allIds) {
        const c = heroCardFor(e, { controlledId: id, playerName: g.players[id]?.name });
        if (c) bump(tally.heroCard, c.text.replace(/^⚡ .*? 回歸/, '⚡ <名> 回歸'));
      }
    }
    commentary.onEvents(events, g, ai, now, heroId);
    const ln = commentary.line(g, ai, heroId, now);
    if (ln.text) {
      bump(tally.commentaryKind, ln.kind);
      // 分數/人名/拍數正規化，讓「同一句台詞」歸成一條
      const norm = ln.text
        .replace(/\d+:\d+/g, '<比分>')
        .replace(/第 \d+ 拍/, '第 N 拍')
        .replace(/連下 \d+ 分/, '連下 N 分')
        .replace(/^[^\s：]{1,8}(?= (發球|接爆了|魚躍救球|Perfect|貼地撈起|全力重扣|被晃過去了|指尖擦到|攔網拍到))/, '<人名>')
        .replace(/^[^\s：]{1,8}(?= 已經在硬撐|腳步變重)/, '<人名>')
        .replace(/^對面的 [^\s]{1,8}/, '對面的 <人名>')
        .replace(/^[^\s]{1,8} 把這一分/, '<人名> 把這一分')
        .replace(/^王牌 [^—]+——「[^」]+」/, '王牌 <名>——「<稱號>」');
      bump(tally.commentaryLine, `[${ln.kind}] ${norm}`);
    }
    // 攔網站位提示（每 tick 對每個 A 隊球員問一次；只記主角）
    if (blockStepHint(g, heroId)) bump(tally.blockStepHint, 'true');
    // 助跑提示（routeCue）
    const route = myRouteFor(g, ai, heroId);
    const cue = routeCueTextOf(route);
    if (cue && !cue.tooEarly) {
      bump(tally.routeCue, cue.action.replace(/[\d.]+s 後起步/, '<N>s 後起步'));
      bump(tally.routeCueLead, cue.lead);
    }
    // 分配窗（S 視角）：真實條件＝setOptionsFor 有選項；遠/近段由 setEtaOf+setStageOf 定
    const setZones = setOptionsFor(g, ai, heroId);
    if (setZones && setZones.length > 0 && g.ball.y > 1.8) {
      const fid = g.rally.flightId;
      if (!seenSetFlights.has(fid)) { seenSetFlights.add(fid); setWindows += 1; }
      const stage = setStageOf(setEtaOf(ai, g.tick));
      if (stage === 'ready') {
        if (!seenReadyFlights.has(fid)) { seenReadyFlights.add(fid); readyWindows += 1; }
        bump(tally.setPanelTitle, setPanelTitle(setZones[0].tier));
      } else {
        if (!seenPreviewFlights.has(fid)) { seenPreviewFlights.add(fid); previewWindows += 1; }
        const suggest = setZones.find((z) => z.pid === ai.attackerId) ?? setZones[0];
        const feas = callFeasibilityOf(g, ai);
        const items = callOptionsFor(g, heroId)
          .filter((o) => (feas ? feas[o.type]?.feasible !== false : true));
        if (!seenPreviewFlights.__counted) { /* noop */ }
        bump(tally.callItemsN, String(items.length));
        const title = setPreviewTitle(setZones[0].tier, suggest?.label ?? null, items.length === 0);
        bump(tally.setPreviewTitle, title.replace(/建議：[^—]+—/, '建議：<點>—'));
        if (items.length === 0) bump(tally.noCallHint, noCallHintOf(setZones[0].tier));
      }
    }
    // MB 讀舉球窗
    if (blockReadAllowedFor(g, heroId)) {
      const mb = mbReadFor(g, ai, heroId);
      if (mb && !(g.ball.vy < 0 && g.ball.y < 2.3)) {
        const fid = g.rally.flightId;
        if (!seenMbFlights.has(fid)) { seenMbFlights.add(fid); mbWindows += 1; }
        bump(tally.mbPanelTitle, mbPanelTitle(mb.tier));
      }
    }
    // 局間教練詞（bo3/bo5）：局數變動時取一次。
    // ⚠ set_break 是**等玩家按鈕**的相位——headless 不推它就會卡到 MAX_TICKS。
    // 這裡代玩家按下「▶ 下一局」（setBreakOverlay.js:77-82 的那顆鈕）。
    const s = g.series;
    if (s && (s.setsWon?.A !== prevSetsA || s.setsWon?.B !== prevSetsB)) {
      prevSetsA = s.setsWon?.A ?? 0;
      prevSetsB = s.setsWon?.B ?? 0;
      const line = setBreakCoachLine(s, 'A');
      if (line) bump(tally.setBreakCoach, line);
    }
    if (g.phase === 'set_break') startNextSet(g);
  }
  matches += 1;
  process.stderr.write(`  [${matches}] ${opponentId} role=${heroRole} bo${bestOf} `
    + `分 ${g.match.score.A}:${g.match.score.B} tick ${g.tick}\n`);
}

const ROLES = ['outside', 'setter', 'middle', 'opposite', 'libero'];
let seedN = 1;
for (const opp of OPPONENTS) {
  for (let i = 0; i < PER_OPPONENT; i += 1) {
    const role = ROLES[(seedN + i) % ROLES.length];
    const bo = i % 3 === 0 ? 3 : 1;
    playOne(seedN * 7919 + i * 101, opp.id, role, bo);
    seedN += 1;
  }
}

const show = (title, m, note = '') => {
  const rows = [...m].sort((a, b) => b[1] - a[1]);
  console.log(`\n=== ${title}（${rows.length} 條）${note} ===`);
  for (const [k, v] of rows) console.log(`  ${String(v).padStart(7)}　${k}`);
};

console.log(`場數 ${matches}　tick ${ticks}`);
console.log(`分配窗（波）${setWindows}　其中遠段 ${previewWindows}　近段 ${readyWindows}`);
console.log(`MB 讀舉球窗（波）${mbWindows}`);
show('播報泡泡・實際顯示過的行', tally.commentaryLine);
show('播報 kind 分佈', tally.commentaryKind);
show('得分原因面板・標題', tally.banner);
show('主角字卡（heroCards.js）', tally.heroCard);
show('氣勢滿檔字卡', tally.momentumCard);
show('助跑提示・動作段', tally.routeCue);
show('助跑提示・前綴', tally.routeCueLead);
show('攔網站位提示 blockStepHint 成立 tick', tally.blockStepHint);
show('S 近段分配面板標題', tally.setPanelTitle);
show('S 遠段戰術面板標題', tally.setPreviewTitle);
show('遠段可列出的戰術數', tally.callItemsN);
show('空清單四條理由（noCallHintOf）', tally.noCallHint);
show('MB 面板標題', tally.mbPanelTitle);
show('局間教練詞', tally.setBreakCoach);
show('sim 事件型別分佈（背景）', tally.eventTypes);
