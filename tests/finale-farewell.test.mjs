// 4.5A 小件：生涯結算送別——招募生具名句（13 recruitKey 全補、不再落 generic）；
// 手寫班底不受影響；補位員仍走 generic
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finaleFarewellLines } from '../src/career/careerFinale.js';

const RECRUIT_KEYS = [
  'north-tech', 'white-wave', 'obsidian', 'iron-mist', 'sky-hawk',
  'gale-shore', 'black-pine',
  'obsidian-2', 'iron-mist-2', 'sky-hawk-2', 'gale-shore-2', 'black-pine-2',
];

test('招募生具名送別：13 recruitKey 各有專屬句，不落 generic', () => {
  for (const key of RECRUIT_KEYS) {
    const members = [
      { id: 'A2', name: '小夢', role: 'outside' },
      { id: 'R1', name: '某招募生', role: 'outside', origin: key.replace(/-2$/, ''), recruitKey: key },
    ];
    const lines = finaleFarewellLines(members, 'A2');
    assert.equal(lines.length, 1, `${key} 應恰一句`);
    assert.ok(!lines[0].text.includes('畢業快樂。') || !lines[0].text.startsWith('跟你打'),
      `${key} 不得落 generic：${lines[0].text}`);
    assert.notEqual(lines[0].text, '跟你打攻擊的日子，很好。畢業快樂。', `${key} 落了 generic`);
  }
});

test('舊存檔回退：無 recruitKey 時 origin＝隊 id 命中主鍵句', () => {
  const members = [{ id: 'R1', name: '阿鷹', role: 'outside', origin: 'sky-hawk' }];
  const lines = finaleFarewellLines(members, 'A2');
  assert.ok(lines[0].text.includes('王牌'), '阿鷹讓位心境句未命中');
});

test('手寫班底優先於 recruitKey；補位員仍走 generic', () => {
  // N2 手寫句優先（就算誤帶 recruitKey 也不受影響）
  const handwritten = [{ id: 'N2', name: '小白', role: 'libero', recruitKey: 'white-wave' }];
  assert.ok(finaleFarewellLines(handwritten, 'A2')[0].text.includes('還在飛'));
  // 補位員（generated，無 recruitKey）＝generic
  const filler = [{ id: 'G1', name: '小樂', role: 'setter', origin: 'generated' }];
  const g = finaleFarewellLines(filler, 'A2');
  assert.ok(g[0].text.includes('畢業快樂'));
  assert.equal(g[0].speaker, '小樂');
});
