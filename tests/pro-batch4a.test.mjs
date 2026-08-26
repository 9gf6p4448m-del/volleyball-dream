// 職業章批 4a「餵線（案 A）＋賽前布置面板」— 純函式/sim 層（2026-08-26）
// 驗收＝docs/kickoffs/acceptance-pro-batch4a.md（D1-D6，動手前凍結）。
// DOM 接線（D2/D4/D5 的真實 UI 行為）另見 tests/pro-batch4a-wiring.test.mjs。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TECH_DEFS, unlockTechnique,
} from '../src/career/growth.js';
import { EVENT_DEFS, dueEvents } from '../src/career/events.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup, weakestReceiverIdOf, PRO_DEPLOY,
  leagueScoutZones, scoutFocusZone, matchOpponentDef,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';
import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { proTeamById } from '../src/career/proTeams.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { createIntent } from '../src/sim/intent.js';
import { serverId } from '../src/sim/match.js';
import { localToWorld } from '../src/sim/rotation.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// ════════════════════════════════════════════════════════════════
// D1：TECH_DEFS 新增「餵線」＋傳授事件走既有職業章事件慣例
// ════════════════════════════════════════════════════════════════
test('D1① TECH_DEFS 含 baitLine，有 name／desc', () => {
  const def = TECH_DEFS.find((t) => t.key === 'baitLine');
  assert.ok(def, 'baitLine 不在 TECH_DEFS 裡');
  assert.ok(typeof def.name === 'string' && def.name.length > 0);
  assert.ok(typeof def.desc === 'string' && def.desc.length > 0);
});

test('D1② unlockTechnique 可解鎖 baitLine；解鎖前 techniques.baitLine 為 0', () => {
  const p = createCareerPlayer('測試員', { seed: 1 });
  assert.equal(p.techniques.baitLine ?? 0, 0, '新建生涯：未解鎖');
  const unlocked = unlockTechnique(p, 'baitLine');
  assert.equal(unlocked.techniques.baitLine, 1);
});

test('D1③ teach-baitline 事件存在、解鎖的就是 baitLine、用 proLeaguePlayed 判準', () => {
  const ev = EVENT_DEFS.find((e) => e.id === 'teach-baitline');
  assert.ok(ev, 'teach-baitline 事件不存在');
  assert.equal(ev.effect?.unlock, 'baitLine');
  assert.ok('proLeaguePlayed' in (ev.when ?? {}), '未用職業聯賽場次計數當判準');
  // ★反向★ 不得綁在高中/大學賽事 id 上（同 B7-7 的紅法）——否則職業章打不到
  assert.equal(ev.when.lastMatchId, undefined);
  assert.equal(ev.when.stage, undefined);
});

test('D1④ proLeaguePlayed：高中/大學章 schedule 沒有 round==="pro"，恆不觸發（結構性零回歸）', () => {
  const career = createCareer({ seed: 5, playerName: '測試員' });
  // 高中生涯的 schedule 一律非 'pro'
  assert.ok(career.schedule.every((m) => m.round !== 'pro'));
  const due = dueEvents(career, 'post', 1);
  assert.ok(!due.some((e) => e.id === 'teach-baitline'), '高中章不得誤觸發職業章傳授事件');
});

test('D1⑤ proLeaguePlayed：職業聯賽打完門檻場數才到期（棄賽不算「打完」，同 uniLeaguePlayed 規則）', () => {
  const career = {
    schedule: [
      { id: 'p1', opponentId: 'x', round: 'pro' },
      { id: 'p2', opponentId: 'x', round: 'pro' },
    ],
    results: [
      { matchId: 'p1', won: true },
      { matchId: 'p2', won: true, forfeit: true }, // 棄賽不算打完
    ],
    events: [],
  };
  const due = dueEvents(career, 'post', 1);
  assert.ok(!due.some((e) => e.id === 'teach-baitline'), '只打完 1 場（p2 是棄賽）不該到期（門檻 7）');
});

// ════════════════════════════════════════════════════════════════
// D4 資料層①：weakestReceiverIdOf（攔網重心用不到，發球攻擊的資料源）
// ════════════════════════════════════════════════════════════════
test('D4-a① weakestReceiverIdOf：control 最低者中選，且排除二傳（索引 0）', () => {
  const def = {
    level: 80,
    attrBias: {},
    roleBias: {
      // ROLE_ORDER = ['setter','outside','middle','opposite','outside','middle']
      setter: { control: -50 }, // 二傳 control 名目上最低，但不得被選中
      opposite: { control: -10 }, // 真正最弱的候選（索引 3 → B4）
    },
  };
  assert.equal(weakestReceiverIdOf(def), 'B4');
});

test('D4-a② weakestReceiverIdOf：全員同值時決定論取第一個非二傳候選（B2）', () => {
  const def = { level: 80, attrBias: {}, roleBias: {} };
  assert.equal(weakestReceiverIdOf(def), 'B2');
});

test('D4-a③ weakestReceiverIdOf：def 缺席回 null（防呆）', () => {
  assert.equal(weakestReceiverIdOf(null), null);
});

// ════════════════════════════════════════════════════════════════
// D4 資料層②／D3 附註：careerMatchSetup 的 deploy 通道——zero-effect 對照＋逐槽生效
// ════════════════════════════════════════════════════════════════
function baseFixture(seed = 1) {
  const career = createCareer({ seed, playerName: '測試員' });
  const player = createCareerPlayer('測試員', { seed });
  const members = buildStarterMembers();
  const roster = { capacity: 12, members, alumni: [] };
  const lineup = defaultLineup(members, player.id, player.currentRole);
  const matchEntry = { id: 'group-1', opponentId: 'north-tech' };
  return {
    career, player, roster, lineup, matchEntry,
  };
}

test('D3 附註 zero-effect① deploy=null（省略）：aiProfiles.A 逐值等於未接批 4a 前（無 blockLean/serveTargetPid/serveScatterMul 鍵）', () => {
  const { career, player, roster, lineup, matchEntry } = baseFixture();
  const cfg = careerMatchSetup(career, player, matchEntry, roster, lineup, 1, null, null, 'cangyu-titans');
  assert.deepEqual(Object.keys(cfg.aiProfiles.A).sort(),
    ['diveRate', 'jumpServeRate', 'floatServeRate'].sort());
});

test('D3 附註 zero-effect② 非職業章（pro=null）：即使 deploy 有值也不生效——僅職業章面板可見的機械保證', () => {
  const { career, player, roster, lineup, matchEntry } = baseFixture();
  const cfg = careerMatchSetup(
    career, player, matchEntry, roster, lineup, 1, null, null, null,
    { blockLean: 'line', chaseTargetId: 'B3' },
  );
  assert.deepEqual(Object.keys(cfg.aiProfiles.A).sort(),
    ['diveRate', 'jumpServeRate', 'floatServeRate'].sort(),
    'pro 未簽（非職業章）＝deploy 結構上不該生效');
});

test('D4① 職業章＋blockLean=line：aiProfiles.A.blockLean 設為 line', () => {
  const { career, player, roster, lineup, matchEntry } = baseFixture();
  const cfg = careerMatchSetup(
    career, player, matchEntry, roster, lineup, 1, null, null, 'cangyu-titans',
    { blockLean: 'line', chaseTargetId: null },
  );
  assert.equal(cfg.aiProfiles.A.blockLean, 'line');
  assert.equal(cfg.aiProfiles.A.serveTargetPid, undefined);
  assert.equal(cfg.aiProfiles.A.serveScatterMul, undefined);
});

test('D4① 職業章＋blockLean=cross：aiProfiles.A.blockLean 設為 cross', () => {
  const { career, player, roster, lineup, matchEntry } = baseFixture();
  const cfg = careerMatchSetup(
    career, player, matchEntry, roster, lineup, 1, null, null, 'cangyu-titans',
    { blockLean: 'cross' },
  );
  assert.equal(cfg.aiProfiles.A.blockLean, 'cross');
});

test('D4① 非法 blockLean 值（不是 line/cross）：不寫入——UI 只會送出這兩種值，但通道本身也要防呆', () => {
  const { career, player, roster, lineup, matchEntry } = baseFixture();
  const cfg = careerMatchSetup(
    career, player, matchEntry, roster, lineup, 1, null, null, 'cangyu-titans',
    { blockLean: 'middle' },
  );
  assert.equal(cfg.aiProfiles.A.blockLean, undefined);
});

test('D4② 職業章＋chaseTargetId：aiProfiles.A.serveTargetPid 與 serveScatterMul（真實代價）同時寫入', () => {
  const { career, player, roster, lineup, matchEntry } = baseFixture();
  const cfg = careerMatchSetup(
    career, player, matchEntry, roster, lineup, 1, null, null, 'cangyu-titans',
    { chaseTargetId: 'B3' },
  );
  assert.equal(cfg.aiProfiles.A.serveTargetPid, 'B3');
  assert.equal(cfg.aiProfiles.A.serveScatterMul, PRO_DEPLOY.CHASE_SERVE_SCATTER_MUL);
  assert.ok(PRO_DEPLOY.CHASE_SERVE_SCATTER_MUL > 1, '代價乘子必須真的放大散佈，不是聊備一格');
});

test('D4③ 兩槽可同時生效（互不干擾）', () => {
  const { career, player, roster, lineup, matchEntry } = baseFixture();
  const cfg = careerMatchSetup(
    career, player, matchEntry, roster, lineup, 1, null, null, 'cangyu-titans',
    { blockLean: 'line', chaseTargetId: 'B5' },
  );
  assert.equal(cfg.aiProfiles.A.blockLean, 'line');
  assert.equal(cfg.aiProfiles.A.serveTargetPid, 'B5');
});

// ════════════════════════════════════════════════════════════════
// D5：情報不足資料源的裸函式行為（scoutFocusZone／有無交手紀錄）
// ════════════════════════════════════════════════════════════════
test('D5① 攔網重心資料源：career.scouting 該隊 zones 樣本不足（<6）＝scoutFocusZone 回 null', () => {
  const zones = { line: 2, cross: 1, middle: 0, tip: 0 }; // 總數 3 < 6
  assert.equal(scoutFocusZone(zones), null);
});

test('D5② 攔網重心資料源：樣本足夠且有主線（>0.35）才回傳 focus', () => {
  const zones = { line: 8, cross: 1, middle: 1, tip: 0 }; // 總 10，line 占 80%
  const focus = scoutFocusZone(zones);
  assert.ok(focus);
  assert.equal(focus.zone, 'line');
});

test('D5③ 發球攻擊資料源：career.scouting 無此對手紀錄＝weakestReceiverIdOf 呼叫端該回 null（UI 層守衛，這裡驗資料判準本身）', () => {
  const career = createCareer({ seed: 9, playerName: '測試員' });
  assert.equal(career.scouting?.['north-tech'], undefined, '新生涯尚未交手，無 scouting 紀錄');
});

// ════════════════════════════════════════════════════════════════
// D4/D5 落檔：careerStore.loadDeployment／saveDeployment
// ════════════════════════════════════════════════════════════════
test('store① saveDeployment 後 loadDeployment 同一場能讀回', () => {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed: 1, playerName: '測試員' }));
  store.saveDeployment('group-1', { blockLean: 'cross', chaseTargetId: 'B4' });
  const d = store.loadDeployment('group-1');
  assert.deepEqual(d, { blockLean: 'cross', chaseTargetId: 'B4' });
});

test('store② 換一場（matchId 對不上）＝視為未設定——不沿用到不相干對手（D5 精神）', () => {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed: 1, playerName: '測試員' }));
  store.saveDeployment('group-1', { blockLean: 'line', chaseTargetId: 'B2' });
  const d = store.loadDeployment('group-2');
  assert.deepEqual(d, { blockLean: null, chaseTargetId: null });
});

test('store③ 未曾布置過：loadDeployment 回預設空值（不 throw）', () => {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed: 1, playerName: '測試員' }));
  assert.deepEqual(store.loadDeployment('group-1'), { blockLean: null, chaseTargetId: null });
});

test('store④ 存檔結構：deploy 落在 save.career.deploy（自由區慣例，不動 schema）', () => {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  store.saveCareer(createCareer({ seed: 1, playerName: '測試員' }));
  store.saveDeployment('group-1', { blockLean: 'line', chaseTargetId: null });
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(raw.career.deploy.matchId, 'group-1');
  assert.equal(raw.career.deploy.blockLean, 'line');
});

// ════════════════════════════════════════════════════════════════
// D3：sim 側零新判定的鑑別力——① 預設值下逐值無效果（serve 散佈公式） ② 有設定時真的介入
// ════════════════════════════════════════════════════════════════
function serveWithScatterMul(scatterMul, seed = 41) {
  const g = createGame({
    seed,
    aiProfiles: scatterMul != null ? { A: { serveScatterMul: scatterMul } } : null,
  });
  g.serveReadyTick = 0;
  const sid = serverId(g.match);
  const aim = localToWorld('B', 0, 7.8);
  stepGame(g, [createIntent({
    playerId: sid, tick: g.tick, action: 'serve', aim,
  })]);
  return { g, aim };
}

test('D3-serve① 未設 serveScatterMul：與完全沒有 aiProfiles 時逐值相同（zero-effect，同種子）', () => {
  const withUndef = serveWithScatterMul(undefined);
  const withNone = serveWithScatterMul(null);
  assert.deepEqual(
    [withUndef.g.ball.x, withUndef.g.ball.z, withUndef.g.rngState],
    [withNone.g.ball.x, withNone.g.ball.z, withNone.g.rngState],
  );
});

// ★ 為什麼量落點而不是發球瞬間的 ball.x/z ★ 發球出手那一刻 ball 仍停在擊球點
// （contact point），target 只編碼進速度向量；量測必須追到球真正落地/出界那一刻。
// `settlePoint`（game.js:1435）把落點存進 `DEAD_BALL` 事件的 `.at`（供回放/UI 用，
// 本測試借用同一顆既有事件，不必額外插樁）。
function serveLandingDistFromAim(scatterMul, seed = 41) {
  const g = createGame({
    seed, aiProfiles: scatterMul != null ? { A: { serveScatterMul: scatterMul } } : null,
  });
  g.serveReadyTick = 0;
  const sid = serverId(g.match);
  const aim = localToWorld('B', 0, 7.8);
  let evs = stepGame(g, [createIntent({ playerId: sid, tick: g.tick, action: 'serve', aim })]);
  let at = evs.find((e) => e.type === 'DEAD_BALL')?.at ?? null;
  let i = 0;
  while (!at && i < 400) {
    evs = stepGame(g, []);
    at = evs.find((e) => e.type === 'DEAD_BALL')?.at ?? null;
    i += 1;
  }
  assert.ok(at, 'fixture 前提：發球必須在追蹤上限內落地/出界（DEAD_BALL）才量得到落點');
  return Math.hypot(at.x - aim.x, at.z - aim.z);
}

test('D3-serve② scatterMul 越大，發球落點離瞄準點越遠（同種子、其餘輸入相同——真實代價兌現，非死碼）', () => {
  const d1 = serveLandingDistFromAim(1);
  const d2 = serveLandingDistFromAim(2);
  const d4 = serveLandingDistFromAim(4);
  assert.ok(d1 > 0, 'fixture 前提：基準散佈本身不得是 0（否則量不出放大）');
  assert.ok(d2 > d1, `mul=2 應比 mul=1 散得更開（d1=${d1} d2=${d2}）`);
  assert.ok(d4 > d2, `mul=4 應比 mul=2 散得更開（d2=${d2} d4=${d4}）`);
});

test('D3-serve③ 出廠布置乘子（PRO_DEPLOY.CHASE_SERVE_SCATTER_MUL）確實放大落點散佈（非 1、非 <1）', () => {
  const base = serveLandingDistFromAim(1);
  const risky = serveLandingDistFromAim(PRO_DEPLOY.CHASE_SERVE_SCATTER_MUL);
  assert.ok(risky > base, '追發布置必須真的變得更容易失準，不是純增益');
});

// ---- 攔網重心：全場行為級鑑別力（同種子、其餘全同——只切 blockLean 一個開關） ----
function playFullMatch(seed, opponentId, aOverride = {}) {
  const career = createCareer({ seed });
  const player = createCareerPlayer('探針', { seed });
  const members = buildStarterMembers();
  const lineup = defaultLineup(members, player.id, player.currentRole);
  const roster = { capacity: 12, members, alumni: [] };
  const setup = careerMatchSetup(career, player, { id: 'group-1', opponentId }, roster, lineup, 1);
  const g = createGame({
    seed: setup.seed,
    teams: setup.teams,
    liberos: setup.liberos,
    aiProfiles: { A: { ...setup.aiProfiles.A, ...aOverride }, B: setup.aiProfiles.B },
  });
  const ai = createAiState();
  let ticks = 0;
  while (g.phase !== 'set_over' && g.tick < 60000) {
    stepGame(g, aiCollectIntents(g, ai));
    ticks += 1;
  }
  return { score: { ...g.match.score }, ticks };
}

test('D3-block① 未設 blockLean：兩次同種子整場逐值相同（決定論對照）', () => {
  const a = playFullMatch(9001, 'north-tech');
  const b = playFullMatch(9001, 'north-tech');
  assert.deepEqual(a, b);
});

test('D3-block② 設 blockLean=line：同種子整場結果與未設定時不同——證明真的接進攔網決策（非死碼）', () => {
  const base = playFullMatch(9001, 'north-tech');
  const leaned = playFullMatch(9001, 'north-tech', { blockLean: 'line' });
  assert.notDeepEqual(leaned, base,
    '押線後同種子的整場結果應與未押不同——若逐值相同代表 blockLean 沒有真的接進判斷');
});
