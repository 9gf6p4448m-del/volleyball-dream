// 組合攻擊卷 段 E —— 輸入落點（玩家第一次能主動參與戰術）
//
// ★ 卷五（2026-08-02 裁定 1）：路徑甲（死球窗 `calledPlay`）整條退場 ★
//   本檔原本用 `ai.calledPlay` 當輸入的條目，一律改掛路徑乙（`ai.replanCall`）——
//   它走**同一支** `resolveCalledPlay`、**同一個**窗界（`touches === 1`），
//   守的行為一格未放寬，只是輸入從死球窗換成球內遠段窗。
//
// 本檔守的七件事（＝上位裁定書 §六.3 驗收＋裁定 E＋護欄）：
//   ① **同源**：玩家選定的套路，實際跑位與面板承諾的線一致
//   ② **改判解析排在 ensureFlightPlan 之後、走位之前**（靜態順序斷言）
//      ——「之後」才有排好的 approach 可改，「之前」才讓改判在同一 tick 內生效。
//      舊制守的是甲路徑「pickAttackPoint 之後、planCombination 之前」，隨甲退場。
//   ③ **非 S 沒有「叫套路」這件事**（2026-08-01 題 0 廢除舊「請求」語意後改守的點）：
//      模式是 null、選項池是空的，解析器也不再產生 accepted／refused
//   ④ **回饋講得清楚**（指令／改判／湊不出來）——三條獨立通道
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
  resolveCalledPlay, offeredCallTypes, firstFailedCheck, COMBO_TYPES, SOLO_CALL_TYPES,
  applyRouteKinds, applySoloRoute, CALL_OFFERS_FACTORY_OFF_TYPES,
} from '../src/sim/approach.js';
import { attackPointsOf } from '../src/sim/ai.js';
import {
  callFeedbackOf, CALL_MODES, callModeOf, callOptionsFor, CALL_LABELS, ALL_CALL_REASONS,
} from '../src/input/callPlay.js';
import { myRouteFor } from '../src/input/myRoute.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const stripComments = (src) => src
  .replace(/\r\n?/g, '\n')
  .split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n');
const aiSrc = () => readFileSync(join(SRC, 'sim', 'ai.js'), 'utf8');

// 凍結輸入的單一規劃點（範式抄 tools/combo-probe.mjs 的 trustSweep：
// 同一組輸入下只跑協調層一次，把「玩家叫了牌」以外的變因全部按住）
// 卷五：輸入槽改成 `replanCall`（路徑乙）。單次 aiCollectIntents 就跑得完整條路——
// `applyReplanCall` 排在 `ensureFlightPlan` 之後（ai.js），所以同一次呼叫內
// 「排好 approach → 改判覆寫」兩步都會發生，不需要跑兩個 tick。
function planWith({ seed = 3, flightId = 1, replanCall = null, rot = 0, trust = null } = {}) {
  const g = createGame({ seed });
  const base = g.match.rotations.A.slice();
  g.match.rotations.A = [...base.slice(rot), ...base.slice(0, rot)];
  if (trust) for (const [pid, v] of Object.entries(trust)) g.players[pid].trust.fromSetter = v;
  const ai = createAiState();
  ai.replanCall = replanCall;
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

test('② 順序：改判解析排在 ensureFlightPlan 之後、走位之前', () => {
  const src = stripComments(aiSrc());
  const iPlan = src.indexOf('ensureFlightPlan(game, aiState);');
  const iCall = src.indexOf('applyReplanCall(game, aiState);');
  const iMove = src.indexOf('applyRouteCommit(game, aiState, excludeIds);');
  assert.ok(iPlan > 0 && iCall > 0 && iMove > 0, '三個錨點都要找得到，否則順序斷言失去標的');
  // 之後：改判要改的正是那一步剛排好的 approach／attackCombo
  assert.ok(iPlan < iCall, '改判排到了 ensureFlightPlan 之前＝那一刻還沒有 approach 可改');
  // 之前：改判要在同一個 tick 內生效，否則這一 tick 的人還照舊線跑＝面板與跑位分岔一格
  assert.ok(iCall < iMove, '改判排到了走位之後＝這一 tick 的人照舊線跑，面板與跑位分岔');
  // ★ 卷五：路徑甲的死球窗輸入槽必須真的不存在了 ★（拆一半比不拆更危險：
  //   欄位還在但沒有消費者＝玩家按了沒反應，且靜態掃描看起來仍「有這個功能」）
  assert.ok(!src.includes('aiState.calledPlay'),
    'ai.js 仍有 aiState.calledPlay＝路徑甲沒拆乾淨（卷五裁定 1）');
  // pickAttackPoint 本體對玩家指令一無所知（與段 B 的「對組合一無所知」同一道防線）
  const body = src.slice(src.indexOf('function pickAttackPoint('));
  const fnBody = body.slice(0, body.indexOf('\n}\n') + 2);
  assert.ok(fnBody.includes('pickByWeights'), '擷取到的 pickAttackPoint 函式本體不對');
  for (const w of ['replanCall', 'resolveCalledPlay', 'callOutcome']) {
    assert.ok(!fnBody.includes(w), `pickAttackPoint 本體出現 ${w}＝選人被玩家指令污染`);
  }
});

test('② 護欄 1 延伸：沒有玩家輸入時，叫套路整條路徑逐值 no-op', () => {
  for (let f = 1; f <= 40; f += 1) {
    const a = planWith({ flightId: f });
    const b = planWith({ flightId: f, replanCall: null });
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
      replanCall: { type: 'cross', callerId: 'A1' },
    });
    if (r.ai.callOutcome?.outcome === 'command') hit = r;
  }
  assert.ok(hit, '200 顆球都叫不成交叉＝乙路徑恆假');
  const { ai } = hit;
  const combo = ai.attackCombo;
  assert.ok(combo, '回饋說指令生效，attackCombo 卻是 null＝面板與 sim 分家');
  assert.equal(combo.type, 'cross');
  // 同源的機械判準：combo 宣稱的線 === 該員 route 的線 === 攻擊分配讀到的線
  assert.equal(routeOf(ai, combo.mainId).kind, combo.mainKind, '主攻者實際跑的線與 combo 宣稱的不符');
  assert.equal(routeOf(ai, combo.partnerId).kind, combo.partnerKind, '配合者實際跑的線與 combo 宣稱的不符');
  assert.equal(ai.attackerId, combo.mainId, '球沒有分配給套路的主攻者');
  assert.equal(ai.attackKind, combo.mainKind, '二傳瞄的線與主攻者跑的線分家');
  // ★ 卷五裁定 2（2026-08-02）：**戰術只管一球** ★
  // 卷三段 3 的「指令整個 rally 內持續有效」語意退場（連同它的載體路徑甲）。
  // 乙路徑本來就是「窗內窗外都只嘗試一次」——消費即清，殘留指令不跨波生效。
  assert.equal(ai.replanCall, null,
    'replanCall 沒被消費掉＝指令會跨波重複生效（裁定 2 明文：戰術只管一球）');
});

// ---------------- ③ 舊「請求」語意已廢除（2026-08-01 題 0） ----------------
//
// 舊制：非 S 在死球窗按 🙋 為自己叫，由 S 的 AI 依 trust 擲骰決定採不採納
//       （outcome ∈ accepted／refused、mode ＝ request）。
// 廢除理由＝玩家叫的是願望不是決策。新的決策流是「S 決策 → 非 S 收球內提示 →
// 自己決定跑不跑」，非 S 在死球窗沒有事情做。
// 這一段守的是**廢除有沒有拆乾淨**：不是「請求會不會被採納」，而是「請求叫不出來」。

test('③ 非 S 沒有「叫套路」這件事：模式是 null、選項池是空的', () => {
  const g = createGame({ seed: 3 });
  const setter = g.match.rotations.A.find((id) => g.players[id].currentRole === 'setter');
  const other = g.match.rotations.A.find((id) => g.players[id].currentRole !== 'setter');
  assert.equal(callModeOf(g, other), null, '非 S 拿到了一種可用語意＝舊請求語意還活著');
  assert.deepEqual(callOptionsFor(g, other), [], '非 S 拿得到叫戰術選項＝面板還開得出來');
  // 對照組：S 這一側必須還在（否則「空陣列」只是整個功能壞掉）
  assert.equal(callModeOf(g, setter), 'command');
  assert.ok(callOptionsFor(g, setter).length > 0, 'S 也拿不到選項＝叫戰術整個死掉了');
});

test('③ 解析器不再產生 accepted／refused：isSetter 帶什麼都是指令', () => {
  const g = createGame({ seed: 3 });
  const pts = applyRouteKinds(attackPointsOf(g, 'A', 'A1', 'perfect'), { flightId: 1, seed: 3 });
  const mb = pts.find((p) => p.kind === 'quick')?.pid ?? pts[0].pid;
  for (const isSetter of [true, false]) {
    const res = resolveCalledPlay(pts, { type: 'cross', callerId: mb, isSetter }, {
      team: 'A', flightId: 1, seed: 3, fallbackMainId: pts[0].pid,
    });
    assert.equal(res.mode, 'command', `isSetter=${isSetter} 時 mode 不是 command＝request 還在`);
    assert.ok(['command', 'infeasible'].includes(res.outcome),
      `outcome 出現了 ${res.outcome}——accepted／refused 應已隨請求語意消失`);
    // 舊制「非 S 只能為自己叫」已廢：主攻者一律由 commandMainId 挑（S 決定給誰）
    assert.notEqual(res.mainId, mb, '主攻者仍是叫牌者本人＝「只能為自己叫」的舊語意殘留');
  }
});

test('③ trust 不再影響叫牌成敗（採納骰已整支拆除）', () => {
  // 同 seed 同 flightId，只把叫牌者的信任從 1 拉到 100——舊制這會翻轉 accepted／refused，
  // 新制必須逐值相同。只比**成敗三欄**：mainId 會隨 trust 變是合法的（trust 本來就
  // 影響 pickAttackPoint 抽出的 fallbackMainId），拿它來比會把合法差異誤判成殘留。
  const verdict = (o) => (o ? { outcome: o.outcome, mode: o.mode, reason: o.reason } : null);
  let samples = 0;
  for (let f = 1; f <= 60; f += 1) {
    const base = planWith({ flightId: f });
    const oh = runnerOf(base.ai, 'left');
    if (!oh) continue;
    // 卷五：改掛路徑乙。乙的 callerId 一樣是「叫的人」，解析器對它一律 isSetter:true
    //（遠段面板只有 S 開得了）——舊制的採納骰若還在，這裡拉 trust 就會翻轉成敗。
    const call = { type: 'cross', callerId: oh };
    const lo = planWith({ flightId: f, trust: { [oh]: 1 }, replanCall: { ...call } });
    const hi = planWith({ flightId: f, trust: { [oh]: 100 }, replanCall: { ...call } });
    // 前置：兩臂都真的叫出了東西——否則「逐值相同」會在兩個 null 上空洞成立
    assert.ok(lo.ai.callOutcome && hi.ai.callOutcome,
      `flightId=${f}：叫牌沒產生任何回饋＝這一輪的比較是空的`);
    assert.deepEqual(verdict(lo.ai.callOutcome), verdict(hi.ai.callOutcome),
      `flightId=${f}：信任高低改變了叫牌成敗＝採納骰還在`);
    samples += 1;
  }
  assert.ok(samples > 0, '一個樣本都沒取到＝這條測試等於沒跑');
});

// ---------------- ⑤ 裁定 E：湊不出來當場回饋，不靜默降級 ----------------

test('⑤ 裁定 E：湊不出套路時 outcome=infeasible 且說得出是哪一條沒過', () => {
  // 2026-08-01 題 0 後的取樣改法：舊版靠「MB 為自己叫交叉」造 infeasible（＝請求語意的
  // 「只能為自己叫」）。新制主攻者一律由 commandMainId 挑，池裡有 left 就挑得到 ⇒
  // 擋在 mainKind 已不可能，改由**池裡根本沒有那條線的人**造（reason=hasMain）。
  // 守的點一格未放寬：叫了牌一定有回饋、infeasible 一定講得出原因、不得靜默降級。
  const seen = new Set();
  let feasible = 0;
  let blocked = 0;
  for (let f = 1; f <= 200; f += 1) {
    const base = planWith({ flightId: f });
    const r = planWith({
      flightId: f, replanCall: { type: 'cross', callerId: 'A1' },
    });
    const o = r.ai.callOutcome;
    assert.ok(o, '叫了牌卻沒有任何回饋＝靜默降級（裁定 E 明文禁止）');
    if (o.outcome === 'command') { feasible += 1; continue; }
    assert.equal(o.outcome, 'infeasible');
    assert.ok(o.reason, 'infeasible 沒有帶原因＝回饋講不出「為什麼」');
    seen.add(o.reason);
    blocked += 1;
    // 不靜默降級的另一半：也不得偷偷把它降級成別的套路
    assert.deepEqual(r.ai.attackCombo, base.ai.attackCombo, '湊不出來卻自己換了一個組合');
  }
  // 兩側都要有樣本：全成功＝這條閘等於不存在，全失敗＝叫戰術根本叫不成
  assert.ok(blocked > 0, '200 顆球都湊得出交叉＝裁定 E 的失敗回饋從出廠就不會響');
  assert.ok(feasible > 0, '200 顆球都湊不出交叉＝叫戰術恆假');
  assert.ok(seen.has('hasMain'), `預期擋在 hasMain，實得 ${[...seen].join('/')}`);
  // eslint-disable-next-line no-console
  console.log(`      ⑤ 叫交叉：成功 ${feasible}／湊不出 ${blocked}（原因：${[...seen].join('、')}）`);
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

test('④ 指令與改判：圖示／詞兩條通道不同，且 request 規格已不存在', () => {
  const c = CALL_MODES.command;
  const p = CALL_MODES.replan;
  assert.notEqual(c.icon, p.icon, '圖示相同＝色盲/單色螢幕下分不出來');
  assert.notEqual(c.word, p.word, '詞相同＝念出來分不出來（最不倚賴視覺的一條）');
  // 舊制的第三種語意：非 S 的「請求」。廢除後不得再有規格，否則面板會把它畫回來
  assert.equal(CALL_MODES.request, undefined, 'CALL_MODES.request 還在＝請求語意沒拆乾淨');
  assert.deepEqual(Object.keys(CALL_MODES).sort(), ['command', 'replan']);
});

test('④ 兩種結果的字卡不同，且失敗字卡講得出原因', () => {
  const mk = (mode, outcome, reason = null) => callFeedbackOf(
    { type: 'cross', mode, outcome, reason, mainId: 'A2', flightId: 1 }, null,
  );
  const cmd = mk('command', 'command');
  const inf = mk('command', 'infeasible', 'partner');
  const rep = mk('replan', 'command');
  const texts = [cmd.text, inf.text, rep.text];
  assert.equal(new Set(texts).size, 3, `結果的文案有重複：${texts.join(' | ')}`);
  // 語意錨點：不靠圖示也講得清楚
  assert.ok(cmd.text.includes(CALL_MODES.command.word));
  assert.ok(rep.text.includes(CALL_MODES.replan.word));
  // 成功 vs 湊不出來：顏色也要分（琥珀＝跑得成／紅＝陣容的問題）
  assert.notEqual(cmd.color, inf.color, '「照跑」與「湊不出來」同色＝掃一眼分不出成敗');
  // ★ 2026-08-03：錨點從 'MB' 改到機制 ★ 舊文案是「前排 MB 接了這一傳（或他不在前排）」，
  // 那句**猜成因的括號**已因實測猜錯 79% 被拔掉（callPlay.js 的 partner／hasQuick 註解）。
  // 這條要守的是「說得出**哪一條**沒過」，不是「一定要提到 MB」——後者會把
  // 「文案不得猜成因」這條裁定卡死。
  assert.ok(inf.text.includes('快攻'), `裁定 E 的原因沒有出現在文案裡：${inf.text}`);
  assert.ok(!inf.text.includes('湊不出來'), `落回了預設文案＝沒講出哪一條沒過：${inf.text}`);
  // eslint-disable-next-line no-console
  console.log(`      ④ ${texts.join('\n      ④ ')}`);
});

test('④ 面板側：S 開＝指令池、非 S 根本開不了', () => {
  const g = createGame({ seed: 3 });
  const setter = g.match.rotations.A.find((id) => g.players[id].currentRole === 'setter');
  const other = g.match.rotations.A.find((id) => g.players[id].currentRole !== 'setter');
  assert.equal(callModeOf(g, setter), 'command');
  assert.equal(callModeOf(g, other), null);
  assert.ok(callOptionsFor(g, setter).every((o) => o.mode === 'command'));
  assert.deepEqual(callOptionsFor(g, other), []);
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
  // 卷五：解析器認得的型別＝組合三型 ∪ 單人改線型（SOLO_CALL_TYPES）。
  // 單人型不吃「出廠機率 0 就不列」那道濾網——它本來就沒有自動觸發機率（只有玩家叫得出來）。
  const known = [...COMBO_TYPES, ...SOLO_CALL_TYPES];
  assert.ok(offered.every((t) => known.includes(t)), '面板列出了 sim 不認得的型別');
  assert.ok(offered.includes('bquick'), 'B 快沒進面板＝卷五的入口沒接上');
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

// ★ 2026-08-03 裁定甲的另一半：語意護欄反向 ★ 這兩條（本測試＋卷五端到端）原本守
// mode === 'replan'，防的是「改判被字卡說成死球窗指令」。卷五 §六把死球窗入口整條拆了
// 之後，沒有前一次判定可以「改」——面板按鈕是「⚡指令」、callModeOf 只回 'command'、
// 解析器（approach.js「叫套路的人一定是 S」）也恆回 'command'。護欄改守反方向：
// 語意標記必須是 'command'，否則字卡（🔄改判）會和面板按鈕（⚡指令）把同一件事說成兩種。
test('⑦ 乙：遠段叫牌真的重建 approach（不是只改一個標籤）', () => {
  let hit = null;
  for (let f = 1; f <= 200 && !hit; f += 1) {
    const r = replanAt(f, 'cross');
    if (r.ai.callOutcome?.outcome === 'command') hit = r;
  }
  assert.ok(hit, '200 顆球都叫不成＝乙路徑恆假');
  const { ai, before } = hit;
  assert.equal(ai.replanCall, null, 'replanCall 沒被消費，會重複觸發');
  assert.equal(ai.attackCombo?.type, 'cross');
  assert.equal(ai.callOutcome.mode, 'command', '語意標記不是 command＝字卡會跟面板按鈕（⚡指令）分岔成兩種說法');
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

// ---------------- 卷五：單人改線型（B 快）走同一個入口 ----------------
//
// 組合是「兩人之間的關係」，B 快只改 MB 自己那一條線 ⇒ 解析器多一種回傳形狀。
// 這一組守的是**兩種形狀不得互相污染**：solo 不得被硬塞進 combo（partnerId 會是
// undefined，applyComboRoutes 的 `pt.pid === undefined` 恆假＝靜默失效），
// combo 也不得在單人型落地後殘留（下游會拿一份「線早就被覆蓋掉」的舊組合做判定）。

test('卷五・解析器：B 快回的是 solo 形狀，不是硬塞進 combo', () => {
  const g = createGame({ seed: 3 });
  const pts = applyRouteKinds(attackPointsOf(g, 'A', 'A1', 'perfect'), { flightId: 1, seed: 3 });
  const quickPid = pts.find((p) => p.kind === 'quick')?.pid;
  assert.ok(quickPid, '這一組池裡沒有人跑 A 快＝本測試沒有標的');
  const res = resolveCalledPlay(pts, { type: 'bquick', callerId: 'A1', isSetter: true }, {
    team: 'A', flightId: 1, seed: 3, fallbackMainId: pts[0].pid,
  });
  assert.equal(res.outcome, 'command');
  assert.equal(res.combo, null, 'B 快產出了 combo＝單人型被當成兩人配合');
  assert.deepEqual(res.solo, { mainId: quickPid, kind: 'bquick' });
  // 主攻者一定是**跑 A 快的那個人**：B 快是把他拉開，不是「叫誰都行」
  assert.equal(res.mainId, quickPid);
  assert.ok(SOLO_CALL_TYPES.includes('bquick'), 'bquick 沒登記在單人型清單裡');
});

test('卷五・解析器：池裡沒人跑 A 快 ⇒ 專屬 reason，不與組合的 hasMain 混用', () => {
  const noQuick = [
    { pid: 'A2', kind: 'left', tier: 'perfect' },
    { pid: 'A4', kind: 'right', tier: 'perfect' },
  ];
  const res = resolveCalledPlay(noQuick, { type: 'bquick' }, { team: 'A', flightId: 1, seed: 3 });
  assert.equal(res.outcome, 'infeasible');
  assert.equal(res.reason, 'hasQuick', '沿用了組合的 hasMain＝文案會說成「你不在攻擊池裡」');
  assert.equal(res.solo, null);
  // 表現層要講得出實情：落回預設文案「這球湊不出來」等於什麼都沒說
  const fb = callFeedbackOf({
    type: 'bquick', mode: 'replan', outcome: 'infeasible', reason: 'hasQuick', mainId: null,
  });
  // 2026-08-03：對照 `CALL_LABELS.bquick` 本身而不是寫死字面——這條守的是
  // 「字卡有沒有把型別名講出來」，不是那個名字怎麼拼。Sawmah 當日把它從
  // 「B 快」統一成「B快」，寫死字面會讓每次命名裁定都誤炸這條。
  assert.ok(fb.text.includes(CALL_LABELS.bquick), `字卡沒有型別名＝CALL_LABELS 缺 bquick：${fb.text}`);
  assert.ok(fb.text.includes('快攻'), `失敗回饋沒講出實情：${fb.text}`);
  assert.ok(!fb.text.includes('湊不出來'), 'REASON_TEXT 沒有 hasQuick 這一鍵＝落回了預設文案');
});

test('卷五・世界規則閘：comboScale = 0 時 B 快也叫不出來（Sawmah 2026-08-02 裁定）', () => {
  const g = createGame({ seed: 3 });
  const pts = applyRouteKinds(attackPointsOf(g, 'A', 'A1', 'perfect'), { flightId: 1, seed: 3 });
  assert.ok(pts.some((p) => p.kind === 'quick'), '池裡沒有 A 快＝擋下來的可能是別的原因');
  const res = resolveCalledPlay(pts, { type: 'bquick' }, {
    team: 'A', flightId: 1, seed: 3, comboScale: 0,
  });
  assert.equal(res.outcome, 'infeasible');
  assert.equal(res.reason, 'playsOff');
  assert.equal(res.solo, null, '世界規則關著卻仍產出了 B 快');
});

test('卷五・applySoloRoute：只動那一個人，其餘 point 是同一個物件參照', () => {
  const pts = [
    { pid: 'A2', kind: 'left' }, { pid: 'A3', kind: 'quick' }, { pid: 'A4', kind: 'right' },
  ];
  const frozen = structuredClone(pts);
  const out = applySoloRoute(pts, { mainId: 'A3', kind: 'bquick' });
  assert.deepEqual(pts, frozen, '改了入參＝純函式破功（與 applyComboRoutes 同範式）');
  assert.equal(out[1].kind, 'bquick');
  assert.equal(out[0], pts[0], '沒被指定的人被複製了一份新物件');
  assert.equal(out[2], pts[2]);
  assert.equal(applySoloRoute(pts, null), pts, 'solo 為 null 時應原樣回傳');
});

test('卷五・乙路徑端到端：叫 B 快真的把 MB 的線改掉，且不外溢到別人', () => {
  // 挑一顆「AI 本來沒排組合」的球：那樣「其餘人逐值不動」才是乾淨的判準
  let hit = null;
  for (let f = 1; f <= 200 && !hit; f += 1) {
    const r = replanAt(f, 'bquick');
    if (r.ai.callOutcome?.outcome === 'command' && r.beforeCombo == null) hit = r;
  }
  assert.ok(hit, '200 顆球都叫不出 B 快＝入口沒接上');
  const { ai, before } = hit;
  const mb = ai.attackerId;
  assert.equal(before.routes.find((r) => r.pid === mb)?.kind, 'quick',
    '改判前他跑的不是 A 快＝標的不對');
  assert.equal(routeOf(ai, mb).kind, 'bquick', 'MB 的 route 沒換線＝只改了標籤沒重建');
  assert.equal(ai.attackKind, 'bquick', 'attackKind 與 route 分岔＝二傳瞄的和他跑的是兩個地方');
  assert.equal(ai.attackCombo, null, '單人型卻生出了組合');
  assert.equal(ai.approach.setTick, before.setTick, '改判動到了 setTick 錨點');
  // 與 ⑦ 乙同一條護欄（見該測試上方的 2026-08-03 註記）：單人型走同一個出口，語意也必須是 command
  assert.equal(ai.callOutcome.mode, 'command', '語意標記不是 command＝字卡會跟面板按鈕（⚡指令）分岔成兩種說法');
  assert.equal(ai.replanCall, null, 'replanCall 沒被消費，會重複觸發');
  for (const r0 of before.routes) {
    if (r0.pid === mb) continue;
    assert.deepEqual(routeOf(ai, r0.pid), r0, `${r0.pid} 的線被 B 快改判波及＝單人型外溢`);
  }
  // 裁定 5 的承諾：MB 自己要看得到「S 要你跑 B 快」。routeCue 不認角色、只讀 route.kind
  //（myRoute.js:49 → KIND_LABELS），所以 MB 一進 route 系統就自動有提示——這一行守的是
  // 那條鏈沒斷（label 落回原始 kind 字串就代表 KIND_LABELS 少了這一鍵）。
  const cue = myRouteFor(hit.g, ai, mb);
  assert.equal(cue.kind, 'bquick');
  assert.ok(cue.label.startsWith('B快'), `MB 的球內提示沒認出 B 快：${cue.label}`);
});

test('卷五・單人型必須清掉上一份組合（否則下游拿早就不存在的線做判定）', () => {
  let hit = null;
  for (let f = 1; f <= 400 && !hit; f += 1) {
    const r = replanAt(f, 'bquick');
    if (r.ai.callOutcome?.outcome === 'command' && r.beforeCombo != null) hit = r;
  }
  assert.ok(hit, '400 顆球都湊不到「AI 已排組合 ＋ B 快叫得成」＝本測試沒有標的');
  const { ai, beforeCombo } = hit;
  assert.ok(beforeCombo.partnerId, '基準組合沒有配合者＝比對的對象不對');
  assert.equal(ai.attackCombo, null,
    '叫了單人型卻留著舊組合：那份 combo 宣稱的兩條線已經被這次重建覆蓋掉了');
  // 為什麼舊組合一定不成立了：三型的誘餌都是跑 A 快的 MB，而 B 快正是把他拉走
  // ⇒ 被拉走的人就是舊組合的 partner，那份 combo 的關係當場斷掉。
  assert.equal(ai.attackerId, beforeCombo.partnerId,
    '被拉去跑 B 快的不是舊組合的誘餌＝這一題的因果前提不成立，斷言失去標的');
  assert.equal(routeOf(ai, beforeCombo.partnerId).kind, 'bquick');
});

test('卷五・乙硬線：MB 已起跑就整筆作廢（單人型也守「不得倒著跑回起點」）', () => {
  let hit = null;
  for (let f = 1; f <= 200 && !hit; f += 1) {
    const ok = replanAt(f, 'bquick');
    if (ok.ai.callOutcome?.outcome !== 'command') continue; // 先確認這球本來叫得成
    const mb = ok.ai.attackerId;
    const base = planWith({ flightId: f });
    const mRoute = base.ai.approach.routes.find((r) => r.pid === mb);
    if (mRoute?.startTick == null) continue;
    const advance = (mRoute.startTick - base.g.tick) + 1;
    if (advance <= 0) continue;
    const late = replanAt(f, 'bquick', { advanceTicks: advance });
    if (late.ai.callOutcome?.reason === 'launched') hit = late;
  }
  assert.ok(hit, '推過起步點之後仍改得動＝單人型漏了「已起跑者不得改線」');
  const { ai, before, beforeCombo } = hit;
  assert.equal(ai.callOutcome.outcome, 'infeasible');
  assert.deepEqual(ai.approach, before, '改判被拒卻仍動了助跑線');
  assert.deepEqual(ai.attackCombo ?? null, beforeCombo, '改判被拒卻仍動了組合');
});

test('卷五・決定論：同 seed 同輸入的 B 快結果逐值相同', () => {
  for (let f = 1; f <= 30; f += 1) {
    const a = replanAt(f, 'bquick');
    const b = replanAt(f, 'bquick');
    assert.ok(a.ai.callOutcome, `flightId=${f}：沒產生任何回饋＝這一輪比的是兩個 null`);
    assert.deepEqual(a.ai.callOutcome, b.ai.callOutcome);
    assert.deepEqual(a.ai.approach, b.ai.approach);
    assert.deepEqual(a.ai.attackCombo ?? null, b.ai.attackCombo ?? null);
  }
});

// ---------------- 決定論 ----------------

test('決定論：同 seed 同輸入的叫牌結果逐值相同（planWith 與 replanAt 兩個治具都要）', () => {
  for (let f = 1; f <= 30; f += 1) {
    const a = planWith({ flightId: f, replanCall: { type: 'cross', callerId: 'A2' } });
    const b = planWith({ flightId: f, replanCall: { type: 'cross', callerId: 'A2' } });
    assert.ok(a.ai.callOutcome, `flightId=${f}：沒產生任何回饋＝這一輪比的是兩個 null`);
    assert.deepEqual(a.ai.callOutcome, b.ai.callOutcome);
    assert.deepEqual(a.ai.approach, b.ai.approach);
    const ra = replanAt(f, 'cross');
    const rb = replanAt(f, 'cross');
    assert.deepEqual(ra.ai.callOutcome, rb.ai.callOutcome);
    assert.deepEqual(ra.ai.approach, rb.ai.approach);
  }
});

test('壽命：叫牌回饋隨死球作廢，殘留的改判指令也不得跨死球生效', () => {
  const { g, ai } = planWith({ flightId: 1 });
  ai.callOutcome = { type: 'cross', mode: 'replan', outcome: 'infeasible', reason: 'hasMain', mainId: 'A2', flightId: 1 };
  ai.replanCall = { type: 'delay', callerId: 'A2' };
  g.phase = 'serve';
  aiCollectIntents(g, ai);
  assert.equal(ai.callOutcome, null, '死球後上一球的回饋沒清＝新的一球會看到舊字卡');
  // ★ 卷五裁定 2：戰術只管一球 ★ 舊制（卷三段 3）在此守的是相反的事——
  // 「死球窗正是叫牌的時機，calledPlay 不得被清」。入口搬進球內之後那句話不成立了：
  // 死球窗不再收戰術輸入，任何殘留指令跨死球生效都是玩家沒下過的命令。
  assert.equal(ai.replanCall, null, '殘留的改判指令跨死球活下來＝玩家沒下過的命令會生效');
});

// ---------------- 卷尾：死球窗面板已整支退場（2026-08-02 卷五）----------------
//
// 【已刪除】原本此處有『卷尾：callPanel 不得自留叫牌鏡像，狀態一律現讀
// aiState.calledPlay』：靜態掃描 `src/ui/callPanel.js` 守「鏡像變數不存在／
// clearPending 兩端都沒有／現讀管道接得上」。
// ★ 留痕（§六表明列）：那個修復本身就證明了鏡像設計不可行 ★——真相的清除點是
// 「被覆寫」，沒有事件可掛，於是顯示與行為必然分岔。卷五裁定 1 把整個死球窗入口
// 拆掉，`callPanel.js` 與 `handlers.calledPlayOf` 一併不存在，這條測試失去標的。
// 它守的「面板不得自留鏡像」在球內入口上由設計本身保證：遠段面板每幀重繪、
// 選項池現算（`callOptionsFor`），沒有可鏡像的長壽狀態。
test('卷尾：死球窗叫戰術的入口確實不存在（拆一半比不拆更危險）', () => {
  const loop = stripComments(readFileSync(join(SRC, 'app', 'matchLoop.js'), 'utf8'));
  const stage = stripComments(readFileSync(join(SRC, 'app', 'matchStage.js'), 'utf8'));
  const tape = stripComments(readFileSync(join(SRC, 'app', 'rallyTape.js'), 'utf8'));
  // ① UI 檔本體不得復活
  assert.throws(() => readFileSync(join(SRC, 'ui', 'callPanel.js'), 'utf8'),
    'src/ui/callPanel.js 又回來了＝死球窗入口復活（卷五裁定 1）');
  // ② 寫入／讀取管道兩端都不得留
  assert.ok(!/handlers\.callPlay\b/.test(loop), 'matchLoop 仍留著 callPlay 寫入管道');
  assert.ok(!/calledPlayOf/.test(loop), 'matchLoop 仍留著 calledPlayOf 讀取管道');
  assert.ok(!/callPanel/.test(stage), 'matchStage 仍在建死球窗面板');
  assert.ok(!/callPanel/.test(loop), 'matchLoop 仍在同步死球窗面板');
  // ③ 錄影白名單要跟著收——留著等於錄一個永遠是 null 的欄位，重演端會誤以為它有意義
  assert.ok(!/'calledPlay'/.test(tape), 'rallyTape 白名單仍列著 calledPlay');
  // ④ 技術閘**不得**跟著退場：它改掛球內入口，是遠段改判選項池的唯一開關
  assert.ok(/gates\.canCallPlay|s\.gates\.canCallPlay/.test(loop),
    '球內遠段入口沒有吃 gates.canCallPlay＝技術閘被一起拆掉了（護欄 1）');
});


// ---------------- 失敗理由文案的完整性護欄（2026-08-04）----------------
//
// ★ 為什麼要這一條 ★
// `hasMain` 漏了文案一整輪沒人發現——玩家撞上它時看到的是 fallback「這球湊不出來」，
// 也就是**最模糊的那一句**，而它是真的會發生的（前排主攻跑 `left_inside` 而非 `left`
// 時叫交叉就會撞上）。sim 端每新增一個 reason，input 層就得補一句話，
// 這種「兩邊各改一半」的漏接靠人眼盯不住，用測試釘。

test('每一個失敗 reason 都要有專屬文案（不得掉進 fallback「這球湊不出來」）', () => {
  const generic = '這球湊不出來';
  const missing = [];
  for (const reason of ALL_CALL_REASONS) {
    const card = callFeedbackOf({
      type: 'cross', mode: 'command', outcome: 'infeasible', reason, mainId: 'A2', flightId: 1,
    });
    assert.ok(card, `reason=${reason} 連字卡都生不出來`);
    if (card.text.includes(generic)) missing.push(reason);
  }
  assert.deepEqual(missing, [],
    `這些 reason 沒有專屬文案、會顯示成「${generic}」：${missing.join('／')}`);
});

test('★鑑別力★ 拿掉任一句文案，上面那條護欄要能抓到', () => {
  // 用一個不在表裡的 reason 模擬「漏寫文案」——它必須掉進 fallback（＝護欄的偵測對象）
  const card = callFeedbackOf({
    type: 'cross', mode: 'command', outcome: 'infeasible',
    reason: '__不存在的reason__', mainId: 'A2', flightId: 1,
  });
  assert.ok(card.text.includes('這球湊不出來'),
    'fallback 機制本身壞了＝上面那條護欄失去偵測能力');
});
