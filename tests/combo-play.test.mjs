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
  routeTicks, approachRoutesFor, AIR_TICKS, CROSS_TEMPO_GAP,
  tandemGeometryOf, delayTimingOf, COMBO_TYPES, TANDEM_DEPTH_M,
  TANDEM_PLAY_RATE, DELAY_PLAY_RATE, DELAY_WINDOW, DELAY_TEMPO, SET_TO_HIT_TICKS,
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
    // 段 C：同一名 OH 也可能被排成 delay（只換節奏不換線）——本條只驗交叉
    const combo = planCombination(pts, oh, { team: 'A', flightId: f, seed: 3 });
    if (combo?.type === 'cross') found = { combo, pts, f };
  }
  assert.ok(found, '400 顆球都組不出交叉＝條件恆假（段 B 的核心產出不存在）');
  const { combo, pts } = found;
  assert.equal(combo.type, 'cross');
  assert.equal(combo.mainKind, 'cross');
  assert.equal(combo.partnerKind, 'quick');
  assert.equal(combo.mainId, idOf(pts, 'left'), 'mainId 必須就是主攻者本人');
  assert.equal(combo.partnerId, idOf(pts, 'quick'), '配合者必須是跑快攻的 MB');
  // 段 B2：由留白（null）改為實值＝主攻者提早起步幾 tick
  assert.equal(combo.tempoGap, CROSS_TEMPO_GAP, 'tempoGap 沒帶上本段的偏移量');
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

test('非恆真 A：主攻者的線決定他能升級成哪一型——不在名單上的線一型都組不出來', () => {
  const pts = poolOf(1);
  // 段 C：每一型只吃指定的來源線。'right' 現在**可以**升級成夾塞／時間差，
  // 所以這裡逐型分開斷言（合併成「一律 null」會把新型別的成立誤判成回歸）。
  const ALLOWED = { quick: [], pipe: [], dball: [], right: ['tandem', 'delay'] };
  for (const kind of Object.keys(ALLOWED)) {
    const pid = idOf(pts, kind);
    if (!pid) continue;
    for (let f = 1; f <= 60; f += 1) {
      const c = planCombination(pts, pid, { team: 'A', flightId: f, seed: 3 });
      assert.ok(c === null || ALLOWED[kind].includes(c.type),
        `主攻者跑 ${kind} 卻組出了 ${c?.type}`);
      assert.notEqual(c?.type, 'cross', `主攻者跑 ${kind} 卻組出了交叉`);
    }
  }
  // 內切（left_inside）不得升級成**任何一型**——CROSS_RATE 的機率帶必須一格不動
  // （裁定 C 甲）；且它走 t=0.75 高球弧，被 delay 指派成二速會擊球前罰站 0.7s（破硬線）
  const inside = poolOf(4);
  const insideId = idOf(inside, 'left_inside');
  assert.ok(insideId, 'seed 3／flightId 4 應抽到內切（前置條件失效，下面的斷言會空洞成立）');
  for (let f = 1; f <= 60; f += 1) {
    assert.equal(planCombination(inside, insideId, { team: 'A', flightId: f, seed: 3 }), null,
      '內切被升級成組合＝CROSS_RATE 的機率帶被吃掉／或高球弧被指派成二速');
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
  const crossAt = (i) => {
    const c = planCombination(pts, oh, { team: 'A', flightId: i, seed: 3 });
    return c?.type === 'cross' ? c : null;
  };
  while (f <= 400 && !crossAt(f)) f += 1;
  const combo = crossAt(f);
  assert.ok(combo, '400 顆球都沒抽到交叉＝下面的「只改兩人」斷言會空洞成立');
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
          mainRouteTempo: route?.tempo ?? null,
          partnerRouteKind: pRoute?.kind ?? null,
          partnerRouteTempo: pRoute?.tempo ?? null,
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

test('實跑：出廠開著的兩型真的發生、夾塞零發生，且組合內兩人的 route 與組合宣稱的線一致', () => {
  assert.ok(allCombos.length > 10, `四局只組出 ${allCombos.length} 次組合＝樣本不足以說「真的發生」`);
  const byType = {};
  for (const c of allCombos) byType[c.type] = (byType[c.type] ?? 0) + 1;
  // ★ 恆假否證：出廠開著的兩型**各自**都要出得來（合計非 0 不算——那可能全是交叉）★
  //   2026-07-31 裁定丙：tandem 出廠關閉（TANDEM_PLAY_RATE=0），從本條移到下面的
  //   「關閉確實生效」＋「機制仍在」兩條。**這不是把斷言拿掉**：交叉與時間差留在原位，
  //   夾塞的機制改由直接呼叫層驗（見『段 C ⑧』『裁定丙：機制仍在』兩測），
  //   而這裡多了一條原本沒有的硬斷言——夾塞必須是 **0**，關閉失效會轉紅。
  for (const t of ['cross', 'delay']) {
    assert.ok((byType[t] ?? 0) > 0, `四局一次都沒組出 ${t}（實測分佈 ${JSON.stringify(byType)}）`);
  }
  assert.equal(TANDEM_PLAY_RATE, 0, '出廠值應為 0（裁定丙）——若已重開，本條該改回三型齊發版');
  assert.equal(byType.tandem ?? 0, 0,
    `TANDEM_PLAY_RATE=0 四局仍組出 ${byType.tandem} 次夾塞＝關閉失效（實測分佈 ${JSON.stringify(byType)}）`);
  // ★ 驗收 ②：同一波不得同時被計為兩型——結構上 attackCombo 只有一個 type，
  //   這裡連同「型別必須是登記過的三型之一」一起釘（多長一型出來也會轉紅）★
  for (const c of allCombos) {
    assert.ok(['cross', 'tandem', 'delay'].includes(c.type), `未登記的組合型別 ${c.type}`);
    assert.equal(c.mainId, c.attackerId, '組合的主攻者必須就是本波的攻擊手');
    assert.equal(c.partnerRouteKind, 'quick', '配合者的 route 不是快攻');
    assert.notEqual(c.mainId, c.partnerId);
    if (c.type === 'cross' || c.type === 'tandem') {
      assert.equal(c.attackKind, c.type, 'attackKind 沒跟著改＝二傳會瞄舊落點');
      assert.equal(c.mainRouteKind, c.type, `主攻者的 route 沒改成 ${c.type} 線`);
      assert.equal(c.mainTempo, null, `${c.type} 不該指派節奏（節奏由 tempoFor 給）`);
    } else {
      // delay 只換節奏不換線：線必須**維持原樣**（否則二傳的落點會跟著搬家）
      assert.ok(['left', 'right'].includes(c.mainKind), `delay 的主攻線不該是 ${c.mainKind}`);
      assert.equal(c.attackKind, c.mainKind, 'delay 動到了攻擊線（它只該動節奏）');
      assert.equal(c.mainRouteKind, c.mainKind, 'delay 動到了主攻者的 route 線');
      assert.equal(c.mainTempo, 'two', 'delay 沒把主攻者指派成二速＝時間差不會發生');
      assert.equal(c.mainRouteTempo, 'two', '指派的節奏沒落到 route 上');
    }
  }
  // 真的有人拿新線扣成（不是只在規劃層存在）
  assert.ok(allSpikes.filter((s) => s.kind === 'cross').length > 0,
    '沒有任何一次 cross 真的扣成＝組合只活在規劃層');
  // 夾塞出廠關閉 ⇒ 連扣球端也必須是 0（關閉若只擋在規劃層、卻讓舊 route 漏到扣球端，
  // 上面的 byType 斷言看不見，這一條看得見）
  assert.equal(allSpikes.filter((s) => s.kind === 'tandem').length, 0,
    '夾塞出廠關閉，卻仍有人以 tandem 線扣成');
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

// ================= 段 B2：tempoGap（前後腳偏移） =================
//
// 本段守三件事：
//   ⑤ 偏移只掛在**主攻者**身上，且 combo 為 null 時逐值等同段 B（零率對照的單元版）
//   ⑥ **罰站硬線**（07-23 Sawmah 拍板 0.5s）：偏移是拿罰站換前後腳的，
//      這條就是那筆交易的上限。把 CROSS_TEMPO_GAP 調到 70 以上會讓它轉紅（鑑別力）。
//   ⑦ 起步後**不得倒著跑回助跑起點**：三速原本在二傳觸球後會被「一氣呵成」叫回
//      起點等，帶偏移的人已經在半路上，叫回去就是倒退跑（approachLaunched 的守門）。

test('段 B2 偏移語意：comboLead 把整條 route 往前平移，0 時逐值等同段 B', () => {
  const SET = 1000;
  const run = 79;
  const base = routeTicks('three', SET, run);
  assert.deepEqual(base, { startTick: SET, takeoffTick: SET + run, settleTick: SET + run + AIR_TICKS },
    '三速的黃金錨點被動到了');
  assert.deepEqual(routeTicks('three', SET, run, 0), base, 'comboLead=0 必須逐值等同不帶偏移');
  const lead = routeTicks('three', SET, run, 30);
  assert.equal(lead.startTick, SET - 30, '起步應比二傳觸球早 30 tick');
  assert.equal(lead.takeoffTick, base.takeoffTick - 30, '起跳應整條跟著早 30 tick');
  assert.equal(lead.takeoffTick - lead.startTick, run, '助跑段長度不得被偏移改變');
  // 一速／二速也走同一條算式（本段沒有人用，但形式一致才不會日後分岔）
  assert.equal(routeTicks('one', SET, run, 5).takeoffTick, routeTicks('one', SET, run).takeoffTick - 5);
});

test('段 B2：comboLead 只掛在主攻者身上；combo 為 null 時全池為 0', () => {
  const pts = poolOf(1);
  const mainId = idOf(pts, 'left');
  const combo = { type: 'cross', mainId, partnerId: idOf(pts, 'quick'), tempoGap: 30, mainKind: 'cross', partnerKind: 'quick' };
  const withCombo = applyComboRoutes(pts, combo);
  const routes = approachRoutesFor('A', withCombo, { setTick: 500, flightId: 1, seed: 3, combo });
  const main = routes.find((r) => r.pid === mainId);
  assert.equal(main.comboLead, 30, '主攻者沒吃到偏移');
  assert.equal(main.startTick, 500 - 30, '主攻者的起步沒被提前');
  for (const r of routes) {
    if (r.pid === mainId) continue;
    assert.equal(r.comboLead, 0, `${r.pid}（${r.kind}）吃到了不該吃的偏移`);
  }
  // 沒有組合＝每個人都 0，且三個 tick 欄位與不傳 combo 逐值相同
  const plain = approachRoutesFor('A', pts, { setTick: 500, flightId: 1, seed: 3 });
  const nullCombo = approachRoutesFor('A', pts, { setTick: 500, flightId: 1, seed: 3, combo: null });
  assert.deepEqual(nullCombo, plain, 'combo=null 必須逐值等同不傳 combo');
  assert.ok(plain.every((r) => r.comboLead === 0));
});

// 實跑：追交叉主攻者的「擊球前連續靜止」與「有沒有倒著跑回起點」
function crossMainTrace(seed) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const stand = [];      // 每次交叉扣球時，該人已連續靜止幾 tick
  const recall = [];     // 起步後**還被叫回助跑起點**的 tick（走位目標＝起點）
  const still = {};
  const prev = {};
  let combo = null;
  let route = null;
  let farthest = 0;
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const intents = aiCollectIntents(g, ai);
    if (ai.attackCombo !== combo) {
      combo = ai.attackCombo;
      route = combo ? ai.approach.routes.find((r) => r.pid === combo.mainId) : null;
      farthest = 0;
    }
    for (const pid of Object.keys(g.actors)) {
      const a = g.actors[pid];
      const p0 = prev[pid];
      still[pid] = p0 && Math.hypot(a.x - p0.x, a.z - p0.z) < 0.005 ? (still[pid] ?? 0) + 1 : 0;
      prev[pid] = { x: a.x, z: a.z };
    }
    // 起步之後才看：走位目標（intent.aim）不得再是助跑起點。
    // ★ 為什麼看 aim 不看位置 ★「被叫回起點」是**決策**，位移只是它的殘影——
    // 一氣呵成的等待條件會隨著他退後而自己失效（退越遠 runTicks 越大），所以位移
    // 只有 ~0.5m、量位置的版本抓不到（實測：拿掉 ai.js 的守門，位移斷言仍全綠，
    // 但前後腳 p50 73→79、罰站 14→6 ⇒ 守門確實在做事，只是位移不是它的量測位置）。
    if (route?.startTick != null && g.tick > route.startTick + 2 && route.comboLead > 0) {
      const im = intents.find((x) => x.playerId === combo.mainId);
      const aim = im?.aim;
      if (aim && Math.hypot(aim.x - route.start.x, aim.z - route.start.z) < 0.2) {
        recall.push(g.tick - route.startTick);
      }
    }
    for (const e of stepGame(g, intents)) {
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.touches === 3
        && combo && e.playerId === combo.mainId) {
        stand.push(still[e.playerId] ?? 0);
      }
    }
  }
  return { stand, recall };
}

const traces = [11, 12, 13].map(crossMainTrace);
const allStand = traces.flatMap((t) => t.stand);
const allRecall = traces.flatMap((t) => t.recall);

test('段 B2 硬線：交叉主攻者擊球前連續靜止不得破 0.5s（07-23 Sawmah 拍板）', () => {
  assert.ok(allStand.length >= 8, `樣本只有 ${allStand.length} 次交叉扣球＝這條斷言空洞`);
  const over = allStand.filter((v) => v > 30); // 30 tick = 0.5s @60Hz
  const p90 = [...allStand].sort((a, b) => a - b)[Math.floor(allStand.length * 0.9)];
  assert.equal(over.length, 0,
    `${over.length}/${allStand.length} 次交叉在擊球前站超過 0.5s（p90=${p90} tick）`
    + '＝CROSS_TEMPO_GAP 拿罰站換前後腳換過頭了');
});

test('段 B2：帶偏移的主攻者起步後不得被叫回助跑起點（倒著跑）', () => {
  assert.ok(traces.some((t) => t.stand.length > 0), '三局沒有交叉扣球＝這條斷言空洞');
  assert.equal(allRecall.length, 0,
    `起步後有 ${allRecall.length} tick 的走位目標仍是助跑起點`
    + `（最早發生在起步後 ${allRecall.length ? Math.min(...allRecall) : '-'} tick）`
    + '＝一氣呵成把已經在跑的人叫回去了，偏移會被吃掉一半');
});

// ================= 段 C：夾塞 tandem ＋ 他人時間差 delay =================
//
// 本段守六件事：
//   ⑧ **夾塞的四條件既不恆假也不恆真**：tandem×quick 全過（恆假否證），
//      換任一邊的線就擋在特定那一條（恆真否證）。
//   ⑨ **兩型互斥**（藍圖 §四 夾塞條件 4）：夾塞的助跑線段不得含 lx=0，
//      也就是它不會同時被判成交叉。
//   ⑩ **DELAY_WINDOW 的鑑別力**：三速落在窗外、二速落在窗內；
//      而藍圖試算的 ±20 會讓 delay **恆假**（這條就是那個恆假的釘子）。
//   ⑪ **判準地基不得過期**：SET_TO_HIT_TICKS 是實測常數，本測試**重新量一次**再比對
//      ——改弧線卻沒回來改這裡就轉紅（delay 的窗會整個失效而沒有人察覺）。
//   ⑫ **罰站硬線**（07-23 Sawmah 拍板 0.5s）出廠開著的型別都要守，不是只有交叉
//      （夾塞出廠關閉後改守結構保證：comboLead=0 ⇒ 它結構上不拿罰站換前後腳）。
//   ⑬ **delay 只換節奏不換線**：它一旦動到路線，二傳瞄的落點就跟著搬家。

test('段 C ⑧：夾塞四條件在 tandem×quick 全成立，且逐值留痕（段 A 符號驗算的落實）', () => {
  for (const team of ['A', 'B']) {
    const geo = tandemGeometryOf(team, 'tandem', 'quick');
    assert.ok(geo.lane, '條件 1 同線不成立');
    assert.ok(geo.depth, '條件 2 前後疊不成立');
    assert.ok(geo.stagger, '條件 3 節奏錯開不成立');
    assert.ok(geo.notCrossing, '條件 4 兩型互斥不成立（夾塞同時滿足了交叉的穿越）');
    assert.ok(geo.ok);
    assert.equal(geo.laneGap.toFixed(3), '0.300');
    assert.equal(geo.depthGap.toFixed(3), '1.000');
    assert.equal(geo.staggerTicks, 54, '計畫起跳差變了＝TEMPO 表或助跑幾何被動過');
  }
  // 硬下界（藍圖 §四 條件 2）：深度門檻低於同隊避讓半徑的話，兩人每 tick 被推開
  // 條件恆真但幾何自我瓦解。0.55 = game.js 的 SEP_RADIUS。
  assert.ok(TANDEM_DEPTH_M > 0.55,
    `TANDEM_DEPTH_M ${TANDEM_DEPTH_M} 不大於 SEP_RADIUS 0.55＝夾塞會被同隊避讓推散`);
  assert.ok(tandemGeometryOf('A', 'tandem', 'quick').depthGap > 0.55);
});

test('段 C ⑧ 非恆真：換掉任一邊的線，夾塞就擋在特定那一條（不是人人及格）', () => {
  // 自己配自己：同線但沒有深度、沒有節奏差
  const same = tandemGeometryOf('A', 'tandem', 'tandem');
  assert.equal(same.depth, false, '同一條線不該算成「前後疊」');
  assert.equal(same.stagger, false, '同一條線不該算成「節奏錯開」');
  assert.equal(same.ok, false);
  // 交叉線配快攻：終點在 lx +1.3，離快攻 1.3m ⇒ 不同線，而且它**會**穿越
  const cross = tandemGeometryOf('A', 'cross', 'quick');
  assert.equal(cross.lane, false, '交叉線不該被算成與快攻同線');
  assert.equal(cross.notCrossing, false, '交叉線當然會穿越——條件 4 必須把它擋掉');
  assert.equal(cross.ok, false);
  // 沒升級的 right／left 直線配快攻：橫向差 2.9m，同線與深度都不成立
  for (const k of ['right', 'left']) {
    const g = tandemGeometryOf('A', k, 'quick');
    assert.equal(g.lane, false, `${k} 直線不該被算成與快攻同線`);
    assert.equal(g.depth, false, `${k} 直線不該被算成前後疊`);
    assert.equal(g.ok, false);
  }
  // 不存在的線回全 false，不丟例外（避免旁枝錯誤蓋掉行為斷言）
  assert.equal(tandemGeometryOf('A', 'no_such_line', 'quick').ok, false);
  assert.equal(tandemGeometryOf('A', 'tandem', 'no_such_line').ok, false);
});

test('段 C ⑨ 兩型互斥：夾塞的助跑線段不含 lx=0，且交叉的幾何判它不過', () => {
  for (const team of ['A', 'B']) {
    // 夾塞不會被判成交叉（線段 lx 區間 [0.3, 2.6] 不含 0——段 A 取 0.3 而非 0 的理由）
    assert.equal(crossGeometryOf(team, 'tandem', 'quick').crosses, false,
      '夾塞線穿過了 lx=0＝同一波會被兩型雙重計數');
    assert.equal(crossGeometryOf(team, 'tandem', 'quick').ok, false);
    // 反向：交叉線過不了夾塞的四條件
    assert.equal(tandemGeometryOf(team, 'cross', 'quick').ok, false);
  }
  // 結構面：一波只有一個 attackCombo，且來源線互斥（cross←left／tandem←right）
  assert.deepEqual(COMBO_TYPES, ['cross', 'tandem', 'delay']);
});

test('段 C ⑩ DELAY_WINDOW 的鑑別力：二速落在窗內、三速落在窗外', () => {
  const two = delayTimingOf('two', 'quick');
  const three = delayTimingOf('three', 'quick');
  const one = delayTimingOf('one', 'quick');
  assert.equal(DELAY_TEMPO, 'two', 'delay 指派的節奏變了，下面的推導要重做');
  assert.ok(two.ok, '二速不成立＝delay 恆假');
  assert.equal(two.offset, 43, '二速的 offset 變了＝弧線或起跳表被動過（見 ⑪）');
  assert.equal(three.inWindow, false,
    `三速 offset ${three.offset} 也落在窗內＝窗太寬，delay 對節奏毫無鑑別力`);
  assert.equal(one.earlier, false, '誘餌不可能比自己早起跳（一速當主攻＝條件 1 該擋）');
  // 藍圖 §四 的試算 ±20 會讓 delay 恆假——這一條就是那個恆假的釘子。
  // 實測 offset 43（不是藍圖推的 16），|43| > 20 ⇒ 一顆都不會成立。
  assert.ok(Math.abs(two.offset) > 20,
    '實測 offset 已掉進 ±20 內＝藍圖的試算重新成立，DELAY_WINDOW 要重議');
  assert.ok(DELAY_WINDOW > Math.abs(two.offset) && DELAY_WINDOW < Math.abs(three.offset),
    `DELAY_WINDOW ${DELAY_WINDOW} 沒有夾在二速 ${two.offset} 與三速 ${three.offset} 之間`);
});

// ---- ⑪ 判準地基不得過期：重新量一次 SET_TO_HIT_TICKS ----
function calibrateSetToHit(seeds) {
  const bag = {};
  for (const seed of seeds) {
    const g = createGame({ seed, setTarget: 25 });
    const ai = createAiState();
    let prev = null;
    let routes = null;
    let setTick = null;
    let guard = 0;
    while (g.phase !== 'set_over' && guard < 300000) {
      guard += 1;
      const intents = aiCollectIntents(g, ai);
      if (ai.approach && ai.approach !== prev) {
        prev = ai.approach;
        routes = ai.approach.routes ?? [];
        setTick = null;
      }
      for (const e of stepGame(g, intents)) {
        if (e.type === 'TOUCH' && e.touches === 2 && routes && ai.approach?.team === e.team) {
          setTick = g.tick;
        }
        if (e.type === 'TOUCH' && e.kind === 'spike' && e.touches === 3 && setTick != null) {
          const rt = (routes ?? []).find((x) => x.pid === e.playerId);
          if (rt) (bag[rt.tempo] ??= []).push(g.tick - setTick);
        }
      }
    }
  }
  const p50 = {};
  for (const [k, v] of Object.entries(bag)) {
    const s = [...v].sort((a, b) => a - b);
    p50[k] = s[Math.floor(s.length / 2)];
  }
  return { p50, raw: bag };
}

test('段 C ⑪ 防過期：SET_TO_HIT_TICKS 重新量一次仍吻合（弧線一改就轉紅）', () => {
  const cal = calibrateSetToHit([11, 12, 13, 14]);
  for (const t of ['one', 'two', 'three']) {
    const n = (cal.raw[t] ?? []).length;
    assert.ok(n >= 20, `${t} 的樣本只有 ${n} 筆＝這條斷言解析力不足`);
    const got = cal.p50[t];
    assert.ok(Math.abs(got - SET_TO_HIT_TICKS[t]) <= 6,
      `${t} 的 set→擊球 實測 p50=${got}，approach.js 的 SET_TO_HIT_TICKS 寫 ${SET_TO_HIT_TICKS[t]}`
      + '＝弧線常數被改過而判準地基沒跟著更新（delay 的窗會整個失效）');
  }
  // 三檔必須仍分得開（等距散開是 route B 那卷的產出，塌掉的話 delay 的鑑別力也沒了）
  assert.ok(cal.p50.two - cal.p50.one >= 15, `二速與一速的弧線靠太近（${cal.p50.one}→${cal.p50.two}）`);
  assert.ok(cal.p50.three - cal.p50.two >= 15, `三速與二速的弧線靠太近（${cal.p50.two}→${cal.p50.three}）`);
});

// ---- ⑫ 三型的罰站硬線 ----
function comboStandByType(seed) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const stand = {};
  const still = {};
  const prev = {};
  let combo = null;
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const intents = aiCollectIntents(g, ai);
    if (ai.attackCombo !== combo) combo = ai.attackCombo;
    for (const pid of Object.keys(g.actors)) {
      const a = g.actors[pid];
      const p0 = prev[pid];
      still[pid] = p0 && Math.hypot(a.x - p0.x, a.z - p0.z) < 0.005 ? (still[pid] ?? 0) + 1 : 0;
      prev[pid] = { x: a.x, z: a.z };
    }
    for (const e of stepGame(g, intents)) {
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.touches === 3
        && combo && e.playerId === combo.mainId) {
        (stand[combo.type] ??= []).push(still[e.playerId] ?? 0);
      }
    }
  }
  return stand;
}

const standTraces = [11, 12, 13].map(comboStandByType);

// 出廠開著的型別走實跑量測；關閉的型別（tandem，裁定丙）沒有實跑樣本，
// 改由**結構證明**守同一件事——理由寫在下面那條測試的註解裡。
const LIVE_COMBO_TYPES = COMBO_TYPES.filter((t) => t !== 'tandem');

test('段 C ⑫ 罰站硬線：出廠開著的型別，主攻者擊球前連續靜止不得破 0.5s（07-23 Sawmah 拍板）', () => {
  assert.deepEqual(LIVE_COMBO_TYPES, ['cross', 'delay'], '出廠開著的型別變了，本條的涵蓋要重算');
  for (const ty of LIVE_COMBO_TYPES) {
    const all = standTraces.flatMap((t) => t[ty] ?? []);
    assert.ok(all.length >= 5, `${ty} 三局只有 ${all.length} 次扣成＝這條斷言空洞`);
    const over = all.filter((v) => v > 30); // 30 tick = 0.5s @60Hz
    const p90 = [...all].sort((a, b) => a - b)[Math.floor(all.length * 0.9)];
    assert.equal(over.length, 0,
      `${ty}：${over.length}/${all.length} 次在擊球前站超過 0.5s（p90=${p90} tick）`);
  }
  // 夾塞關閉 ⇒ 三局零樣本，這是預期而非「量不到」；一旦不是 0 代表關閉失效
  assert.equal(standTraces.flatMap((t) => t.tandem ?? []).length, 0,
    '夾塞出廠關閉卻仍有扣成樣本');
});

// ★ 裁定丙（2026-07-31）：夾塞 tandem **出廠關閉、機制與測試全部保留** ★
//   關閉理由與真因見 approach.js 的 TANDEM_PLAY_RATE 註解（右線嚴格支配＋攔死 97.1%
//   來自已落地的攔網手＝攔網時序卷的病）。
//
// ★ 為什麼下面兩條「不算放水」★
//   原本守夾塞的是**實跑統計**（四局要組出 ≥1 次、三局要有 ≥5 次扣成）。骰子關到 0
//   之後那些統計必然是 0，留著只會恆紅、刪掉則連機制保護一起丟。所以改守同樣的東西、
//   但**換一個量測位置**：走真實判斷式（`evaluateCombination` / `tandemGeometryOf` /
//   `applyComboRoutes` / `approachRoutesFor`）直接呼叫，證明
//     ① 四條幾何條件在真實池上**逐球全過**——被擋掉的只有骰子那一條（結構沒死）；
//     ② 把骰子的結果手動補上去（合成一個 combo），下游整條鏈仍然把主攻者改成
//        tandem 線、二速、零偏移——也就是骰子若調回 >0，行為會原封不動回來。
//   這**不是**放寬門檻：原測只證明「有發生過」，這兩條逐球檢查 600 顆球的每一條條件，
//   鑑別力比原本的「≥1 次」更高；被拿掉的只有「它真的飛出去過」這件在關閉下不可能為真的事。
//   ⇒ 重開（TANDEM_PLAY_RATE > 0）時，本註解上方的兩條實跑斷言要改回三型齊發版。

test('裁定丙 ①：夾塞擋在骰子那一條——四條幾何條件在真實池上逐球全過，roll 恆假', () => {
  assert.equal(TANDEM_PLAY_RATE, 0, '出廠值應為 0（裁定丙）');
  const pts = poolOf(1);
  const mainId = idOf(pts, 'right');
  assert.ok(mainId, '真實池抽不到 right 主攻者＝下面的量測空洞');
  const STRUCT = ['hasMain', 'mainKind', 'tier', 'partner', 'lane', 'depth', 'stagger', 'notCrossing'];
  const N = 600;
  let rolled = 0;
  for (let f = 1; f <= N; f += 1) {
    const { combo, checks } = evaluateCombination(pts, mainId,
      { team: 'A', flightId: f, seed: 3, type: 'tandem' });
    for (const k of STRUCT) {
      assert.equal(checks[k], true,
        `flightId=${f}：結構條件 ${k} 不成立＝夾塞的機制被關閉一起打死了（不只是骰子）`);
    }
    if (checks.roll) rolled += 1;
    assert.equal(combo, null, `flightId=${f}：骰子為 0 卻組出了夾塞`);
  }
  assert.equal(rolled, 0, `${N} 顆球有 ${rolled} 次觸發骰通過＝TANDEM_PLAY_RATE 沒真的是 0`);
  // 同一組球對照：delay 的骰子照常會過（證明「逐球全 false」不是量測位置壞掉）
  const wing = idOf(pts, 'left') ?? mainId;
  let delayRolls = 0;
  for (let f = 1; f <= N; f += 1) {
    if (evaluateCombination(pts, wing, { team: 'A', flightId: f, seed: 3, type: 'delay' }).checks.roll) {
      delayRolls += 1;
    }
  }
  assert.ok(delayRolls > 0, '同一支探針量 delay 也是 0＝量到的是探針壞掉，不是夾塞關閉');
});

test('裁定丙 ②：骰子若調回 >0，下游整條鏈原封不動——合成 combo 走真實 apply 路徑', () => {
  const pts = poolOf(1);
  const mainId = idOf(pts, 'right');
  const quick = idOf(pts, 'quick');
  assert.ok(mainId && quick);
  // 這個 combo 物件＝`evaluateCombination` 在 roll 通過時**會**回傳的那一份
  // （欄位逐一照 approach.js 的 return 建；COMBO_LINE.tandem='tandem'、
  //   COMBO_TEMPO.tandem=null、COMBO_LEAD.tandem=0）
  const combo = {
    type: 'tandem',
    mainId,
    partnerId: quick,
    tempoGap: 0,
    mainTempo: null,
    mainKind: 'tandem',
    partnerKind: 'quick',
  };
  const out = applyComboRoutes(pts, combo);
  const main = out.find((p) => p.pid === mainId);
  assert.equal(main.kind, 'tandem', '主攻者沒被改成夾塞線＝applyComboRoutes 的夾塞分支死了');
  assert.equal(main.rowFactor, pts.find((p) => p.pid === mainId).rowFactor, 'trust 權重被組合動到');
  for (const p of out) {
    if (p.pid === mainId) continue;
    assert.equal(p, pts.find((x) => x.pid === p.pid), `${p.pid} 不在組合內卻被換了物件`);
  }
  // route 層：夾塞走二速（tempoFor 給的，不是被指派的）、且**零偏移**
  const routes = approachRoutesFor('A', out, { setTick: 500, flightId: 1, seed: 3, combo });
  const r = routes.find((x) => x.pid === mainId);
  assert.equal(r.kind, 'tandem');
  assert.equal(r.tempo, 'two', '夾塞的節奏不是二速＝tempoFor 的 tandem 條目被動過');
  assert.equal(r.comboLead, 0, '夾塞吃到了偏移＝COMBO_LEAD.tandem 被動過');
  // ⑫ 罰站硬線對夾塞的結構保證：偏移是拿罰站換前後腳的**唯一**來源，
  // 夾塞的 comboLead=0 ⇒ 帶 combo 的 route 必須與不帶 combo 的逐值相同
  // （時序一格未被組合層挪動 ⇒ 它的罰站就是一般二速攻擊的罰站，不會多）
  assert.deepEqual(routes, approachRoutesFor('A', out, { setTick: 500, flightId: 1, seed: 3 }),
    '夾塞的 route 被組合層挪動了時序＝它開始拿罰站換前後腳');
  // 舉球落點與助跑終點對得上（＝二傳不會瞄到舊落點）
  const aim = setAimFor(null, 'A', null, 'tandem');
  const takeoff = takeoffSpotFor('A', 'tandem');
  assert.equal(aim.t, 0.55, '夾塞的舉球弧線不是半快檔＝與二速對不上');
  assert.ok(Math.abs(aim.lx - 0.3) < 1e-9, `夾塞的舉球落點 lx=${aim.lx} 不是起跳點的 0.3`);
  assert.ok(Math.hypot(takeoff.x, takeoff.z) > 0, '取不到夾塞的起跳點');
});

test('段 C ⑬：delay 只換節奏不換線——applyComboRoutes 連物件參照都不換', () => {
  const pts = poolOf(1);
  const wing = idOf(pts, 'left') ?? idOf(pts, 'right');
  const quick = idOf(pts, 'quick');
  assert.ok(wing && quick);
  const combo = {
    type: 'delay', mainId: wing, partnerId: quick, tempoGap: 0,
    mainTempo: 'two', mainKind: pts.find((p) => p.pid === wing).kind, partnerKind: 'quick',
  };
  // 兩人的 kind 都沒變 ⇒ 逐筆同物件參照
  const out = applyComboRoutes(pts, combo);
  for (let i = 0; i < pts.length; i += 1) {
    assert.equal(out[i], pts[i], `${pts[i].pid} 被 delay 換掉了物件＝它動到了路線`);
  }
  // 節奏改由 route 表達：主攻者拿到 two、其餘人一格未動
  const routes = approachRoutesFor('A', out, { setTick: 500, flightId: 1, seed: 3, combo });
  const plain = approachRoutesFor('A', pts, { setTick: 500, flightId: 1, seed: 3 });
  assert.equal(routes.find((r) => r.pid === wing).tempo, 'two');
  assert.equal(routes.find((r) => r.pid === wing).kind,
    plain.find((r) => r.pid === wing).kind, 'delay 動到了主攻者的線');
  for (const r of routes) {
    if (r.pid === wing) continue;
    assert.deepEqual(r, plain.find((x) => x.pid === r.pid), `${r.pid} 被 delay 的節奏指派波及`);
  }
  // mainTempo 為 null（cross／tandem）時逐值等同不指派
  const noTempo = approachRoutesFor('A', pts, {
    setTick: 500, flightId: 1, seed: 3, combo: { ...combo, mainTempo: null },
  });
  assert.deepEqual(noTempo, plain, 'mainTempo=null 必須逐值等同不指派節奏');
});

test('段 C：時間差的觸發骰真的在擋，名目比例對得上，且三型的骰子不同步', () => {
  // ★ 裁定丙後 tandem 從本條移出 ★ 它的名目值是 0＝「恆假」正是預期，
  //   放在這裡會與「恆假或恆真＝壞掉」的判準直接打架。夾塞的骰子改由
  //   『裁定丙 ①』守（逐球 600 顆全 false，且同一支探針量 delay 非 0）——
  //   那條的鑑別力比本條的比例區間更嚴，不是把檢查拿掉。
  for (const [type, rate] of [['delay', DELAY_PLAY_RATE]]) {
    const pts = poolOf(1);
    const mainId = idOf(pts, 'left') ?? idOf(pts, 'right');
    assert.ok(mainId, `${type} 找不到來源線的主攻者＝下面的量測空洞`);
    let hit = 0;
    const N = 600;
    for (let f = 1; f <= N; f += 1) {
      if (evaluateCombination(pts, mainId, { team: 'A', flightId: f, seed: 3, type }).checks.roll) {
        hit += 1;
      }
    }
    assert.ok(hit > 0 && hit < N, `${type} 的觸發骰恆假或恆真（${hit}/${N}）`);
    assert.ok(Math.abs(hit / N - rate) < 0.06,
      `${type} 觸發率 ${(hit / N * 100).toFixed(1)}% 偏離名目 ${rate * 100}%`);
  }
  assert.equal(TANDEM_PLAY_RATE, 0,
    '夾塞已重開（裁定丙被推翻）——本條要把 tandem 加回上面的迴圈');
  // 三型的骰子不得互相對齊（同一顆球三型同時中／同時不中＝salt 沒起作用）
  const pts = poolOf(1);
  const oh = idOf(pts, 'left');
  let differ = 0;
  for (let f = 1; f <= 200; f += 1) {
    const a = evaluateCombination(pts, oh, { team: 'A', flightId: f, seed: 3, type: 'cross' }).checks.roll;
    const b = evaluateCombination(pts, oh, { team: 'A', flightId: f, seed: 3, type: 'delay' }).checks.roll;
    if (a !== b) differ += 1;
  }
  assert.ok(differ > 40, `交叉與時間差的骰子幾乎同步（200 顆只有 ${differ} 顆不同）＝salt 失效`);
  assert.equal(CROSS_RATE, 0.3, '內切的機率帶被動到了（裁定 C 甲）');
});
