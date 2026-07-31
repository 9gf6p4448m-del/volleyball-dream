// 組合攻擊卷 段 E（2026-07-31 Sawmah 裁定）—「叫戰術」改由技術傳授解鎖
//
// 裁定要點：解鎖不是重點，**教學才是**——硬綁屆數只是把功能藏起來、教不了東西。
// 實作照 pipe 的既有先例逐項對齊：
//   ①旗標＝player.techniques.callPlay（careerState.createCareerPlayer 起步 0）
//   ②解鎖＝events.js 的 teach-* 事件 effect.unlock（careerScreen.fireEvents 泛型入帳）
//   ③閘門＝matchConfig.resolveTechGates 的 canCallPlay（快速比賽 tech===null＝恆開）
//   ④舊存檔＝careerState.normalizeCareerPlayer「新技術缺欄＝未解鎖」既有補正路徑
// 對照先例：tests/trust-events.test.mjs「後排攻擊資格：pipe 未解鎖者不進後排攻擊池」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveMatchConfig, resolveTechGates } from '../src/app/matchConfig.js';
import {
  createCareer, createCareerPlayer, normalizeCareerPlayer, recordResult,
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
function gatesOfCareer(career, player) {
  const store = createCareerStore(mapStorage());
  store.saveCareer(career);
  store.savePlayer(player);
  const careerCtx = { store, career, player, matchEntry: career.schedule[0] };
  const config = resolveMatchConfig({
    params: new URLSearchParams(''), careerCtx, randomSeed: 1,
  });
  return resolveTechGates(createGame(config.gameOptions), 'A2', true);
}

test('①生涯第一屆尚未傳授：叫戰術閘門關閉（鈕不建）', () => {
  const career = createCareer({ seed: 123, playerName: '測試' });
  const player = createCareerPlayer('測試');
  assert.equal(player.techniques.callPlay, 0, '生涯新人起步＝未受教');
  assert.equal(gatesOfCareer(career, player).canCallPlay, false);
});

test('②走完傳授事件（teach-call）後：閘門開啟', () => {
  const career = createCareer({ seed: 123, playerName: '測試' });
  const player = createCareerPlayer('測試');
  // 真實觸發路徑：第一場打完 → 下一場（group-2）賽前 dueEvents 應吐出 teach-call
  const afterG1 = recordResult(career, {
    matchId: 'group-1', won: true, scoreFor: 25, scoreAgainst: 20,
  });
  const due = dueEvents(afterG1, 'pre');
  const ev = due.find((e) => e.id === 'teach-call');
  assert.ok(ev, 'group-2 賽前應觸發 teach-call');
  assert.equal(ev.effect.unlock, 'callPlay');
  // 入帳＝careerScreen.fireEvents 的泛型那一行（`techniques[e.effect.unlock] = 1`），
  // 與 tip/pipe/dive 共用同一段程式碼，本次未新增分支
  player.techniques[ev.effect.unlock] = Math.max(1, player.techniques[ev.effect.unlock] ?? 0);
  assert.equal(gatesOfCareer(afterG1, player).canCallPlay, true);
});

test('②-b 傳授之前：group-1 賽前不會提早給（教學鏈順序）', () => {
  const career = createCareer({ seed: 123, playerName: '測試' });
  assert.ok(!dueEvents(career, 'pre').some((e) => e.id === 'teach-call'));
});

test('③快速比賽不受影響：叫戰術一律可用（與 trust／暫停／換人同款）', () => {
  const quick = createGame({ seed: 5 });
  assert.equal(resolveTechGates(quick, 'A2', false).canCallPlay, true);
  // 生涯建隊的同一局，只切 careerActive＝快速比賽語意，仍全開
  assert.equal(resolveTechGates(quick, 'A2', false).canTip, true);
});

test('④舊存檔相容：無 callPlay 欄的存檔可載入、不 crash、預設＝未解鎖', () => {
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

test('教學鏈資料形狀：teach-call 進表、一次性去重、技術頁與學招預告查得到名字', () => {
  const ev = EVENT_DEFS.find((e) => e.id === 'teach-call');
  assert.ok(ev, 'teach-call 應在 EVENT_DEFS');
  assert.equal(ev.moment, 'pre');
  assert.deepEqual(ev.when, { matchId: 'group-2' });
  assert.equal(ev.effect.unlock, 'callPlay');
  assert.ok(ev.lines.some((l) => l.speaker === '阿哲'), '二傳＝手勢的收訊端，由他教');
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
});
