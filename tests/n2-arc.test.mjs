// 4.5A 小白支線：掃描器決定論／作用中自由人歸屬／事件二數據觸發（上場版/師徒版/
// 場邊保底）／事件一・三差分與去重
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scanChaseLost, actingLiberoFor, n2ChaseTotals, n2OpeningLines,
  n2PostEvents, n2FinaleEvents, N2_CHASE_N,
} from '../src/career/n2Arc.js';

const T = (playerId, kind = 'dive') => ({ type: 'TOUCH', playerId, kind, team: 'A' });
const S = (team) => ({ type: 'SCORE', team, score: {} });

test('scanChaseLost：魚躍後該 rally 失分才計數；一 rally 至多一次；同輸入重跑一致', () => {
  // 撲了→對方得分＝1；撲了→我方得分＝0；沒撲→失分＝0
  const evs = [
    T('AL'), S('B'),          // +1
    T('AL'), S('A'),          // 救回來了＝0
    T('A5', 'receive'), S('B'), // 非撲＝0
    T('AL'), T('AL'), S('B'), // 同 rally 兩撲＝仍 +1
  ];
  assert.equal(scanChaseLost(evs, 'AL', 'A'), 2);
  assert.equal(scanChaseLost(evs, 'AL', 'A'), scanChaseLost(evs, 'AL', 'A'));
  assert.equal(scanChaseLost([], 'AL', 'A'), 0);
  assert.equal(scanChaseLost(evs, 'A2', 'A'), 0); // 別人的撲不算
});

test('actingLiberoFor：玩家=L＝本人；lineup 選小白＝AL 槽；其餘（小守）＝不記', () => {
  assert.deepEqual(
    actingLiberoFor({ player: { id: 'A2', currentRole: 'libero' }, lineup: null }),
    { pid: 'A2', who: 'player' },
  );
  assert.deepEqual(
    actingLiberoFor({ player: { id: 'A2', currentRole: 'outside' }, lineup: { libero: 'N2' } }),
    { pid: 'AL', who: 'N2' },
  );
  assert.equal(actingLiberoFor({ player: { id: 'A2', currentRole: 'outside' }, lineup: { libero: 'AL' } }), null);
});

const R = (matchId, stats) => ({ matchId, won: false, stats });
const roster = { members: [{ id: 'N2', name: '小白', role: 'libero', origin: 'handwritten' }] };
const noN2 = { members: [{ id: 'AL', name: '小守', role: 'libero' }] };

test('事件二・上場版：小白上場累積達 N＝觸發；未達/非第 3 屆/小白不在隊＝不觸發', () => {
  const career = {
    results: [
      R('group-1', { lbChase: 2, lbWho: 'N2' }),
      R('group-2', { lbChase: 1, lbWho: 'N2' }),
    ],
  };
  assert.equal(n2ChaseTotals(career).n2, 3);
  const evs = n2PostEvents({ career, seasonIndex: 3, player: { currentRole: 'outside' }, roster });
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, 'n2-arc-2');
  assert.ok(evs[0].lines.some((l) => l.text.includes('下半句')));
  // 未達 N
  const few = { results: [R('group-1', { lbChase: N2_CHASE_N - 1, lbWho: 'N2' })] };
  assert.equal(n2PostEvents({ career: few, seasonIndex: 3, player: { currentRole: 'outside' }, roster }).length, 0);
  // 非第 3 屆／小白不在隊／已入帳
  assert.equal(n2PostEvents({ career, seasonIndex: 2, player: { currentRole: 'outside' }, roster }).length, 0);
  assert.equal(n2PostEvents({ career, seasonIndex: 3, player: { currentRole: 'outside' }, roster: noN2 }).length, 0);
  assert.equal(n2PostEvents({
    career: { ...career, events: ['n2-arc-2'] }, seasonIndex: 3, player: { currentRole: 'outside' }, roster,
  }).length, 0);
});

test('事件二・師徒版：玩家=L 用自己的撲球數據；台詞指向「該放的球」', () => {
  const career = {
    results: [
      R('group-1', { lbChase: 2, lbWho: 'player' }),
      R('group-2', { lbChase: 1, lbWho: 'player' }),
    ],
  };
  const evs = n2PostEvents({ career, seasonIndex: 3, player: { currentRole: 'libero' }, roster });
  assert.equal(evs.length, 1);
  assert.ok(evs[0].lines.some((l) => l.text.includes('該放的球')));
  assert.ok(evs[0].lines.every((l) => l.speaker === '小白'));
});

test('事件二・場邊保底：小組打完且小白未上場＝場邊版（三事件鏈不斷）', () => {
  const career = {
    results: [
      R('group-1', {}), R('group-2', {}), R('group-3', {}),
    ],
  };
  const evs = n2PostEvents({ career, seasonIndex: 3, player: { currentRole: 'outside' }, roster });
  assert.equal(evs.length, 1);
  assert.ok(evs[0].lines.some((l) => l.text.includes('場邊')));
  // 小組未打完＝還不掛保底
  const mid = { results: [R('group-1', {}), R('group-2', {})] };
  assert.equal(n2PostEvents({ career: mid, seasonIndex: 3, player: { currentRole: 'outside' }, roster }).length, 0);
});

test('事件一：第 3 屆新生含小白＝入學宣言；玩家=L＝前輩自由人追加；無小白＝空', () => {
  const freshmen = [{ id: 'N2', name: '小白' }];
  const base = n2OpeningLines({ freshmen, player: { currentRole: 'outside' } });
  assert.ok(base.some((l) => l.text.includes('球不落地，就還沒輸')));
  const asL = n2OpeningLines({ freshmen, player: { currentRole: 'libero' } });
  assert.equal(asL.length, base.length + 2);
  assert.ok(asL.some((l) => l.text.includes('異色球衣')));
  assert.equal(n2OpeningLines({ freshmen: [{ id: 'N9' }], player: null }).length, 0);
});

test('事件三：轉 L/未轉差分；信仰升級為選擇權；去重', () => {
  const career = { results: [] };
  const base = n2FinaleEvents({ career, player: { currentRole: 'outside' }, roster });
  assert.equal(base[0].id, 'n2-arc-3');
  assert.ok(base[0].lines.some((l) => l.text.includes('選擇不放手')));
  const mentor = n2FinaleEvents({ career, player: { currentRole: 'libero' }, roster });
  assert.ok(mentor[0].lines.some((l) => l.text.includes('地板，交給我')));
  assert.notDeepEqual(base[0].lines, mentor[0].lines);
  assert.equal(n2FinaleEvents({ career: { events: ['n2-arc-3'], results: [] }, player: {}, roster }).length, 0);
  assert.equal(n2FinaleEvents({ career, player: {}, roster: noN2 }).length, 0);
});
