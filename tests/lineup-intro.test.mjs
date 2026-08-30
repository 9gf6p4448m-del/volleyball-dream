// 大作感二卷 批3（J3-3）：入場運鏡腳本純函式直測——段落邊界、掃描單調性、
// 特寫對焦、王牌缺席 fallback、越界夾取、全程數值有限
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTRO_SEC, introPhase, lineupIntroShot } from '../src/app/lineupIntro.js';

const LAYOUT = {
  oppZ: -4.5, myZ: 4.5,
  oppAce: { x: 1.8, z: -3.2 },
  myStar: { x: -2.1, z: 5.0 },
};

test('段落邊界：四段依序、越界夾取', () => {
  assert.equal(introPhase(0), 'oppLine');
  assert.equal(introPhase(0.33), 'oppLine');
  assert.equal(introPhase(0.34), 'oppAce');
  assert.equal(introPhase(0.53), 'oppAce');
  assert.equal(introPhase(0.54), 'myStar');
  assert.equal(introPhase(0.74), 'overview');
  assert.equal(introPhase(1), 'overview');
  assert.equal(introPhase(-0.5), 'oppLine');
  assert.equal(introPhase(1.5), 'overview');
});

test('掃描段：鏡頭 x 沿列隊單調前進、視線落在對手半場', () => {
  let prevX = -Infinity;
  for (let p = 0; p < 0.34; p += 0.02) {
    const shot = lineupIntroShot(p, LAYOUT);
    assert.ok(shot.pos.x >= prevX, `p=${p} 掃描倒退`);
    prevX = shot.pos.x;
    assert.ok(Math.sign(shot.target.z) === Math.sign(LAYOUT.oppZ), '視線該望向對手半場');
  }
});

test('特寫段：視線鎖定焦點（王牌／我方主角）', () => {
  const ace = lineupIntroShot(0.44, LAYOUT);
  assert.equal(ace.target.x, LAYOUT.oppAce.x);
  assert.equal(ace.target.z, LAYOUT.oppAce.z);
  const me = lineupIntroShot(0.64, LAYOUT);
  assert.equal(me.target.x, LAYOUT.myStar.x);
  assert.equal(me.target.z, LAYOUT.myStar.z);
});

test('王牌缺席 fallback：oppAce=null 退回對手列隊中心、不炸', () => {
  const shot = lineupIntroShot(0.44, { ...LAYOUT, oppAce: null });
  assert.equal(shot.target.x, 0);
  assert.equal(shot.target.z, LAYOUT.oppZ);
});

test('收尾段：鏡頭拉高退到我方後上方（銜接常態視角）', () => {
  const early = lineupIntroShot(0.76, LAYOUT);
  const late = lineupIntroShot(1, LAYOUT);
  assert.ok(late.pos.y > early.pos.y, '收尾要爬升');
  assert.ok(Math.sign(late.pos.z) === Math.sign(LAYOUT.myZ), '退到我方側');
});

test('全程數值有限（含反轉半場與越界 p）', () => {
  const flipped = { oppZ: 4.5, myZ: -4.5, oppAce: null, myStar: { x: 0, z: -4.5 } };
  for (const layout of [LAYOUT, flipped]) {
    for (let p = -0.2; p <= 1.2; p += 0.05) {
      const { pos, target } = lineupIntroShot(p, layout);
      for (const v of [pos.x, pos.y, pos.z, target.x, target.y, target.z]) {
        assert.ok(Number.isFinite(v), `p=${p} 出現非有限值`);
      }
    }
  }
  assert.ok(INTRO_SEC > 0);
});
