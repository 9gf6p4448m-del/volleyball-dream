// 可種子 PRNG（mulberry32）— sim 內唯一合法的隨機來源（架構鐵律：決定論）
// 狀態存在呼叫端（game state）裡，同種子＋同呼叫序 → 同數列

export function seedRng(seed) {
  return seed >>> 0;
}

// 回傳 [0,1) 亂數與新狀態；不修改輸入
export function nextRand(rngState) {
  let t = (rngState + 0x6d2b79f5) >>> 0;
  let x = t;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return [value, t];
}

// 便利版：直接在 holder（含 rngState 欄位的物件）上推進
export function rand(holder) {
  const [v, s] = nextRand(holder.rngState);
  holder.rngState = s;
  return v;
}

// [-1,1) 對稱亂數
export function randSigned(holder) {
  return rand(holder) * 2 - 1;
}

// 無狀態決定論雜湊（整數 → [0,1)）：給「同一顆球只該骰一次、且不得推進 game rng」
// 的決定論抽選用（攻擊點抽選、吊球分支、§4 節奏分配…）。原本是 ai.js 的私有函式，
// §4 之後 approach.js 也要用同一份——兩邊各抄一份就會漂移，故上移到此。**本體逐字未動**
export function hash01(n) {
  let x = Math.imul(n | 0, 2654435761);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
