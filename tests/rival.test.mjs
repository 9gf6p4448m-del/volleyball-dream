// W4(P4) 題6 — 宿敵資料鉤：ace 遞補豁免（rival 旗標）／畢業播報豁免／
// 天鷹隊級 rival 旗標／賽制聯動（宿敵場 bo3）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySeasonRoster, graduatingAces, opponentById } from '../src/career/careerState.js';
import { RIVAL_TEAM_ID, matchFormatOf } from '../src/career/schedule.js';

// 合成 def：三年級 ace（無豁免＝第 2 屆起會被遞補）
const mkDef = (rival) => ({
  id: 'test-team',
  name: '測試隊',
  squad: ['甲', '乙', '丙', '丁', '戊', '己'],
  grades: [2, 3, 2, 2, 1, 2],
  ace: { slot: 1, name: '乙', title: '王牌', ...(rival ? { rival: true } : {}) },
  reserves: [{ name: '庚', role: 'outside', grade: 1, drop: 3, title: '接班' }],
});

test('宿敵豁免：ace.rival＝三年不被遞補純函式滾掉；無旗標＝照常遞補（零擾動）', () => {
  // 無旗標：第 2 屆起遞補（現行行為不變）
  const normal = applySeasonRoster(mkDef(false), 2);
  assert.equal(normal.ace.name, '庚', '三年級 ace 第 2 屆起換接班人');
  // rival 旗標：三屆全程豁免
  for (const season of [2, 3]) {
    const kept = applySeasonRoster(mkDef(true), season);
    assert.equal(kept.ace.name, '乙', `宿敵 ace 第 ${season} 屆仍在（豁免）`);
    assert.equal(kept.reserves.length, 1, '接班人不被消耗');
  }
});

test('宿敵 ace 不入畢業播報（graduatingAces 豁免）', () => {
  // 現役名單（OPPONENTS）：驗證帶 rival 旗標的 ace 恆不出現在畢業清單
  for (const season of [1, 2, 3]) {
    for (const g of graduatingAces(season)) {
      const def = opponentById(g.opponentId);
      assert.ok(!def.ace?.rival, `${g.opponentId} 的宿敵 ace 不得入畢業播報`);
    }
  }
});

test('天鷹＝宿敵所屬（隊級 rival 旗標）＋宿敵場賽制 bo3 聯動', () => {
  const hawk = opponentById(RIVAL_TEAM_ID);
  assert.equal(hawk.id, 'sky-hawk');
  assert.equal(hawk.rival, true, '隊級 rival 旗標（館氛圍/情蒐標記/ace 反讀共用）');
  assert.equal(matchFormatOf({ id: 'group-2', label: '', opponentId: RIVAL_TEAM_ID }), 3);
  // 其餘六隊無 rival 旗標（宿敵唯一性）
  const others = ['north-tech', 'white-wave', 'obsidian', 'gale-shore', 'iron-mist', 'black-pine'];
  for (const id of others) assert.ok(!opponentById(id).rival, `${id} 不得帶 rival`);
});
