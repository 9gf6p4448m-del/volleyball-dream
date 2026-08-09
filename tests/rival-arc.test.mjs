// 4.5A 宿敵三幕：掛點觸發／鏡子牆分版／勝敗分版／幕三條件句三版＋長高變體／
// 止步旁觀版／決定論（同輸入重跑逐值一致）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rivalActNo, mirrorOrWall, playerHeightCm, confessionVariant,
  rivalPreEvents, rivalPostEvents, rivalSpectatorEvents,
  RIVAL_ACT_MATCH, MIRROR_HEIGHT_CM, STYLE_MIN_SPIKES,
} from '../src/career/rivalArc.js';
import { createCareer, recordResult } from '../src/career/careerState.js';
import { buildSchedule } from '../src/career/schedule.js';

// 玩家樁：h＝現值公尺；plan[0]＝創角公分（長高變體＝current*100 - plan[0]）
const P = (h = 1.75, role = 'outside', planStart = null) => ({
  id: 'A2',
  currentRole: role,
  height: { current: h, plan: [planStart ?? Math.round(h * 100)] },
});

// 把賽程打到 targetId 之前（全勝）——nextMatch 剛好指向 targetId
function playUpTo(career, targetId) {
  let c = career;
  for (const m of c.schedule) {
    if (m.id === targetId) break;
    c = recordResult(c, { matchId: m.id, won: true, scoreFor: 25, scoreAgainst: 20 });
  }
  return c;
}

const seasonCareer = (seasonIndex, seed = 42) => ({
  seed,
  schedule: buildSchedule({ seed, seasonIndex }),
  results: [],
  growthPoints: 0,
});

test('掛點映射：幕一＝第1屆決賽、幕二＝第2屆準決、幕三＝第3屆決賽；他屆不觸發', () => {
  assert.equal(rivalActNo(1, 'national-final'), 1);
  assert.equal(rivalActNo(2, 'national-sf'), 2);
  assert.equal(rivalActNo(3, 'national-final'), 3);
  assert.equal(rivalActNo(1, 'national-sf'), null);
  assert.equal(rivalActNo(2, 'national-final'), null);
  assert.equal(RIVAL_ACT_MATCH[3], 'national-final');
});

test('鏡子/牆門檻：183cm 為界；playerHeightCm 缺值回退 175＝牆', () => {
  assert.equal(mirrorOrWall(MIRROR_HEIGHT_CM), 'mirror');
  assert.equal(mirrorOrWall(MIRROR_HEIGHT_CM - 1), 'wall');
  assert.equal(playerHeightCm({}), 175);
});

test('幕一賽前：決賽前觸發、鏡/牆分版、去重、非天鷹場不觸發', () => {
  const c = playUpTo(createCareer({ seed: 7 }), 'national-final');
  const wall = rivalPreEvents({ career: c, seasonIndex: 1, player: P(1.60) });
  assert.equal(wall.length, 1);
  assert.equal(wall[0].id, 'rival-act1-pre');
  assert.ok(wall[0].lines.some((l) => l.text.includes('高的人的運動')));
  const mirror = rivalPreEvents({ career: c, seasonIndex: 1, player: P(1.90) });
  assert.ok(mirror[0].lines.some((l) => l.text.includes('你幾公分')));
  // 去重：id 已入帳＝不再觸發
  const seen = { ...c, events: ['rival-act1-pre'] };
  assert.equal(rivalPreEvents({ career: seen, seasonIndex: 1, player: P(1.60) }).length, 0);
  // 尚在小組賽＝下一場非掛點場＝不觸發
  assert.equal(rivalPreEvents({ career: createCareer({ seed: 7 }), seasonIndex: 1, player: P(1.60) }).length, 0);
});

test('幕二賽前：準決賽前觸發；曾交手（情蒐存在）/首遇 差分；鏡牆共用', () => {
  const c = playUpTo(seasonCareer(2), 'national-sf');
  const first = rivalPreEvents({ career: c, seasonIndex: 2, player: P(1.60) });
  assert.equal(first[0].id, 'rival-act2-pre');
  assert.ok(first[0].lines.some((l) => l.text.includes('我叫莊敬嶺')));
  const faced = rivalPreEvents({
    career: { ...c, scouting: { 'sky-hawk': { zones: { line: 1, cross: 0, middle: 0, tip: 0 }, feints: 0, spikes: 1 } } },
    seasonIndex: 2,
    player: P(1.60),
  });
  assert.ok(faced[0].lines.some((l) => l.text.includes('多留一小時')));
  // 鏡牆共用：兩種身高同版
  const tall = rivalPreEvents({ career: c, seasonIndex: 2, player: P(1.95) });
  assert.deepEqual(tall[0].lines, first[0].lines);
});

test('幕一賽後：勝/敗 × 鏡/牆 四版各自可達；簽名句落在敗×牆版', () => {
  const pre = playUpTo(createCareer({ seed: 7 }), 'national-final');
  const lost = recordResult(pre, { matchId: 'national-final', won: false, scoreFor: 0, scoreAgainst: 3 });
  const won = recordResult(pre, { matchId: 'national-final', won: true, scoreFor: 3, scoreAgainst: 1 });
  const lw = rivalPostEvents({ career: lost, seasonIndex: 1, player: P(1.60) });
  assert.ok(lw[0].lines.some((l) => l.text.includes('爬不上來，是你不夠想')));
  const lm = rivalPostEvents({ career: lost, seasonIndex: 1, player: P(1.90) });
  assert.ok(lm[0].lines.some((l) => l.text.includes('浪費')));
  const ww = rivalPostEvents({ career: won, seasonIndex: 1, player: P(1.60) });
  assert.ok(ww[0].lines.some((l) => l.text.includes('我還不夠想')));
  const wm = rivalPostEvents({ career: won, seasonIndex: 1, player: P(1.90) });
  assert.ok(wm[0].lines.some((l) => l.text.includes('不想輸給你')));
  // 四版皆為同一事件 id（去重軸一致）
  for (const evs of [lw, lm, ww, wm]) assert.equal(evs[0].id, 'rival-act1-post');
});

test('幕三條件句：轉 L ＞ 打法 ＞ 基底；長高＝附加變體非主判定', () => {
  // 轉 L 最優先（即使打法條件也成立）
  const styleTally = {
    'sky-hawk': { zones: { line: 5, cross: 5, middle: 2, tip: 4 }, feints: 6, spikes: 20 },
  };
  const cStyle = { seed: 1, schedule: [], results: [], scouting: styleTally };
  assert.equal(confessionVariant({ player: P(1.60, 'libero'), career: cStyle }).key, 'libero');
  // 打法版：樣本 20 ≥ 12、(6+4)/20 = 0.5 ≥ 0.35
  assert.equal(confessionVariant({ player: P(1.60), career: cStyle }).key, 'style');
  // 樣本不足＝基底
  const few = { 'sky-hawk': { zones: { line: 0, cross: 0, middle: 0, tip: 3 }, feints: 3, spikes: STYLE_MIN_SPIKES - 1 } };
  assert.equal(confessionVariant({ player: P(1.60), career: { scouting: few } }).key, 'base');
  // 長高變體：三年 +10cm＝grewTall；主判定不變
  const grown = confessionVariant({ player: P(1.70, 'outside', 160), career: {} });
  assert.equal(grown.key, 'base');
  assert.equal(grown.grewTall, true);
  assert.equal(confessionVariant({ player: P(1.70, 'outside', 168), career: {} }).grewTall, false);
});

test('幕三賽後：坦白勝敗皆成立、條件句組落台詞、馬振羽一句戲恆在', () => {
  const pre = playUpTo(seasonCareer(3), 'national-final');
  const won = recordResult(pre, { matchId: 'national-final', won: true, scoreFor: 3, scoreAgainst: 2 });
  const lost = recordResult(pre, { matchId: 'national-final', won: false, scoreFor: 2, scoreAgainst: 3 });
  const wEvs = rivalPostEvents({ career: won, seasonIndex: 3, player: P(1.60, 'libero') });
  assert.equal(wEvs[0].id, 'rival-act3-post');
  assert.ok(wEvs[0].lines.some((l) => l.text.includes('我砌的牆，你繞過去了')));
  assert.ok(wEvs[0].lines.some((l) => l.text.includes('我也曾在牆的這一邊')));
  assert.ok(wEvs[0].lines.some((l) => l.speaker.includes('馬振羽')));
  const lEvs = rivalPostEvents({ career: lost, seasonIndex: 3, player: P(1.60) });
  assert.ok(lEvs[0].lines.some((l) => l.text.includes('我也曾在牆的這一邊')));
  assert.ok(lEvs[0].lines.some((l) => l.text.includes('先低頭的')));
  assert.ok(lEvs[0].lines.some((l) => l.speaker.includes('馬振羽')));
});

test('止步旁觀版：未實戰天鷹且止步＝觸發；實戰過/奪冠/已入帳＝不觸發', () => {
  // 第 1 屆八強敗＝止步且未遇天鷹 → 幕一旁觀
  // 循環賽卷（08-09）：止步＝八強循環三場打滿沒進前二
  let c = playUpTo(createCareer({ seed: 9 }), 'national-qf');
  for (const m of c.schedule.filter((x) => x.round === 'rr')) {
    c = recordResult(c, { matchId: m.id, won: false, scoreFor: 0, scoreAgainst: 25 });
  }
  const watch = rivalSpectatorEvents({ career: c, seasonIndex: 1 });
  assert.equal(watch[0].id, 'rival-act1-watch');
  assert.ok(watch[0].lines.some((l) => l.text.includes('莊敬嶺')));
  // 決賽輸給天鷹＝實戰過 → 不掛旁觀（賽後敗版已播）
  let f = playUpTo(createCareer({ seed: 9 }), 'national-final');
  f = recordResult(f, { matchId: 'national-final', won: false, scoreFor: 1, scoreAgainst: 3 });
  assert.equal(rivalSpectatorEvents({ career: f, seasonIndex: 1 }).length, 0);
  // 奪冠＝非止步 → 不觸發
  let ch = playUpTo(createCareer({ seed: 9 }), 'national-final');
  ch = recordResult(ch, { matchId: 'national-final', won: true, scoreFor: 3, scoreAgainst: 0 });
  assert.equal(rivalSpectatorEvents({ career: ch, seasonIndex: 1 }).length, 0);
  // 已入帳＝去重
  assert.equal(rivalSpectatorEvents({ career: { ...c, events: ['rival-act1-watch'] }, seasonIndex: 1 }).length, 0);
  // 第 3 屆旁觀含馬振羽一句
  let c3 = playUpTo(seasonCareer(3), 'national-qf');
  for (const m of c3.schedule.filter((x) => x.round === 'rr')) {
    c3 = recordResult(c3, { matchId: m.id, won: false, scoreFor: 0, scoreAgainst: 25 });
  }
  const w3 = rivalSpectatorEvents({ career: c3, seasonIndex: 3 });
  assert.ok(w3[0].lines.some((l) => l.speaker.includes('馬振羽')));
});

test('決定論：同輸入重跑逐值一致', () => {
  const c = playUpTo(seasonCareer(2, 123), 'national-sf');
  const a = rivalPreEvents({ career: c, seasonIndex: 2, player: P(1.72) });
  const b = rivalPreEvents({ career: c, seasonIndex: 2, player: P(1.72) });
  assert.deepEqual(a, b);
});
