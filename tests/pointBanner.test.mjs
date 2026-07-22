// 得分原因面板：derivePointInfo 純函式的事件→文案對映
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivePointInfo } from '../src/ui/pointBanner.js';

const base = { myTeam: 'A', controlledId: 'A2', score: { A: 5, B: 3 } };

test('犯規三態：站位/四擊/後排攻擊直接以犯規名為題', () => {
  for (const [reason, title] of [
    ['POSITIONAL_FAULT', '站位犯規'],
    ['FOUR_HITS', '四擊犯規'],
    ['BACK_ROW_ATTACK', '後排攻擊違例'],
  ]) {
    const info = derivePointInfo({ ...base, reason, winner: 'A', lastTouch: null });
    assert.equal(info.title, title);
    assert.equal(info.mine, true);
    assert.match(info.sub, /我方得分/);
  }
});

test('出界依最後觸球動作細分：發球/扣球/攔網/一般', () => {
  for (const [kind, title] of [
    ['serve', '發球出界'], ['spike', '扣球出界'],
    ['block', '攔網出界'], ['receive', '擊球出界'],
  ]) {
    const info = derivePointInfo({
      ...base, reason: 'OUT', winner: 'A',
      lastTouch: { team: 'B', playerId: 'B4', kind },
    });
    assert.equal(info.title, title);
  }
});

test('界內落地：殺球/ACE/攔網得分；受控玩家親手殺球有專屬文案', () => {
  const spike = derivePointInfo({
    ...base, reason: 'BALL_IN', winner: 'A',
    lastTouch: { team: 'A', playerId: 'A4', kind: 'spike' },
  });
  assert.equal(spike.title, '殺球得分');
  const mySpike = derivePointInfo({
    ...base, reason: 'BALL_IN', winner: 'A',
    lastTouch: { team: 'A', playerId: 'A2', kind: 'spike' },
  });
  assert.equal(mySpike.title, '你的殺球得分！');
  const ace = derivePointInfo({
    ...base, reason: 'BALL_IN', winner: 'B',
    lastTouch: { team: 'B', playerId: 'B1', kind: 'serve' },
  });
  assert.equal(ace.title, 'ACE！發球直得');
  assert.equal(ace.mine, false);
  assert.match(ace.sub, /對方得分/);
  const block = derivePointInfo({
    ...base, reason: 'BALL_IN', winner: 'A',
    lastTouch: { team: 'A', playerId: 'A3', kind: 'block' },
  });
  assert.equal(block.title, '攔網得分');
});

test('界內落地但最後觸球方＝失分方：處理失誤（自家把球弄掉）', () => {
  const info = derivePointInfo({
    ...base, reason: 'BALL_IN', winner: 'B',
    lastTouch: { team: 'A', playerId: 'A6', kind: 'receive' },
  });
  assert.equal(info.title, '處理失誤');
  assert.equal(info.mine, false);
});
