// 多人連線卷 批3 —— 訊息編解碼與版本（純資料，零 DOM／WebRTC——那些只准在 transport.js）
//
// 線上訊息一律 JSON 物件、帶 y（type）欄位：
//   { y:'hello', v:NET_VERSION, seed, delay, roles:{A,B}, names?:{A,B} } 主機→客機的開局合約
//   { y:'ready' }                                客機收到 hello、版本相容後回覆
//   { y:'input', t, f }                          鎖步影格（lockstep.sample 的原樣輸出）
//   { y:'bye', reason }                          主動離場
// 版本不符＝明確拒絕（A5-2 的同款原則提前到批3：不得靜默降級）。
export const NET_VERSION = 1;

export function encodeMsg(obj) {
  return JSON.stringify(obj);
}

// 解不開或形狀不對回 null——呼叫端決定要不要斷線，不在這裡丟例外
// （對方送垃圾不該讓本機炸掉）
export function decodeMsg(text) {
  try {
    const o = JSON.parse(text);
    return (o && typeof o === 'object' && typeof o.y === 'string') ? o : null;
  } catch {
    return null;
  }
}

export function helloMsg({ seed, delay, roles, names }) {
  return { y: 'hello', v: NET_VERSION, seed, delay, roles, names: names ?? null };
}

// hello 相容性檢查：回 null＝相容；回字串＝人話拒絕理由
export function helloProblem(msg) {
  if (msg?.y !== 'hello') return '開局訊息形狀不對';
  if (msg.v !== NET_VERSION) {
    return `版本不符：對方 v${msg.v}、本機 v${NET_VERSION}——兩邊都用最新版再試`;
  }
  if (!Number.isInteger(msg.seed)) return '開局訊息缺 seed';
  if (!Number.isInteger(msg.delay) || msg.delay < 0 || msg.delay > 30) return '開局訊息 delay 不合法';
  return null;
}
