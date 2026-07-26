// Phase 4 W3 — 建隊鏈參數化（解玩家 OH 硬編；工單 §3 地基級）：
// applyPositionChange 三位置（S/MB/OPP）轉位後——currentRole 持久化、缺額補位員入隊、
// 預設陣依新對位重排且合法（validateLineup＋checkRoleStructure＋checkRotationOrder）、
// careerTeams 建隊玩家落新槽；同存檔轉位決定論；轉位後 advanceSeason 換血吃新角色。
// L（libero）＝工單 §8 建隊特例，本檔明確擋拒。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCareer, createCareerPlayer, careerStage, careerTeams,
} from '../src/career/careerState.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { ensureStarterRoster } from '../src/career/roster.js';
import {
  validateLineup, checkRoleStructure, checkRotationOrder, effectiveOrder,
} from '../src/career/lineup.js';
import { settleCareerMatch } from '../src/app/matchCareer.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function freshStore(seed = 777) {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed, playerName: '測' }));
  store.savePlayer(createCareerPlayer('測'));
  ensureStarterRoster(store);
  return store;
}

// 陣容三重合法性（結構＋5-1 對位＋7.7 輪轉序）一次驗
function assertLineupLegal(store, playerRole, label) {
  const members = store.loadRoster().members;
  const lineup = store.loadLineup();
  const v = validateLineup(lineup, members, 'A2');
  assert.ok(v.valid, `${label}：validateLineup 失敗 ${v.errors.join('；')}`);
  const rs = checkRoleStructure(lineup.starters, members, 'A2', playerRole);
  assert.ok(rs.legal, `${label}：對位失敗 ${rs.reason}`);
  const rot = checkRotationOrder(lineup.starters, lineup.rotationStart);
  assert.ok(rot.legal, `${label}：輪轉序失敗 ${rot.reason}`);
}

const winGame = { players: { A2: { teamId: 'A' } }, match: { score: { A: 25, B: 18 }, winner: 'A' }, events: [], scoutTally: {} };
const loseGame = { players: { A2: { teamId: 'A' } }, match: { score: { A: 19, B: 25 }, winner: 'B' }, events: [], scoutTally: {} };

function playSeason(store) {
  for (;;) {
    const career = store.loadCareer();
    const next = career.schedule.find((m) => !career.results.some((r) => r.matchId === m.id));
    if (!next || careerStage(career) === 'eliminated') break;
    settleCareerMatch({
      careerCtx: { store, career, player: store.loadPlayer(), matchEntry: next },
      game: next.stage === 'national' ? loseGame : winGame,
      playerId: 'A2',
    });
    if (careerStage(store.loadCareer()) === 'eliminated') break;
  }
}

test('轉 S：currentRole 持久化、OH 缺額補位員入隊（trust=10）、預設陣合法且玩家佔 S 槽', () => {
  const store = freshStore();
  const before = store.loadRoster().members.length;
  assert.ok(store.applyPositionChange('setter'));
  assert.equal(store.loadPlayer().currentRole, 'setter');
  // 創隊名冊 OH=A2+A5：玩家轉走後 OH 剩 1 → 補位員恰 1 名 OH
  const members = store.loadRoster().members;
  assert.equal(members.length, before + 1);
  const fill = members.find((m) => m.origin === 'generated');
  assert.equal(fill.role, 'outside');
  assert.equal(fill.growth.grade, 1);
  assertLineupLegal(store, 'setter', '轉 S');
  // SLOT_ROLES[0]=setter＋玩家佇列優先 → 玩家在 starters[0]；阿哲（A1）讓出主舉落板凳
  const lineup = store.loadLineup();
  assert.equal(lineup.starters[0], 'A2');
  assert.ok(!lineup.starters.includes('A1'), '阿哲應讓位（不在先發）');
  // trust 跟人：既有隊友沿用、補位員顯式 10、玩家不入映射
  assert.equal(lineup.trust[fill.id], 10);
  assert.equal(lineup.trust.A5, 20);
  assert.equal(lineup.trust.A2, undefined);
});

test('轉 MB／轉 OPP：缺額補位、陣容合法、careerTeams 玩家落對應槽', () => {
  for (const role of ['middle', 'opposite']) {
    const store = freshStore();
    assert.ok(store.applyPositionChange(role), `applyPositionChange(${role})`);
    assert.equal(store.loadPlayer().currentRole, role);
    assertLineupLegal(store, role, `轉 ${role}`);
    // OH 洞由補位員補（玩家原佔 OH 一席）
    const members = store.loadRoster().members;
    assert.ok(members.some((m) => m.origin === 'generated' && m.role === 'outside'));
    // careerTeams：玩家物件原樣入隊、落在 starters 對應槽位
    const player = store.loadPlayer();
    const lineup = store.loadLineup();
    const teams = careerTeams(player, null, members, lineup);
    const order = effectiveOrder(lineup.starters, lineup.rotationStart);
    const idx = order.indexOf('A2');
    assert.ok(idx >= 0);
    assert.equal(teams.A[idx].id, 'A2');
    assert.equal(teams.A[idx].currentRole, role);
    // 全隊無重複、6 人整
    assert.equal(new Set(teams.A.map((p) => p.id)).size, 6);
  }
});

test('轉位決定論：同 seed 兩個存檔各轉 S——補位員 id/全名/屬性逐值相同', () => {
  const a = freshStore(123);
  const b = freshStore(123);
  a.applyPositionChange('setter');
  b.applyPositionChange('setter');
  const fa = a.loadRoster().members.find((m) => m.origin === 'generated');
  const fb = b.loadRoster().members.find((m) => m.origin === 'generated');
  assert.deepEqual(fa, fb);
});

test('轉回 OH：不再新增補位員（名冊已有足額）、陣容合法、玩家回主攻槽', () => {
  const store = freshStore();
  store.applyPositionChange('setter');
  const countAfterS = store.loadRoster().members.length;
  assert.ok(store.applyPositionChange('outside'));
  assert.equal(store.loadPlayer().currentRole, 'outside');
  assert.equal(store.loadRoster().members.length, countAfterS); // 足額不再補
  assertLineupLegal(store, 'outside', '轉回 OH');
});

test('轉 L（工單 §8 建隊特例）：不入先發、libero=玩家、六席全隊友、陣容合法；未知角色拒收', () => {
  const store = freshStore();
  assert.equal(store.applyPositionChange('coach'), false);
  assert.ok(store.applyPositionChange('libero'));
  assert.equal(store.loadPlayer().currentRole, 'libero');
  const lineup = store.loadLineup();
  const members = store.loadRoster().members;
  // 玩家不入先發、異色球衣是玩家的
  assert.ok(!lineup.starters.includes('A2'), '玩家=L 不得在先發');
  assert.equal(lineup.libero, 'A2');
  // OH 洞由補位員補（玩家原佔 OH 一席）；六席全為名冊隊友
  assert.ok(members.some((m) => m.origin === 'generated' && m.role === 'outside'));
  assert.equal(lineup.starters.length, 6);
  for (const id of lineup.starters) assert.ok(members.some((m) => m.id === id));
  // 三重合法性（validateLineup 吃 playerRole='libero'）
  const v = validateLineup(lineup, members, 'A2', 'libero');
  assert.ok(v.valid, v.errors.join('；'));
  const rs = checkRoleStructure(lineup.starters, members, 'A2', 'libero');
  assert.ok(rs.legal, rs.reason);
  const rot = checkRotationOrder(lineup.starters, lineup.rotationStart);
  assert.ok(rot.legal, rot.reason);
  // careerTeams：L 玩家不在 teams.A、不炸守衛（liberos 通道由 careerMatchSetup 接）
  const teams = careerTeams(store.loadPlayer(), null, members, lineup);
  assert.ok(!teams.A.some((p) => p.id === 'A2'));
  assert.equal(teams.A.length, 6);
});

test('轉位後過屆：advanceSeason 換血吃新角色——缺額按玩家=S 計、下屆陣容合法', () => {
  const store = freshStore();
  playSeason(store); // 第 1 屆打完（止步收束）
  const adv = store.advanceSeason();
  assert.ok(adv && adv.ok);
  // 屆間轉位（教練談話接受的存檔面）
  assert.ok(store.applyPositionChange('setter'));
  assertLineupLegal(store, 'setter', '第 2 屆轉 S');
  playSeason(store); // 第 2 屆以 S 身分打完
  const adv2 = store.advanceSeason();
  assert.ok(adv2 && adv2.ok);
  // 換血後（吃 playerRole='setter'）：名冊仍能排出合法陣、玩家仍在 S 槽
  assertLineupLegal(store, 'setter', '第 3 屆換血後');
  const lineup = store.loadLineup();
  const members = store.loadRoster().members;
  const rs = checkRoleStructure(lineup.starters, members, 'A2', 'setter');
  assert.ok(rs.legal, rs.reason);
  assert.ok(lineup.starters.includes('A2'));
  assert.equal(store.loadPlayer().currentRole, 'setter'); // 轉位跨屆持久
});
