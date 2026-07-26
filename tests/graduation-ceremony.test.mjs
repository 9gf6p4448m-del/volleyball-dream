// Phase 4 W3 — 畢業儀式分段（graduationCeremonySegments）＋阿岩專屬離別（甲3③）
// 演出版與對話卡版同一事實源（flat＝segments 攤平）；儀式演出鏈冪等（工單 §10）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { graduationCeremonySegments, graduationCeremonyLines } from '../src/career/events.js';

const IWAN = { id: 'A6', name: '阿岩', role: 'middle', height: 1.94, growth: { grade: 3 } };
const RAI = { id: 'N1', name: '小雷', role: 'middle', growth: { grade: 1 } };

test('分段結構：opening/perGraduate/aceLines/closing；flat＝分段攤平（同一事實源）', () => {
  const args = {
    graduates: [IWAN],
    aceGrads: [{ opponentId: 'obsidian', teamName: '曜石體中', name: '詹子曜', title: '黑曜箭' }],
    members: [RAI],
  };
  const s = graduationCeremonySegments(args);
  assert.equal(s.perGraduate.length, 1);
  assert.equal(s.perGraduate[0].member.id, 'A6');
  assert.deepEqual(
    graduationCeremonyLines(args),
    [...s.opening, ...s.perGraduate.flatMap((g) => g.lines), ...s.aceLines, ...s.closing],
  );
});

test('甲3③ 阿岩專屬：具名離別非通用款；小雷在隊＝專屬對話、不在＝獨白留白', () => {
  const withRai = graduationCeremonySegments({ graduates: [IWAN], members: [RAI] });
  const lines = withRai.perGraduate[0].lines;
  assert.ok(lines.some((l) => l.speaker === '阿岩' && l.text.includes('牆')));
  assert.ok(!lines.some((l) => l.text.includes('謝謝大家')), '阿岩不得落通用款');
  assert.ok(lines.some((l) => l.speaker === '小雷'), '小雷在隊＝專屬對話');
  const without = graduationCeremonySegments({ graduates: [IWAN], members: [] });
  assert.ok(without.perGraduate[0].lines.every((l) => l.speaker !== '小雷'));
});

test('儀式冪等＋隊長交接歸段：同輸入兩次逐值相同；交接台詞在大山（A3）段內', () => {
  const A3 = { id: 'A3', name: '大山', role: 'middle', growth: { grade: 3 } };
  const args = { graduates: [A3, { id: 'A4', name: '阿烈', role: 'opposite' }], members: [] };
  assert.deepEqual(graduationCeremonySegments(args), graduationCeremonySegments(args));
  const s = graduationCeremonySegments(args);
  const a3seg = s.perGraduate.find((g) => g.member.id === 'A3');
  assert.ok(a3seg.lines.some((l) => l.text.includes('隊長臂章')));
  const a4seg = s.perGraduate.find((g) => g.member.id === 'A4');
  assert.ok(a4seg.lines.every((l) => !l.text.includes('隊長臂章')));
});
