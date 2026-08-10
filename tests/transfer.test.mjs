// W4(P4) 題1 — 賽季中請調：gate 三條件（open／打滿 3 場／每屆一次）＋
// 當屆二選一互斥＋決定論＋台詞分版
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transferCandidates, transferAskLines, transferTalkFor, seasonTransferState,
  interSeasonTalkAllowed, TRANSFER_ASKED_EV, TRANSFER_USED_EV, TRANSFER_MIN_MATCHES,
  TALK_CANDIDATES,
} from '../src/career/positionEvents.js';
import { createCareer, recordResult, advanceSeason } from '../src/career/careerState.js';

const FLAGS_ALL_OPEN = { setter: 'open', middle: 'open', opposite: 'open', libero: 'open' };
const PLAYER = { currentRole: 'outside', aspiration: 'libero' };
const careerWith = (n, events = []) => ({
  results: Array.from({ length: n }, (_, i) => ({ matchId: `group-${i + 1}`, won: i % 2 === 0 })),
  events,
});

test('gate 三條件：位置 open／打滿 3 場／每屆一次——缺一即空', () => {
  // 未打滿 3 場
  assert.deepEqual(
    transferCandidates({ flags: FLAGS_ALL_OPEN, player: PLAYER, career: careerWith(TRANSFER_MIN_MATCHES - 1) }),
    [],
  );
  // 打滿 3 場＋全 open＝四位置扣現任
  const roles = transferCandidates({ flags: FLAGS_ALL_OPEN, player: PLAYER, career: careerWith(3) });
  assert.deepEqual(roles, ['setter', 'middle', 'opposite', 'libero']);
  // 部分 open：只給 open 的
  assert.deepEqual(
    transferCandidates({
      flags: { setter: 'open', middle: 'ready', opposite: 'locked', libero: 'open' },
      player: PLAYER,
      career: careerWith(5),
    }),
    ['setter', 'libero'],
  );
  // 每屆一次：asked 或 used 皆封（入口不再出現）
  assert.deepEqual(
    transferCandidates({ flags: FLAGS_ALL_OPEN, player: PLAYER, career: careerWith(5, [TRANSFER_ASKED_EV]) }),
    [],
  );
  assert.deepEqual(
    transferCandidates({ flags: FLAGS_ALL_OPEN, player: PLAYER, career: careerWith(5, [TRANSFER_USED_EV]) }),
    [],
  );
  // 現任位置不列
  assert.ok(!transferCandidates({
    flags: FLAGS_ALL_OPEN, player: { currentRole: 'setter' }, career: careerWith(3),
  }).includes('setter'));
});

// 2026-08-10 Sawmah 裁定「開放轉回 OH」（真人試玩：第三屆想從 S 轉回 OH，選單只有 MB/L/OPP）。
// 修復前紅在第一條 includes——OH 從來不在候選池常數裡，不是被哪條規則剔除的
test('回任 OH：轉出去之後回得來——請調選單列得出主攻手', () => {
  const roles = transferCandidates({
    flags: FLAGS_ALL_OPEN, player: { currentRole: 'setter' }, career: careerWith(3),
  });
  assert.ok(roles.includes('outside'), 'OH 不入旗標系統 ≠ 不能回任');
  assert.deepEqual(roles, ['middle', 'opposite', 'libero', 'outside'], 'OH 排最後、現任 S 不列');
  // OH 不受三態旗標管（出道位的工程與驗收隨遊戲本體出廠）：旗標全 locked 也回得去
  assert.deepEqual(
    transferCandidates({ flags: {}, player: { currentRole: 'libero' }, career: careerWith(3) }),
    ['outside'],
  );
  // 現任 OH 不列自己（沿現制的「不列現任位置」）
  assert.ok(!transferCandidates({
    flags: FLAGS_ALL_OPEN, player: PLAYER, career: careerWith(3),
  }).includes('outside'));
  // 教練主動談話的池不動（回任只走玩家主動的請調——兩個池刻意分開）
  assert.ok(!TALK_CANDIDATES.includes('outside'));
});

test('回任 OH 的台詞自成一版：不得沿用「舉對」分支，位置名不得漏字', () => {
  const members = [
    { id: 'G9', name: '林替身', role: 'outside' },
    { id: 'G8', name: '別的人', role: 'opposite' },
  ];
  const t = transferTalkFor({ role: 'outside', player: { currentRole: 'setter' }, members });
  assert.ok(t.offerLines.some((l) => l.text.includes('主攻手')), 'ROLE_LABEL 缺 outside＝畫面直接吐英文 role');
  assert.ok(t.acceptLines.some((l) => l.speaker === '林替身'), '被取代者＝現任主攻');
  assert.ok(!t.acceptLines.some((l) => l.text.includes('右翼')), 'fallthrough 到 opposite＝台詞說錯位置');
  // 名冊裡沒有其他 OH（理論上不會發生）也不得炸，退回泛稱
  const bare = transferTalkFor({ role: 'outside', player: { currentRole: 'setter' }, members: [] });
  assert.ok(bare.acceptLines.every((l) => l.speaker === '隊友'));
});

test('當屆二選一互斥：used＝屆間談話不觸發；婉拒（僅 asked）＝屆間談話照常', () => {
  assert.equal(interSeasonTalkAllowed(careerWith(5, [TRANSFER_USED_EV])), false);
  assert.equal(interSeasonTalkAllowed(careerWith(5, [TRANSFER_ASKED_EV])), true, '婉拒沒用掉機會');
  assert.equal(interSeasonTalkAllowed(careerWith(5)), true);
  assert.deepEqual(seasonTransferState(careerWith(0, [TRANSFER_ASKED_EV])),
    { asked: true, used: false });
});

test('決定論＋台詞分版：同輸入同輸出；表現/志願各自分版', () => {
  const c = careerWith(4); // 2 勝 2 敗＝勝率 5 成＝表現好版
  assert.deepEqual(transferAskLines(c), transferAskLines(c), '決定論');
  assert.ok(transferAskLines(c).some((l) => l.text.includes('沒理由')), '勝率≥5成＝肯定版');
  const bad = { results: [{ won: false }, { won: false }, { won: false }], events: [] };
  assert.ok(transferAskLines(bad).some((l) => l.text.includes('想走，還是想逃')), '低勝率＝質問版');
  // 志願位＝「我等你這句話很久了」；非志願位＝勸但尊重
  const asp = transferTalkFor({ role: 'libero', player: PLAYER, members: [] });
  assert.ok(asp.offerLines.some((l) => l.text.includes('等你這句話很久了')));
  const non = transferTalkFor({ role: 'middle', player: PLAYER, members: [] });
  assert.ok(non.offerLines.some((l) => l.text.includes('不是非走不可')));
  assert.ok(non.acceptLines.length > 0, '接受＝縫隙 1 被取代者劇情沿現制');
  assert.deepEqual(asp.declineLines, transferTalkFor({ role: 'libero', player: PLAYER, members: [] }).declineLines);
});

// B1 迴歸（試玩回饋 0730 #2）：旗標註解承諾「events 逐屆重置」，但 advanceSeason
// 的 ...base 把舊 events 原封帶進下一屆——第一屆用掉轉位後，第 2、3 屆入口永久鎖死。
test('B1：advanceSeason 清除當屆轉位旗標、非轉位事件保留——「每屆一次」的屆界要真的存在', () => {
  let c = createCareer({ seed: 5, playerName: '測' });
  c = { ...c, events: [...(c.events ?? []), TRANSFER_ASKED_EV, TRANSFER_USED_EV, 'story-anchor'] };
  // 打完一屆（小組全勝＋八強循環全敗＝止步，可進 advanceSeason）
  // 循環賽卷（08-09）：循環組輸球不止步，三場要打滿
  for (const m of c.schedule) {
    if (m.stage === 'group') c = recordResult(c, { matchId: m.id, won: true, scoreFor: 25, scoreAgainst: 10 });
  }
  for (const m of c.schedule.filter((x) => x.round === 'rr')) {
    c = recordResult(c, { matchId: m.id, won: false, scoreFor: 20, scoreAgainst: 25 });
  }
  const next = advanceSeason(c);
  // 行為斷言（修復前紅在這裡）：新屆入口不得被上屆旗標鎖死
  assert.deepEqual(seasonTransferState(next), { asked: false, used: false },
    '上屆轉位旗標帶進新屆＝第 2、3 屆請調入口全鎖死（回饋 #2 的現象）');
  assert.equal(interSeasonTalkAllowed(next), true, '屆間教練談話也被上屆 used 鎖死');
  // 範圍檢查：只清轉位旗標，劇情類事件跨屆有效
  assert.ok((next.events ?? []).includes('story-anchor'), '非轉位事件不得被誤刪');
});
