// 大作感二卷 批3（2026-08-30，J3-1 修訂版）：賽前入場運鏡的鏡位腳本——純函式、
// 零 three.js 依賴（回傳純數值，rig 的 'cine' 模式消費），node --test 直測。
//
// 轉播式四段（段間直切＝轉播剪接，不補間）：
//   oppLine（掃對手列隊，低角度橫移）→ oppAce（對手王牌特寫，緩推）→
//   myStar（我方主角特寫，緩推）→ overview（拉高退到全場，收尾銜接正常鏡位）
// p ∈ [0,1] 全程進度（呼叫端用牆鐘換算；INTRO_SEC 是唯一時長來源）。
export const INTRO_SEC = 6.5; // 【試玩必調】入場運鏡全長（秒）

const PHASES = [
  { key: 'oppLine', until: 0.34 },
  { key: 'oppAce', until: 0.54 },
  { key: 'myStar', until: 0.74 },
  { key: 'overview', until: 1 },
];

export function introPhase(p) {
  const cp = Math.max(0, Math.min(1, p));
  return PHASES.find((ph) => cp < ph.until)?.key ?? 'overview';
}

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t); // smoothstep

// 段內局部進度 0..1
function localT(p, from, until) {
  return Math.max(0, Math.min(1, (p - from) / (until - from)));
}

// 特寫鏡位：從網子那一側看向 focus（緩推 dolly-in）。sideSign＝focus 所在半場的 z 正負號
function closeupShot(focus, sideSign, t) {
  const dolly = lerp(0.5, 0.38, ease(t)); // 緩推：鏡頭從網側往人靠
  return {
    pos: { x: focus.x * 0.7, y: 1.7, z: focus.z - sideSign * lerp(2.6, 2.0, ease(t)) * dolly * 2 },
    target: { x: focus.x, y: 1.5, z: focus.z },
  };
}

// layout：{ oppZ, myZ（兩隊場上 z 平均）, oppAce:{x,z}|null, myStar:{x,z} }
// oppAce 拿不到（王牌不在場上/名單對不上）＝特寫段落退回看對手列隊中心，腳本不斷炸
export function lineupIntroShot(p, layout) {
  const cp = Math.max(0, Math.min(1, p));
  const oppSign = Math.sign(layout.oppZ) || -1;
  const mySign = Math.sign(layout.myZ) || 1;
  const phase = introPhase(cp);
  if (phase === 'oppLine') {
    // 低角度橫移掃列隊：鏡頭沿 x 從左到右、貼在網與對手之間，視線望向隊列
    const t = ease(localT(cp, 0, 0.34));
    const camX = lerp(-4.2, 4.2, t);
    return {
      pos: { x: camX, y: 1.55, z: layout.oppZ * 0.35 },
      target: { x: camX * 0.8, y: 1.45, z: layout.oppZ },
    };
  }
  if (phase === 'oppAce') {
    const focus = layout.oppAce ?? { x: 0, z: layout.oppZ };
    return closeupShot(focus, oppSign, localT(cp, 0.34, 0.54));
  }
  if (phase === 'myStar') {
    return closeupShot(layout.myStar, mySign, localT(cp, 0.54, 0.74));
  }
  // overview：拉高退場到我方後上方的全場視角（貼近常態第三人稱，收尾轉場不跳）
  const t = ease(localT(cp, 0.74, 1));
  return {
    pos: { x: 0, y: lerp(4.5, 7, t), z: mySign * lerp(8, 11, t) },
    target: { x: 0, y: 1.1, z: 0 },
  };
}
