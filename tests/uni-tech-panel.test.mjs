// 大學卷 批 7 — 兩招新技術的玩家端路徑（壓手攔網／追發）
// 驗收＝`docs/kickoffs/acceptance-uni-batch7.md`：B7-1／B7-2／B7-3／B7-4／B7-5／B7-6
//
// ★ 這一檔為什麼非得「真的按下去」★
// 該檔「鑑別力要求」點名 B7-2／B7-3／B7-5 是最容易「看起來有、其實沒有」的三條，
// 因為它們的紅法在畫面上長得一模一樣：
//   · press 沒送出去 → 被 `game.js:596` 的 `?? 'vertical'` 靜默吸收，畫面照跳攔網
//   · 三個追發目標同一座標 → 就是「球都往那邊飛」，看起來很合理
// 所以每一條都按到底，並且**分三段各自走真實程式碼**：
//   段 A：面板 item → applyMbChoice → 真 controls（驗 blockCall 與武裝成對發生）
//   段 B：真 controls 的 collect → intent.hand（驗武裝真的變成 intent 上的欄位）
//   段 C：帶 hand 的 intent → 真 sim → actor.blockHand／BLOCK_TOUCH.pressed
// 三段接起來就是玩家實際走的那條路。★沒有任何一段用替身取代待驗行為★——
// 替身只有 window/DOM/rig（事件註冊與視線），它們不碰 intent 的任何欄位。

import test from 'node:test';
import assert from 'node:assert/strict';

import { TECH_DEFS } from '../src/career/growth.js';
import { createCareerPlayer, normalizeCareerPlayer } from '../src/career/careerState.js';
import { resolveTechGates } from '../src/app/matchConfig.js';
import {
  mbPanelItems, applyMbChoice,
  servePanelItems, applyServeChoice,
  chasePanelItems, applyChaseChoice,
} from '../src/app/matchLoop.js';
import { createMatchControls } from '../src/input/matchControls.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';
import { serverId } from '../src/sim/match.js';
import { isBackRow, rotateLineup } from '../src/sim/rotation.js';

// ════════════════════════════════════════════════════════════
// 宿主替身：createMatchControls 綁 window/DOM 事件，node 沒有 window
// ════════════════════════════════════════════════════════════
// ★這是本檔唯一的替身，而且刻意只蓋「事件註冊」與「視線 rig」★
// 它不產生、不改寫、也不讀取 intent 的任何欄位——決定這一批成敗的那一段
// （武裝 → intent.hand → sim 定格）整條都是真的程式碼跑出來的。
function withControls(playerId, fn, simpleMode = true) {
  const prev = Object.prototype.hasOwnProperty.call(globalThis, 'window')
    ? globalThis.window : undefined;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const domElement = { addEventListener() {}, removeEventListener() {} };
  const rig = {
    setLook() {}, resetLook() {}, getMode: () => 'third', gazePoint: () => null,
  };
  try {
    return fn(createMatchControls(domElement, null, playerId, rig, simpleMode));
  } finally {
    if (prev === undefined) delete globalThis.window; else globalThis.window = prev;
  }
}

// 假的 matchLoop state：applyMbChoice／applyServeChoice 只吃這幾個欄位。
function fakeState(game, controls, controlledId, extra = {}) {
  return {
    game,
    aiState: {},
    stage: { controls },
    controlledId,
    servedThisTurn: false,
    chaseExpanded: false,
    ...extra,
  };
}

// ---- 擦頂治具（抄 tests/block-hand-tool.test.mjs 的 topBlockRig 幾何）----
// press 只在 zone==='top' 才會壓球，所以要把球逼進擦頂窄條。
// ★差別★ 那一檔自己捏 intent；這裡的 intent 一律由**真 controls** 產出。
function topRigGame(seed = 42) {
  const g = createGame({ seed });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'spike', possession: 'B', touches: 3, lastTouchTeam: 'B', lastToucherId: 'B2',
  });
  const b = g.ball;
  b.x = 0; b.y = 2.75; b.z = -0.35; b.vx = 0; b.vy = -1.5; b.vz = 9;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.actors.A3.x = 0; g.actors.A3.z = 0.5;
  return g;
}

// 用真 controls 產出的 intent 把治具跑到攔網接觸為止。
function runBlockWithControls(g, controls) {
  const step = () => {
    const intents = controls.collect(g, { landingTeam: 'A' });
    return stepGame(g, intents);
  };
  step();
  for (let i = 0; i < 40 && g.phase === 'rally'; i += 1) {
    if (g.tick === 2) {
      g.ball.z = -0.01;
      g.ball.px = g.ball.x; g.ball.py = g.ball.y; g.ball.pz = g.ball.z;
      g.ball.y = 2.75;
    }
    const evs = step();
    const bt = evs.find((e) => e.type === 'BLOCK_TOUCH');
    if (bt) return bt;
    if (g.ball.z > 1.5 || g.ball.vz < 0) return null;
  }
  return null;
}

// ════════════════════════════════════════════════════════════
// B7-1 兩招進技術樹且預設未解鎖
// ════════════════════════════════════════════════════════════
// 08-26 職業章批 4a：9→10（新增「餵線」）。這條斷言不是本批驗收條件，
// 是大學卷批 7 遺留的長度硬編碼——新技術正常成長必然要更新它，同 growth.test.mjs
// 的先例（B7-10 使用者已就「加新技術要動這條斷言」追認過）。
// 08-26 職業章批 4b：10→11（新增「改叫」）——同一先例再走一次。
// 08-26 職業章批 4c：11→12（新增「二段時間差」）——同一先例再走一次。
test('B7-1 TECH_DEFS 恰 12 條（含批 4a 餵線／批 4b 改叫／批 4c 二段時間差）、key 唯一、每條有 name 與 desc', () => {
  assert.equal(TECH_DEFS.length, 12);
  const keys = TECH_DEFS.map((d) => d.key);
  assert.equal(new Set(keys).size, 12, 'key 不得重複');
  assert.ok(keys.includes('pressBlock') && keys.includes('chaseServe'));
  for (const d of TECH_DEFS) {
    assert.ok(typeof d.name === 'string' && d.name.length > 0, `${d.key} 少了 name`);
    assert.ok(typeof d.desc === 'string' && d.desc.length > 0, `${d.key} 少了 desc`);
  }
});

test('B7-1 新建生涯：兩招都是 0（不是 undefined、也不是 1）', () => {
  // ★走新建生涯的必經路徑★ createCareerPlayer 的技術初值表刻意不動——
  // tests/call-unlock.test.mjs:146 把「techniques 恰有這些鍵」寫成了不變量，
  // 動它會撞那條既有測試（批 5 教訓 4：正解是換一條不衝突的路，不是改任何一邊）。
  // 而補正本來就跑得到：careerTeams（careerState.js:520）建隊時、careerScreen:1705
  // 顯示前都會呼叫，玩家拿到手的 player 一定經過這裡。
  const p = normalizeCareerPlayer(createCareerPlayer('小夢'));
  assert.equal(p.techniques.pressBlock, 0);
  assert.equal(p.techniques.chaseServe, 0);
});

test('★B7-1 反向對照★ 高中舊存檔（根本沒有這兩欄）載入後逐值＝0，不是 undefined', () => {
  // 模擬升版前的存檔：techniques 只有當時那幾把
  const old = {
    ...createCareerPlayer('小夢'),
    techniques: { tip: 1, dive: 1, pipe: 0, floatServe: 1, feint: 0, jumpServe: 0, v: 2 },
  };
  const p = normalizeCareerPlayer(old);
  assert.equal(p.techniques.pressBlock, 0, 'undefined 在技術列表顯示層是「這招不存在」，與「還沒學會」不同');
  assert.equal(p.techniques.chaseServe, 0);
  assert.notEqual(p.techniques.pressBlock, undefined);
  assert.equal(p.techniques.tip, 1, '既有的技術不得被這條遷移洗掉');
});

// ════════════════════════════════════════════════════════════
// B7-4 未學會不得使用（gate 在行為層＝選項根本不存在）
// ════════════════════════════════════════════════════════════
function gatesFor(tech) {
  // attributes 是 blockReadTier（readTier 檔位）要讀的，與本批無關但不給會炸
  const game = { players: { A3: { techniques: tech, attributes: { reaction: 50 } } }, comboScale: 1 };
  return resolveTechGates(game, 'A3', true);
}

test('B7-4 未受教：MB 面板沒有壓手選項、發球面板沒有追發入口', () => {
  const g0 = gatesFor({ pressBlock: 0, chaseServe: 0 });
  assert.equal(g0.canPressBlock, false);
  assert.equal(g0.canChaseServe, false);
  const mb = mbPanelItems(g0);
  assert.equal(mb.length, 2, '未受教時只該有封直線/封斜線兩項');
  assert.equal(mb.filter((i) => i.press).length, 0);
  const zs = [{ key: 'dm', label: '深中', aim: { x: 0, z: -8 } }];
  assert.equal(servePanelItems(g0, zs).filter((i) => i.chase).length, 0);
});

test('★B7-4 反向對照★ 解鎖前後同一情境，選項數不同', () => {
  const locked = gatesFor({ pressBlock: 0, chaseServe: 0 });
  const learned = gatesFor({ pressBlock: 1, chaseServe: 1 });
  assert.equal(mbPanelItems(locked).length, 2);
  assert.equal(mbPanelItems(learned).length, 4);
  const zs = [{ key: 'dm', label: '深中', aim: { x: 0, z: -8 } }];
  assert.equal(servePanelItems(locked, zs).length + 1, servePanelItems(learned, zs).length);
});

test('B7-4 快速比賽（非生涯）不受閘門影響：兩招恆開', () => {
  const game = { players: { A3: {} }, comboScale: 1 };
  const q = resolveTechGates(game, 'A3', false);
  assert.equal(q.canPressBlock, true);
  assert.equal(q.canChaseServe, true);
});

// ════════════════════════════════════════════════════════════
// B7-3 壓手有代價：press 必與押方向綁在同一個 item
// ════════════════════════════════════════════════════════════
test('B7-3 面板上沒有「只壓手、不押方向」的選項', () => {
  const items = mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }));
  const pressItems = items.filter((i) => i.press);
  assert.equal(pressItems.length, 2, '壓手恰兩項：封直線版與封斜線版');
  for (const it of pressItems) {
    assert.ok(it.line === 'line' || it.line === 'cross',
      `${it.key} 帶了 press 卻沒帶 line ⇒ 拿得到增益卻不必押方向`);
  }
  assert.equal(items.filter((i) => i.press && !i.line).length, 0);
});

test('★B7-3 三態逐值不同★ 不開面板／只封線／壓手封線，blockCall 與武裝各自不同', () => {
  const g = topRigGame();
  withControls('A3', (controls) => {
    // ① 不開面板：blockCall 沒被寫、也沒武裝
    const sNone = fakeState(g, controls, 'A3');
    assert.equal(sNone.aiState.blockCall, undefined);
    assert.equal(controls.isPressArmed(), false);

    // ② 只封直線（不壓手）：blockCall 有了，但沒武裝
    const sLine = fakeState(g, controls, 'A3');
    const items = mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }));
    applyMbChoice(sLine, items.find((i) => i.key === 'block-line'));
    assert.deepEqual(sLine.aiState.blockCall, { team: 'A', line: 'line' });
    assert.equal(controls.isPressArmed(), false, '沒按壓手卻武裝了＝白送 press');
    assert.equal(sLine.mbCommit.pressed, false);

    // ③ 壓手封直線：blockCall 與武裝**同時**成立
    const sPress = fakeState(g, controls, 'A3');
    applyMbChoice(sPress, items.find((i) => i.key === 'press-line'));
    assert.deepEqual(sPress.aiState.blockCall, { team: 'A', line: 'line' },
      '★紅法二★ 選了壓手卻沒寫 blockCall ⇒ 代價落空，玩家白拿 press');
    assert.equal(controls.isPressArmed(), true);
    assert.equal(sPress.mbCommit.pressed, true);
  });
});

// ════════════════════════════════════════════════════════════
// B7-2 壓手真的送到 sim（不是死按鈕）——段 B ＋ 段 C
// ════════════════════════════════════════════════════════════
test('★B7-2 段 B★ 按下壓手後，真 controls 產出的 intent 帶 hand=press', () => {
  const g = topRigGame();
  withControls('A3', (controls) => {
    const s = fakeState(g, controls, 'A3');
    const items = mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }));
    applyMbChoice(s, items.find((i) => i.key === 'press-line'));
    controls.chooseMbTiming(true); // 投遞一次攔網（走 blockTap 的緩衝路徑）
    const [it] = controls.collect(g, { landingTeam: 'A' });
    assert.equal(it.action, 'block');
    assert.equal(it.hand, 'press', '★這正是 game.js:596 的 `?? vertical` 會靜默吃掉的那一格★');
  });
});

test('★B7-2 反向對照★ 沒按壓手（走一般攔網）＝intent 不帶 hand ⇒ sim 讀成 vertical', () => {
  const g = topRigGame();
  withControls('A3', (controls) => {
    const s = fakeState(g, controls, 'A3');
    const items = mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }));
    applyMbChoice(s, items.find((i) => i.key === 'block-line')); // 只封線
    controls.chooseMbTiming(true);
    const [it] = controls.collect(g, { landingTeam: 'A' });
    assert.equal(it.action, 'block');
    assert.equal(it.hand, undefined);
    // 真 sim 的解讀：沒有 hand ＝ vertical
    const g2 = topRigGame();
    stepGame(g2, [Object.assign(createIntent({ playerId: 'A3', tick: g2.tick, action: 'block' }))]);
    assert.equal(g2.actors.A3.blockHand, 'vertical');
  });
});

test('★B7-2 段 C★ 真 controls 的 intent 餵真 sim：攔網窗定格 press，且擦頂真的壓球', () => {
  const g = topRigGame();
  const bt = withControls('A3', (controls) => {
    const s = fakeState(g, controls, 'A3');
    const items = mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }));
    applyMbChoice(s, items.find((i) => i.key === 'press-line'));
    controls.chooseMbTiming(true);
    return runBlockWithControls(g, controls);
  });
  assert.equal(g.actors.A3.blockHand, 'press', '攔網窗開的那一刻沒有定格成 press');
  assert.ok(bt, '治具沒跑出 BLOCK_TOUCH（幾何走鐘，不是實作壞了——先修治具）');
  assert.equal(bt.zone, 'top');
  assert.equal(bt.pressed, true, 'zone=top＋blockHand=press 才會有的 pressed 旗標');
});

test('★B7-2 段 C 反向★ 同一顆球、同一站位，不壓手＝擦頂而非壓球', () => {
  const g = topRigGame();
  const bt = withControls('A3', (controls) => {
    const s = fakeState(g, controls, 'A3');
    const items = mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }));
    applyMbChoice(s, items.find((i) => i.key === 'block-line'));
    controls.chooseMbTiming(true);
    return runBlockWithControls(g, controls);
  });
  assert.equal(g.actors.A3.blockHand, 'vertical');
  assert.ok(bt, '對照組也要真的碰到球，否則兩組不可比');
  assert.notEqual(bt.pressed, true, '沒按壓手卻壓到球＝press 是白送的');
});

test('★B7-3 代價的另一面★ 武裝送出一次就清（sim 一窗一態，窗開時定格）', () => {
  const g = topRigGame();
  withControls('A3', (controls) => {
    const s = fakeState(g, controls, 'A3');
    const items = mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }));
    applyMbChoice(s, items.find((i) => i.key === 'press-cross'));
    assert.equal(controls.isPressArmed(), true);
    controls.chooseMbTiming(true);
    const [it] = controls.collect(g, { landingTeam: 'A' });
    assert.equal(it.hand, 'press');
    assert.equal(controls.isPressArmed(), false, '送出後還留著＝下一波沒按也會壓手');
  });
});

// ════════════════════════════════════════════════════════════
// B7-5／B7-6 追發
// ════════════════════════════════════════════════════════════
function serveGame(seed = 7) {
  const g = createGame({ seed });
  g.phase = 'serve';
  g.serveReadyTick = 0;
  return g;
}

test('B7-6 追發名單恰為對方當前輪轉的後排三人', () => {
  const g = serveGame();
  const me = serverId(g.match);
  withControls(me, (controls) => {
    const targets = controls.chaseServeTargets(g);
    const oppTeam = g.players[me].teamId === 'A' ? 'B' : 'A';
    const rot = g.match.rotations[oppTeam];
    assert.equal(targets.length, 3, '後排恰三人');
    for (const t of targets) {
      assert.ok(isBackRow(rot, t.pid), `${t.pid} 不在後排卻被列進追發名單`);
      assert.ok(typeof t.label === 'string' && t.label.length > 0, '名單要看得到名字');
    }
    assert.equal(new Set(targets.map((t) => t.pid)).size, 3, '不得重複列同一人');
  });
});

test('★B7-6 反向對照★ 對方輪轉推進後，名單跟著變（不是寫死三個名字）', () => {
  const g = serveGame();
  const me = serverId(g.match);
  withControls(me, (controls) => {
    const before = controls.chaseServeTargets(g).map((t) => t.pid);
    const oppTeam = g.players[me].teamId === 'A' ? 'B' : 'A';
    g.match.rotations[oppTeam] = rotateLineup(g.match.rotations[oppTeam]);
    const after = controls.chaseServeTargets(g).map((t) => t.pid);
    assert.notDeepEqual(after, before, '輪轉推進了名單卻一樣＝名單是寫死的');
  });
});

test('B7-5 三個追發目標的 aim 互不相同', () => {
  const g = serveGame();
  const me = serverId(g.match);
  withControls(me, (controls) => {
    const targets = controls.chaseServeTargets(g);
    const keyOf = (t) => `${t.aim.x.toFixed(4)},${t.aim.z.toFixed(4)}`;
    const uniq = new Set(targets.map(keyOf));
    assert.equal(uniq.size, 3,
      '★紅法★ 三個選項發到同一點＝追發形同虛設，畫面上完全看不出來');
  });
});

test('★B7-5 tap 到底★ 選了某個人，真 controls 產出的發球 intent 就瞄他的位置', () => {
  const g = serveGame();
  const me = serverId(g.match);
  withControls(me, (controls) => {
    const s = fakeState(g, controls, me);
    const targets = controls.chaseServeTargets(g);
    const items = chasePanelItems(targets);
    const pick = items.find((i) => i.target && i.target.pid === targets[1].pid);
    applyChaseChoice(s, pick);
    const [it] = controls.collect(g, null);
    assert.equal(it.action, 'serve');
    assert.ok(it.aim, '發球 intent 沒帶 aim');
    assert.ok(Math.abs(it.aim.x - targets[1].aim.x) < 1e-6
      && Math.abs(it.aim.z - targets[1].aim.z) < 1e-6,
    `瞄到的不是選中的人：aim=${JSON.stringify(it.aim)} 目標=${JSON.stringify(targets[1].aim)}`);
    assert.equal(s.servedThisTurn, true);
    assert.equal(s.chaseExpanded, false, '發完球第二層要收起來');
  });
});

test('★B7-5 反向對照★ 選不同的人 ⇒ 送出的 aim 逐值不同', () => {
  const aimOf = (idx) => {
    const g = serveGame();
    const me = serverId(g.match);
    return withControls(me, (controls) => {
      const s = fakeState(g, controls, me);
      const targets = controls.chaseServeTargets(g);
      applyChaseChoice(s, chasePanelItems(targets).find((i) => i.target === targets[idx]));
      const [it] = controls.collect(g, null);
      return it.aim;
    });
  };
  const a0 = aimOf(0); const a1 = aimOf(1); const a2 = aimOf(2);
  assert.notDeepEqual([a0.x, a0.z], [a1.x, a1.z]);
  assert.notDeepEqual([a1.x, a1.z], [a2.x, a2.z]);
  assert.notDeepEqual([a0.x, a0.z], [a2.x, a2.z]);
});

test('B7-5 追發入口本身不發球（只展開第二層）', () => {
  const g = serveGame();
  const me = serverId(g.match);
  withControls(me, (controls) => {
    const s = fakeState(g, controls, me);
    const zs = controls.serveZones(g);
    const items = servePanelItems(gatesFor({ pressBlock: 0, chaseServe: 1 }), zs);
    applyServeChoice(s, items.find((i) => i.chase));
    assert.equal(s.chaseExpanded, true);
    assert.equal(s.servedThisTurn, false, '按「追發」就發球出去＝玩家還沒選人球就飛了');
  });
});

test('B7-5 第二層的「返回」不發球、只收起來', () => {
  const g = serveGame();
  const me = serverId(g.match);
  withControls(me, (controls) => {
    const s = fakeState(g, controls, me, { chaseExpanded: true });
    const items = chasePanelItems(controls.chaseServeTargets(g));
    applyChaseChoice(s, items.find((i) => i.back));
    assert.equal(s.chaseExpanded, false);
    assert.equal(s.servedThisTurn, false);
  });
});

// ════════════════════════════════════════════════════════════
// 追發配飄跳發（08-27，驗收凍結＝acceptance-chase-style.md）
// ════════════════════════════════════════════════════════════
const chaseGatesAll = () => gatesFor({ chaseServe: 1, floatServe: 1, jumpServe: 1 });

test('追發×式 兩閘皆關：第二層與舊制逐項相同（三名＋返回，style 全 null）', () => {
  const g = serveGame();
  const me = serverId(g.match);
  withControls(me, (controls) => {
    const targets = controls.chaseServeTargets(g);
    const locked = chasePanelItems(targets, gatesFor({ chaseServe: 1 }));
    assert.equal(locked.length, 4, '未受教長出變體＝gate 沒做在行為層（B7-4 同則）');
    for (const it of locked) if (it.target) assert.equal(it.style, null);
    // 不帶 gates（既有呼叫端形狀）也必須是舊制
    assert.equal(chasePanelItems(targets).length, 4);
  });
});

test('追發×式 解鎖後：每個目標各多「飄·名」「跳·名」，逐目標 style/aim 成對', () => {
  const g = serveGame();
  const me = serverId(g.match);
  withControls(me, (controls) => {
    const targets = controls.chaseServeTargets(g);
    const items = chasePanelItems(targets, chaseGatesAll());
    assert.equal(items.filter((i) => i.style === 'float').length, 3);
    assert.equal(items.filter((i) => i.style === 'jump').length, 3);
    for (const t of targets) {
      const f = items.find((i) => i.style === 'float' && i.target === t);
      const j = items.find((i) => i.style === 'jump' && i.target === t);
      assert.ok(f && f.label.includes(t.label), '飄變體要看得出發給誰');
      assert.ok(j && j.label.includes(t.label), '跳變體要看得出發給誰');
    }
  });
});

test('★追發×式 tap 到底★ 飄追發 intent style=float 且瞄選中的人；跳追發 timing>1.1', () => {
  const me0 = serverId(serveGame().match);
  const intentOf = (pick) => {
    const g = serveGame();
    return withControls(me0, (controls) => {
      const s = fakeState(g, controls, me0);
      const targets = controls.chaseServeTargets(g);
      const items = chasePanelItems(targets, chaseGatesAll());
      applyChaseChoice(s, items.find((i) => pick(i, targets)));
      const [it] = controls.collect(g, null);
      return { it, target: targets[1] };
    });
  };
  const f = intentOf((i, ts) => i.style === 'float' && i.target === ts[1]);
  assert.equal(f.it.action, 'serve');
  assert.equal(f.it.style, 'float', '★紅法＝現行實作★ style 寫死 null，飄追發根本發不出飄球');
  assert.ok(Math.abs(f.it.aim.x - f.target.aim.x) < 1e-6
    && Math.abs(f.it.aim.z - f.target.aim.z) < 1e-6, '配了式就丟了人＝追發語意壞掉');
  const j = intentOf((i, ts) => i.style === 'jump' && i.target === ts[1]);
  assert.ok(j.it.timing > 1.1, '★紅法★ 跳追發 timing 沒過跳發門檻＝發的還是一般球');
  assert.ok(Math.abs(j.it.aim.x - j.target.aim.x) < 1e-6
    && Math.abs(j.it.aim.z - j.target.aim.z) < 1e-6);
});

test('追發×式 按原本名字鈕：style 仍 null、timing=1（既有行為逐值不變）', () => {
  const g = serveGame();
  const me = serverId(g.match);
  withControls(me, (controls) => {
    const s = fakeState(g, controls, me);
    const targets = controls.chaseServeTargets(g);
    const items = chasePanelItems(targets, chaseGatesAll());
    applyChaseChoice(s, items.find((i) => i.target === targets[0] && i.style === null));
    const [it] = controls.collect(g, null);
    assert.equal(it.style, null);
    assert.equal(it.timing, 1);
  });
});

test('B7-5 落點區照舊可用（追發沒有把原本四個區擠掉）', () => {
  const g = serveGame();
  const me = serverId(g.match);
  withControls(me, (controls) => {
    const zs = controls.serveZones(g);
    const items = servePanelItems(gatesFor({ pressBlock: 0, chaseServe: 1 }), zs);
    for (const k of ['dl', 'dm', 'dr', 'short']) {
      assert.ok(items.some((i) => i.key === k), `落點區 ${k} 不見了`);
    }
  });
});

// ════════════════════════════════════════════════════════════
// 對抗覆審 HIGH-1 回歸：壓手承諾的生命週期
// ════════════════════════════════════════════════════════════
// 覆審抓到的洩漏：`pressArmed` 原本只在「送出過 block intent」或「球死」時清，
// 而封線指令 `blockCall` 是在**球權翻回我方**時就清（matchLoop.js:1144-1147）。
// 兩者被註解宣稱「成對發生」，實際壽命卻不同 ⇒ 一球之內對手若舉球多次
// （我方起球→攻擊→對方防起→再舉），上一波沒用掉的 press 會殘留到下一波，
// 變成**沒按壓手也壓手、而且 blockCall 已經是 null**＝B7-3 紅法二「代價落空」。
// press 對非擦頂區完全沒有副作用（game.js:1287 以下不讀 blockHand）⇒ 殘留＝純增益。

test('★HIGH-1★ 這一波沒用掉的壓手，球權翻回我方時就要作廢', () => {
  const g = topRigGame();
  withControls('A3', (controls) => {
    const s = fakeState(g, controls, 'A3');
    const items = mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }));
    applyMbChoice(s, items.find((i) => i.key === 'press-line'));
    assert.equal(controls.isPressArmed(), true);
    // 這一波沒有產出 block intent（對手第三擊是輕吊／玩家退離網帶／落點不在我方），
    // 接著我方起球 ⇒ 球權翻回我方＝這一波的攔網機會已經過去
    g.rally.possession = 'A';
    controls.collect(g, null);
    assert.equal(controls.isPressArmed(), false,
      '★B7-3 紅法二★ 殘留到下一波＝沒按壓手也會壓手，玩家白拿 press');
  });
});

test('★HIGH-1 後果★ 殘留的壓手不得掛到下一波的攔網 intent 上', () => {
  const g = topRigGame();
  withControls('A3', (controls) => {
    const s = fakeState(g, controls, 'A3');
    const items = mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }));
    applyMbChoice(s, items.find((i) => i.key === 'press-line'));
    // 第一波沒攔到，球權翻回我方
    g.rally.possession = 'A';
    controls.collect(g, null);
    // 第二波：對手又舉球，玩家這次**只封線、沒按壓手**
    g.rally.possession = 'B';
    g.rally.touches = 2;
    applyMbChoice(s, items.find((i) => i.key === 'block-line'));
    controls.chooseMbTiming(true);
    const [it] = controls.collect(g, { landingTeam: 'A' });
    assert.equal(it.action, 'block');
    assert.equal(it.hand, undefined,
      '沒按壓手卻帶了 press ⇒ 上一波的承諾漏過來了');
  });
});

test('★HIGH-1 洩漏點二★ 主角被換下板凳，壓手承諾要清掉', () => {
  const g = topRigGame();
  withControls('A3', (controls) => {
    const s = fakeState(g, controls, 'A3');
    applyMbChoice(s, mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }))
      .find((i) => i.key === 'press-line'));
    assert.equal(controls.isPressArmed(), true);
    // 換下場：把 A3 從雙方名冊移除＝onCourt 為 false（collect 會走板凳早退分支）
    for (const t of ['A', 'B']) {
      g.match.rotations[t] = g.match.rotations[t].filter((pid) => pid !== 'A3');
    }
    controls.collect(g, null);
    assert.equal(controls.isPressArmed(), false,
      '板凳期間留著承諾＝回場後第一次攔網莫名壓手');
  });
});

test('★HIGH-1 洩漏點三★ 全隊輪控切換受控球員，壓手承諾不得跟著跑到別人身上', () => {
  const g = topRigGame();
  withControls('A3', (controls) => {
    const s = fakeState(g, controls, 'A3');
    applyMbChoice(s, mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }))
      .find((i) => i.key === 'press-cross'));
    assert.equal(controls.isPressArmed(), true);
    controls.setPlayerId('A2'); // matchLoop 的 syncControlled 在 rally 中會這樣切
    assert.equal(controls.isPressArmed(), false,
      'A3 承諾的壓手跟著控制權跑到 A2 身上＝玩家沒為這個人押過方向');
  });
});

// ════════════════════════════════════════════════════════════
// 對抗覆審 MEDIUM-1：production 走的是自動跳攔，不是手動窗
// ════════════════════════════════════════════════════════════
// 上面段 B／段 C 用 chooseMbTiming(true) 投遞攔網，那會走 blockTap→queuedAction→
// manualBlock=true，而 game.js:1231 是 `if (airT > AIR_TICKS && !actor.blockManual) continue;`
// ⇒ **手動窗豁免滯空閘、自動跳攔不豁免**，治具比 production 寬。
// production 的路徑是 applyMbChoice 只呼叫 chooseMbTiming(false)，block intent 由
// matchControls 的自動跳攔（simpleMode＋contextAction==='block'＋profile==='spike'
// ＋landingTeam===我方＋貼網）產生。這一段補上那條路。
test('★MEDIUM-1★ 不按任何攔網鍵：自動跳攔產出的 intent 也帶得到 press', () => {
  const g = topRigGame();
  withControls('A3', (controls) => {
    const s = fakeState(g, controls, 'A3');
    applyMbChoice(s, mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }))
      .find((i) => i.key === 'press-line'));
    // ★刻意不呼叫 chooseMbTiming(true)★——applyMbChoice 內部只送 (false)，
    // 起跳交給自動跳攔，這才是玩家實際走的路
    const [it] = controls.collect(g, { landingTeam: 'A' });
    assert.equal(it.action, 'block', '自動跳攔沒觸發＝這條路徑的前置在治具裡不成立');
    assert.equal(it.manual, undefined, '走到手動窗了＝測的還是比 production 寬的那條');
    assert.equal(it.hand, 'press');
  });
});

test('★MEDIUM-1 反向★ 自動跳攔路徑下不按壓手，intent 不帶 hand', () => {
  const g = topRigGame();
  withControls('A3', (controls) => {
    const s = fakeState(g, controls, 'A3');
    applyMbChoice(s, mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }))
      .find((i) => i.key === 'block-line'));
    const [it] = controls.collect(g, { landingTeam: 'A' });
    assert.equal(it.action, 'block');
    assert.equal(it.hand, undefined);
  });
});

// ── 第三輪對抗覆審：HIGH-1 的第四條洩漏路徑 ──────────────────
// 前三個洞（球死／球權翻我方／板凳／換受控者）補上之後，覆審實跑找到第四條：
// game.js:1198-1204 只有在**沒被攔到**時才寫 possession=toTeam，被攔到時
// possession 原封不動留在攻方 ⇒ 「隊友攔到球」這條路上「球死」與「球權翻我方」
// 兩個條件都不成立，承諾清不掉，下一波沒按壓手也會壓手。
// ★這是原 HIGH-1 的同一個危險效果換一條路活下來★——所以判準改成看
// lastTouchTeam（我方碰過球＝這一波攔網結束），不再列舉情境。
test('★HIGH-1 第四條路★ 隊友攔到球（球權不翻）時，壓手承諾也要作廢', () => {
  const g = topRigGame();
  withControls('A3', (controls) => {
    const s = fakeState(g, controls, 'A3');
    applyMbChoice(s, mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }))
      .find((i) => i.key === 'press-line'));
    assert.equal(controls.isPressArmed(), true);
    // 模擬隊友攔到之後的 rally 狀態：三個欄位照抄 game.js 攔到時實際寫入的值
    g.rally.lastTouchTeam = 'A';
    g.rally.lastToucherId = 'A2'; // 隊友，不是受控的 A3
    g.rally.touches = 0;
    g.rally.profile = 'arc';
    assert.equal(g.rally.possession, 'B', '前提：球權仍在攻方，否則測的不是第四條路');
    assert.equal(g.phase, 'rally', '前提：球還沒死，否則會被「球死」那條清掉');
    controls.collect(g, null);
    assert.equal(controls.isPressArmed(), false,
      '隊友攔到球之後承諾還活著 ⇒ 下一波沒按壓手也會壓手（HIGH-1 換一條路活）');
  });
});

test('★HIGH-1 第四條路 後果★ 隊友攔到之後的下一波，intent 不得帶 press', () => {
  const g = topRigGame();
  withControls('A3', (controls) => {
    const s = fakeState(g, controls, 'A3');
    const items = mbPanelItems(gatesFor({ pressBlock: 1, chaseServe: 0 }));
    applyMbChoice(s, items.find((i) => i.key === 'press-line'));
    // 隊友攔到（球權留在對方）
    g.rally.lastTouchTeam = 'A';
    g.rally.lastToucherId = 'A2';
    g.rally.touches = 0;
    g.rally.profile = 'arc';
    controls.collect(g, null);
    // 對方再組織一波，玩家這次只按「封直線」
    g.rally.lastTouchTeam = 'B';
    g.rally.touches = 2;
    g.rally.profile = 'spike';
    applyMbChoice(s, items.find((i) => i.key === 'block-line'));
    controls.chooseMbTiming(true);
    const [it] = controls.collect(g, { landingTeam: 'A' });
    assert.equal(it.action, 'block');
    assert.equal(it.hand, undefined, '上一波的壓手承諾漏過來了');
  });
});
