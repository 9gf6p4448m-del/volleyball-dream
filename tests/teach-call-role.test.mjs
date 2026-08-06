// 2026-08-06 試玩回饋 — 戰術教學台詞依位置分歧
//
// 回饋原話（Sawmah 打 OPP 到第 2 屆）：「開了戰術，是不是整套都沒我的事？
// 換位置看到的文字還一樣。」查證：第三點屬實——`teach-call` 四句台詞不看 `currentRole`。
// 本批測試守的是**分歧存在且不說謊**，不是台詞的字面內容（文案會再潤，機制對照不會變）。
//
// ⚠ 這一層只解決「文字都一樣」；「OPP 沒有專屬戰術線」是機制題，屬集訓卷
//（training-camp-discussion-brief.md §二「加成內容：依位置不同」，尚未實作）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_DEFS, resolveEventsForRoster, resolveEventsForRole,
} from '../src/career/events.js';

const ROLES = ['setter', 'outside', 'middle', 'opposite', 'libero'];
const teachCall = () => EVENT_DEFS.filter((e) => e.id === 'teach-call');

test('五個位置各自拿到一句專屬追加台詞，且彼此不同', () => {
  const texts = ROLES.map((role) => {
    const [ev] = resolveEventsForRole(teachCall(), role);
    const base = teachCall()[0].lines.length;
    assert.equal(ev.lines.length, base + 1, `${role} 應該剛好多一句`);
    return ev.lines[ev.lines.length - 1].text;
  });
  assert.equal(new Set(texts).size, ROLES.length,
    '五個位置的台詞必須各不相同——這正是本次回饋要修的「換位置看到一樣的字」');
  for (const t of texts) assert.ok(t.length > 0);
});

test('★順序護欄★ 位置分歧必須疊在年級守衛之後（先追加會被 altLines 整段覆蓋）', () => {
  // ⚠ 判準要挑**只有追加句才有**的字串：「時間差」在原本第二句就出現過
  //（「交叉、時間差、B快」），拿它當判準兩個方向都會通過＝分不出有沒有掉句。
  //  第一版就是這樣寫的，被下面的反向斷言當場抓到。
  const ONLY_IN_EXTRA = /交叉走不到/;
  // A6（阿岩）不在名冊＝守衛會把 lines 換成 altLines（阿哲代述版）
  const members = [{ id: 'A1' }, { id: 'A2' }];
  const correct = resolveEventsForRole(resolveEventsForRoster(teachCall(), members), 'opposite');
  const last = correct[0].lines[correct[0].lines.length - 1];
  assert.match(last.text, ONLY_IN_EXTRA, '正確順序＝追加句活著（OPP 的那句）');
  assert.ok(correct[0].lines.every((l) => l.speaker !== '阿岩'),
    '轉授版不得出現不在隊的阿岩');

  // 反向：先追加再套守衛 ⇒ 追加句被 altLines 蓋掉（這就是為什麼順序不能反）
  const wrong = resolveEventsForRoster(resolveEventsForRole(teachCall(), 'opposite'), members);
  assert.ok(!wrong[0].lines.some((l) => ONLY_IN_EXTRA.test(l.text)),
    '順序反了就會掉句——本測試證明這個風險真實存在，不是想像的');
});

test('未指定位置／未知位置＝原樣通過（安全預設，比照名冊守衛）', () => {
  const base = teachCall()[0].lines.length;
  assert.equal(resolveEventsForRole(teachCall(), null)[0].lines.length, base);
  assert.equal(resolveEventsForRole(teachCall(), 'coach')[0].lines.length, base);
});

test('沒有 roleLines 的事件不受影響（只有戰術教學這一條分歧）', () => {
  const others = EVENT_DEFS.filter((e) => e.id !== 'teach-call' && e.lines);
  const resolved = resolveEventsForRole(others, 'opposite');
  for (let i = 0; i < others.length; i += 1) {
    assert.deepEqual(resolved[i].lines, others[i].lines, `${others[i].id} 不該被動到`);
  }
});

// ★ 誠實護欄：台詞宣稱的東西必須與 sim 的實際規則一致 ★
// 對照來源＝`src/sim/approach.js` 的 COMBO_MAIN_KINDS（cross 只認 left、delay 認 left+right）
// 與 COMBO_PARTNER_KIND（配合者恆為 quick＝MB）。這幾條一旦改了，台詞就成了謊話。
test('OH 的台詞講交叉、OPP 的台詞講時間差——與 COMBO_MAIN_KINDS 一致', () => {
  const lineOf = (role) => {
    const [ev] = resolveEventsForRole(teachCall(), role);
    return ev.lines[ev.lines.length - 1].text;
  };
  assert.match(lineOf('outside'), /交叉/, 'cross 主攻只認 left＝OH');
  assert.match(lineOf('opposite'), /時間差/, 'delay 認 right＝OPP 的那條');
  assert.match(lineOf('opposite'), /交叉走不到/, 'OPP 打不到交叉，要對他講實話');
  assert.match(lineOf('middle'), /幌子/, '配合者恆為 quick＝MB 只能當誘餌');
});
