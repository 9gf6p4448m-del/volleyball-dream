// Phase 3 W3 — 先發編排測試：schema 結構驗證、FIVB 7.7 輪轉序預檢、trust 跟人映射、
// 遷移/補齊冪等、null→預設序建隊與 W2 固定槽位逐位等價、自由人排除、RMW 冪等。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LINEUP_SIZE, DEFAULT_STARTERS, DEFAULT_LIBERO_ID,
  defaultLineup, validateLineup, checkRotationOrder, checkRoleStructure,
  effectiveOrder, trustOf,
} from '../src/career/lineup.js';
import { createCareer, createCareerPlayer, careerTeams, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers, ensureStarterRoster } from '../src/career/roster.js';
import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { deserializeSave, createSaveV2, serializeSave } from '../src/career/schema.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

// W1/W2 期存檔實況：career+player+空名冊+lineup.starters=null（尚未排陣）
function storeW2Save() {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  store.saveCareer(createCareer({ seed: 42, playerName: '測試員' }));
  store.savePlayer(createCareerPlayer('測試員'));
  return { store, storage };
}

const MEMBERS = buildStarterMembers();
const PLAYER_ID = 'A2';

// ---- 1. schema 結構驗證 ----

test('validateLineup：合法預設陣容通過', () => {
  const { valid, errors } = validateLineup(defaultLineup(MEMBERS), MEMBERS, PLAYER_ID);
  assert.equal(valid, true, errors.join('；'));
});

test('validateLineup：長度非 6 擋下', () => {
  const lu = { ...defaultLineup(MEMBERS), starters: ['A1', 'A2', 'A3'] };
  assert.equal(validateLineup(lu, MEMBERS, PLAYER_ID).valid, false);
});

test('validateLineup：重複球員擋下', () => {
  const lu = { ...defaultLineup(MEMBERS), starters: ['A1', 'A2', 'A3', 'A4', 'A5', 'A1'] };
  const r = validateLineup(lu, MEMBERS, PLAYER_ID);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(''), /重複/);
});

test('validateLineup：先發含非法 id 擋下', () => {
  const lu = { ...defaultLineup(MEMBERS), starters: ['A1', 'A2', 'A3', 'A4', 'A5', 'ZZ'] };
  const r = validateLineup(lu, MEMBERS, PLAYER_ID);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(''), /ZZ/);
});

test('validateLineup：玩家 id 視為合法場上球員', () => {
  // 先發必含玩家 A2；members 不含 A2，靠 playerId 補進合法集
  assert.equal(validateLineup(defaultLineup(MEMBERS), MEMBERS, PLAYER_ID).valid, true);
  // 不給 playerId → A2 不在名冊 → 擋下（證明 A2 的合法性確實來自 playerId）
  assert.equal(validateLineup(defaultLineup(MEMBERS), MEMBERS, null).valid, false);
});

test('validateLineup：自由人排入先發擋下', () => {
  const lu = { ...defaultLineup(MEMBERS), starters: ['A1', 'A2', 'A3', 'A4', 'A5', 'AL'] };
  const r = validateLineup(lu, MEMBERS, PLAYER_ID);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(''), /自由人/);
});

test('validateLineup：rotationStart 越界擋下', () => {
  assert.equal(validateLineup({ ...defaultLineup(MEMBERS), rotationStart: 6 }, MEMBERS, PLAYER_ID).valid, false);
  assert.equal(validateLineup({ ...defaultLineup(MEMBERS), rotationStart: -1 }, MEMBERS, PLAYER_ID).valid, false);
  assert.equal(validateLineup({ ...defaultLineup(MEMBERS), rotationStart: 1.5 }, MEMBERS, PLAYER_ID).valid, false);
});

test('deserializeSave：壞 lineup 整包擲錯（匯入把關）', () => {
  const save = createSaveV2({ career: createCareer({ seed: 1 }), player: createCareerPlayer('X') });
  save.roster = { capacity: 10, members: MEMBERS };
  save.lineup = { starters: ['A1', 'A1', 'A3', 'A4', 'A5', 'A6'], libero: 'AL', rotationStart: 0, trust: {} };
  assert.throws(() => deserializeSave(serializeSave(save)), /先發陣容不合法/);
});

test('deserializeSave：starters=null（建檔中間態）不驗內容、放行', () => {
  const save = createSaveV2({ career: createCareer({ seed: 1 }), player: createCareerPlayer('X') });
  save.roster = { capacity: 10, members: MEMBERS };
  // lineup 仍是 createSaveV2 的預設 { starters:null, ... }
  assert.doesNotThrow(() => deserializeSave(serializeSave(save)));
});

// ---- 2. FIVB 7.7 輪轉序預檢 ----

test('checkRotationOrder：合法排列每棒依序輪替（legal）', () => {
  const r = checkRotationOrder([...DEFAULT_STARTERS], 0);
  assert.equal(r.legal, true);
  assert.equal(r.reason, null);
});

test('checkRotationOrder：重複球員判非法並給 7.7 理由', () => {
  const r = checkRotationOrder(['A1', 'A1', 'A3', 'A4', 'A5', 'A6'], 0);
  assert.equal(r.legal, false);
  assert.match(r.reason, /7\.7|重複/);
});

test('checkRotationOrder：長度不足判非法', () => {
  assert.equal(checkRotationOrder(['A1', 'A2'], 0).legal, false);
});

test('effectiveOrder：rotationStart 旋轉起始 1 號位', () => {
  assert.deepEqual(effectiveOrder(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], 0), ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
  assert.deepEqual(effectiveOrder(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], 2), ['A3', 'A4', 'A5', 'A6', 'A1', 'A2']);
  // rotationStart 合法排列旋轉後仍每棒依序輪替
  assert.equal(checkRotationOrder(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], 3).legal, true);
});

// ---- 3. trust 跟人映射 ----

test('trust 跟人：換位後該成員 trust 值不變、不繼承他人', () => {
  const player = createCareerPlayer('小夢');
  // A3 被賦予高信任 55；其餘 20。把 A3 從 index 2 換到 index 0（與 A1 對調）
  const lineup = {
    starters: ['A3', 'A2', 'A1', 'A4', 'A5', 'A6'],
    libero: 'AL', rotationStart: 0,
    trust: { A1: 20, A3: 55, A4: 20, A5: 20, A6: 20 },
  };
  const teams = careerTeams(player, null, MEMBERS, lineup);
  const byId = Object.fromEntries(teams.A.map((p) => [p.id, p]));
  assert.equal(byId.A3.trust.fromSetter, 55, 'A3 的信任跟著 A3 走');
  assert.equal(byId.A1.trust.fromSetter, 20, 'A1 未繼承 A3 舊槽位的信任');
  // 位置確實對調
  assert.equal(teams.A[0].id, 'A3');
  assert.equal(teams.A[2].id, 'A1');
  // 玩家信任恆取 save.player（40），不受 trust 映射左右
  assert.equal(byId.A2.trust.fromSetter, 40);
});

test('trustOf：缺鍵回退預設 20', () => {
  assert.equal(trustOf({ trust: { A3: 55 } }, 'A3'), 55);
  assert.equal(trustOf({ trust: { A3: 55 } }, 'A9'), 20);
  assert.equal(trustOf(null, 'A3'), 20);
});

// ---- 4/5. 補齊/遷移冪等 ----

test('ensureStarterRoster：補齊 lineup 為預設陣容', () => {
  const { store } = storeW2Save();
  assert.equal(store.loadLineup().starters, null, '前置：W2 存檔 starters=null');
  ensureStarterRoster(store);
  const lu = store.loadLineup();
  assert.deepEqual(lu.starters, DEFAULT_STARTERS);
  assert.equal(lu.libero, DEFAULT_LIBERO_ID);
  assert.equal(lu.rotationStart, 0);
  // trust 映射：隊友全 20、玩家 A2 不入映射
  assert.deepEqual(lu.trust, { A1: 20, A3: 20, A4: 20, A5: 20, A6: 20 });
  assert.equal(lu.trust.A2, undefined);
});

test('ensureStarterRoster：不覆蓋玩家已排陣容（冪等）', () => {
  const { store } = storeW2Save();
  ensureStarterRoster(store); // 首補
  // 玩家自排（對位合法：OH 對換你↔小飛）＋改起始輪轉＋調一個信任
  const edited = {
    starters: ['A1', 'A5', 'A3', 'A4', 'A2', 'A6'],
    libero: 'AL', rotationStart: 3,
    trust: { A1: 20, A3: 30, A4: 20, A5: 20, A6: 20 },
  };
  store.saveLineup(edited);
  ensureStarterRoster(store); // 二次呼叫
  assert.deepEqual(store.loadLineup(), edited, '玩家編排不被補齊覆蓋');
});

// ---- 5-1 對位結構（拍板 07-23：強制對角，杜絕職責位衝突）----

test('checkRoleStructure：預設陣容合法（S–OPP／OH–OH／MB–MB 對角）', () => {
  const r = checkRoleStructure([...DEFAULT_STARTERS], MEMBERS, PLAYER_ID);
  assert.equal(r.legal, true, r.reason);
});

test('checkRoleStructure：OH 對換／S–OPP 對換仍合法', () => {
  // 你↔小飛（OH 對）
  assert.equal(checkRoleStructure(['A1', 'A5', 'A3', 'A4', 'A2', 'A6'], MEMBERS, PLAYER_ID).legal, true);
  // 舉球員↔對角砲
  assert.equal(checkRoleStructure(['A4', 'A2', 'A3', 'A1', 'A5', 'A6'], MEMBERS, PLAYER_ID).legal, true);
});

test('checkRoleStructure：亂序（MB 佔 OH 對角）擋下並給職責衝突理由', () => {
  // A6(MB) 換到 2 號位、A2(OH) 到 6 號位 → 2-5 對角＝MB–OH 衝突
  const r = checkRoleStructure(['A1', 'A6', 'A3', 'A4', 'A5', 'A2'], MEMBERS, PLAYER_ID);
  assert.equal(r.legal, false);
  assert.match(r.reason, /對角|職責/);
});

test('ensureStarterRoster：對位衝突的已存陣容重置為預設、保留 trust（不 brick 存檔）', () => {
  const { store } = storeW2Save();
  ensureStarterRoster(store);
  store.saveLineup({
    starters: ['A1', 'A6', 'A3', 'A4', 'A5', 'A2'], // 2-5 對角 MB–OH 衝突（規則上線前的舊陣）
    libero: 'AL', rotationStart: 2,
    trust: { A1: 20, A3: 35, A4: 20, A5: 20, A6: 20 },
  });
  ensureStarterRoster(store); // 讀到衝突陣→重置
  const healed = store.loadLineup();
  assert.deepEqual(healed.starters, DEFAULT_STARTERS, '衝突陣重置為預設序');
  assert.equal(healed.rotationStart, 0);
  assert.equal(healed.trust.A3, 35, 'trust 映射保留不歸零');
});

test('lineup 遷移冪等：補齊後重載不再遷移', () => {
  const { store, storage } = storeW2Save();
  ensureStarterRoster(store);
  const first = store.loadLineup();
  // 重建 store（模擬重載）並再次 ensure——starters 已非 null，不得重跑遷移
  const store2 = createCareerStore(storage);
  ensureStarterRoster(store2);
  assert.deepEqual(store2.loadLineup(), first);
});

// ---- 6. null→預設序建隊與 W2 固定槽位逐位等價 ----

test('補齊後建隊與 W2 固定槽位對映逐位相同', () => {
  const { store } = storeW2Save();
  ensureStarterRoster(store);
  const player = createCareerPlayer('測試員');
  const teams = careerTeams(player, null, MEMBERS, store.loadLineup());
  // 逐位 id：與舊 createDefaultTeams 槽序 A1..A6 相同
  assert.deepEqual(teams.A.map((p) => p.id), ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
  // 逐位 trust：隊友全 20、玩家（槽1）40（舊 BASE_TRUST 隊友槽同值）
  assert.deepEqual(teams.A.map((p) => p.trust.fromSetter), [20, 40, 20, 20, 20, 20]);
  assert.equal(teams.A[1].trust.floorShare, 0.27, '玩家保底地板');
  // 逐位屬性：吃名冊個性化屬性（抽 A3 中間手核對）
  const a3 = MEMBERS.find((m) => m.id === 'A3');
  assert.deepEqual(teams.A[2].attributes, a3.attributes);
});

test('careerTeams：無 lineup 時取 defaultLineup（與顯式預設 lineup 等價）', () => {
  const player1 = createCareerPlayer('X');
  const player2 = createCareerPlayer('X');
  const withDefault = careerTeams(player1, null, MEMBERS);
  const withExplicit = careerTeams(player2, null, MEMBERS, defaultLineup(MEMBERS));
  assert.deepEqual(withDefault.A.map((p) => p.id), withExplicit.A.map((p) => p.id));
  assert.deepEqual(
    withDefault.A.map((p) => p.trust.fromSetter),
    withExplicit.A.map((p) => p.trust.fromSetter),
  );
});

// ---- 7. 自由人接線 ＋ RMW 冪等 ----

test('careerMatchSetup：依 lineup 順序建 A 隊、自由人由 lineup.libero 選', () => {
  const career = createCareer({ seed: 42 });
  const player = createCareerPlayer('小夢');
  const lineup = {
    starters: ['A5', 'A2', 'A3', 'A4', 'A1', 'A6'],
    libero: 'AL', rotationStart: 0,
    trust: { A1: 20, A3: 20, A4: 20, A5: 20, A6: 20 },
  };
  const setup = careerMatchSetup(career, player, career.schedule[0], { capacity: 10, members: MEMBERS }, lineup);
  assert.deepEqual(setup.teams.A.map((p) => p.id), ['A5', 'A2', 'A3', 'A4', 'A1', 'A6']);
  // 自由人：id 'AL'、名字取名冊成員 AL
  assert.equal(setup.liberos.A.id, 'AL');
  assert.equal(setup.liberos.A.name, MEMBERS.find((m) => m.id === 'AL').name);
});

// ---- 對抗式審查補強：中間態回退＋玩家必在先發（W4 潛伏防線）----

// W4-like 名冊：6 名非自由人隊友（可排出不含玩家 A2 的合法長度陣列）
const MEMBERS_W4 = [
  ...MEMBERS,
  { id: 'A7', name: '新人', origin: 'iron-mist', role: 'outside', height: 1.87,
    attributes: { jump: 60, power: 60, reaction: 60, stamina: 60, speed: 60, control: 60, serve: 60, block: 60 },
    growth: { grade: 1, xp: {}, log: [] }, dna: { teamId: 'iron-mist', style: 'balanced', tag: '' } },
];

test('careerTeams：{starters:null} 中間態回退預設、不炸', () => {
  const player = createCareerPlayer('X');
  const teams = careerTeams(player, null, MEMBERS, { starters: null, libero: null, rotationStart: 0 });
  assert.deepEqual(teams.A.map((p) => p.id), ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
});

test('validateLineup：先發缺主控球員 A2 擋下（W4 fieldIds>6）', () => {
  const noPlayer = { starters: ['A1', 'A3', 'A4', 'A5', 'A6', 'A7'], libero: 'AL', rotationStart: 0, trust: {} };
  const r = validateLineup(noPlayer, MEMBERS_W4, 'A2');
  assert.equal(r.valid, false);
  assert.match(r.errors.join(''), /主控/);
});

test('careerTeams：先發缺主控球員 A2 擲錯（不建出無主控的隊）', () => {
  const player = createCareerPlayer('X');
  const noPlayer = { starters: ['A1', 'A3', 'A4', 'A5', 'A6', 'A7'], libero: 'AL', rotationStart: 0, trust: {} };
  assert.throws(() => careerTeams(player, null, MEMBERS_W4, noPlayer), /主控|A2/);
});

test('saveLineup RMW：不覆蓋 roster/player 其餘鍵', () => {
  const { store } = storeW2Save();
  ensureStarterRoster(store);
  const rosterBefore = store.loadRoster();
  const playerBefore = store.loadPlayer();
  store.saveLineup({ starters: [...DEFAULT_STARTERS], libero: 'AL', rotationStart: 2, trust: { A1: 20, A3: 20, A4: 20, A5: 20, A6: 20 } });
  assert.deepEqual(store.loadRoster(), rosterBefore, 'roster 未被 lineup 寫入波及');
  assert.deepEqual(store.loadPlayer(), playerBefore, 'player 未被 lineup 寫入波及');
  assert.equal(store.loadLineup().rotationStart, 2);
});
