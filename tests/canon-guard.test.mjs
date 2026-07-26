// Phase 4 W2 — canon 事件年級守衛（拍板①保底轉授）＋隊長交接（拍板：阿哲接任）
import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_DEFS, resolveEventsForRoster, graduationCeremonyLines } from '../src/career/events.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { splitGraduates, applySeasonTurnover } from '../src/career/graduation.js';

const GUARDED_IDS = ['teach-jump', 'rematch-won', 'rematch-lost'];
const guarded = () => EVENT_DEFS.filter((e) => GUARDED_IDS.includes(e.id));

test('守衛資料形狀：三事件皆帶 elderId=A3＋altLines，且轉授版不得由大山開口', () => {
  const defs = guarded();
  assert.equal(defs.length, 3);
  for (const def of defs) {
    assert.equal(def.elderId, 'A3');
    assert.ok(Array.isArray(def.altLines) && def.altLines.length >= 2);
    assert.ok(def.altLines.every((l) => l.speaker !== '大山'), `${def.id} 轉授版亡靈不得開口`);
    assert.ok(def.lines.some((l) => l.speaker === '大山'), `${def.id} 原版應由大山開口`);
  }
});

test('大山在隊＝原版；已畢業＝轉授版——effect（跳發解鎖）兩路皆不變', () => {
  const withElder = buildStarterMembers(); // 含 A3
  const { remaining } = splitGraduates(withElder); // A3/A4 畢業後
  const original = resolveEventsForRoster(guarded(), withElder);
  const succeeded = resolveEventsForRoster(guarded(), remaining);
  for (let i = 0; i < 3; i += 1) {
    assert.deepEqual(original[i].lines, guarded()[i].lines, '在隊＝原版台詞');
    assert.deepEqual(succeeded[i].lines, guarded()[i].altLines, '已畢業＝轉授版台詞');
    assert.equal(succeeded[i].id, guarded()[i].id, '去重 id 不變');
    assert.deepEqual(succeeded[i].effect, guarded()[i].effect, '技術照樣學到（effect 不變）');
  }
  // 跳發兩路皆可習得：teach-jump effect.unlock 恆為 jumpServe
  const tj = succeeded.find((e) => e.id === 'teach-jump');
  assert.equal(tj.effect.unlock, 'jumpServe');
  // 無名冊（舊路徑）＝安全預設播原版、不 throw
  assert.deepEqual(resolveEventsForRoster(guarded(), null)[0].lines, guarded()[0].lines);
});

test('隊長交接：換血後 captain 旗標落阿哲（A1），且不重複授旗', () => {
  const roster = { capacity: 12, members: buildStarterMembers(), alumni: [] };
  const { roster: next } = applySeasonTurnover({ roster, seasonIndex: 1, seed: 777 });
  const captains = next.members.filter((m) => m.captain);
  assert.equal(captains.length, 1);
  assert.equal(captains[0].id, 'A1', '大山畢業後隊長＝阿哲');
  // 第 2→3 屆再換血：阿哲已帶旗＝不重複授旗、旗標跟人
  const { roster: third } = applySeasonTurnover({ roster: next, seasonIndex: 2, seed: 778 });
  const again = third.members.filter((m) => m.captain);
  assert.equal(again.length, 1);
  assert.equal(again[0].id, 'A1');
});

test('交接台詞：大山畢業的儀式鏈內完成授旗（大山交、阿哲接）', () => {
  const { graduates } = splitGraduates(buildStarterMembers());
  const lines = graduationCeremonyLines({ graduates, aceGrads: [] });
  const handover = lines.findIndex((l) => l.speaker === '大山' && l.text.includes('隊長'));
  assert.ok(handover >= 0, '儀式鏈須含大山交接台詞');
  assert.ok(lines.some((l, i) => i > handover && l.speaker === '阿哲'), '阿哲須回應交接');
});
