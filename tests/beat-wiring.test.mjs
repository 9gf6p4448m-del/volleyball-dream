// 4.5B §6 專屬 beat＋模板消費接線：camera metadata 落在正確的事件/台詞上
//（純資料斷言——beatStage 幾何不在此測；演出宣告不得改變台詞內容本身）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rivalPreEvents, rivalPostEvents, rivalSpectatorEvents } from '../src/career/rivalArc.js';
import { n2OpeningLines } from '../src/career/n2Arc.js';
import { positionTalkFor } from '../src/career/positionEvents.js';
import { createCareer, recordResult } from '../src/career/careerState.js';
import { buildSchedule } from '../src/career/schedule.js';

const P = (h = 1.75, role = 'outside') => ({
  id: 'A2', currentRole: role, height: { current: h, plan: [Math.round(h * 100)] },
});

function playUpTo(career, targetId) {
  let c = career;
  for (const m of c.schedule) {
    if (m.id === targetId) break;
    c = recordResult(c, { matchId: m.id, won: true, scoreFor: 25, scoreAgainst: 20 });
  }
  return c;
}

test('幕一隔網注視：牆版俯視（down）／鏡子版平視（level）；身高語意入 camOpts', () => {
  const c = playUpTo(createCareer({ seed: 7 }), 'national-final');
  const wall = rivalPreEvents({ career: c, seasonIndex: 1, player: P(1.6) });
  assert.ok(wall[0].lines.every((l) => l.cam === 'confront'));
  assert.equal(wall[0].lines[0].camOpts.angle, 'down');
  assert.equal(wall[0].lines[0].camOpts.playerHeightM, 1.6);
  const mirror = rivalPreEvents({ career: c, seasonIndex: 1, player: P(1.9) });
  assert.equal(mirror[0].lines[0].camOpts.angle, 'level');
});

test('幕一賽後＝exit 離場；幕二斷句 beat＝勝版擦汗/敗版握拳（rimlight-solo）', () => {
  let c1 = playUpTo(createCareer({ seed: 7 }), 'national-final');
  c1 = recordResult(c1, { matchId: 'national-final', won: false, scoreFor: 20, scoreAgainst: 25 });
  const a1 = rivalPostEvents({ career: c1, seasonIndex: 1, player: P(1.6) });
  assert.ok(a1[0].lines.every((l) => l.cam === 'exit'));

  const mk2 = (won) => {
    let c = playUpTo(createCareer({ seed: 9, seasonIndex: 2 }), 'national-sf');
    c = { ...c, schedule: buildSchedule({ seed: 9, seasonIndex: 2 }) };
    c = recordResult(c, { matchId: 'national-sf', won, scoreFor: won ? 2 : 0, scoreAgainst: won ? 0 : 2 });
    return rivalPostEvents({ career: c, seasonIndex: 2, player: P(1.7) });
  };
  const won = mk2(true);
  assert.equal(won[0].lines[0].cam, 'rimlight-solo');
  assert.equal(won[0].lines[0].camOpts.pose, 'wipe', '勝版＝他第一次擦汗');
  const lost = mk2(false);
  assert.equal(lost[0].lines[0].camOpts.pose, 'fist', '敗版＝握拳盯著手心');
});

test('幕三：坦白段 confess 燈光帶、馬振羽句邊光單人、阿哲收尾回純卡', () => {
  let c = playUpTo(createCareer({ seed: 11, seasonIndex: 3 }), 'national-final');
  c = recordResult(c, { matchId: 'national-final', won: true, scoreFor: 3, scoreAgainst: 1 });
  const evs = rivalPostEvents({ career: c, seasonIndex: 3, player: P(1.7) });
  const lines = evs[0].lines;
  const confess = lines.find((l) => l.text.includes('我也曾在牆的這一邊'));
  assert.equal(confess.cam, 'confront');
  assert.equal(confess.camOpts.lighting, 'confess', '場館燈滅、只留兩人光帶');
  const ma = lines.find((l) => l.speaker.includes('馬振羽'));
  assert.equal(ma.cam, 'rimlight-solo', '隊伍末端邊光單人');
  const tail = lines[lines.length - 1];
  assert.equal(tail.cam ?? null, null, '阿哲收尾＝回純對話卡');
  // 牆版開場＝仰角對峙
  const open = lines[0];
  assert.equal(open.camOpts.angle, 'up');
});

test('止步旁觀＝stands 看台遠景（事件級宣告）', () => {
  // 循環賽卷（08-09）：止步＝八強循環三場打滿沒進前二（不再是「輸一場」）
  let c = playUpTo(createCareer({ seed: 13 }), 'national-qf');
  for (const m of c.schedule.filter((x) => x.round === 'rr')) {
    c = recordResult(c, { matchId: m.id, won: false, scoreFor: 20, scoreAgainst: 25 });
  }
  const evs = rivalSpectatorEvents({ career: c, seasonIndex: 1 });
  assert.equal(evs.length, 1);
  assert.equal(evs[0].camera, 'stands');
});

test('小白事件一：膝蓋著地 beat 落在「膝蓋碰得到地」句上（knee 姿勢＋thud 合成音）', () => {
  const lines = n2OpeningLines({ freshmen: [{ id: 'N2' }], player: P(1.75) });
  const knee = lines.find((l) => l.text.includes('膝蓋碰得到地'));
  assert.equal(knee.cam, 'rimlight-solo');
  assert.equal(knee.camOpts.pose, 'knee');
  assert.equal(knee.camOpts.sound, 'thud', '零音檔架構＝WebAudio 合成');
  assert.equal(knee.camOpts.heightM, 1.6);
});

test('三人版轉位並排：小白在隊＝trio 隊形宣告（confront 變體、不新增模板）', () => {
  const members = [
    { id: 'AL', name: '小守', role: 'libero', origin: 'starter' },
    { id: 'N2', name: '小白', role: 'libero', origin: 'handwritten' },
  ];
  const talk = positionTalkFor({
    flags: { libero: 'open' },
    player: { ...P(1.75), currentRole: 'outside', aspiration: 'libero' },
    members,
  });
  const trioLines = talk.acceptLines.filter((l) => l.cam === 'confront');
  assert.ok(trioLines.length >= 3, '小白入教三句皆帶 trio 宣告');
  assert.ok(trioLines.every((l) => l.camOpts.formation === 'trio'));
  // 小守讓位兩句維持純卡（並排 beat 屬小白入教段）
  assert.equal(talk.acceptLines[0].cam ?? null, null);
});
