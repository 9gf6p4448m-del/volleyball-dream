// 位置體檢 2026-08-06 裁定 C — OH 招牌演出的位置檢查
//
// 病根：`signatureBeats.js` 檔頭寫「**OH** 被騙的人」，但判定內聯在 matchLoop 的事件
// 迴圈裡且**沒有 role 檢查** ⇒ 任何位置假動作騙過攔網都會起鏡。與 `mbCallFeedbackOf`
// 那次「恆假整天沒人發現」同一個病根：判定住在 UI 迴圈，沒有測試守得住。
// 抽成純函式後由本檔釘死。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ohSignatureArms } from '../src/ui/signatureBeats.js';

const DECEIVED = { type: 'BLOCK_DECEIVED', spikerId: 'ME', blockerId: 'B2' };

test('OH 假動作騙過攔網 → 武裝', () => {
  assert.equal(ohSignatureArms(DECEIVED, 'ME', 'outside'), true);
});

test('★本次修的就是這條★ 其他位置騙過攔網 → 不武裝（原本四個位置全都會起鏡）', () => {
  for (const role of ['opposite', 'middle', 'setter', 'libero']) {
    assert.equal(ohSignatureArms(DECEIVED, 'ME', role), false,
      `${role} 也觸發了 OH 專屬演出＝位置檢查失效`);
  }
});

test('騙到的不是受控玩家 → 不武裝（別人被騙不是你的招牌）', () => {
  assert.equal(ohSignatureArms({ ...DECEIVED, spikerId: 'A9' }, 'ME', 'outside'), false);
});

test('別的事件型別 → 不武裝', () => {
  assert.equal(ohSignatureArms({ type: 'BLOCK_TOUCH', spikerId: 'ME' }, 'ME', 'outside'), false);
  assert.equal(ohSignatureArms(null, 'ME', 'outside'), false);
});

test('role 未知（舊存檔／快速比賽）→ 不武裝，不得當成 OH', () => {
  assert.equal(ohSignatureArms(DECEIVED, 'ME', null), false);
  assert.equal(ohSignatureArms(DECEIVED, 'ME', undefined), false);
});
