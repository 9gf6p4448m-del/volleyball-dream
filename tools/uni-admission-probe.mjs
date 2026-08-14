// 升學分發規則的快速迴圈（大學卷 批 3，2026-08-14）——一眼看完五級成績各自開出什麼。
// 用法：node tools/uni-admission-probe.mjs
// ★ 走真實路徑 ★ 用 devSeed 產合成存檔、再用 admission 讀回來，跟遊戲裡同一條鏈；
// 不自己抄一份規則（抄一份量到的是探針對不對，不是產品對不對）。
import { buildSyntheticSave } from '../src/career/devSeed.js';
import { FINISH, bestFinishOf, admissionTiersFor } from '../src/career/admission.js';
import { normalizeChapter } from '../src/career/chapter.js';

const LABEL = {
  [FINISH.CHAMPION]: '冠軍', [FINISH.RUNNER_UP]: '亞軍', [FINISH.SEMI]: '四強',
  [FINISH.QUARTER]: '八強', [FINISH.GROUP]: '小組出局',
};
const TIER_LABEL = { powerhouse: '強豪', mid: '中段', weak: '弱校' };

console.log('=== 高中三屆最佳成績 → 開得出哪些大學 ===');
console.log('（成績決定天花板，玩家在候選集合內自己挑——題 9 拍板）\n');
for (const finish of [FINISH.CHAMPION, FINISH.RUNNER_UP, FINISH.SEMI, FINISH.QUARTER, FINISH.GROUP]) {
  const save = buildSyntheticSave({ finish });
  const best = bestFinishOf(save.career, { titles: save.season.titles ?? 0 });
  const tiers = admissionTiersFor(best).map((t) => TIER_LABEL[t] ?? t);
  const ok = best === finish ? '' : `  ⚠ 讀回來變成 ${LABEL[best]}`;
  console.log(`  ${LABEL[finish].padEnd(5, '　')} → ${tiers.join('／')}${ok}`);
}
const one = buildSyntheticSave({ finish: FINISH.CHAMPION });
console.log(`\n合成存檔檢查：屆數=${one.season.index}　章節=${normalizeChapter(one.career).id}`);
console.log('瀏覽器治具：?devseed=champion&devslot=3  （兩個參數缺一不啟動、無預設槽）');
