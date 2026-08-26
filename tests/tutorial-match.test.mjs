// 教學局（2026-08-12 練習賽卷最後一批）——「第一次玩的人，有沒有人教他怎麼玩」
//
// ★ 為什麼要這一檔 ★ 真人回饋兩句：「這遊戲那麼多特別的地方，都沒有很好的解釋玩法」、
//   「新手第一次操作練習的賭注就是真比賽」。本批交付三段，三段各自都會壞在不同地方：
//     ① 步進機（純函式）：切片語意錯 ⇒ 六步在兩秒內自己跑完，教練喊了但沒人做
//     ② 台詞（文案守衛）：喊的操作與現行操作對不上 ⇒ 教人去按不存在的鈕
//     ③ 接線（假 DOM）：卡片寫好了卻沒被 renderCareer 喚起 ⇒ 從上線起一次沒出現
//        （`bquickButton` 就是這樣死的——所以這一段跑正式的 `createCareerScreen`，
//         真的去按那兩顆鈕，不掃原始碼字串）
//
// ★ 鑑別力 ★ 每一條「不該發生」的斷言旁邊都放它的反向對照：切片測試配一條「不切片
//   就會提前跑完」的證據、旗標測試配一條「沒按過就一定會出現」、教學局不落檔配一條
//   「同一個結算器換成紅白賽就一定會落檔」。只驗「沒發生」的話，一支什麼都不做的
//   假實作也會全綠。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRILL_DEFS, TUTORIAL_DRILL_IDS, TUTORIAL_STALL_TICKS, TUTORIAL_INVITE_EVENT_ID,
  createTutorialState, advanceTutorial, currentTutorialDrill, tutorialRows,
  tutorialSettle, tutorialDrills, tutorialCoachLine, tutorialVerdictLine,
  tutorialInviteDue, hintViolations, CLASSIC_ONLY_TERMS, settlePractice,
} from '../src/career/practiceMatch.js';
import { updateTutorial, refreshTutorialHud, endTutorialSet } from '../src/app/matchLoop.js';

const PID = 'A2';
const TEAM = 'A';

// ── 事件素材（形狀與 tests/practice-wiring.test.mjs 同源）──
const touch = (o) => ({ type: 'TOUCH', tick: 0, team: TEAM, ...o });
const score = (team = TEAM) => ({ type: 'SCORE', tick: 0, team, score: { A: 1, B: 0 } });
const receive = () => touch({ playerId: PID, kind: 'receive', touches: 1 });
const setBall = () => touch({ playerId: PID, kind: 'set', touches: 2 });
const blockTouch = () => ({ type: 'BLOCK_TOUCH', tick: 0, team: TEAM, playerId: PID });
const serve = () => ({ type: 'SERVE', tick: 0, team: TEAM, playerId: PID, style: null });
// 我方三擊組織（接—舉—攻）：touches 1→2→3 且第三擊是扣球
const threeTouch = () => [
  touch({ playerId: 'A1', kind: 'receive', touches: 1 }),
  touch({ playerId: 'A3', kind: 'set', touches: 2 }),
  touch({ playerId: 'A4', kind: 'spike', touches: 3, power: 0.9 }),
];
// 玩家親手拿下一分（吊球得分；totalPointsFor 吃 tipKills）
const tipKill = () => [touch({ playerId: PID, kind: 'spike', touches: 3, power: 0.3 }), score()];

// 六步各自「做到」需要的事件（順序＝TUTORIAL_DRILL_IDS）
const STEP_EVENTS = [
  () => [receive()],
  () => [setBall()],
  () => [blockTouch()],
  () => [serve()],
  () => threeTouch(),
  () => tipKill(),
];

// ★ 2026-08-13 判準變更（Sawmah 裁定）★ `tut-block` 從「攔網碰到球」改成
// 「貼網卡位、起跳攔網」——起因是量測：個人攔網率只有 7.3%（897 次扣球），
// 以碰到球為門檻平均要打約 14 球，而主因不是位置而是時機窗與擲骰。
// 起跳沒有事件（加事件會動到 sim-hash），走 `obs.blockJumps`⇒ 治具要跟著給觀測量。
const STEP_OBS = [null, null, { blockJumps: 1 }, null, null, null];
const stepOnce = (state, events, tick = 0, obs = null) => advanceTutorial(state, {
  events, playerId: PID, myTeam: TEAM, tick, obs,
});

// ════════════════════════════════════════════════════════════
// 一、步進機：事件流增量 ⇒ 當前步推進
// ════════════════════════════════════════════════════════════

test('六步依序推進：每一步做到了才走下一步，六步走完回收局訊號', () => {
  let st = createTutorialState(0);
  const ev = [];
  assert.equal(currentTutorialDrill(st).id, TUTORIAL_DRILL_IDS[0]);
  for (let i = 0; i < TUTORIAL_DRILL_IDS.length; i += 1) {
    // 這一步的素材還沒出現＝不得推進（否則是「喊了但沒判」）
    const idle = stepOnce(st, ev, 0);
    assert.equal(idle.change, null, `第 ${i + 1} 步在沒做到之前就被推掉了`);
    assert.equal(idle.state.index, i);
    assert.equal(currentTutorialDrill(idle.state).id, TUTORIAL_DRILL_IDS[i]);

    ev.push(...STEP_EVENTS[i]());
    const done = stepOnce(st, ev, 0, STEP_OBS[i]);
    assert.equal(done.change, 'advance', `第 ${i + 1} 步（${TUTORIAL_DRILL_IDS[i]}）做到了卻沒推進`);
    assert.equal(done.cleared, true);
    assert.equal(done.drill.id, TUTORIAL_DRILL_IDS[i]);
    st = done.state;
    assert.equal(st.log.length, i + 1);
    assert.equal(st.log[i].cleared, true);
  }
  assert.equal(st.done, true, '★核心★ 六步走完＝收局訊號');
  assert.equal(currentTutorialDrill(st), null);
  // 走完之後再問一次不得再吐訊號（收局是一次性的）
  assert.equal(stepOnce(st, ev, 0).change, null);
});

test('純函式：不改傳入的 state（呼叫端拿到的是新的那一份）', () => {
  const st = createTutorialState(0);
  const snapshot = JSON.stringify(st);
  stepOnce(st, [receive()], 0);
  assert.equal(JSON.stringify(st), snapshot, 'advanceTutorial 不得就地改 state');
});

test('★切片語意★ 每一步只看「這一步開始之後」的事件——先做的不算後面那一步', () => {
  // 開場就先打進一分（＝第六步 tut-point 的素材），再從第一步開始走
  const ev = [...tipKill()];
  let st = createTutorialState(0);
  for (let i = 0; i < 5; i += 1) {
    ev.push(...STEP_EVENTS[i]());
    const r = stepOnce(st, ev, 0, STEP_OBS[i]);
    assert.equal(r.change, 'advance', `第 ${i + 1} 步沒推進`);
    st = r.state;
  }
  assert.equal(currentTutorialDrill(st).id, 'tut-point');
  assert.equal(stepOnce(st, ev, 0).change, null,
    '★核心★ 開場那一分是第六步開始「之前」拿的——不得讓教練喊完就自己過關');
  ev.push(...tipKill()); // 教練喊完之後真的再拿一分
  assert.equal(stepOnce(st, ev, 0).change, 'advance');
});

test('★反向對照★ 不切片的話會提前跑完（證明上面那條驗得到東西）', () => {
  // 直接拿整份事件流餵第六步的判定函式——這就是「沒有 startEvent 切片」的實作
  const ev = [...tipKill()];
  assert.ok(DRILL_DEFS['tut-point'].count(ev, PID, TEAM) >= DRILL_DEFS['tut-point'].target,
    '若不切片，第六步在開場那一分之後就已經滿足＝教練還沒喊就過關了');
});

// ════════════════════════════════════════════════════════════
// 二、卡步自動放行（防新手卡死在攔網／發球那一步）
// ════════════════════════════════════════════════════════════

test('卡太久自動放行：逾時＝往下走但不算完成（結算照實記 cleared:false）', () => {
  const st = createTutorialState(0);
  const almost = stepOnce(st, [], TUTORIAL_STALL_TICKS - 1);
  assert.equal(almost.change, null, '★反向對照★ 還沒到門檻就放行＝門檻是假的');

  const out = stepOnce(st, [], TUTORIAL_STALL_TICKS);
  assert.equal(out.change, 'release');
  assert.equal(out.cleared, false);
  assert.equal(out.state.index, 1, '放行之後要真的走到下一步（不然還是卡死）');
  assert.equal(out.state.log[0].cleared, false, '放行不得記成完成');
  assert.equal(out.state.log[0].count, 0);
});

test('放行的計時基準是「這一步開始的時候」，不是整場開賽', () => {
  // 第一步在 tick 0 完成 ⇒ 第二步的計時從那一刻重新起算
  const first = stepOnce(createTutorialState(0), [receive()], 0);
  assert.equal(first.state.startTick, 0);
  const later = stepOnce(first.state, [receive()], TUTORIAL_STALL_TICKS - 1);
  assert.equal(later.change, null, '第二步才剛開始，不得沿用第一步的時鐘直接放行');
  const second = stepOnce(first.state, [receive(), setBall()], 500);
  assert.equal(second.state.startTick, 500, '每一步重新起算');
});

test('同一幀既做到又逾時 ⇒ 記「做到」（不得把玩家真的做到的事寫成沒做到）', () => {
  const out = stepOnce(createTutorialState(0), [receive()], TUTORIAL_STALL_TICKS + 999);
  assert.equal(out.change, 'advance');
  assert.equal(out.cleared, true);
});

test('放行也走得完六步（全程零操作 ⇒ 一路放行到收局，玩家出得去）', () => {
  let st = createTutorialState(0);
  for (let i = 0; i < TUTORIAL_DRILL_IDS.length; i += 1) {
    const r = stepOnce(st, [], TUTORIAL_STALL_TICKS * (i + 1));
    assert.equal(r.change, 'release');
    st = r.state;
  }
  assert.equal(st.done, true, '★核心★ 什麼都不做也不得卡死在教學局出不去');
  assert.equal(tutorialSettle(st).completedCount, 0, '但一項都不算完成');
});

// ════════════════════════════════════════════════════════════
// 三、HUD 逐步狀態與結算
// ════════════════════════════════════════════════════════════

test('tutorialRows：六列固定，只有一列是 current 且帶操作提示', () => {
  const first = stepOnce(createTutorialState(0), [receive()], 0);
  const stalled = stepOnce(first.state, [], TUTORIAL_STALL_TICKS); // 第二步被放行
  const rows = tutorialRows(stalled.state, { events: [], playerId: PID, myTeam: TEAM });
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map((r) => r.phase),
    ['done', 'passed', 'current', 'todo', 'todo', 'todo']);
  assert.equal(rows[0].achieved, true);
  assert.equal(rows[1].achieved, false, '被放行的那一步不得標成完成');
  const cur = rows.find((r) => r.phase === 'current');
  assert.ok(cur.hints?.length, '★核心★ 當前步要帶得出「怎麼做」——泡泡 5 秒就沒了');
  assert.equal(cur.label, DRILL_DEFS[cur.id].label, '★台詞是規格★ HUD 的字與定義表同源');
  for (const r of rows) assert.equal(r.target, DRILL_DEFS[r.id].target);
});

test('tutorialSettle：完成數與 log 同源，且**不得**帶 unlockControl（教學局零獎勵）', () => {
  let st = createTutorialState(0);
  const ev = [];
  for (let i = 0; i < 4; i += 1) { // 前四步做到，後兩步放行
    ev.push(...STEP_EVENTS[i]());
    st = stepOnce(st, ev, 0, STEP_OBS[i]).state;
  }
  st = stepOnce(st, ev, TUTORIAL_STALL_TICKS).state;
  st = stepOnce(st, ev, TUTORIAL_STALL_TICKS * 2).state;
  const settled = tutorialSettle(st);
  assert.equal(settled.total, 6);
  assert.equal(settled.completedCount, 4);
  assert.equal(settled.unlockControl, undefined,
    '★核心★ unlockControl 的語意是「集訓控球格開放」——教學局沒有那回事，給了就是憑空發獎勵');
  // ★反向對照★ 屆間紅白賽的結算器**有**這個欄位（證明上面那條不是恆真）
  const practice = settlePractice({
    events: tipKill(), playerId: PID, myTeam: TEAM, drills: [DRILL_DEFS.tip],
  });
  assert.equal(practice.unlockControl, true);
});

test('未開始就結算（中途離開）：六列都在、完成 0（不得吐出半殘的清單）', () => {
  const settled = tutorialSettle(createTutorialState(0));
  assert.equal(settled.results.length, 6);
  assert.equal(settled.completedCount, 0);
  assert.deepEqual(settled.results.map((r) => r.id), TUTORIAL_DRILL_IDS);
});

// ════════════════════════════════════════════════════════════
// 四、文案守衛（台詞是規格）
// ════════════════════════════════════════════════════════════

test('每一步都喊得出話，而且那句話含這一步的 label', () => {
  for (const id of TUTORIAL_DRILL_IDS) {
    const def = DRILL_DEFS[id];
    assert.ok(def.hints?.length, `${id} 沒有操作提示——教練喊了目標卻沒說怎麼做`);
    const line = tutorialCoachLine(def);
    assert.ok(line.includes(def.label), `${id} 的喊話沒有含 label：${line}`);
    assert.ok(line.includes(def.hints[0]), `${id} 的喊話沒有帶上操作提示：${line}`);
  }
});

test('認不得的科目喊不出話（不得靠呼叫端自帶的字繞過定義表）', () => {
  assert.equal(tutorialCoachLine({ id: 'nope', label: '亂編的', hints: ['亂編的'] }), '');
  assert.equal(tutorialCoachLine(null), '');
});

test('★文案守衛★ 魚躍是自動的：提到它的句子必須說「自動」、不得指向任何鈕', () => {
  const lines = TUTORIAL_DRILL_IDS.flatMap((id) => [
    ...(DRILL_DEFS[id].hints ?? []), DRILL_DEFS[id].label, tutorialCoachLine(DRILL_DEFS[id]),
  ]);
  assert.ok(lines.some((t) => t.includes('魚躍')),
    '★前提★ 教學局至少要有一句提到魚躍，否則這條守衛守的是空氣');
  for (const t of lines) {
    assert.deepEqual(hintViolations(t), [], `文案說謊：${t}`);
  }
});

test('★反向對照★ 守衛真的攔得下壞句子（否則上面那條全綠等於沒驗）', () => {
  assert.ok(hintViolations('搆不到的時候按魚躍鈕撲救').length >= 1);
  assert.ok(hintViolations('魚躍要自己找那顆鈕按').includes('提到魚躍卻指向某顆鈕（魚躍沒有鈕）'));
  assert.ok(hintViolations('魚躍要抓時機').includes('提到魚躍卻沒說它是自動的'));
  // ★ 2026-08-13 更正 ★ 這裡原本斷言「攔網用 K 鍵或攔網鈕一點就跳」是合法句，
  // 理由寫「攔網真的有鈕」——**那個前提是錯的**：`ui/actionButtons.js:34` 的攔網鈕
  // 只在 `!simpleMode` 建立（`app/matchStage.js:68`），而教學局恆為 simpleMode。
  // 真人試玩就是被這類句子誤導的。改成正例＝現在真正做得到的操作。
  // （這是**加嚴**不是降標：同一句話從「放行」變成「攔下」。）
  assert.ok(hintViolations('攔網用 K 鍵或攔網鈕一點就跳').length >= 1,
    'classic 專屬的「攔網鈕」必須被攔下');
  assert.deepEqual(hintViolations('貼網卡到位就會自己起跳（電腦按 K）'), [],
    'simpleMode 真的做得到的操作不得被誤殺');
});

test('★文案守衛★ classic 專屬詞彙：教學局所有台詞都不得出現（真人試玩抓到的那批）', () => {
  const lines = TUTORIAL_DRILL_IDS.flatMap((id) => [
    ...(DRILL_DEFS[id].hints ?? []), DRILL_DEFS[id].label, tutorialCoachLine(DRILL_DEFS[id]),
  ]);
  for (const t of lines) {
    for (const term of CLASSIC_ONLY_TERMS) {
      assert.ok(!t.includes(term), `台詞出現 classic 專屬詞「${term}」：${t}`);
    }
  }
});

test('★反向對照★ 那批真人抓到的原句，現在會被守衛攔下（證明守衛守得到東西）', () => {
  // 這五句是 2026-08-13 之前實際上線的原文，逐句取自當時的 DRILL_DEFS。
  // 若哪天有人把它們搬回去，這條會紅。
  const shipped = [
    '球到手邊、正在往下掉的那一刻放開右邊大鈕——那是 Perfect 一傳',
    '一樣是按住蓄力、拖曳瞄準、放開——蓄力別壓到底，過頭球會飄掉',
    'K 鍵或攔網鈕一點就跳，不用蓄力；手機版站到位會自動起跳',
    '再按住右邊大鈕蓄力、放開出手——蓄力有甜蜜區，壓到底反而會飄',
    '按住蓄力、拖曳瞄準、放開出手。鈕面的字會隨情境變成發球／扣球／舉球／墊球。',
  ];
  for (const t of shipped) {
    assert.ok(hintViolations(t).length >= 1, `這句上線過而且是錯的，守衛卻放行：${t}`);
  }
});

test('賽末評語：三段門檻與 completedCount 同源，且不得承諾任何獎勵', () => {
  const verdicts = [0, 3, 6].map((n) => tutorialVerdictLine({ completedCount: n, total: 6 }));
  assert.equal(new Set(verdicts).size, 3, '三段要真的分得出來');
  for (const v of verdicts) {
    assert.doesNotMatch(v, /集訓|控球|成長點|屬性特訓/, '教學局零獎勵——評語不得暗示有');
  }
});

// ════════════════════════════════════════════════════════════
// 五、matchLoop 接線（跑正式的 updateTutorial／endTutorialSet）
// ════════════════════════════════════════════════════════════

function loopState(events) {
  const said = [];
  const hud = [];
  return {
    said,
    hud,
    s: {
      playerId: PID,
      tutorial: createTutorialState(0),
      tutorialGreeted: false,
      tutorialEnded: false,
      tutorialNextLine: null,
      game: {
        players: { [PID]: { id: PID, teamId: TEAM } },
        // `actors` 是起跳攔網觀測的來源（matchLoop.observeTutorialBlockJump 讀
        // `blockStartTick` 的上升緣＝一次起跳；sim/game.js:592-604「一新窗＝一跳」）
        actors: { [PID]: { blockStartTick: -9999, x: 0, z: 0 } },
        events,
        tick: 0,
        phase: 'rally',
      },
      stage: {
        practiceHud: { update: (rows, head) => hud.push({ rows, head }) },
        commentary: { coach: (text) => said.push(text) },
      },
    },
  };
}

test('★接線★ updateTutorial：開場先喊第一步、做到就喊下一步、HUD 每次跟著更新', () => {
  const ev = [];
  const { s, said, hud } = loopState(ev);
  assert.equal(updateTutorial(s, 0), false);
  assert.ok(said[0].includes(DRILL_DEFS['tut-receive'].label), `開場沒喊第一步：${said[0]}`);
  assert.equal(hud.at(-1).rows.find((r) => r.phase === 'current').id, 'tut-receive');

  ev.push(receive());
  assert.equal(updateTutorial(s, 100), false);
  assert.ok(said.at(-1).includes(DRILL_DEFS['tut-handle'].label),
    `★核心★ 做到第一步之後要喊第二步：${said.at(-1)}`);
  assert.equal(s.tutorial.index, 1);
  assert.equal(hud.at(-1).rows.find((r) => r.phase === 'current').id, 'tut-handle');
});

test('★接線★ updateTutorial：六步走完回 true（＝提前收局的訊號），且只回一次', () => {
  const ev = [];
  const { s } = loopState(ev);
  let fired = 0;
  for (let i = 0; i < STEP_EVENTS.length; i += 1) {
    ev.push(...STEP_EVENTS[i]());
    // 攔網那一步的判準是「起跳」不是事件——模擬 sim 開一次新攔網窗
    // （這正是玩家貼網卡到位時 simpleMode 自動起跳會做的事）
    if (STEP_OBS[i]?.blockJumps) s.game.actors[PID].blockStartTick = 42;
    if (updateTutorial(s, 0)) fired += 1;
  }
  assert.equal(fired, 1, '★核心★ 收局訊號要出現、而且只出現一次');
  assert.equal(s.tutorial.done, true);
  assert.equal(updateTutorial(s, 0), false, '走完之後不得再吐訊號');
});

test('★接線★ endTutorialSet：把 game.phase 推成 set_over（sim 據此凍結）、冪等', () => {
  const { s } = loopState([]);
  endTutorialSet(s);
  assert.equal(s.game.phase, 'set_over',
    '★核心★ 全專案「這場結束了」的單一事實源就是 game.phase——另立平行旗標會讓'
    + '記分板／換人鈕／離場攔阻繼續以為比賽還在進行');
  assert.equal(s.tutorialEnded, true);
  s.game.phase = 'rally'; // 冪等：第二次呼叫不得再動它（一次性轉場）
  endTutorialSet(s);
  assert.equal(s.game.phase, 'rally');
});

test('★反向★ 非教學局：updateTutorial 整段短路（紅白賽與正式賽零擾動）', () => {
  const { s, said, hud } = loopState([...tipKill()]);
  s.tutorial = null;
  assert.equal(updateTutorial(s, 0), false);
  refreshTutorialHud(s);
  assert.deepEqual(said, []);
  assert.deepEqual(hud, []);
});

// ════════════════════════════════════════════════════════════
// 六、掛點：創角後、group-1 前的邀請卡（假 DOM 真的按那兩顆鈕）
// ════════════════════════════════════════════════════════════

test('tutorialInviteDue：第一屆＋零戰績＋沒邀請過才成立', () => {
  const fresh = { results: [], events: [] };
  assert.equal(tutorialInviteDue(fresh, 1), true);
  assert.equal(tutorialInviteDue(fresh, 2), false, '第二屆不再邀請（那是紅白賽的地盤）');
  assert.equal(tutorialInviteDue({ results: [{ matchId: 'group-1' }], events: [] }, 1), false,
    '已經打過正式賽＝這張卡的時機過了');
  assert.equal(tutorialInviteDue({ results: [], events: [TUTORIAL_INVITE_EVENT_ID] }, 1), false,
    '★核心★ 邀請只有一次');
  assert.equal(tutorialInviteDue(null, 1), false);
});

function fakeDom() {
  const make = (tag = 'div') => ({
    tag,
    style: { cssText: '' },
    textContent: '',
    value: '',
    dataset: {},
    children: [],
    handlers: {},
    disabled: false,
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    remove() { this.parent?.removeChild(this); },
    addEventListener(ev, fn) { (this.handlers[ev] ||= []).push(fn); },
    removeEventListener(ev, fn) {
      this.handlers[ev] = (this.handlers[ev] ?? []).filter((f) => f !== fn);
    },
    // 債清批 2026-08-26：照真實 DOM 語意帶參數（原版丟參數＝replaceChildren(card) 內容憑空消失）
    replaceChildren(...nodes) { this.children = []; for (const n of nodes) this.appendChild(n); },
    setAttribute() {},
    getAttribute() { return null; },
    focus() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: 100, height: 100, bottom: 0, right: 0 };
    },
  });
  globalThis.document = {
    createElement: (t) => make(t),
    createTextNode: (t) => ({ textContent: t }),
    body: make('body'),
    head: make('head'),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = {
    innerWidth: 400,
    innerHeight: 700,
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 0; };
}
const tap = (node) => {
  for (const fn of [...(node.handlers?.pointerdown ?? [])]) fn({ stopPropagation() {} });
};
const walk = (node, out = []) => {
  out.push(node);
  for (const c of node.children ?? []) walk(c, out);
  return out;
};
const findByText = (root, re) => walk(root).find((n) => re.test(n.textContent ?? ''));
const allText = (root) => walk(root).map((n) => n.textContent ?? '').join('｜');
const settle = () => new Promise((r) => { setTimeout(r, 0); });

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 剛創完角的存檔：第一屆、零戰績、零事件（＝創角鏈末端 renderCareer() 的那一刻）
async function freshSave() {
  const { createCareerStore } = await import('../src/career/careerStore.js');
  const { createCareer, createCareerPlayer } = await import('../src/career/careerState.js');
  const { ensureStarterRoster } = await import('../src/career/roster.js');
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 4242, playerName: '小夢' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  ensureStarterRoster(store);
  return { storage, store };
}

// 開生涯畫面，回傳 { overlay, practiceArgs, store }
async function openCareer(storage, { withPractice = true } = {}) {
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const { createCareerStore } = await import('../src/career/careerStore.js');
  const store = createCareerStore(storage);
  const rec = { practiceArgs: null, practiceCalls: 0 };
  const screen = createCareerScreen(store, {
    primeSlot: () => {},
    onQuick: () => {},
    onPlay: () => {},
    onPractice: withPractice
      ? (args) => { rec.practiceCalls += 1; rec.practiceArgs = args; }
      : null,
  });
  screen.show('career');
  await settle();
  return { overlay: document.body.children.at(-1), rec, store };
}

test('★接線★ 創角完成進生涯畫面 ⇒ 隊內測試邀請卡自己出現，兩顆鈕都在', async () => {
  const { storage } = await freshSave();
  const { overlay } = await openCareer(storage);
  const text = allText(overlay);
  assert.match(text, /隊內測試/, '★核心★ 創角完成後必須看得到這張卡');
  assert.match(text, /入隊第一天/, '教練那句敘事要在');
  assert.ok(findByText(overlay, /▶ 開始/), '要有「▶ 開始」鈕');
  assert.ok(findByText(overlay, /我打過了，跳過/), '★核心★ 可跳過（二週目／老玩家）');
  assert.doesNotMatch(text, /成長點|集訓|控球/, '教學局零獎勵——卡上不得暗示有');
});

test('★接線★ 按「▶ 開始」⇒ 交回 main.js 開教學局（tutorial 旗標＋六步科目）', async () => {
  const { storage } = await freshSave();
  const { overlay, rec, store } = await openCareer(storage);
  tap(findByText(overlay, /▶ 開始/));
  await settle();
  assert.equal(rec.practiceCalls, 1, '★核心★ 按下去必須真的開比賽');
  assert.equal(rec.practiceArgs.tutorial, true, '★核心★ 沒帶 tutorial 旗標＝開成一般紅白賽');
  assert.equal(rec.practiceArgs.seasonIndex, 1);
  assert.ok(rec.practiceArgs.player, '要帶著主角過去');
  assert.deepEqual(rec.practiceArgs.drills.map((d) => d.id), TUTORIAL_DRILL_IDS);
  assert.deepEqual(tutorialDrills().map((d) => d.id), TUTORIAL_DRILL_IDS, '科目來源同一支函式');
  // 旗標與那個決定同一次落檔——打到一半殺 app 重開才不會再邀請一次
  assert.ok(store.loadCareer().events.includes(TUTORIAL_INVITE_EVENT_ID),
    '★核心★ 按下去的當下就要入帳，不是等打完');
  assert.deepEqual(store.loadPractice(),
    { seasonIndex: 0, completed: 0, total: 0, unlockControl: false },
    '開打時不得先寫任何成績');
});

test('★接線★ 按「跳過」⇒ 旗標落檔、不開比賽、直接進生涯畫面（group-1 打得到）', async () => {
  const { storage } = await freshSave();
  const { overlay, rec, store } = await openCareer(storage);
  tap(findByText(overlay, /我打過了，跳過/));
  await settle();
  assert.equal(rec.practiceCalls, 0, '跳過就是不打');
  assert.ok(store.loadCareer().events.includes(TUTORIAL_INVITE_EVENT_ID));
  // 跳過之後畫面上要真的走到生涯視圖（有第一場的出戰鈕）
  assert.ok(findByText(document.body, /▶ 出戰/), '★核心★ 跳過之後 group-1 要按得到');
});

for (const [label, act] of [['開始', /▶ 開始/], ['跳過', /我打過了，跳過/]]) {
  test(`★接線★ ${label} 之後重開生涯畫面：邀請卡不再出現（只出現一次）`, async () => {
    const { storage } = await freshSave();
    const first = await openCareer(storage);
    tap(findByText(first.overlay, act));
    await settle();
    const again = await openCareer(storage);
    assert.doesNotMatch(allText(document.body), /隊內測試/,
      `★核心★ ${label} 之後不得再邀請一次`);
    assert.equal(again.rec.practiceCalls, 0);
    assert.ok(findByText(document.body, /▶ 出戰/), 'group-1 要照常打得到');
  });
}

test('★反向對照★ 沒按過任何鈕就重開 ⇒ 卡片一定會再出現（證明上面那條驗得到東西）', async () => {
  const { storage } = await freshSave();
  await openCareer(storage);
  const again = await openCareer(storage);
  assert.match(allText(again.overlay), /隊內測試/,
    '中斷（創角完馬上關掉）要還接得回來——旗標只在按了鈕之後才落');
});

// ════════════════════════════════════════════════════════════
// 七、旗標往下游的傳遞（建隊層 → 設定層）
// ════════════════════════════════════════════════════════════
// ★ 為什麼要驗這一段 ★ 卡片按下去只是起點：旗標要一路傳到 `config.practice.tutorial`，
// 沿路任何一段掉了，教學局就會開成一場**普通的紅白賽**（六步同時開放、打滿 25 分、
// 而且會把成績寫進 `save.practice` 憑空發集訓獎勵）——畫面上完全看不出來。

test('★接線★ practiceMatchSetup：tutorial 旗標隨附在 practice 包裡（建隊本身零差別）', async () => {
  const { practiceMatchSetup } = await import('../src/career/practiceMatch.js');
  const { createCareerPlayer } = await import('../src/career/careerState.js');
  const { buildStarterMembers } = await import('../src/career/roster.js');
  const args = {
    player: createCareerPlayer('小夢', { seed: 7 }),
    members: buildStarterMembers(),
    drills: tutorialDrills(),
    seasonIndex: 1,
    seed: 11,
  };
  const tut = practiceMatchSetup({ ...args, tutorial: true });
  const plain = practiceMatchSetup(args);
  assert.equal(tut.practice.tutorial, true);
  assert.equal(plain.practice.tutorial, false, '★反向對照★ 沒帶旗標時不得自己變成教學局');
  // 旗標只是隨附資料：同一份科目清單建出來的兩隊必須逐值相同（不得偷偷改建隊）
  assert.deepEqual(
    tut.teams.A.map((p) => [p.id, p.trust.fromSetter]),
    plain.teams.A.map((p) => [p.id, p.trust.fromSetter]),
  );
  assert.deepEqual(tut.aiProfiles, plain.aiProfiles);
  assert.equal(tut.comboScale, 0, '第 1 屆＝組合攻擊未開（教學局不是特例場）');
});

test('★接線★ resolveMatchConfig：careerCtx.practice.tutorial 傳到 config.practice.tutorial', async () => {
  const { resolveMatchConfig } = await import('../src/app/matchConfig.js');
  const { createCareer, createCareerPlayer } = await import('../src/career/careerState.js');
  const { createCareerStore } = await import('../src/career/careerStore.js');
  const { ensureStarterRoster } = await import('../src/career/roster.js');
  const { practiceMatchEntry } = await import('../src/career/practiceMatch.js');
  const store = createCareerStore(fakeStorage());
  const career = createCareer({ seed: 4242, playerName: '小夢' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  const roster = ensureStarterRoster(store);
  const build = (tutorial) => resolveMatchConfig({
    params: new URLSearchParams(''),
    careerCtx: {
      store,
      career,
      player: store.loadPlayer(),
      roster,
      lineup: store.loadLineup(),
      matchEntry: practiceMatchEntry(1),
      seasonIndex: 1,
      practice: { drills: tutorialDrills(), seasonIndex: 1, tutorial },
    },
    randomSeed: 1,
  });
  assert.equal(build(true).practice.tutorial, true, '★核心★ 掉了就會開成一般紅白賽');
  assert.equal(build(false).practice.tutorial, false, '★反向對照★');
});

test('★反向★ 沒接 onPractice ⇒ 整張卡不畫（不畫按不下去的鈕）', async () => {
  const { storage } = await freshSave();
  const { overlay } = await openCareer(storage, { withPractice: false });
  assert.doesNotMatch(allText(overlay), /隊內測試/);
  assert.ok(findByText(document.body, /▶ 出戰/), '沒有入口時直接進生涯畫面');
});
