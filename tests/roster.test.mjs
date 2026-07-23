// Phase 3 W2 — 名冊系統測試：具名化/個性化、capacity 語義、空名冊補齊、
// 表現驅動成長（決定論/冪等/上限 85）、建隊接線、schema 成員驗證
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStarterMembers, ensureStarterRoster, applyRosterGrowth,
  rosterCount, openSlots, totalGains, ROSTER_GROWTH, STARTER_DEFS,
} from '../src/career/roster.js';
import {
  createCareer, createCareerPlayer, careerTeams, careerMatchSetup, buildLibero,
} from '../src/career/careerState.js';
import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { deserializeSave } from '../src/career/schema.js';
import { ATTRIBUTE_KEYS } from '../src/sim/player.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

// 建一個已有生涯（career+player、roster 空殼）的 store——W1 期存檔的實況
function storeWithCareer() {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  store.saveCareer(createCareer({ seed: 42, playerName: '測試員' }));
  store.savePlayer(createCareerPlayer('測試員'));
  return { store, storage };
}

// 事件流小工具：一顆由 playerId 扣死的球（TOUCH spike → SCORE）
function killEvents(playerId, n, power = 1) {
  const evs = [];
  for (let i = 0; i < n; i += 1) {
    evs.push({ type: 'TOUCH', playerId, team: 'A', kind: 'spike', power });
    evs.push({ type: 'SCORE', team: 'A' });
  }
  return evs;
}

// ---- 任務 1：具名化與個性化 ----

test('buildStarterMembers：六名成員具名、槽位角色正確、隊長必為 MB', () => {
  const members = buildStarterMembers();
  assert.deepEqual(members.map((m) => m.id), ['A1', 'A3', 'A4', 'A5', 'A6', 'AL']);
  assert.deepEqual(members.map((m) => m.role),
    ['setter', 'middle', 'opposite', 'outside', 'middle', 'libero']);
  for (const m of members) {
    assert.equal(m.origin, 'starter');
    assert.equal(typeof m.name, 'string');
    assert.ok(m.name.length > 0);
    assert.equal(m.dna.teamId, 'A'); // starter DNA＝A 隊基準風格
    assert.ok(m.dna.tag);
    assert.deepEqual(m.growth.log, []);
  }
  const captain = members.find((m) => m.captain);
  assert.ok(captain, '必須有隊長');
  assert.equal(captain.role, 'middle'); // D3：隊長（MB）——events.js speaker 對齊
  const libero = members.find((m) => m.role === 'libero');
  assert.equal(libero.name, '小守'); // 已定名不重開
});

test('個性化：脫離六人全同，且屬性總和守恆（＝舊基準 490，近中性設計）', () => {
  const members = buildStarterMembers();
  const nonLibero = members.filter((m) => m.role !== 'libero');
  // 全同檢查：任兩人屬性向量不得完全相同
  for (let i = 0; i < nonLibero.length; i += 1) {
    for (let j = i + 1; j < nonLibero.length; j += 1) {
      assert.notDeepEqual(nonLibero[i].attributes, nonLibero[j].attributes,
        `${nonLibero[i].name} 與 ${nonLibero[j].name} 屬性不得全同`);
    }
  }
  // 總和守恆：舊基準 60+62+60+60+62+68+60+58＝490
  for (const m of nonLibero) {
    const sum = ATTRIBUTE_KEYS.reduce((s, k) => s + m.attributes[k], 0);
    assert.equal(sum, 490, `${m.name} 屬性總和須為 490`);
  }
  // 身高沿用既有基準（槽序 A1,A3..A6）
  assert.deepEqual(nonLibero.map((m) => m.height), [1.83, 1.96, 1.90, 1.86, 1.94]);
});

test('小守屬性＝buildLibero 防守專才公式輸出（結構不推翻）', () => {
  const members = buildStarterMembers();
  const al = members.find((m) => m.id === 'AL');
  assert.deepEqual(al.attributes, buildLibero('A', '小守').attributes);
});

// ---- D1：capacity 語義 ----

test('capacity 語義：10＝玩家＋小守＋隊友；現員 7、招募空位 3', () => {
  const roster = { capacity: 10, members: buildStarterMembers() };
  assert.equal(rosterCount(roster), 7); // members 6（含小守）＋玩家 1
  assert.equal(openSlots(roster), 3);
});

// ---- 任務 4：空名冊一次性補齊 ----

test('ensureStarterRoster：空名冊自動補齊並持久化；player/season 不動', () => {
  const { store, storage } = storeWithCareer();
  const beforeSave = JSON.parse(storage.getItem(SAVE_KEY));
  const roster = ensureStarterRoster(store);
  assert.equal(roster.members.length, 6);
  const afterSave = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(afterSave.roster.members.length, 6); // 已持久化
  assert.deepEqual(afterSave.player, beforeSave.player); // 玩家不動
  assert.deepEqual(afterSave.season, beforeSave.season); // 賽季不動
});

test('ensureStarterRoster：已補齊不重複觸發（改名/成長不被蓋掉）', () => {
  const { store } = storeWithCareer();
  ensureStarterRoster(store);
  const roster = store.loadRoster();
  roster.members[0].name = '改名測試';
  store.saveRoster(roster);
  const again = ensureStarterRoster(store);
  assert.equal(again.members[0].name, '改名測試');
});

test('ensureStarterRoster：無存檔（快速比賽）→ null、不落檔', () => {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  assert.equal(ensureStarterRoster(store), null);
  assert.equal(storage.getItem(SAVE_KEY), null);
});

// ---- 任務 3：表現驅動成長 ----

test('成長歸因：殺球→力量/彈跳 xp、每 2 xp 兌 +1；沒表現不長', () => {
  const members = buildStarterMembers();
  const events = killEvents('A5', 2); // 小飛（一年級 rate 1.0）殺 2 顆
  const grown = applyRosterGrowth(members, events, 'A', 'group-1');
  const a5 = grown.find((m) => m.id === 'A5');
  const before = members.find((m) => m.id === 'A5');
  // atk 2 × 1.0 xp × rate 1.0 ＝ 2 xp → +1 力量；jump 2×0.5=1 xp 未達門檻留存
  assert.equal(a5.attributes.power, before.attributes.power + 1);
  assert.equal(a5.attributes.jump, before.attributes.jump);
  assert.equal(a5.growth.xp.jump, 1);
  assert.deepEqual(a5.growth.log, [{ matchId: 'group-1', gains: { power: 1 } }]);
  assert.deepEqual(totalGains(a5), { power: 1 });
  // 沒上場表現的人整包不變
  const a1 = grown.find((m) => m.id === 'A1');
  assert.deepEqual(a1.attributes, members.find((m) => m.id === 'A1').attributes);
  assert.deepEqual(a1.growth.log, [{ matchId: 'group-1', gains: {} }]);
});

test('成長率分檔：同表現，一年級（1.0）快於三年級（0.4）', () => {
  const members = buildStarterMembers();
  const events = [...killEvents('A5', 2), ...killEvents('A3', 2)];
  const grown = applyRosterGrowth(members, events, 'A', 'group-1');
  const rookie = grown.find((m) => m.id === 'A5'); // grade 1
  const senior = grown.find((m) => m.id === 'A3'); // grade 3（隊長大山）
  assert.deepEqual(rookie.growth.log[0].gains, { power: 1 }); // 2 xp → +1
  assert.deepEqual(senior.growth.log[0].gains, {}); // 0.8 xp → 未達門檻
  assert.ok(senior.growth.xp.power > 0, '老將 xp 仍留存跨場累積');
});

test('成長決定論：同事件流＋同名冊→逐值相同', () => {
  const events = [...killEvents('A5', 3), ...killEvents('A4', 1)];
  const a = applyRosterGrowth(buildStarterMembers(), events, 'A', 'group-2');
  const b = applyRosterGrowth(buildStarterMembers(), events, 'A', 'group-2');
  assert.deepEqual(a, b);
});

test('成長冪等：同 matchId 重入不重複成長', () => {
  const events = killEvents('A5', 2);
  const once = applyRosterGrowth(buildStarterMembers(), events, 'A', 'group-1');
  const twice = applyRosterGrowth(once, events, 'A', 'group-1');
  assert.deepEqual(twice, once);
});

test('隊友屬性上限 85：封頂後不再長、該屬性 xp 歸零', () => {
  const members = buildStarterMembers().map((m) => (m.id === 'A3'
    ? { ...m, attributes: { ...m.attributes, power: 84 }, growth: { ...m.growth, grade: 1 } }
    : m));
  const events = killEvents('A3', 10); // 10 顆殺球＝10 xp → 5 點，但只剩 1 格
  const grown = applyRosterGrowth(members, events, 'A', 'group-1');
  const a3 = grown.find((m) => m.id === 'A3');
  assert.equal(a3.attributes.power, ROSTER_GROWTH.ATTR_CAP);
  assert.equal(a3.growth.xp.power, 0); // 封頂後 xp 不再堆積
  // 10 顆殺球連帶彈跳 xp 5 → +2（未封頂屬性照常長）
  assert.deepEqual(a3.growth.log[0].gains, { power: 1, jump: 2 });
});

// ---- 建隊接線（careerTeams / careerMatchSetup）----

test('careerTeams＋名冊：五槽吃個性化屬性，trust 槽位與玩家槽不動', () => {
  const player = createCareerPlayer('測試員');
  const members = buildStarterMembers();
  const teams = careerTeams(player, null, members);
  assert.equal(teams.A[1], player); // 玩家槽原物件
  assert.equal(teams.A[0].name, members[0].name);
  assert.equal(teams.A[0].attributes.control, members[0].attributes.control); // 個性化生效
  assert.deepEqual(teams.A.map((p) => p.trust.fromSetter), [20, 40, 20, 20, 20, 20]);
  assert.deepEqual(teams.A.map((p) => p.height.current), [1.83, 1.88, 1.96, 1.90, 1.86, 1.94]);
  // 未給名冊＝舊行為（隊友屬性全同）
  const plain = careerTeams(createCareerPlayer('測試員'), null);
  assert.deepEqual(plain.A[0].attributes, plain.A[2].attributes);
});

test('careerMatchSetup＋名冊：小守結構走 buildLibero、屬性承成長後數值', () => {
  const career = createCareer({ seed: 7, playerName: '測試員' });
  const player = createCareerPlayer('測試員');
  const members = buildStarterMembers().map((m) => (m.id === 'AL'
    ? { ...m, attributes: { ...m.attributes, reaction: 80 } } // 模擬成長後
    : m));
  const setup = careerMatchSetup(career, player, career.schedule[0], { capacity: 10, members });
  const lib = setup.liberos.A;
  assert.equal(lib.id, 'AL');
  assert.equal(lib.height.current, 1.72); // 結構欄位＝公式供給
  assert.equal(lib.trust.fromSetter, 5);
  assert.equal(lib.attributes.reaction, 80); // 屬性承名冊
  assert.equal(setup.teams.A[2].name, members.find((m) => m.id === 'A3').name);
  // 不給名冊＝舊行為
  const plain = careerMatchSetup(career, createCareerPlayer('測試員'), career.schedule[0]);
  assert.equal(plain.teams.A[0].name, 'A隊1號');
});

// ---- schema 成員驗證與 store 讀寫 ----

test('schema：含 starter 名冊的存檔通過驗證；壞成員（缺屬性欄）拒收', () => {
  const { store, storage } = storeWithCareer();
  ensureStarterRoster(store);
  const json = storage.getItem(SAVE_KEY);
  const ok = deserializeSave(json); // 不 throw
  assert.equal(ok.roster.members.length, 6);
  const bad = JSON.parse(json);
  delete bad.roster.members[0].attributes.jump;
  assert.throws(() => deserializeSave(JSON.stringify(bad)), /attributes 缺數值欄位/);
  const noDna = JSON.parse(json);
  delete noDna.roster.members[2].dna;
  assert.throws(() => deserializeSave(JSON.stringify(noDna)), /缺 dna 標記/);
});

test('careerStore：loadRoster/saveRoster RMW roundtrip，不動其他鍵', () => {
  const { store, storage } = storeWithCareer();
  const before = JSON.parse(storage.getItem(SAVE_KEY));
  const roster = { capacity: 10, members: buildStarterMembers() };
  assert.equal(store.saveRoster(roster), true);
  assert.deepEqual(store.loadRoster(), roster);
  const after = JSON.parse(storage.getItem(SAVE_KEY));
  assert.deepEqual(after.player, before.player);
  assert.deepEqual(after.season, before.season);
});

// ---- STARTER_DEFS 自身健全性（防手滑改壞名單）----

test('STARTER_DEFS：id 唯一、玩家槽 A2 缺席（玩家不進 members）', () => {
  const ids = STARTER_DEFS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes('A2'));
});
