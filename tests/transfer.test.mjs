// W4(P4) 題1 — 賽季中請調：gate 三條件（open／打滿 3 場／每屆一次）＋
// 當屆二選一互斥＋決定論＋台詞分版
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transferCandidates, transferAskLines, transferTalkFor, seasonTransferState,
  interSeasonTalkAllowed, TRANSFER_ASKED_EV, TRANSFER_USED_EV, TRANSFER_MIN_MATCHES,
} from '../src/career/positionEvents.js';

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
