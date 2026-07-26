// Phase 4 W2 — 身高建議邏輯＋教練話術（heightAdvice.js：A2 映射／A4 三段式／A3 跨帶）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adviceFor, coachAdviceLines, aspirationReplyLines, bandShiftLines, roleLabel,
} from '../src/career/heightAdvice.js';

const ROLES = ['outside', 'setter', 'middle', 'opposite', 'libero'];

test('A2 映射表：五帶建議正確、邊界落帶正確', () => {
  assert.deepEqual(adviceFor(150).primary, ['libero']);
  assert.equal(adviceFor(150).secondary, 'setter');
  assert.deepEqual(adviceFor(165).primary, ['libero', 'setter']); // 165 落 165–175 帶
  assert.equal(adviceFor(165).secondary, 'outside');
  assert.deepEqual(adviceFor(175).primary, ['setter', 'outside']); // 175 落 175–183 帶
  assert.equal(adviceFor(175).secondary, 'opposite');
  assert.deepEqual(adviceFor(183).primary, ['outside', 'opposite']); // 183 落 183–192 帶
  assert.equal(adviceFor(183).secondary, 'middle');
  assert.deepEqual(adviceFor(192).primary, ['middle']); // 192 落 ≥192 帶
  assert.equal(adviceFor(192).secondary, 'opposite');
});

test('重疊帶＝並列雙建議；兩端單建議', () => {
  for (const cm of [165, 170, 175, 180, 183, 191]) {
    assert.equal(adviceFor(cm).primary.length, 2, `${cm}cm 應為並列雙建議`);
  }
  for (const cm of [140, 160, 164, 192, 220]) {
    assert.equal(adviceFor(cm).primary.length, 1, `${cm}cm 應為單建議`);
  }
});

test('A4 三段式話術：全帶皆有誠實判定＋成長預留句＋培育邏輯＋志願確認，極端輸入不 crash', () => {
  for (const cm of [140, 150, 165, 170, 175, 183, 190, 192, 205, 220]) {
    const lines = coachAdviceLines(cm);
    assert.ok(lines.length >= 5, `${cm}cm 話術過短`);
    assert.ok(lines.every((l) => l.speaker === '教練' && l.text.length > 0));
    assert.ok(lines[0].text.includes(String(cm)), '誠實判定須含實際身高');
    assert.ok(lines.some((l) => l.text.includes('還會長')), '成長預留句（A3 配套）');
    assert.ok(lines.some((l) => l.text.includes('主攻')), '培育邏輯（縫隙 3：一律 OH 出道）');
  }
  // 並列帶明說「兩條路都看好你」
  for (const cm of [170, 178, 187]) {
    assert.ok(coachAdviceLines(cm).some((l) => l.text.includes('兩條路')), `${cm}cm 應明說並列`);
  }
});

test('志願回覆：primary／secondary／違背三分支×五位置全覆蓋——違背必帶「用球說服我」', () => {
  for (const cm of [150, 170, 178, 187, 200]) {
    const adv = adviceFor(cm);
    for (const role of ROLES) {
      const lines = aspirationReplyLines(cm, role);
      assert.ok(lines.length >= 2 && lines.every((l) => l.text.length > 0));
      assert.ok(lines.some((l) => l.text.includes(roleLabel(role).slice(0, 3))
        || l.text.includes('志願登記')), '結尾須確認志願');
      const violated = !adv.primary.includes(role) && adv.secondary !== role;
      if (violated) {
        assert.ok(lines.some((l) => l.text.includes('用球說服我')),
          `${cm}cm 志願 ${role} 違背建議應帶存疑句`);
      }
    }
  }
});

test('A3 跨帶檢查：跨帶＝教練動態評語、未跨帶＝null', () => {
  assert.equal(bandShiftLines(170, 174), null); // 同帶
  const up = bandShiftLines(190, 193); // 183–192 → ≥192
  assert.ok(Array.isArray(up) && up[0].speaker === '教練');
  assert.ok(up[0].text.includes('中間手'), '跨進 ≥192 帶應重新看好 MB');
  assert.ok(bandShiftLines(163, 166) !== null); // ≤165 → 165–175
  assert.ok(bandShiftLines(181, 184) !== null); // 175–183 → 183–192
});
