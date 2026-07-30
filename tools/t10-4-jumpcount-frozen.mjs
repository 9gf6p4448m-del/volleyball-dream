// §十-4 統計定生死・第三輪 —— 用「離開地板」口徑（款3 原始驗收指標）跑凍結版
//
// 為什麼要這支包裝檔而不是直接改 tools/phase5-block-jumpcount-probe.mjs：
// 該探針本身不吃 TUNING patch（沒 import TUNING），且它是既有、被文件引用的探針，
// 直接改它會污染既有口徑的可重現性。改用 ESM 模組單例特性：先 import game.js 拿到
// TUNING、在本 process 內原地改 TUNING.SPIKE_CLEARANCE.quick，再動態 import 原探針——
// 原探針執行時看到的 TUNING 是同一個已被改過的物件（因為兩邊 import 的是同一個
// 已快取模組實例），效果等同「patch 過的原探針」，但原檔案本身逐行未動、不落盤。
//
// 跑法：node tools/t10-4-jumpcount-frozen.mjs [lo=2.655] [hi=lo] [局數=40]
import { TUNING } from '../src/sim/game.js';

const lo = Number(process.argv[2] ?? 2.655);
const hi = Number(process.argv[3] ?? lo);
const sets = process.argv[4] ?? '40';

TUNING.SPIKE_CLEARANCE.quick = [lo, hi];
console.log(`=== 凍結版 in-process patch：TUNING.SPIKE_CLEARANCE.quick = [${lo}, ${hi}] ===`);

// 原探針只讀 process.argv[2] 當局數，這裡覆寫成使用者要的局數再動態 import。
process.argv[2] = sets;
await import('./phase5-block-jumpcount-probe.mjs');
