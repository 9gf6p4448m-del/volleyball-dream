// Phase 4 W3 — 位置開放旗標（憲法 Q7 折衷案＋W3 甲4 拍板：三態 locked→ready→open）
// 純函式，零 DOM/IO。旗標落 save.career.positionFlags——schema v2 的 career 頂層鍵
// 首次填內容；缺鍵容錯沿 W1 alumni 慣例（舊檔無鍵＝全 locked，讀取端補預設）。
//
// 三態語意（甲4）：
//   locked = 工程未完；ready = 工程全綠＋治具達標（W3 結案定義＝四位置全 ready）；
//   open   = Sawmah 試玩手批通過，轉位事件（教練談話）就此解鎖。
// 鐵律：ready→open 唯一路徑＝手批入口（main.js ?openPosition= → store.approveOpenPosition）。
// markPositionReady 結構上寫不出 open、approvePositionOpen 只認 ready 起點——
// 任何自動化流程誤寫 open 一律 throw（tests/position-flags.test.mjs 背書）。

export const FLAG_POSITIONS = ['setter', 'middle', 'opposite', 'libero']; // OH=現役不入旗標
export const FLAG_STATES = ['locked', 'ready', 'open'];

// 甲4 locked→ready＝「該位置工程全綠＋治具達標時由實作端設定」——這是 build 級事實，
// 不是存檔級事實：本清單＝當前版本已達 ready 門檻的位置（W3 結案：四位置全上），
// main.js 開機以 markPositionReady 冪等回填（不動 open、不降級——守衛見下）
export const ENGINEERED_READY = ['setter', 'middle', 'opposite', 'libero'];

export function defaultPositionFlags() {
  return Object.fromEntries(FLAG_POSITIONS.map((p) => [p, 'locked']));
}

// 讀取端唯一入口：整包存檔 → 四鍵齊全的旗標物件（缺檔/缺鍵/非法值一律回 locked；
// 未知鍵丟棄——讀取容錯歸容錯，寫入驗證在 schema.deserializeSave 嚴格擋）
export function positionFlagsOf(save) {
  const raw = save?.career?.positionFlags ?? {};
  const flags = defaultPositionFlags();
  for (const p of FLAG_POSITIONS) {
    if (FLAG_STATES.includes(raw[p])) flags[p] = raw[p];
  }
  return flags;
}

function assertPosition(pos) {
  if (!FLAG_POSITIONS.includes(pos)) {
    throw new Error(`positionFlags：未知位置 ${pos}（合法值：${FLAG_POSITIONS.join('/')}）`);
  }
}

// 工程結案路徑：locked→ready。已 ready/open＝no-op 冪等（不降級、不越級）。
// 回傳新物件（不動原 flags）。
export function markPositionReady(flags, pos) {
  assertPosition(pos);
  const cur = flags[pos] ?? 'locked';
  if (cur === 'ready' || cur === 'open') return { ...flags };
  return { ...flags, [pos]: 'ready' };
}

// 手批唯一路徑：ready→open。locked 直開＝throw（工程未 ready 不存在可批的東西）；
// 已 open＝no-op 冪等。呼叫端限 careerStore.approveOpenPosition（?openPosition= 入口）。
export function approvePositionOpen(flags, pos) {
  assertPosition(pos);
  const cur = flags[pos] ?? 'locked';
  if (cur === 'open') return { ...flags };
  if (cur !== 'ready') {
    throw new Error(`positionFlags：${pos} 尚未 ready（現值 ${cur}），不可手批 open`);
  }
  return { ...flags, [pos]: 'open' };
}

export function isPositionOpen(flags, pos) {
  assertPosition(pos);
  return (flags?.[pos] ?? 'locked') === 'open';
}
