// 組合攻擊卷 段 E —— 輸入落點（玩家第一次能主動參與戰術）
//
// 本檔守的七件事（＝上位裁定書 §六.3 驗收＋裁定 E＋護欄）：
//   ① **同源**：玩家選定的套路，實際跑位與面板承諾的線一致
//   ② **回寫順序在 pickAttackPoint 之後、planCombination 之前**（靜態順序斷言）
//      ——「之後」才保得住 trust 分佈零漂移，「之前」才讓選擇成為組合的**輸入**
//      而不是事後回寫。兩邊都釘死，少釘一邊都會靜默失效。
//   ③ **非 S 的請求真的經 trust 權衡**：高信任採納、低信任被無視（固定 seed 重演）
//   ④ **兩種語意的回饋分得開**（S＝指令／非 S＝請求）——三條獨立通道
//   ⑤ **裁定 E**：湊不出套路當場回饋失敗，且**不是靜默降級**
//   ⑦ **乙路徑**：臨場改判真的重建 approach，且**已起跑者不得改線**
//   非恆真／非恆假：每一條閘都要有兩側樣本，否則等於沒有閘
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { localToWorld } from '../src/sim/rotation.js';
import {
  resolveCalledPlay, offeredCallTypes, firstFailedCheck, COMBO_TYPES,
  applyRouteKinds, CALL_OFFERS_FACTORY_OFF_TYPES,
} from '../src/sim/approach.js';
import { attackPointsOf } from '../src/sim/ai.js';
import { callFeedbackOf, CALL_MODES, callModeOf, callOptionsFor } from '../src/input/callPlay.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const stripComments = (src) => src
  .replace(/\r\n?/g, '\n')
  .split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n');
const aiSrc = () => readFileSync(join(SRC, 'sim', 'ai.js'), 'utf8');

// 凍結輸入的單一規劃點（範式抄 tools/combo-probe.mjs 的 trustSweep：
// 同一組輸入下只跑協調層一次，把「玩家叫了牌」以外的變因全部按住）
function planWith({ seed = 3, flightId = 1, calledPlay = null, rot = 0, trust = null } = {}) {
  const g = createGame({ seed });
  const base = g.match.rotations.A.slice();
  g.match.rotations.A = [...base.slice(rot), ...base.slice(0, rot)];
  if (trust) for (const [pid, v] of Object.entries(trust)) g.players[pid].trust.fromSetter = v;
  const ai = createAiState();
  ai.calledPlay = calledPlay;
  g.phase = 'rally';
  Object.assign(g.rally, {
    flightId, profile: 'arc', possession: 'A', touches: 1,
    lastTouchTeam: 'A', lastToucherId: null, touchLockTick: -1,
  });
  const w = localToWorld('A', 1.2, 1.2);
  const b = g.ball;
  b.x = w.x; b.y = 3.0; b.z = w.z; b.vx = 0; b.vy = 0.5; b.vz = 0;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  aiCollectIntents(g, ai);
  return { g, ai };
}

const routeOf = (ai, pid) => (ai.approach?.routes ?? []).find((r) => r.pid === pid) ?? null;
// 這一波誰跑哪條線（不叫牌的基準跑法）——叫牌對象要從這裡挑，才不是憑空指人
const runnerOf = (ai, kind) => (ai.approach?.routes ?? []).find((r) => r.kind === kind)?.pid ?? null;

// ---------------- ② 回寫順序（靜態，機械可驗） ----------------

test('② 順序：叫套路的解析排在 pickAttackPoint 之後、planCombination 之前', () => {
  const src = stripComments(aiSrc());
  const iPick = src.indexOf('pickAttackPoint(game, team, aiState.claimId, tier, points)');
  const iCall = src.indexOf('resolveCalledPlay(points, aiState.calledPlay');
  const iPlan = src.indexOf('planCombination(points, aiState.attackerId');
  assert.ok(iPick > 0 && iCall > 0 && iPlan > 0, '三個錨點都要找得到，否則順序斷言失去標的');
  // 之後：pickAttackPoint 的入參一格未動 ⇒ 沒有玩家輸入的對局 trust 分佈逐值不變
  assert.ok(iPick < iCall, '叫套路解析排到了 pickAttackPoint 之前＝trust 分佈會被帶偏（護欄 1）');
  // 之前：玩家的選擇成為 planCombination 的**輸入**，不需要任何事後回寫
  assert.ok(iCall < iPlan, '叫套路解析排到了 planCombination 之後＝變成事後回寫，同源鐵則失守');
  // pickAttackPoint 本體對叫牌一無所知（與段 B 的「對組合一無所知」同一道防線）
  const body = src.slice(src.indexOf('function pickAttackPoint('));
  const fnBody = body.slice(0, body.indexOf('\n}\n') + 2);
  assert.ok(fnBody.includes('pickByWeights'), '擷取到的 pickAttackPoint 函式本體不對');
  for (const w of ['calledPlay', 'resolveCalledPlay', 'callOutcome']) {
    assert.ok(!fnBody.includes(w), `pickAttackPoint 本體出現 ${w}＝選人被玩家指令污染`);
  }
});

test('② 護欄 1 延伸：沒有玩家輸入時，叫套路整條路徑逐值 no-op', () => {
  for (let f = 1; f <= 40; f += 1) {
    const a = planWith({ flightId: f });
    const b = planWith({ flightId: f, calledPlay: null });
    assert.equal(a.ai.callOutcome, null, '沒叫牌卻產生了回饋＝AI 對局被污染');
    assert.deepEqual(a.ai.approach, b.ai.approach);
    assert.deepEqual(a.ai.attackCombo, b.ai.attackCombo);
    assert.equal(a.ai.attackerId, b.ai.attackerId);
  }
});

// ---------------- ① 同源：面板承諾的＝實際跑的 ----------------

test('① 同源：玩家叫的套路，主攻者與配合者實際跑的線與 combo 宣稱的一致', () => {
  let hit = null;
  for (let f = 1; f <= 200 && !hit; f += 1) {
    const base = planWith({ flightId: f });
    const oh = runnerOf(base.ai, 'left'); // 這一球本來跑直線的 OH
    if (!oh) continue;
    // S 指令：直接生效，不吃 trust 閘 ⇒ 只要陣容湊得出來就一定跑
    const r = planWith({
      flightId: f,
      calledPlay: { type: 'cross', callerId: 'A1', isSetter: true },
    });
    if (r.ai.callOutcome?.outcome === 'command') hit = r;
  }
  assert.ok(hit, '200 顆球都叫不成交叉＝甲路徑恆假');
  const { ai } = hit;
  const combo = ai.attackCombo;
  assert.ok(combo, '回饋說指令生效，attackCombo 卻是 null＝面板與 sim 分家');
  assert.equal(combo.type, 'cross');
  // 同源的機械判準：combo 宣稱的線 === 該員 route 的線 === 攻擊分配讀到的線
  assert.equal(routeOf(ai, combo.mainId).kind, combo.mainKind, '主攻者實際跑的線與 combo 宣稱的不符');
  assert.equal(routeOf(ai, combo.partnerId).kind, combo.partnerKind, '配合者實際跑的線與 combo 宣稱的不符');
  assert.equal(ai.attackerId, combo.mainId, '球沒有分配給套路的主攻者');
  assert.equal(ai.attackKind, combo.mainKind, '二傳瞄的線與主攻者跑的線分家');
  // 叫牌消費即清＝一次叫牌只管一球
  assert.equal(ai.calledPlay, null, 'calledPlay 沒有被消費，會漏到下一球');
});

// ---------------- ③ 非 S 的請求：trust 權衡 ----------------

// 高／低信任的對照必須**同 seed 同 flightId**——骰值一格不動，只有 acceptP 變，
// 才證明得了「差別來自 trust 而不是來自骰子」。
function requestOutcome(flightId, callerTrust, callerId) {
  const { ai } = planWith({
    flightId,
    trust: { [callerId]: callerTrust },
    calledPlay: { type: 'cross', callerId, isSetter: false },
  });
  return ai.callOutcome?.outcome ?? null;
}

test('③ 請求經 trust 權衡：同 seed 同骰值下，高信任採納、低信任被無視', () => {
  const flips = [];
  for (let f = 1; f <= 200; f += 1) {
    const base = planWith({ flightId: f });
    const oh = runnerOf(base.ai, 'left');
    if (!oh) continue;
    const hi = requestOutcome(f, 100, oh);
    const lo = requestOutcome(f, 1, oh);
    if (hi === 'accepted' && lo === 'refused') flips.push({ f, oh, hi, lo });
  }
  assert.ok(flips.length > 0,
    'trust 從 1 拉到 100 都翻不動任何一球的採納結果＝trust 閘沒有在作用（恆真或恆假）');
  // 逐值可重演：把第一個翻轉案例原地重跑一次，兩次逐值相同
  const { f, oh } = flips[0];
  assert.equal(requestOutcome(f, 100, oh), 'accepted');
  assert.equal(requestOutcome(f, 1, oh), 'refused');
  // eslint-disable-next-line no-console
  console.log(`      ③ 翻轉案例 ${flips.length} 筆；首例 flightId=${f} 叫牌者=${oh}`
    + `　trust100 → accepted／trust1 → refused`);
});

test('③ 非恆真亦非恆假：同一組球上，採納與被無視兩側都拿得到樣本', () => {
  const tally = { accepted: 0, refused: 0, infeasible: 0 };
  for (let f = 1; f <= 200; f += 1) {
    const base = planWith({ flightId: f });
    const oh = runnerOf(base.ai, 'left');
    if (!oh) continue;
    const o = requestOutcome(f, 45, oh); // 45＝主角實測 effectiveTrust 的 p50
    if (o in tally) tally[o] += 1;
  }
  assert.ok(tally.accepted > 0, '一顆都沒被採納＝請求恆假（玩家永遠許不到願）');
  assert.ok(tally.refused > 0, '一顆都沒被無視＝請求恆真（trust 閘等於不存在）');
  // eslint-disable-next-line no-console
  console.log(`      ③ trust=45 的分佈：採納 ${tally.accepted}／被無視 ${tally.refused}`
    + `／湊不出 ${tally.infeasible}`);
});

test('③ 被無視＝逐值走 AI 原路徑（不得偷偷給半套）', () => {
  let hit = null;
  for (let f = 1; f <= 200 && !hit; f += 1) {
    const base = planWith({ flightId: f });
    const oh = runnerOf(base.ai, 'left');
    if (!oh) continue;
    const r = planWith({
      flightId: f, trust: { [oh]: 1 },
      calledPlay: { type: 'cross', callerId: oh, isSetter: false },
    });
    if (r.ai.callOutcome?.outcome === 'refused') {
      const ref = planWith({ flightId: f, trust: { [oh]: 1 } });
      hit = { r, ref };
    }
  }
  assert.ok(hit, '找不到被無視的樣本');
  assert.deepEqual(hit.r.ai.approach, hit.ref.ai.approach, '被無視卻改了助跑線');
  assert.deepEqual(hit.r.ai.attackCombo, hit.ref.ai.attackCombo, '被無視卻改了組合');
  assert.equal(hit.r.ai.attackerId, hit.ref.ai.attackerId, '被無視卻改了球權');
});

// ---------------- ⑤ 裁定 E：湊不出來當場回饋，不靜默降級 ----------------

test('⑤ 裁定 E：湊不出套路時 outcome=infeasible 且說得出是哪一條沒過', () => {
  const seen = new Set();
  for (let f = 1; f <= 200; f += 1) {
    const base = planWith({ flightId: f });
    const mb = runnerOf(base.ai, 'quick');
    if (!mb) continue;
    // MB 跑快攻——他不可能當交叉的主攻者（COMBO_MAIN_KINDS.cross＝['left']）
    const r = planWith({
      flightId: f, calledPlay: { type: 'cross', callerId: mb, isSetter: false },
    });
    const o = r.ai.callOutcome;
    assert.ok(o, '叫了牌卻沒有任何回饋＝靜默降級（裁定 E 明文禁止）');
    assert.equal(o.outcome, 'infeasible');
    assert.ok(o.reason, 'infeasible 沒有帶原因＝回饋講不出「為什麼」');
    seen.add(o.reason);
    // 不靜默降級的另一半：也不得偷偷把它降級成別的套路
    assert.deepEqual(r.ai.attackCombo, base.ai.attackCombo, '湊不出來卻自己換了一個組合');
  }
  assert.ok(seen.size > 0, '一顆都沒測到');
  assert.ok(seen.has('mainKind'), `預期擋在 mainKind，實得 ${[...seen].join('/')}`);
  // eslint-disable-next-line no-console
  console.log(`      ⑤ MB 叫交叉的失敗原因集合：${[...seen].join('、')}`);
});

test('⑤ 一傳不到位＝擋在 tier 那一條（與 routeKindFor 同一道階梯，不另立判準）', () => {
  // 直接對解析器下手：池子照真實函式建，只換 passTier
  const g = createGame({ seed: 3 });
  for (const tier of ['ok', 'poor']) {
    const pts = applyRouteKinds(attackPointsOf(g, 'A', 'A1', tier), { flightId: 1, seed: 3, passTier: tier });
    const anyPid = pts[0]?.pid;
    const res = resolveCalledPlay(pts, { type: 'cross', callerId: anyPid, isSetter: true }, {
      team: 'A', flightId: 1, seed: 3, passTier: tier, fallbackMainId: anyPid,
    });
    assert.equal(res.outcome, 'infeasible', `一傳 ${tier} 竟然叫得成交叉`);
    assert.ok(['mainKind', 'tier', 'partner'].includes(res.reason), `非預期的原因 ${res.reason}`);
  }
});

test('⑤ firstFailedCheck 的鑑別力：全過回 null、擋哪條就回哪條', () => {
  assert.equal(firstFailedCheck({ a: true, b: true }), null);
  assert.equal(firstFailedCheck({ a: true, b: false, c: false }), 'b', '要回**第一個**沒過的');
});

// ---------------- ④ 兩種語意的回饋分得開 ----------------

test('④ 指令與請求：圖示／詞／顏色三條通道全部不同（任一條被吃掉仍分得出來）', () => {
  const c = CALL_MODES.command;
  const r = CALL_MODES.request;
  assert.notEqual(c.icon, r.icon, '圖示相同＝色盲/單色螢幕下分不出來');
  assert.notEqual(c.word, r.word, '詞相同＝念出來分不出來（最不倚賴視覺的一條）');
  assert.notEqual(c.color, r.color, '顏色相同＝掃一眼分不出來');
});

test('④ 四種結果的字卡兩兩不同，且指令/請求各自的成功文案也不同', () => {
  const mk = (mode, outcome, reason = null) => callFeedbackOf(
    { type: 'cross', mode, outcome, reason, mainId: 'A2', flightId: 1 }, null,
  );
  const cmd = mk('command', 'command');
  const acc = mk('request', 'accepted');
  const ref = mk('request', 'refused', 'trust');
  const inf = mk('request', 'infeasible', 'partner');
  const texts = [cmd.text, acc.text, ref.text, inf.text];
  assert.equal(new Set(texts).size, 4, `四種結果的文案有重複：${texts.join(' | ')}`);
  // 語意錨點：指令帶「指令」、請求帶「請求」——不靠圖示也講得清楚
  assert.ok(cmd.text.includes(CALL_MODES.command.word));
  assert.ok(acc.text.includes(CALL_MODES.request.word));
  // 被無視 vs 湊不出來：顏色也要分（灰＝人的問題／紅＝陣容的問題），
  // 因為玩家的下一步完全相反（前者累積信任、後者換套路）
  assert.notEqual(ref.color, inf.color, '「二傳沒理你」與「湊不出來」同色＝行動方案會被混淆');
  assert.ok(inf.text.includes('MB'), `裁定 E 的原因沒有出現在文案裡：${inf.text}`);
  // eslint-disable-next-line no-console
  console.log(`      ④ ${texts.join('\n      ④ ')}`);
});

test('④ 面板側也分得開：S 開＝指令池、非 S 開＝請求池', () => {
  const g = createGame({ seed: 3 });
  const setter = g.match.rotations.A.find((id) => g.players[id].currentRole === 'setter');
  const other = g.match.rotations.A.find((id) => g.players[id].currentRole !== 'setter');
  assert.equal(callModeOf(g, setter), 'command');
  assert.equal(callModeOf(g, other), 'request');
  assert.ok(callOptionsFor(g, setter).every((o) => o.mode === 'command'));
  assert.ok(callOptionsFor(g, other).every((o) => o.mode === 'request'));
});

test('④ 沒叫牌＝沒有字卡（不得每球都彈東西）', () => {
  assert.equal(callFeedbackOf(null), null);
});

// ---------------- 面板選項池：出廠關閉的型別 ----------------

test('面板選項池＝保守解讀②：出廠機率 0 的型別不列（切換點只有一個常數）', () => {
  const offered = offeredCallTypes();
  assert.ok(offered.length > 0, '一型都不列＝面板等於不存在');
  assert.ok(offered.includes('cross') && offered.includes('delay'));
  assert.ok(!offered.includes('tandem'),
    '夾塞出廠關閉（裁定丙）卻列進面板——Sawmah 裁定前一律照保守解讀②');
  assert.equal(CALL_OFFERS_FACTORY_OFF_TYPES, false, '切換旗標被改動＝解讀①上線，需 Sawmah 裁定');
  assert.ok(offered.every((t) => COMBO_TYPES.includes(t)), '面板列出了 sim 不認得的型別');
});

test('面板列的每一型，解析器都真的處理得動（面板與 sim 同源的最低保證）', () => {
  const g = createGame({ seed: 3 });
  const pts = applyRouteKinds(attackPointsOf(g, 'A', 'A1', 'perfect'), { flightId: 1, seed: 3 });
  for (const type of offeredCallTypes()) {
    const res = resolveCalledPlay(pts, { type, callerId: pts[0].pid, isSetter: true }, {
      team: 'A', flightId: 1, seed: 3, fallbackMainId: pts[0].pid,
    });
    assert.notEqual(res.outcome, 'none', `解析器不認得面板列出的型別 ${type}`);
  }
  // 反例：不認得的型別＝沒叫（不得當成某一型硬跑）
  const bogus = resolveCalledPlay(pts, { type: 'banana', callerId: pts[0].pid }, {});
  assert.equal(bogus.outcome, 'none');
});

// ---------------- ⑦ 乙路徑：臨場改判 ----------------

// 改判要在**還沒有人起跑**的時候下（遠段＝S 還在跑向球的階段），
// 所以先取一個規劃點，再在同一個 flight 內注入 replanCall 跑第二次協調層。
function replanAt(flightId, type, { advanceTicks = 0 } = {}) {
  const { g, ai } = planWith({ flightId });
  const before = structuredClone(ai.approach);
  const beforeCombo = structuredClone(ai.attackCombo ?? null);
  g.tick += advanceTicks;
  ai.replanCall = { type, callerId: ai.claimId };
  aiCollectIntents(g, ai);
  return { g, ai, before, beforeCombo };
}

test('⑦ 乙：臨場改判真的重建 approach（不是只改一個標籤）', () => {
  let hit = null;
  for (let f = 1; f <= 200 && !hit; f += 1) {
    const r = replanAt(f, 'cross');
    if (r.ai.callOutcome?.outcome === 'command') hit = r;
  }
  assert.ok(hit, '200 顆球都改判不成＝乙路徑恆假');
  const { ai, before } = hit;
  assert.equal(ai.replanCall, null, 'replanCall 沒被消費，會重複觸發');
  assert.equal(ai.attackCombo?.type, 'cross');
  assert.equal(ai.callOutcome.mode, 'replan', '改判的語意標記不是 replan＝回饋會說成死球窗指令');
  const combo = ai.attackCombo;
  // 重建的機械證明：主攻者的 route 真的換了線，且與 combo 宣稱的一致（同源）
  assert.equal(routeOf(ai, combo.mainId).kind, combo.mainKind);
  assert.equal(routeOf(ai, combo.partnerId).kind, combo.partnerKind);
  assert.equal(ai.attackerId, combo.mainId);
  assert.equal(ai.attackKind, combo.mainKind);
  const beforeMain = before.routes.find((r) => r.pid === combo.mainId);
  assert.notDeepEqual(beforeMain, routeOf(ai, combo.mainId),
    '改判前後主攻者的 route 逐值相同＝approach 根本沒重建');
  // setTick 是本波的錨點，改判不得把它重算（重算＝助跑時序整組平移）
  assert.equal(ai.approach.setTick, before.setTick, '改判動到了 setTick 錨點');
});

test('⑦ 乙硬線：已起跑者不得改線——主攻者/配合者已起跑就整筆作廢', () => {
  let hit = null;
  for (let f = 1; f <= 200 && !hit; f += 1) {
    // 先確認這一球改判得成（不然「作廢」可能是別的原因）
    const ok = replanAt(f, 'cross');
    if (ok.ai.callOutcome?.outcome !== 'command') continue;
    // 同一球，把 tick 推過一速誘餌的起步點再改判
    const partner = ok.ai.attackCombo.partnerId;
    const base = planWith({ flightId: f });
    const pRoute = base.ai.approach.routes.find((r) => r.pid === partner);
    if (pRoute?.startTick == null) continue;
    const advance = (pRoute.startTick - base.g.tick) + 1;
    if (advance <= 0) continue;
    const late = replanAt(f, 'cross', { advanceTicks: advance });
    if (late.ai.callOutcome?.reason === 'launched') hit = late;
  }
  assert.ok(hit, '推過起步點之後仍然改得動＝「已起跑者不得改線」沒有在守');
  const { ai, before, beforeCombo } = hit;
  assert.equal(ai.callOutcome.outcome, 'infeasible');
  assert.equal(ai.callOutcome.reason, 'launched');
  // 作廢＝**逐值**不動（不是「大致沒動」）——倒著跑回助跑起點是本專案的既知禁區
  assert.deepEqual(ai.approach, before, '改判被拒卻仍動了助跑線');
  assert.deepEqual(ai.attackCombo ?? null, beforeCombo, '改判被拒卻仍動了組合');
});

test('⑦ 乙窗界：不在第二觸窗內的改判指令一律作廢，且不留回饋', () => {
  const { g, ai } = planWith({ flightId: 1 });
  const before = structuredClone(ai.approach);
  g.rally.touches = 2; // 離開第二觸窗
  ai.callOutcome = null;
  ai.replanCall = { type: 'cross', callerId: ai.claimId };
  aiCollectIntents(g, ai);
  assert.equal(ai.replanCall, null, '窗外的殘留指令沒被清掉，會在下一球突然生效');
  assert.equal(ai.callOutcome, null, '窗外指令不該產生回饋');
  assert.deepEqual(ai.approach, before);
});

// ---------------- 決定論 ----------------

test('決定論：同 seed 同輸入的叫牌結果逐值相同（甲與乙都要）', () => {
  for (let f = 1; f <= 30; f += 1) {
    const a = planWith({ flightId: f, calledPlay: { type: 'cross', callerId: 'A2', isSetter: false } });
    const b = planWith({ flightId: f, calledPlay: { type: 'cross', callerId: 'A2', isSetter: false } });
    assert.deepEqual(a.ai.callOutcome, b.ai.callOutcome);
    assert.deepEqual(a.ai.approach, b.ai.approach);
    const ra = replanAt(f, 'cross');
    const rb = replanAt(f, 'cross');
    assert.deepEqual(ra.ai.callOutcome, rb.ai.callOutcome);
    assert.deepEqual(ra.ai.approach, rb.ai.approach);
  }
});

test('壽命：叫牌回饋隨死球作廢，但 calledPlay **不得**在死球窗被清掉', () => {
  const { g, ai } = planWith({ flightId: 1, calledPlay: { type: 'cross', callerId: 'A2', isSetter: false } });
  ai.callOutcome = { type: 'cross', mode: 'request', outcome: 'refused', reason: 'trust', mainId: 'A2', flightId: 1 };
  ai.calledPlay = { type: 'delay', callerId: 'A2', isSetter: false };
  g.phase = 'serve';
  aiCollectIntents(g, ai);
  assert.equal(ai.callOutcome, null, '死球後上一球的回饋沒清＝新的一球會看到舊字卡');
  assert.deepEqual(ai.calledPlay, { type: 'delay', callerId: 'A2', isSetter: false },
    '死球窗把玩家剛叫的牌清掉了＝一按就沒（死球窗正是叫牌的時機）');
});
