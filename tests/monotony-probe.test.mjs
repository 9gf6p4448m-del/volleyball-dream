// 單調治療探針卷 批 1 — 純函式層（2026-08-26）
// 驗收＝`docs/kickoffs/acceptance-probe-batch1.md`（M1/M2＋門檻釘住，凍結 0aaff0c）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { CORPORATIONS, corporationById } from '../src/career/corporations.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup,
  leagueScoutZones, scoutFocusZone, SCOUT_HOT_SHARE, SCOUT_COLD_SHARE, SCOUT_ZONE_LABEL,
} from '../src/career/careerState.js';
import { buildCorpSchedule } from '../src/career/corpSchedule.js';
import { buildCorpMembers } from '../src/career/corpTeam.js';
import { corpShakeOffEvents } from '../src/career/corpEvents.js';
import { scoutBlockMul } from '../src/sim/game.js';
import { TIER } from '../src/career/admission.js';

// ════════════════════════════════════════════════════════════════
// M1 八隊 scoutRead 逐值＋梯度
// ════════════════════════════════════════════════════════════════
test('M1 八隊 scoutRead：三檔梯度逐值（★值屬提案，改提案要連這裡一起改★）', () => {
  const expected = {
    'qingkong-aero': 0.85, 'panshi-heavy': 0.85,
    'chaoxi-marine': 0.55, 'lieyang-petro': 0.55, 'baigang-precision': 0.55,
    'lvyuan-foods': 0.25, 'xingqiao-elec': 0.25, 'nanfeng-textile': 0.25,
  };
  for (const c of CORPORATIONS) {
    assert.equal(c.scoutRead, expected[c.id], `${c.id} 的讀取強度`);
  }
  // 梯度性質：強豪 ≥ 中堅 ≥ 保底（凍結的性質，數值可調、序不可反）
  const byTier = (t) => CORPORATIONS.filter((c) => c.tier === t).map((c) => c.scoutRead);
  const min = (a) => Math.min(...a);
  const max = (a) => Math.max(...a);
  assert.ok(min(byTier(TIER.POWERHOUSE)) >= max(byTier(TIER.MID)), '強豪 ≥ 中堅');
  assert.ok(min(byTier(TIER.MID)) >= max(byTier(TIER.WEAK)), '中堅 ≥ 保底');
});

// ════════════════════════════════════════════════════════════════
// 聚合與焦點線
// ════════════════════════════════════════════════════════════════
const scoutingFixture = {
  'sky-hawk': { zones: { line: 20, cross: 6, middle: 2, tip: 2 } },
  'north-ridge': { zones: { line: 16, cross: 8, middle: 4, tip: 2 } },
};

test('leagueScoutZones：跨對手逐鍵加總、excludeId 剔除、零紀錄回 null', () => {
  const career = { ...createCareer({ seed: 1, playerName: '夢' }), scouting: scoutingFixture };
  assert.deepEqual(leagueScoutZones(career),
    { zones: { line: 36, cross: 14, middle: 6, tip: 4 } });
  assert.deepEqual(leagueScoutZones(career, { excludeId: 'north-ridge' }),
    { zones: { line: 20, cross: 6, middle: 2, tip: 2 } });
  assert.equal(leagueScoutZones({ scouting: {} }), null);
  assert.equal(leagueScoutZones(null), null);
});

test('scoutFocusZone：>門檻取最大線、恰在門檻不算、樣本<6 回 null', () => {
  const f = scoutFocusZone({ line: 36, cross: 14, middle: 6, tip: 4 }); // line 佔 60%
  assert.equal(f.zone, 'line');
  assert.ok(f.share > SCOUT_HOT_SHARE);
  assert.equal(scoutFocusZone({ line: 35, cross: 35, middle: 15, tip: 15 }), null,
    '恰 0.35 不算被盯（門檻是嚴格大於，同 sim）');
  assert.equal(scoutFocusZone({ line: 3, cross: 1, middle: 1, tip: 0 }), null, '樣本<6');
  assert.equal(scoutFocusZone(null), null);
  assert.ok(SCOUT_ZONE_LABEL.line && SCOUT_ZONE_LABEL.tip, '線路中文表存在');
});

// ════════════════════════════════════════════════════════════════
// 門檻釘住：career 層常數與 sim 的 scoutBlockMul 行為在邊界上同義
// （M5 禁改 sim ⇒ 0.35/0.15 是有意複製，這組測試就是防漂移的鎖）
// ════════════════════════════════════════════════════════════════
const simState = (zones, zone = 'line') => ({
  scoutRead: { B: { targetId: 'A2', read: 0.85, zones } },
  rally: { lastSpikeZone: zone, lastToucherId: 'A2' },
});

test('門檻釘住：share 恰過熱線 sim 收攏、恰在熱線不收、過冷線給折扣', () => {
  assert.ok(scoutBlockMul(simState({ line: 36, cross: 64, middle: 0, tip: 0 }), 'B') > 1,
    'share .36 > SCOUT_HOT_SHARE ⇒ 攔網收攏');
  assert.equal(scoutBlockMul(simState({ line: 35, cross: 65, middle: 0, tip: 0 }), 'B'), 1,
    'share .35 ＝門檻 ⇒ 不收（嚴格大於，career 層 scoutFocusZone 同義）');
  assert.ok(scoutBlockMul(simState({ line: 14, cross: 86, middle: 0, tip: 0 }), 'B') < 1,
    'share .14 < SCOUT_COLD_SHARE ⇒ 反常線折扣（反制迴路的得利端）');
  assert.equal(scoutBlockMul(simState({ line: 3, cross: 2, middle: 0, tip: 0 }), 'B'), 1,
    '樣本<6 不讀（scoutFocusZone 同義）');
  assert.equal(SCOUT_HOT_SHARE, 0.35);
  assert.equal(SCOUT_COLD_SHARE, 0.15);
});

// ════════════════════════════════════════════════════════════════
// M2 careerMatchSetup 球探建檔
// ════════════════════════════════════════════════════════════════
function corpCareer(scouting) {
  const career = createCareer({ seed: 9, playerName: '夢' });
  const schedule = buildCorpSchedule({ corpId: 'panshi-heavy', seed: 9 });
  return { ...career, schedule, results: [], scouting };
}
const setupFor = (career, entry) => careerMatchSetup(
  career, createCareerPlayer('夢', { seed: 9 }), entry,
  { capacity: 8, members: buildCorpMembers('panshi-heavy'), alumni: [] },
  null, 8, null, 'panshi-heavy',
);

test('M2 企業對手：無個別紀錄仍成立——read＝表值、zones＝全生涯聚合', () => {
  const career = corpCareer(scoutingFixture);
  const entry = career.schedule[0];
  const setup = setupFor(career, entry);
  assert.ok(setup.scoutRead, '球探建檔：賽前無個別交手紀錄也要讀');
  assert.equal(setup.scoutRead.B.read, corporationById(entry.opponentId).scoutRead,
    'read＝該隊表值');
  assert.deepEqual(setup.scoutRead.B.zones, { line: 36, cross: 14, middle: 6, tip: 4 },
    'zones＝聚合（逐鍵加總）');
});

test('M2b 聚合空（零紀錄新檔）：參數不成立、sim 照舊不讀', () => {
  const career = corpCareer({});
  const setup = setupFor(career, career.schedule[0]);
  assert.equal(setup.scoutRead, undefined, '零紀錄＝不偽造樣本，交給 sim 防線');
});

test('M2c 高中路徑行為不變：未交手不讀、交手過走個別紀錄（非聚合）', () => {
  const hs = { ...createCareer({ seed: 9, playerName: '夢' }), scouting: scoutingFixture };
  const player = createCareerPlayer('夢', { seed: 9 });
  // sky-hawk（天鷹 scoutRead 0.9）交手過 ⇒ 用**它自己**的紀錄，不是聚合
  const hawkEntry = { id: 'x1', stage: 'national', round: 'qf', opponentId: 'sky-hawk', label: '' };
  const s1 = careerMatchSetup(hs, player, hawkEntry);
  assert.deepEqual(s1.scoutRead.B.zones, scoutingFixture['sky-hawk'].zones,
    '高中個別 seen 閘逐字不變（不得被聚合覆蓋）');
  // black-pine（黑松 0.6）未交手 ⇒ 照舊不讀（聚合回退只給企業對手）
  const pineEntry = { id: 'x2', stage: 'national', round: 'qf', opponentId: 'black-pine', label: '' };
  assert.equal(careerMatchSetup(hs, player, pineEntry).scoutRead, undefined);
});

// ════════════════════════════════════════════════════════════════
// M4 甩開句判準（純函式層；wiring 另檔）
// ════════════════════════════════════════════════════════════════
function shakeOffCareer({ myZones, events = [] }) {
  const career = corpCareer(scoutingFixture); // 聚合被盯線＝line（60%）
  const entry = career.schedule[0];
  const oppId = entry.opponentId;
  return {
    ...career,
    events,
    results: [{ matchId: entry.id, opponentId: oppId, won: true, scoreFor: 2, scoreAgainst: 0 }],
    scouting: { ...scoutingFixture, [oppId]: { zones: myZones } },
    _entry: entry,
  };
}

test('M4 甩開句：整場躲開被盯線（<冷線、樣本≥6）才給、一場一次', () => {
  const hit = shakeOffCareer({ myZones: { line: 0, cross: 6, middle: 3, tip: 1 } }); // line 0%
  const evs = corpShakeOffEvents(hit);
  assert.equal(evs.length, 1);
  assert.match(evs[0].lines[0].text, /直線/, '要點名被盯的那條線');
  assert.equal(typeof evs[0].lines[0].speaker, 'string', 'dialogPlay 契約：{speaker, text}');
  assert.equal(evs[0].id, `corp-shakeoff-${hit._entry.id}`);
  // 兩態對照：被盯線照打（佔比高）＝不給
  const miss = shakeOffCareer({ myZones: { line: 6, cross: 3, middle: 1, tip: 0 } }); // line 60%
  assert.deepEqual(corpShakeOffEvents(miss), []);
  // 樣本不足不給
  const few = shakeOffCareer({ myZones: { line: 0, cross: 3, middle: 1, tip: 1 } });
  assert.deepEqual(corpShakeOffEvents(few), []);
  // 已入帳不重播
  const played = shakeOffCareer({ myZones: { line: 0, cross: 6, middle: 3, tip: 1 } });
  assert.deepEqual(corpShakeOffEvents({ ...played, events: [`corp-shakeoff-${played._entry.id}`] }), []);
});
