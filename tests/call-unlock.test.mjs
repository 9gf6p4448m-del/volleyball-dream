// 組合攻擊卷 段 E（2026-07-31 Sawmah 裁定）—「叫戰術」改由技術傳授解鎖
//
// 裁定要點：解鎖不是重點，**教學才是**——硬綁屆數只是把功能藏起來、教不了東西。
// 實作照 pipe 的既有先例逐項對齊：
//   ①旗標＝player.techniques.callPlay（careerState.createCareerPlayer 起步 0）
//   ②解鎖＝events.js 的 teach-* 事件 effect.unlock（careerScreen.fireEvents 泛型入帳）
//   ③閘門＝matchConfig.resolveTechGates 的 canCallPlay（快速比賽 tech===null＝恆開）
//   ④舊存檔＝careerState.normalizeCareerPlayer「新技術缺欄＝未解鎖」既有補正路徑
// 對照先例：tests/trust-events.test.mjs「後排攻擊資格：pipe 未解鎖者不進後排攻擊池」
//
// ---- 2026-08-01 裁定乙：`canCallPlay` 改吃**兩道語意不同的閘**（本檔守 UI 層那一半）----
//   · 技術閘 `player.techniques.callPlay`＝**這個球員學會了沒**（角色成長）
//   · 世界閘 `game.comboScale`＝**這場比賽有沒有組合攻擊**（場級規則，雙方適用；
//     現階段由屆數決定，第 1 屆 0／第 2 屆起 1）
// 兩道並存且不可互相覆寫 ⇒ 四格真值表逐格驗（下面 ①②③＋「第 1 屆已學會仍關」）。
// 邏輯層那一半（繞過面板直接送 calledPlay 也產不出 combo）在 season-combo-gate.test.mjs。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolveMatchConfig, resolveTechGates } from '../src/app/matchConfig.js';
import {
  advanceSeason, createCareer, createCareerPlayer, normalizeCareerPlayer, recordResult,
} from '../src/career/careerState.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { EVENT_DEFS, dueEvents, isOnceEvent, upcomingTeach } from '../src/career/events.js';
import { TECH_DEFS } from '../src/career/growth.js';
import { createGame } from '../src/sim/game.js';

function mapStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    raw: m,
  };
}

// 真實路徑：生涯存檔 → resolveMatchConfig 建隊（含 normalizeCareerPlayer）→ createGame
// → resolveTechGates。不替身、不重抄閘門邏輯。
function gatesOfCareer(career, player, seasonIndex = 1) {
  const store = createCareerStore(mapStorage());
  store.saveCareer(career);
  store.savePlayer(player);
  const careerCtx = {
    store, career, player, matchEntry: career.schedule[0], seasonIndex,
  };
  const config = resolveMatchConfig({
    params: new URLSearchParams(''), careerCtx, randomSeed: 1,
  });
  return resolveTechGates(createGame(config.gameOptions), 'A2', true);
}

// 真實的第 2 屆 career：打完第 1 屆六場 → advanceSeason（results 歸零、賽程重建）
function seasonTwoCareer(seed = 123) {
  let c = createCareer({ seed, playerName: '測試' });
  for (const e of c.schedule) {
    c = recordResult(c, { matchId: e.id, won: true, scoreFor: 25, scoreAgainst: 20 });
  }
  const s2 = advanceSeason(c, { seasonIndex: 2 });
  assert.equal(s2.schedule[0].id, 'group-1', '第 2 屆第一場仍是 group-1（教學鏈掛點）');
  assert.equal(s2.results.length, 0);
  return s2;
}

test('①第 1 屆：叫戰術閘門關閉（鈕不建）——未受教＋世界無組合，兩道閘都關', () => {
  const career = createCareer({ seed: 123, playerName: '測試' });
  const player = createCareerPlayer('測試');
  assert.equal(player.techniques.callPlay, 0, '生涯新人起步＝未受教');
  assert.equal(gatesOfCareer(career, player, 1).canCallPlay, false);
});

test('①-b 第 1 屆即使已學會（舊存檔情境）：世界閘照樣關掉叫戰術鈕', () => {
  // 這一格證明「屆數閘不是技術閘的同義詞」——技術閘全開，鈕仍不建。
  // 也正是 ffdd342 之前的存檔（第 1 屆 group-2 已受教）在本次改動後的樣子。
  const career = createCareer({ seed: 123, playerName: '測試' });
  const player = createCareerPlayer('測試');
  player.techniques.callPlay = 1;
  assert.equal(gatesOfCareer(career, player, 1).canCallPlay, false);
  // 對照：同一個 player 換到第 2 屆就開 ⇒ 上一行的 false 來自屆數，不是別的東西擋著
  assert.equal(gatesOfCareer(seasonTwoCareer(), player, 2).canCallPlay, true);
});

test('②第 2 屆走完傳授事件（teach-call）後：閘門開啟', () => {
  const s2 = seasonTwoCareer();
  const player = createCareerPlayer('測試');
  // 真實觸發路徑：第 2 屆第一場（group-1）賽前 dueEvents 應吐出 teach-call
  const ev = dueEvents(s2, 'pre', 2).find((e) => e.id === 'teach-call');
  assert.ok(ev, '第 2 屆 group-1 賽前應觸發 teach-call');
  assert.equal(ev.effect.unlock, 'callPlay');
  // 入帳＝careerScreen.fireEvents 的泛型那一行（`techniques[e.effect.unlock] = 1`），
  // 與 tip/pipe/dive 共用同一段程式碼，本次未新增分支
  player.techniques[ev.effect.unlock] = Math.max(1, player.techniques[ev.effect.unlock] ?? 0);
  assert.equal(gatesOfCareer(s2, player, 2).canCallPlay, true);
});

test('③第 2 屆但還沒學會：技術閘仍生效 ⇒ 叫不出（兩道閘語意分開）', () => {
  const s2 = seasonTwoCareer();
  const player = createCareerPlayer('測試');
  assert.equal(player.techniques.callPlay, 0);
  assert.equal(gatesOfCareer(s2, player, 2).canCallPlay, false);
  // 對照：同一屆、同一個 career，只把技術學起來就開 ⇒ 上一行的 false 來自技術閘
  player.techniques.callPlay = 1;
  assert.equal(gatesOfCareer(s2, player, 2).canCallPlay, true);
});

test('②-b 傳授位置：第 1 屆全程不觸發（group-1／group-2 賽前都不給）', () => {
  const career = createCareer({ seed: 123, playerName: '測試' });
  assert.ok(!dueEvents(career, 'pre', 1).some((e) => e.id === 'teach-call'),
    '第 1 屆 group-1 賽前不給');
  const afterG1 = recordResult(career, {
    matchId: 'group-1', won: true, scoreFor: 25, scoreAgainst: 20,
  });
  assert.ok(!dueEvents(afterG1, 'pre', 1).some((e) => e.id === 'teach-call'),
    '第 1 屆 group-2 賽前也不給（08-01 從這裡搬走）');
  // 省略第 3 參數＝視同第 1 屆（保守預設）：舊呼叫端不會誤發
  assert.ok(!dueEvents(seasonTwoCareer(), 'pre').some((e) => e.id === 'teach-call'));
});

test('④快速比賽不受影響：叫戰術一律可用（與 trust／暫停／換人同款）', () => {
  const quick = createGame({ seed: 5 });
  assert.equal(quick.comboScale, null, '快速比賽＝未注入屆數閘（讀取端 ?? 1）');
  assert.equal(resolveTechGates(quick, 'A2', false).canCallPlay, true);
  // 生涯建隊的同一局，只切 careerActive＝快速比賽語意，仍全開
  assert.equal(resolveTechGates(quick, 'A2', false).canTip, true);
});

test('⑤舊存檔相容：無 callPlay 欄的存檔可載入、不 crash、預設＝未解鎖', () => {
  const storage = mapStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 456, playerName: '舊檔' });
  const player = createCareerPlayer('舊檔');
  store.saveCareer(career);
  store.savePlayer(player);

  // 把存檔改寫成「本次改動之前的建置會寫出的樣子」＝techniques 沒有 callPlay 這個鍵
  const raw = JSON.parse(storage.raw.get('vd-save'));
  delete raw.player.techniques.callPlay;
  assert.deepEqual(
    Object.keys(raw.player.techniques).sort(),
    ['block', 'dive', 'emergencySet', 'feint', 'feintUses', 'floatServe',
      'jumpServe', 'pipe', 'receive', 'spike', 'tip', 'v'],
    '欄位集合＝改動前 createCareerPlayer 的技術欄位（確實是舊檔形狀）',
  );
  storage.raw.set('vd-save', JSON.stringify(raw));

  // 讀檔不 throw（deserializeSave 嚴格驗證照走）
  const loaded = store.loadPlayer();
  assert.ok(loaded, '舊存檔應可載入');
  assert.equal(loaded.techniques.callPlay, undefined, '載入當下該欄仍缺席');
  // 跨版本補正（開賽與生涯畫面都會跑）：缺欄→0，與新生涯的顯式 0 同值
  normalizeCareerPlayer(loaded);
  assert.equal(loaded.techniques.callPlay, 0);
  // 開賽全程不 crash，閘門＝未解鎖
  const loadedCareer = store.loadCareer();
  assert.equal(gatesOfCareer(loadedCareer, store.loadPlayer()).canCallPlay, false);
});

// ⚠ tools/w6-save*.json 被 .gitignore 排除（本機治具，`node tools/w6-fixture.mjs` 產出）
// ⇒ 檔案不在時 skip，不讓乾淨 clone 紅在缺檔上。合成版舊存檔覆蓋在上面的 ⑤。
test('⑤-b 舊存檔實測：tools/w6-saveA.json（W6 時期真實存檔）載入→開賽→閘門', (t) => {
  const fixture = new URL('../tools/w6-saveA.json', import.meta.url);
  if (!existsSync(fixture)) {
    t.skip('缺 tools/w6-saveA.json（跑 `node tools/w6-fixture.mjs` 產出後再驗）');
    return;
  }
  const storage = mapStorage();
  storage.setItem('vd-save', readFileSync(fixture, 'utf8'));
  const store = createCareerStore(storage);
  assert.equal(store.seasonIndex(), 1, '這份存檔停在第 1 屆');
  const career = store.loadCareer();
  const player = store.loadPlayer();
  assert.ok(career && player, '舊存檔應可載入');
  assert.equal(player.techniques.callPlay, undefined, '舊檔沒有 callPlay 欄（改動前的形狀）');
  normalizeCareerPlayer(player);
  assert.equal(player.techniques.callPlay, 0);
  // 開賽路徑全程不 crash，且第 1 屆＝世界無組合＝鈕不建
  const g1 = gatesOfCareer(career, player, store.seasonIndex());
  assert.equal(g1.canCallPlay, false);
  assert.equal(g1.canTip, false, '其餘技術閘照舊（本次改動沒有波及）');
  // 同一份舊存檔推進到第 2 屆並補上受教旗標 ⇒ 開得起來（舊檔不會被永久鎖死）
  const s2 = advanceSeason(
    career.schedule.reduce(
      (c, e) => recordResult(c, { matchId: e.id, won: true, scoreFor: 25, scoreAgainst: 20 }),
      career,
    ),
    { seasonIndex: 2 },
  );
  player.techniques.callPlay = 1;
  assert.equal(gatesOfCareer(s2, player, 2).canCallPlay, true);
});

test('教學鏈資料形狀：teach-call 進表、一次性去重、技術頁與學招預告查得到名字', () => {
  const ev = EVENT_DEFS.find((e) => e.id === 'teach-call');
  assert.ok(ev, 'teach-call 應在 EVENT_DEFS');
  assert.equal(ev.moment, 'pre');
  // 08-01 搬家：第 1 屆 group-2（暫置）→ 第 2 屆 group-1（過渡；最終歸宿是集訓）
  assert.deepEqual(ev.when, { seasonIndex: 2, matchId: 'group-1' });
  assert.equal(ev.effect.unlock, 'callPlay');
  assert.ok(ev.lines.some((l) => l.speaker === '阿哲'), '二傳＝手勢的收訊端，由他教');
  // 年級守衛：搬到第 2 屆後大山（A3）已畢業 ⇒ MB 那句改由阿岩（A6）講，
  // 阿岩若不在現役名冊（被逐出）就播阿哲代述版——否則會出現「畢業的人開口」
  assert.ok(!ev.lines.some((l) => l.speaker === '大山'), '第 2 屆大山已畢業，不得開口');
  assert.equal(ev.elderId, 'A6');
  assert.ok(ev.altLines?.length === ev.lines.length && ev.altLines.every((l) => l.speaker === '阿哲'));
  assert.ok(isOnceEvent('teach-call'), '一次性事件（跨屆不重播）');
  // TECH_DEFS 有名字＝生涯技術頁列得出來、matchLoop 學招預告字卡查得到
  assert.ok(TECH_DEFS.some((t) => t.key === 'callPlay' && t.name === '叫戰術'));
  // pre 傳授不進學招預告（既有規則：進場前已播完），不與同場賽後的 teach-dive 打架
  assert.ok(!upcomingTeach({ results: [] }, 'group-2').includes('callPlay'));
  assert.deepEqual(upcomingTeach({ results: [] }, 'group-2'), ['dive']);
});

test('佈線守衛：建鈕與遠段改判都吃 gates.canCallPlay（未受教＝不出現）', () => {
  const stageSrc = readFileSync(new URL('../src/app/matchStage.js', import.meta.url), 'utf8');
  // 建鈕唯一路徑必須被閘門包住——移除閘門本測試即紅
  assert.match(
    stageSrc,
    /callPanel\s*=\s*gates\.canCallPlay[\s\S]{0,80}?createCallPanel\(/,
    'matchStage 的 createCallPanel 必須由 gates.canCallPlay 決定',
  );
  assert.equal(
    (stageSrc.match(/createCallPanel\(/g) ?? []).length, 1,
    '不得有第二個未受閘的建鈕點',
  );
  const loopSrc = readFileSync(new URL('../src/app/matchLoop.js', import.meta.url), 'utf8');
  assert.match(
    loopSrc,
    /s\.gates\.canCallPlay\s*\?\s*callOptionsFor\(/,
    '段 E 路徑乙（遠段改判）同閘：未受教退回唯讀預覽',
  );
  assert.equal(
    (loopSrc.match(/callOptionsFor\(/g) ?? []).length, 1,
    '不得有第二個未受閘的選項來源',
  );
  // 08-01：UI 閘唯一計算點必須同時吃兩道閘（改回單吃技術閘本測試即紅）
  const cfgSrc = readFileSync(new URL('../src/app/matchConfig.js', import.meta.url), 'utf8');
  assert.match(
    cfgSrc,
    /canCallPlay:.*tech\.callPlay[\s\S]{0,40}?game\.comboScale/,
    'resolveTechGates 的 canCallPlay 必須同時吃技術閘與世界閘（comboScale）',
  );
});
