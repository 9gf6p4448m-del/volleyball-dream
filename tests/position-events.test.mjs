// Phase 4 W3 — 轉位事件（positionEvents）＋阿哲導師介面契約（mentor）
// 工單 §6/§10：gated on open、縫隙 3 志願優先、縫隙 1 名冊解版本（按屆分版）、
// OH 留守無事件、導師規則決定論。
import test from 'node:test';
import assert from 'node:assert/strict';
import { positionTalkFor, TALK_CANDIDATES } from '../src/career/positionEvents.js';
import { dueMentorLines, MENTOR_RULES } from '../src/career/mentor.js';

const P = (over = {}) => ({ currentRole: 'outside', aspiration: 'outside', ...over });
const FLAGS = (over = {}) => ({ setter: 'locked', middle: 'locked', opposite: 'locked', libero: 'locked', ...over });
// 第 2 屆典型名冊片段（阿岩 A6 仍在＋小雷 N1 已入學）
const S2 = [
  { id: 'A1', name: '阿哲', role: 'setter' },
  { id: 'A6', name: '阿岩', role: 'middle' },
  { id: 'N1', name: '小雷', role: 'middle' },
  { id: 'G1', name: '小廷', role: 'opposite' },
];

test('gating：locked/ready 無談話、open 才觸發、現任位置跳過、OH 留守無事件', () => {
  assert.equal(positionTalkFor({ flags: FLAGS(), player: P(), members: S2 }), null);
  assert.equal(positionTalkFor({ flags: FLAGS({ setter: 'ready' }), player: P(), members: S2 }), null);
  const talk = positionTalkFor({ flags: FLAGS({ setter: 'open' }), player: P(), members: S2 });
  assert.equal(talk.role, 'setter');
  // 已是 S＝不再對 S 談話
  assert.equal(
    positionTalkFor({ flags: FLAGS({ setter: 'open' }), player: P({ currentRole: 'setter' }), members: S2 }),
    null,
  );
  // libero 候選已落地（工單 §8 AL 槽鏈）：open＝小守讓位談話
  assert.ok(TALK_CANDIDATES.includes('libero'));
  const lTalk = positionTalkFor({ flags: FLAGS({ libero: 'open' }), player: P(), members: S2 });
  assert.equal(lTalk.role, 'libero');
  assert.ok(lTalk.acceptLines.every((l) => l.speaker === '小守'));
  // 第 3 屆 L 手寫新生在隊＝三人關係版（多一句、不具名——人設未定案）
  const withFresh = positionTalkFor({
    flags: FLAGS({ libero: 'open' }),
    player: P(),
    members: [...S2, { id: 'N2', name: '新生', role: 'libero', origin: 'handwritten' }],
  });
  assert.equal(withFresh.acceptLines.length, lTalk.acceptLines.length + 1);
});

test('縫隙 3 志願優先：多位置 open 時志願位置先談；志願命中＝回收培育話術', () => {
  const flags = FLAGS({ setter: 'open', middle: 'open' });
  const talk = positionTalkFor({ flags, player: P({ aspiration: 'middle' }), members: S2 });
  assert.equal(talk.role, 'middle');
  assert.match(talk.offerLines[0].text, /入學/); // 志願命中版開場回收入學面談
  // 無志願命中＝候選序（setter 先）
  const t2 = positionTalkFor({ flags, player: P(), members: S2 });
  assert.equal(t2.role, 'setter');
  assert.ok(!/入學面談/.test(t2.offerLines[0].text));
});

test('縫隙 1 名冊解版本：MB 兩代同場版／小雷獨挑版／generic 版；OPP 插入被取代者名', () => {
  const flags = FLAGS({ middle: 'open' });
  // 第 2 屆：阿岩＋小雷都開口
  const both = positionTalkFor({ flags, player: P(), members: S2 });
  assert.ok(both.acceptLines.some((l) => l.speaker === '阿岩'));
  assert.ok(both.acceptLines.some((l) => l.speaker === '小雷'));
  // 第 3 屆：阿岩畢業＝小雷獨挑
  const s3 = S2.filter((m) => m.id !== 'A6');
  const solo = positionTalkFor({ flags, player: P(), members: s3 });
  assert.ok(solo.acceptLines.every((l) => l.speaker !== '阿岩'));
  assert.ok(solo.acceptLines.some((l) => l.speaker === '小雷'));
  // 兩者皆缺：generic（名冊 MB 開口）
  const gen = positionTalkFor({
    flags, player: P(), members: [{ id: 'G9', name: '小群', role: 'middle' }],
  });
  assert.equal(gen.acceptLines[0].speaker, '小群');
  // OPP：被取代者名插入
  const opp = positionTalkFor({ flags: FLAGS({ opposite: 'open' }), player: P(), members: S2 });
  assert.equal(opp.role, 'opposite');
  assert.ok(opp.acceptLines.every((l) => l.speaker === '小廷'));
});

test('談話決定論：同輸入兩次逐值相同；婉拒台詞存在', () => {
  const args = { flags: FLAGS({ setter: 'open' }), player: P(), members: S2 };
  assert.deepEqual(positionTalkFor(args), positionTalkFor(args));
  assert.ok(positionTalkFor(args).declineLines.length >= 1);
});

test('導師契約：四規則各自命中、鼓勵優先於檢討、無命中 null、決定論', () => {
  const base = { sets: {}, names: {}, keyPoint: { sets: 0, kills: 0 }, consecErrors: 0, result: { won: true } };
  assert.equal(MENTOR_RULES.length, 4); // 拍板 3-5 條核心
  // slump-cheer
  assert.equal(dueMentorLines({ ...base, consecErrors: 3 }).id, 'slump-cheer');
  // concentration（含名字插值）
  const conc = dueMentorLines({
    ...base,
    sets: { A5: 6, N1: 2, G1: 2 },
    names: { A5: '小飛' },
  });
  assert.equal(conc.id, 'concentration');
  assert.ok(conc.lines.some((l) => l.text.includes('小飛')));
  // key-nerve
  assert.equal(dueMentorLines({ ...base, keyPoint: { sets: 4, kills: 3 } }).id, 'key-nerve');
  // spread-praise
  assert.equal(dueMentorLines({ ...base, sets: { A5: 3, N1: 3, G1: 3 } }).id, 'spread-praise');
  // 鼓勵優先：連續失誤＋集中度同時成立＝先鼓勵
  assert.equal(dueMentorLines({ ...base, consecErrors: 4, sets: { A5: 9, N1: 1 } }).id, 'slump-cheer');
  // 無命中
  assert.equal(dueMentorLines({ ...base, sets: { A5: 3, N1: 2 } }), null);
  assert.equal(dueMentorLines(null), null);
});
