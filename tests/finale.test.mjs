// W4(P4) Q5 生涯結算＋W3 債務 5（debut 跨屆旗標）＋雙人畢業量能
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  finaleFarewellLines, finaleRitualSegments, buildFinaleSummary, NEXT_CHAPTER_LINES,
} from '../src/career/careerFinale.js';
import { isOnceEvent, ONCE_EVENT_IDS, graduationCeremonySegments } from '../src/career/events.js';
import { createCareerStore, vaultOf } from '../src/career/careerStore.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

test('送別台詞：班底手寫、招募生具名（4.5A）、補位員 generic、玩家不自送、決定論', () => {
  const members = [
    { id: 'A2', name: '小夢', role: 'outside' },
    { id: 'A1', name: '林承哲', role: 'setter' },
    { id: 'A5', name: '葉翊飛', role: 'outside' },
    { id: 'R1', name: '阿澄', role: 'setter', origin: 'north-tech', recruitKey: 'north-tech' },
    { id: 'G1', name: '小樂', role: 'middle', origin: 'generated' },
  ];
  const lines = finaleFarewellLines(members, 'A2');
  assert.ok(lines.length >= 6, '手寫（阿哲 2＋小飛 2）＋招募具名 1＋generic 1');
  assert.ok(!lines.some((l) => l.speaker === '小夢'), '玩家不出現在送別名單');
  assert.ok(lines.some((l) => l.speaker === '阿澄' && !l.text.includes('畢業快樂')),
    '招募生具名句（4.5A：不再落 generic）');
  assert.ok(lines.some((l) => l.speaker === '小樂' && l.text.includes('畢業快樂')),
    '補位員仍被記得（generic）');
  assert.deepEqual(lines, finaleFarewellLines(members, 'A2'), '決定論');
});

test('主角畢業儀式段落：graduationRitual perGraduate 同形；奪冠/未冠分版', () => {
  const champ = finaleRitualSegments({ playerName: '小夢', champion: true });
  assert.equal(champ.length, 1);
  assert.equal(champ[0].member.name, '小夢', 'graduationRitual 消費形狀 [{member, lines}]');
  assert.ok(champ[0].lines.every((l) => l.speaker && l.text), '台詞形狀完整');
  assert.ok(champ[0].lines.some((l) => l.text.includes('獎盃')));
  const lost = finaleRitualSegments({ playerName: '小夢', champion: false });
  assert.notDeepEqual(champ[0].lines, lost[0].lines, '戰績誠實分版');
  assert.ok(NEXT_CHAPTER_LINES.title.includes('完'));
});

test('4.5B §5-2 主角儀式三年遞進：帶一年級身高＝兩段（先矮後高）；無成長＝維持單段', () => {
  const grown = finaleRitualSegments({
    playerName: '小夢', champion: true, heightM: 1.78, heightStartM: 1.65,
  });
  assert.equal(grown.length, 2, '一年級的你＋現在的你＝同一條逐位聚光鏈');
  assert.equal(grown[0].member.height, 1.65);
  assert.equal(grown[1].member.height, 1.78);
  assert.ok(grown[0].lines.every((l) => l.speaker && l.text));
  assert.ok(grown[1].lines.some((l) => l.text.includes('獎盃')));
  const flat = finaleRitualSegments({
    playerName: '小夢', champion: false, heightM: 1.75, heightStartM: 1.75,
  });
  assert.equal(flat.length, 1, '身高沒變＝不硬拆兩段');
});

test('三屆總結：合計/冠軍數/招募名單解析', () => {
  const seasons = [
    { index: 1, wins: 5, losses: 1, champion: false, totals: { kills: 10, aces: 2, blockPoints: 1, tipKills: 0, perfects: 3, digs: 0, assistDigs: 0, rallySaves: 0 } },
    { index: 2, wins: 6, losses: 0, champion: true, totals: { kills: 12, aces: 3, blockPoints: 2, tipKills: 1, perfects: 4, digs: 5, assistDigs: 2, rallySaves: 1 } },
  ];
  const data = buildFinaleSummary({
    seasons,
    recruitment: { recruited: ['north-tech'], expelled: [{ member: { name: '被逐者' } }] },
    memberNames: { 'north-tech': '方振正' },
  });
  assert.equal(data.sum.wins, 11);
  assert.equal(data.sum.titles, 1);
  assert.equal(data.sum.kills, 22);
  assert.equal(data.sum.digs, 5);
  assert.deepEqual(data.recruits.joined, ['方振正']);
  assert.deepEqual(data.recruits.expelled, ['被逐者']);
});

test('W3 債務 5：一次性事件分類（debut 類 once／hot-hand 每屆可重）＋跨屆旗標存取', () => {
  assert.ok(isOnceEvent('debut'));
  assert.ok(isOnceEvent('teach-jump'));
  assert.ok(isOnceEvent('rematch-won'));
  assert.ok(!isOnceEvent('hot-hand'), '狀態性事件保留每屆重置語意');
  assert.ok(ONCE_EVENT_IDS.size >= 10);
  const store = createCareerStore(fakeStorage(), 1);
  assert.deepEqual(store.loadPlayedOnce(), []);
  store.markPlayedOnce(['debut', 'first-win']);
  store.markPlayedOnce(['debut']); // 冪等
  assert.deepEqual(store.loadPlayedOnce().sort(), ['debut', 'first-win']);
});

test('雙人畢業量能：阿岩＋阿遠同屆畢業——一次暗場、逐位聚光兩段', () => {
  const members = [
    { id: 'A6', name: '陳定岩', role: 'middle' },
    { id: 'A7', name: '莊明遠', role: 'outside' },
    { id: 'N1', name: '雷紹齊', role: 'middle' },
  ];
  const graduates = [members[0], members[1]];
  const segs = graduationCeremonySegments({ graduates, aceGrads: [], members });
  assert.equal(segs.perGraduate.length, 2, '逐位聚光＝兩段（節奏：合場一次暗場、逐位上光）');
  assert.ok(segs.opening.length >= 1, '開場（暗場）只有一次');
  const names = segs.perGraduate.map((g) => g.member.name);
  assert.deepEqual(names, ['陳定岩', '莊明遠']);
  for (const g of segs.perGraduate) {
    assert.ok(g.lines.length >= 1, `${g.name} 有離別台詞`);
  }
});

// 4.6 §3-1：典藏牆由單筆改固定四槽（champion＋天鷹三屆）。上限恆為 4 筆、
// 屆數即 key、永不覆寫；空槽不出現（顯示哲學：不給玩家看空欄）
test('典藏牆四槽：store 落檔/讀回 roundtrip＋永不覆寫', () => {
  const store = createCareerStore(fakeStorage(), 1);
  assert.deepEqual(store.loadRallyVault(), { champion: null, rival: {} });
  const tape = { v: 2, snapshot: { tick: 99 }, ai: {}, steps: [{ p: [] }] };
  const champ = { matchId: 'national-final', seasonIndex: 3, won: true, tape };
  assert.ok(store.recordVaultRally('champion', champ));
  assert.deepEqual(store.loadRallyVault().champion, champ);

  const act1 = { matchId: 'national-final', seasonIndex: 1, opponentId: 'sky-hawk', label: '決賽', won: false, tape };
  assert.ok(store.recordVaultRally(1, act1));
  assert.deepEqual(store.loadRallyVault().rival['1'], act1);
  // 同屆重打不覆蓋既有記憶
  assert.ok(store.recordVaultRally(1, { ...act1, won: true }));
  assert.equal(store.loadRallyVault().rival['1'].won, false);
  // 四槽並存、上限即四
  store.recordVaultRally(2, { ...act1, seasonIndex: 2 });
  store.recordVaultRally(3, { ...act1, seasonIndex: 3 });
  const vault = store.loadRallyVault();
  assert.deepEqual(Object.keys(vault.rival).sort(), ['1', '2', '3']);
  assert.ok(vault.champion);
});

test('舊存檔的單筆 finalRally＝讀成空牆（不寫回退相容層，但不得報錯）', () => {
  assert.deepEqual(
    vaultOf({ finalRally: { matchId: 'national-final', seasonIndex: 3, snapshot: {}, steps: [] } }),
    { champion: null, rival: {} },
  );
  assert.deepEqual(vaultOf(undefined), { champion: null, rival: {} });
});
