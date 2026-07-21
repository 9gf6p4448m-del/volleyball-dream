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
