// Phase 3 W1 — 存檔 schema v2：結構定型、版本遷移機制、存取層（單 key＋v1 清空）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION, createSaveV2, migrate, deserializeSave, serializeSave,
  IncompatibleSaveError, careerViewOf,
} from '../src/career/schema.js';
import {
  createCareerStore, SAVE_KEY, LEGACY_CAREER_KEY, LEGACY_PLAYER_KEY, SAVE_FORMAT,
} from '../src/career/careerStore.js';
import {
  createCareer, createCareerPlayer, markPending, mergeScouting, recordResult,
} from '../src/career/careerState.js';
import { recordEvent, dueEvents } from '../src/career/events.js';
import { buildStarterMembers } from '../src/career/roster.js';

function fakeStorage() {
  const m = new Map();
  return {
    _map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

test('schema v2 骨架：頂層鍵一次補齊、四系統結構定實、Phase 4 鍵留空物件', () => {
  const save = createSaveV2({ career: createCareer({ seed: 7, playerName: '夢' }) });
  assert.equal(save.schemaVersion, 2);
  // 頂層鍵齊備
  for (const k of ['player', 'roster', 'recruitment', 'lineup', 'season', 'career', 'story']) {
    assert.ok(k in save, `缺頂層鍵 ${k}`);
  }
  // 名冊：上限 10（kickoff 第 2 題拍板）、成員留空待 W2
  assert.deepEqual(save.roster, { capacity: 10, members: [] });
  // 招募：條件進度跨賽季累積（第 1 題拍板）、留空待 W4
  assert.deepEqual(save.recruitment, { progress: {}, recruited: [] });
  // 先發編排：6 人＋自由人＋輪轉起點、留空待 W3
  assert.deepEqual(save.lineup, { starters: null, libero: null, rotationStart: 0 });
  // 賽季：序號起始 1（線性多賽季，第 4 題拍板）；現行生涯資料歸戶
  assert.equal(save.season.index, 1);
  assert.equal(save.season.seed, 7);
  assert.equal(save.season.schedule.length, 6);
  // Phase 4 預留：空物件、不猜內容
  assert.deepEqual(save.career, {});
  assert.deepEqual(save.story, {});
});

test('careerViewOf：season → careerState v3 視圖 roundtrip 恆等（含選填鍵）', () => {
  let career = createCareer({ seed: 11, playerName: '恆等' });
  career = mergeScouting(career, 'north-tech', {
    zones: { line: 1, cross: 0, middle: 0, tip: 0 }, feints: 0, spikes: 1,
  });
  career = markPending(career, 'group-1');
  const view = careerViewOf(createSaveV2({ career }));
  assert.deepEqual(view, career); // 鍵集合與值完全一致（W1 過渡期邏輯層繼續吃這形狀）
});

test('career.events 存檔來回留存（防賽後對話無限重跳；W1 漏存回歸）', () => {
  let career = createCareer({ seed: 7, playerName: '事件' });
  career = recordEvent(career, 'teach-tip');
  career = recordEvent(career, 'first-loss');
  // seasonFromCareer 寫入→careerViewOf 讀回，events 必須原樣保留
  const view = careerViewOf(createSaveV2({ career }));
  assert.deepEqual(view.events, ['teach-tip', 'first-loss']);
});

test('已觸發賽後事件經 store 來回後不再重觸發（無限重跳的實況重現）', () => {
  const store = createCareerStore(fakeStorage());
  let career = createCareer({ seed: 42, playerName: '測試' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('測試'));
  // 模擬棄賽敗 group-1 → 賽後事件 teach-tip/first-loss 應觸發
  career = recordResult(career, { matchId: 'group-1', won: false, scoreFor: 0, scoreAgainst: 25 });
  store.saveCareer(career);
  career = store.loadCareer();
  const firstDue = dueEvents(career, 'post').map((e) => e.id);
  assert.ok(firstDue.includes('teach-tip'), '第一次應觸發 teach-tip');
  // fireEvents 入帳＋存檔的等效：recordEvent 後 saveCareer
  let c = career;
  for (const id of firstDue) c = recordEvent(c, id);
  store.saveCareer(c);
  // 點擊繼續→renderCareer→loadCareer 的等效：重載後不得再觸發
  const reloaded = store.loadCareer();
  assert.deepEqual(dueEvents(reloaded, 'post'), [], '來回後不得重觸發（否則無限重跳卡死）');
});

test('migrate：版本分派骨架——v1 無路徑擲 Incompatible、鏈式可走、同版本原樣', () => {
  const save = createSaveV2({});
  // 同版本：原樣返回
  assert.equal(migrate(save, SCHEMA_VERSION), save);
  // v1（Phase 2）：拍板不相容——無遷移路徑
  assert.throws(() => migrate({ any: 'v1' }, 1), IncompatibleSaveError);
  // 鏈式分派（注入測試表證明機制可用；正式表 Phase 4 後才有內容）
  const table = { 1: (s) => ({ ...s, schemaVersion: 2, upgraded: true }) };
  const out = migrate({ schemaVersion: 1 }, 1, table);
  assert.equal(out.upgraded, true);
});

test('deserializeSave：壞結構/缺鍵/較新版本一律擲錯，合法檔 roundtrip', () => {
  const save = createSaveV2({
    career: createCareer({ seed: 3, playerName: '驗' }),
    player: JSON.parse(JSON.stringify(createCareerPlayer('驗'))),
  });
  assert.deepEqual(deserializeSave(serializeSave(save)), save);
  assert.throws(() => deserializeSave('"字串"'), /不是物件/);
  const { roster, ...missing } = save;
  assert.throws(() => deserializeSave(JSON.stringify(missing)), /缺頂層鍵：roster/);
  assert.throws(
    () => deserializeSave(JSON.stringify({ ...save, schemaVersion: 99 })), /較新/,
  );
  // schemaVersion 1（或缺）＝Phase 2 世代：不相容
  assert.throws(() => deserializeSave(JSON.stringify({ version: 3, seed: 1 })), IncompatibleSaveError);
});

test('存取層 v1 偵測：Phase 2 舊 key → 清空＋重置旗標；已有 v2 檔則靜默清殘留', () => {
  // 情境一：只有舊檔——清空、旗標亮、無可用存檔
  const s1 = fakeStorage();
  s1.setItem(LEGACY_CAREER_KEY, '{"version":3}');
  s1.setItem(LEGACY_PLAYER_KEY, '{"id":"A2"}');
  const store1 = createCareerStore(s1);
  assert.equal(store1.wasLegacyReset(), true);
  assert.equal(s1._map.has(LEGACY_CAREER_KEY), false);
  assert.equal(s1._map.has(LEGACY_PLAYER_KEY), false);
  assert.equal(store1.hasSave(), false);
  // 情境二：v2 檔在、舊 key 殘留——靜默清除、不報重置
  const s2 = fakeStorage();
  const pre = createCareerStore(s2);
  pre.saveCareer(createCareer({ seed: 5, playerName: '在' }));
  pre.savePlayer(createCareerPlayer('在'));
  s2.setItem(LEGACY_CAREER_KEY, '{"version":3}');
  const store2 = createCareerStore(s2);
  assert.equal(store2.wasLegacyReset(), false);
  assert.equal(s2._map.has(LEGACY_CAREER_KEY), false);
  assert.equal(store2.hasSave(), true);
});

test('存取層 RMW：savePlayer/saveCareer 各動各的欄位，W2+ 填入的鍵不被蓋掉', () => {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  store.saveCareer(createCareer({ seed: 9, playerName: '共存' }));
  store.savePlayer(createCareerPlayer('共存'));
  // 模擬 W2 之後 roster 已填內容（W2 起成員形狀已定實並受驗證——fixture 用合法成員）
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.roster.members.push({ ...buildStarterMembers()[0], id: 'R1', name: '招牌', origin: 'north-tech' });
  raw.season.index = 3; // 模擬第 3 賽季
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  // 再各存一次：roster 與賽季序號都不得退回
  store.savePlayer(createCareerPlayer('共存'));
  store.saveCareer(createCareer({ seed: 9, playerName: '共存' }));
  const after = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(after.roster.members.length, 1);
  assert.equal(after.season.index, 3);
  assert.ok(after.player);
});

test('匯出→清空→匯入還原；Phase 2 匯出檔與外來檔案拒收', () => {
  const store = createCareerStore(fakeStorage());
  let career = createCareer({ seed: 21, playerName: 'IO' });
  career = mergeScouting(career, 'obsidian', {
    zones: { line: 3, cross: 1, middle: 0, tip: 0 }, feints: 2, spikes: 4,
  });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('IO'));
  const exported = store.exportSave();
  assert.ok(exported.includes(SAVE_FORMAT));
  store.clear();
  assert.equal(store.hasSave(), false);
  const { career: back, player } = store.importSave(exported);
  assert.deepEqual(back, career); // 宿敵記憶跟著回來
  assert.equal(player.id, 'A2');
  assert.equal(store.hasSave(), true);
  // Phase 2 匯出檔（雙物件形）：明確不相容訊息
  assert.throws(
    () => store.importSave(JSON.stringify({ format: SAVE_FORMAT, career: {}, player: {} })),
    /Phase 2 存檔不相容/,
  );
  // 外來檔案
  assert.throws(() => store.importSave('{"format":"別的遊戲"}'), /排球夢/);
});
