// 組合攻擊卷 段 B —— 組合結構＋交叉（第一次把新線接上抽籤）
//
// 本檔守的四件事：
//   ① **排程順序**（裁定 A 乙）：選人 → 組合 → 寫回池 → 算 route。`pickAttackPoint`
//      一格未動＝trust 分佈零漂移，這是裁定 A 乙的驗收條件本身。順序一旦被調換，
//      整個裁定就失效，而那**不會讓任何既有測試轉紅** ⇒ 這裡用靜態順序斷言釘住。
//   ② **交叉既不恆假也不恆真**：真實池上組合得出來（恆假否證），且改掉任一前置條件
//      就組不出來（恆真否證）。只有前者＝把門檻放寬到人人及格（`02 §6.1` 條 6）。
//   ③ **誘餌不得長出旗標**（護欄 1／藍圖 §六）：sim 的走位分支（COMBO-SCAN 區）
//      不得出現 `attackCombo`／`partnerId`。範式抄 block-persona.test.mjs 的 B1-SCAN。
//   ④ **配合者不吃 trust**（裁定 B）：用 trust 選誘餌語意是反的。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, attackPointsOf } from '../src/sim/ai.js';
import {
  applyRouteKinds, applyComboRoutes, planCombination, evaluateCombination,
  crossGeometryOf, CROSS_PLAY_RATE, CROSS_RATE, setAimFor, takeoffSpotFor,
} from '../src/sim/approach.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'sim');

// 逐行剝掉行註解後再掃（本專案不用區塊註解）。行尾先正規化——CRLF 工作區下
// `//…\r` 會整條剝不掉，2026-07-29 的 repo 級缺陷（block-persona.test.mjs:160 有全文）
const stripComments = (src) => src
  .replace(/\r\n?/g, '\n')
  .split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n');

const aiSrc = () => readFileSync(join(SRC, 'ai.js'), 'utf8');

// 真實池：seed 3 的預設陣容（A1=S／A2,A5=OH／A3,A6=MB／A4=OPP）
function poolOf(flightId = 1, { seed = 3, passTier = 'perfect' } = {}) {
  const g = createGame({ seed });
  const pts = attackPointsOf(g, 'A', 'A1', passTier);
  return applyRouteKinds(pts, { flightId, seed, passTier });
}
const idOf = (pts, kind) => pts.find((p) => p.kind === kind)?.pid ?? null;

// ---------------- ① 排程順序（裁定 A 乙的機械證明） ----------------

test('段 B 順序：選人 → 組合 → 寫回池 → 算 route，且 pickAttackPoint 本體零組合字樣', () => {
  const src = stripComments(aiSrc());
  const iPick = src.indexOf('pickAttackPoint(game, team, aiState.claimId, tier, points)');
  const iPlan = src.indexOf('planCombination(');
  const iApply = src.indexOf('applyComboRoutes(');
  const iRoutes = src.indexOf('approachRoutesFor(team, comboPoints');
  assert.ok(iPick > 0, '找不到 pickAttackPoint 的呼叫點——順序斷言失去標的');
  assert.ok(iPlan > 0 && iApply > 0 && iRoutes > 0, '找不到組合排程層的呼叫點');
  assert.ok(iPick < iPlan, 'planCombination 排到了 pickAttackPoint 之前＝trust 分佈會被組合帶偏');
  assert.ok(iPlan < iApply, 'applyComboRoutes 必須在 planCombination 之後');
  assert.ok(iApply < iRoutes, 'approachRoutesFor 必須吃寫回後的池，否則舉球落點與助跑終點分家');
  // pickAttackPoint 的函式本體不得讀到任何組合狀態（它必須對組合一無所知）
  const body = src.slice(src.indexOf('function pickAttackPoint('));
  const fnBody = body.slice(0, body.indexOf('\n}\n') + 2);
  assert.ok(fnBody.includes('pickByWeights'), '擷取到的 pickAttackPoint 函式本體不對');
  for (const w of ['attackCombo', 'planCombination', 'combo']) {
    assert.ok(!fnBody.includes(w), `pickAttackPoint 本體出現 ${w}＝選人被組合污染`);
  }
});

// ---------------- ③ 護欄 1：誘餌不得長出旗標 ----------------

test('護欄 1：sim 走位分支（COMBO-SCAN 區）零 attackCombo／partnerId＝誘餌維持湧現式', () => {
  const src = aiSrc();
  const hits = [...src.matchAll(/COMBO-SCAN-BEGIN[^\n]*\n([\s\S]*?)COMBO-SCAN-END/g)];
  assert.equal(hits.length, 1, 'ai.js 的 COMBO-SCAN 掃描區被移除或改名');
  const body = stripComments(hits[0][1]);
  // 前置：掃描區真的涵蓋走位三段（助跑中／cover／等起步），不是一個空殼
  for (const anchor of ['approachRunOf', 'coverPosition', 'ACTION_PHASE.WAIT']) {
    assert.ok(body.includes(anchor), `COMBO-SCAN 區沒有涵蓋 ${anchor}＝掃描範圍被縮到無效`);
  }
  for (const w of ['attackCombo', 'partnerId']) {
    assert.ok(!body.includes(w),
      `ai.js 的 COMBO-SCAN 區出現 ${w}＝誘餌從湧現變成內建旗標`);
  }
});

test('護欄的護欄：剝註解不得剝過頭（真的偷讀要抓得到，註解裡提到不算）', () => {
  const cheat = 'const p = aiState.attackCombo.partnerId;\r\n// 註解裡提到 attackCombo\r\n';
  const stripped = stripComments(cheat);
  assert.ok(/attackCombo/.test(stripped), '剝過頭：真的讀了也被剝掉');
  assert.equal((stripped.match(/attackCombo/g) ?? []).length, 1, '註解那一行沒被剝乾淨');
});

// ---------------- ② 交叉：恆假否證（真實池上組合得出來） ----------------

test('交叉成立：真實池上組合得出來，結構欄位齊備且指向 OH＋MB', () => {
  let found = null;
  for (let f = 1; f <= 400 && !found; f += 1) {
    const pts = poolOf(f);
    const oh = idOf(pts, 'left');
    if (!oh) continue; // 這一球 OH 被抽成內切
    const combo = planCombination(pts, oh, { team: 'A', flightId: f, seed: 3 });
    if (combo) found = { combo, pts, f };
  }
  assert.ok(found, '400 顆球都組不出交叉＝條件恆假（段 B 的核心產出不存在）');
  const { combo, pts } = found;
  assert.equal(combo.type, 'cross');
  assert.equal(combo.mainKind, 'cross');
  assert.equal(combo.partnerKind, 'quick');
  assert.equal(combo.mainId, idOf(pts, 'left'), 'mainId 必須就是主攻者本人');
  assert.equal(combo.partnerId, idOf(pts, 'quick'), '配合者必須是跑快攻的 MB');
  assert.equal(combo.tempoGap, null, '裁定 D 丙＝tempoGap 本段留白（欄位在、值不用）');
});

test('交叉的幾何三條件在 cross×quick 上全部成立（藍圖 §四 條件 2／3／5）', () => {
  for (const team of ['A', 'B']) {
    const geo = crossGeometryOf(team, 'cross', 'quick');
    assert.ok(geo.crosses, '條件 2 穿越不成立＝助跑線段沒有含到快攻起跳點的 lx');
    assert.ok(geo.behind, '條件 3 後方不成立＝沒有從快攻手身後穿過去');
    assert.ok(geo.outOfReach, '條件 5 搆不到不成立＝跟死快攻的中間攔網手照樣構得到');
    assert.ok(geo.ok);
    // 逐值留痕（段 A 的符號驗算）：lz(0)=2.370、擊球點距離 hypot(1.3,0.3)=1.334
    assert.equal(geo.lzAtLane.toFixed(3), '2.370');
    assert.equal(geo.gap.toFixed(3), '1.334');
    assert.ok(geo.gap > TUNING.BLOCK_REACH_X, '搆不到的門檻必須是 sim 實際的攔網涵蓋半寬');
  }
});

// ---------------- ② 交叉：恆真否證（改掉任一前置條件就組不出來） ----------------

test('非恆真 A：主攻者不是跑 left 的人（quick／right／pipe／內切）一律組不出交叉', () => {
  const pts = poolOf(1);
  for (const kind of ['quick', 'right', 'pipe', 'dball']) {
    const pid = idOf(pts, kind);
    if (!pid) continue;
    for (let f = 1; f <= 60; f += 1) {
      assert.equal(planCombination(pts, pid, { team: 'A', flightId: f, seed: 3 }), null,
        `主攻者跑 ${kind} 卻組出了交叉`);
    }
  }
  // 內切（left_inside）也不得升級——CROSS_RATE 的機率帶必須一格不動（裁定 C 甲）
  const inside = poolOf(4);
  const insideId = idOf(inside, 'left_inside');
  assert.ok(insideId, 'seed 3／flightId 4 應抽到內切（前置條件失效，下面的斷言會空洞成立）');
  for (let f = 1; f <= 60; f += 1) {
    assert.equal(planCombination(inside, insideId, { team: 'A', flightId: f, seed: 3 }), null,
      '內切被升級成交叉＝CROSS_RATE 的機率帶被吃掉');
  }
});

test('非恆真 B：一傳不到位（ok／poor）組不出交叉——與 routeKindFor 同一道階梯', () => {
  const pts = poolOf(1).map((p) => ({ ...p, tier: 'ok' }));
  const oh = idOf(pts, 'left');
  assert.ok(oh);
  for (let f = 1; f <= 120; f += 1) {
    const ev = evaluateCombination(pts, oh, { team: 'A', flightId: f, seed: 3 });
    assert.equal(ev.combo, null);
    assert.equal(ev.checks.tier, false, '擋下來的應該是 tier 這一條');
  }
});

test('非恆真 C：池內沒有快攻手（MB 不在池裡）＝交叉自然不成立，且擋在 partner 那一條', () => {
  const full = poolOf(1);
  const oh = idOf(full, 'left');
  const noQuick = full.filter((p) => p.kind !== 'quick');
  assert.ok(oh && noQuick.length === full.length - 1, '前置：池內原本要有一名快攻手');
  for (let f = 1; f <= 120; f += 1) {
    const ev = evaluateCombination(noQuick, oh, { team: 'A', flightId: f, seed: 3 });
    assert.equal(ev.combo, null);
    assert.equal(ev.checks.tier, true);
    assert.equal(ev.checks.partner, false, '擋下來的應該是「池內有快攻配合者」那一條');
  }
  // 一傳 poor 的真實池本來就沒有快攻（attackPointsOf 的 tier === 'perfect' 條件）
  assert.equal(poolOf(1, { passTier: 'poor' }).some((p) => p.kind === 'quick'), false);
});

test('非恆真 D：幾何三條件不是人人及格——同線配對會擋在條件 3／5', () => {
  // 配合者若跑 cross 自己那條線：穿越成立（端點），但「後方」與「搆不到」都不成立
  const same = crossGeometryOf('A', 'cross', 'cross');
  assert.equal(same.behind, false, '同一條線不該算成「從對方身後穿過」');
  assert.equal(same.outOfReach, false, '同一點的距離 0 不該算成「攔網手搆不到」');
  assert.equal(same.ok, false);
  // 內切（left_inside）根本穿不過 lx=0——這正是段 A 之前條件 2 恆假的那件事
  assert.equal(crossGeometryOf('A', 'left_inside', 'quick').crosses, false);
  // 不存在的線回全 false，不丟例外（避免旁枝錯誤蓋掉行為斷言）
  assert.equal(crossGeometryOf('A', 'no_such_line', 'quick').ok, false);
  assert.equal(crossGeometryOf('A', 'cross', 'no_such_line').ok, false);
});

test('非恆真 E：觸發骰真的在擋——名目比例約 CROSS_PLAY_RATE，且不是恆過', () => {
  const oh = idOf(poolOf(1), 'left');
  let hit = 0;
  const N = 600;
  for (let f = 1; f <= N; f += 1) {
    // 固定用同一顆「主攻者跑 left」的池，只讓骰子變——量的才是骰子本身
    if (evaluateCombination(poolOf(1), oh, { team: 'A', flightId: f, seed: 3 }).checks.roll) hit += 1;
  }
  assert.ok(hit > 0 && hit < N, `觸發骰恆假或恆真（${hit}/${N}）`);
  assert.ok(Math.abs(hit / N - CROSS_PLAY_RATE) < 0.06,
    `觸發率 ${(hit / N * 100).toFixed(1)}% 偏離名目 ${CROSS_PLAY_RATE * 100}%`);
  // 內切的機率一格未動（裁定 C 甲的釘子）
  assert.equal(CROSS_RATE, 0.3);
});

// ---------------- ④ 配合者不吃 trust（裁定 B） ----------------

test('裁定 B：配合者由幾何最近者決定，把 trust 拉到極端也不改變選誰', () => {
  const g = createGame({ seed: 3 });
  const pts = applyRouteKinds(attackPointsOf(g, 'A', 'A1', 'perfect'),
    { flightId: 1, seed: 3, passTier: 'perfect' });
  const oh = idOf(pts, 'left');
  const quick = idOf(pts, 'quick');
  assert.ok(oh && quick);
  let f = 1;
  while (f <= 400 && !planCombination(pts, oh, { team: 'A', flightId: f, seed: 3 })) f += 1;
  const base = planCombination(pts, oh, { team: 'A', flightId: f, seed: 3 });
  assert.ok(base, '找不到成立的交叉，下面的對照無意義');
  // trust 是 pickAttackPoint 的入參，不是 planCombination 的——後者連 game 都拿不到
  assert.equal(planCombination.length <= 3, true, 'planCombination 不該需要 game 才算得出來');
  for (const t of [0, 100]) {
    g.players[quick].trust.baseline = t;
    g.players[quick].trust.floorShare = t / 100;
    const again = planCombination(pts, oh, { team: 'A', flightId: f, seed: 3 });
    assert.deepEqual(again, base, `把配合者的 trust 改成 ${t} 之後組合變了＝配合者吃了 trust`);
  }
});

// ---------------- applyComboRoutes：只動兩人、不改入參 ----------------

test('applyComboRoutes：只改涉及的兩人，其餘 point 連物件參照都不換；且不改入參', () => {
  const pts = poolOf(1);
  const oh = idOf(pts, 'left');
  let f = 1;
  while (f <= 400 && !planCombination(pts, oh, { team: 'A', flightId: f, seed: 3 })) f += 1;
  const combo = planCombination(pts, oh, { team: 'A', flightId: f, seed: 3 });
  assert.ok(combo);
  const before = JSON.parse(JSON.stringify(pts));
  const out = applyComboRoutes(pts, combo);
  assert.deepEqual(pts, before, 'applyComboRoutes 改動了入參（純函式契約破了）');
  assert.equal(out.length, pts.length);
  for (let i = 0; i < pts.length; i += 1) {
    assert.equal(out[i].pid, pts[i].pid, '順序不得變（決定論吃池內序）');
    if (pts[i].pid === combo.mainId) {
      assert.equal(out[i].kind, 'cross');
      assert.equal(out[i].rowFactor, pts[i].rowFactor, 'trust 權重的入參不得被組合動到');
      assert.equal(out[i].tier, pts[i].tier);
    } else {
      // 快攻手本來就跑 quick＝partnerKind 相同 ⇒ 連新物件都不該建
      assert.equal(out[i], pts[i], `${pts[i].pid} 不在組合內卻被換了物件`);
    }
  }
  // combo 為 null＝原封不動的同一個陣列
  assert.equal(applyComboRoutes(pts, null), pts);
});

// ---------------- 實跑：交叉真的被打出來 ----------------

function runSet(seed) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const combos = [];
  const spikes = [];
  const log = [];
  let prev = null;
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const intents = aiCollectIntents(g, ai);
    if (ai.approach && ai.approach !== prev) {
      prev = ai.approach;
      if (ai.attackCombo) {
        const route = ai.approach.routes.find((r) => r.pid === ai.attackCombo.mainId);
        const pRoute = ai.approach.routes.find((r) => r.pid === ai.attackCombo.partnerId);
        combos.push({
          ...ai.attackCombo,
          attackerId: ai.attackerId,
          attackKind: ai.attackKind,
          mainRouteKind: route?.kind ?? null,
          partnerRouteKind: pRoute?.kind ?? null,
        });
      }
      log.push(`${g.tick}:${ai.attackerId}/${ai.attackKind}/`
        + `${ai.attackCombo ? `${ai.attackCombo.mainId}x${ai.attackCombo.partnerId}` : '-'}`);
    }
    for (const e of stepGame(g, intents)) {
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.touches === 3) {
        spikes.push({ pid: e.playerId, kind: ai.attackKind });
      }
    }
  }
  return { combos, spikes, log, ai };
}

const live = [11, 12, 13, 14].map(runSet);
const allCombos = live.flatMap((r) => r.combos);
const allSpikes = live.flatMap((r) => r.spikes);

test('實跑：交叉真的發生（非 0），且組合內兩人的 route 與組合宣稱的線一致', () => {
  assert.ok(allCombos.length > 10, `四局只組出 ${allCombos.length} 次交叉＝樣本不足以說「真的發生」`);
  for (const c of allCombos) {
    assert.equal(c.type, 'cross');
    assert.equal(c.mainId, c.attackerId, '組合的主攻者必須就是本波的攻擊手');
    assert.equal(c.attackKind, 'cross', 'attackKind 沒跟著改＝二傳會瞄舊落點');
    assert.equal(c.mainRouteKind, 'cross', '主攻者的 route 沒改成交叉線');
    assert.equal(c.partnerRouteKind, 'quick', '配合者的 route 不是快攻');
    assert.notEqual(c.mainId, c.partnerId);
  }
  // 真的有人拿 cross 扣成（不是只在規劃層存在）
  assert.ok(allSpikes.filter((s) => s.kind === 'cross').length > 5,
    '沒有任何一次交叉真的扣成＝組合只活在規劃層');
});

test('實跑：交叉的舉球落點與助跑終點對得上（順序錯就會分家）', () => {
  const aim = setAimFor(null, 'A', null, 'cross');
  const takeoff = takeoffSpotFor('A', 'cross');
  const quick = takeoffSpotFor('A', 'quick');
  assert.ok(Math.hypot(takeoff.x - quick.x, takeoff.z - quick.z) > TUNING.BLOCK_REACH_X);
  assert.equal(aim.lx, 1.3);
});

test('決定論：同 seed 兩次整局，組合分配逐值相同', () => {
  const a = runSet(11);
  const b = runSet(11);
  assert.ok(a.log.length > 50, `樣本足夠（${a.log.length}）`);
  assert.equal(a.log.length, b.log.length);
  for (let i = 0; i < a.log.length; i += 1) {
    assert.equal(a.log[i], b.log[i], `第 ${i} 筆組合分配不一致`);
  }
});

// ---------------- 壽命：兩處清空點 ----------------

test('壽命：attackCombo 與 approach 同壽命——非 rally 與來球兩處都清空', () => {
  const g = createGame({ seed: 11, setTarget: 25 });
  const ai = createAiState();
  assert.equal(ai.attackCombo, null, 'createAiState 沒有這個欄位＝重演端建不出同一份狀態');
  let sawCombo = false;
  let leak = 0;
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 60000) {
    guard += 1;
    const intents = aiCollectIntents(g, ai);
    if (ai.attackCombo) sawCombo = true;
    // 死球／發球階段：上一球的組合必須已經作廢
    if (g.phase !== 'rally' && ai.attackCombo) leak += 1;
    // 來球（對方持球）：本波沒有我方的攻擊要組合
    if (g.phase === 'rally' && g.rally.touches === 0 && ai.attackCombo) leak += 1;
    stepGame(g, intents);
  }
  assert.ok(sawCombo, '整局沒出現過組合＝下面的清空斷言空洞成立');
  assert.equal(leak, 0, `組合殘留到非 rally／來球階段 ${leak} tick＝壽命與 approach 不同步`);
});
