// 跳躍前飄（純表現層，docs/kickoffs/jump-drift-acceptance.md）：sim 的攻擊手「到位即停、
// 原地拔起」（src/sim/ai.js 起跳點分支；起跳點刻意退在擊球點後方 approach.js TAKEOFF），
// 畫面上就是垂直起跳。本模組只算「畫面上的 root 該比 sim 位置多偏多少」，不寫回 sim。
//
// 三段：
//   air   ：離地那一幀記下起點，之後 root 在空中「自己飛」——不再跟 sim 位置
//           （人在空中改不了水平軌跡；sim 在滯空期間還在跑或已停都不影響畫面），
//           以不超過 MAX_SPEED 的速度朝擊球點前進，預計在擊球時刻到達。
//   hold  ：落地後先停在前方 HOLD_SEC（落地緩衝的前段）。
//   merge ：MERGE_SEC 內平滑併回 sim 位置（偏移對 sim 相對縮小，sim 照跑不受影響）。
// 範圍（使用者 09-28 裁定）：扣球／後排攻擊／跳發前飄；跳舉 ≤SET_MAX；攔網與其他跳躍恆 0。
//
// 純函式、無 three.js 依賴，node 可單測（tests/jump-drift.test.mjs）。

export const JUMP_DRIFT = Object.freeze({
  // 空中水平速度上限（m/s）：驗收 J3「60fps 單幀步長 ≤0.05 m」＝3.0 m/s，留 0.1 餘裕
  MAX_SPEED: 2.9,
  // 速度平滑（1/s）：目標估計逐幀微調時，速度不跟著抖
  VEL_K: 18,
  // 不過網：root 離網面（z=0）至少這麼遠（驗收 J5 ≥0.15 m，留 0.05 餘裕）
  NET_MIN: 0.2,
  // 跳舉只准微量（驗收 J6 ≤0.15 m）
  SET_MAX: 0.12,
  // 跳發：sim 的發球擊球點就在腳下（game.js performServe ball=actor），沒有「擊球點」可飄；
  // 畫面的拋球在身前、擊球關鍵幀在 serveJump 0.4×0.85s——取一個前飄名目距離【試玩必調】
  SERVE_DIST: 0.8,
  SERVE_HIT_SEC: 0.34,
  // 還不知道擊球點時（快攻在二傳觸球前就起跳）的名目前飄距離＝sim 起跳點退的距離
  // （src/sim/approach.js TAKEOFF.FRONT／BACK 由呼叫端傳入，不在此重寫一份）
  // 落地：先停 HOLD_SEC，再 MERGE_SEC 併回（驗收 J7：落地後 ≤0.5 s 併回）
  HOLD_SEC: 0.08,
  MERGE_SEC: 0.38,
  // sim 位置單幀跳動超過此值＝得分後重新佈陣的瞬移：前飄立即作廢
  TELEPORT: 0.5,
});

// 會前飄的跳躍種類（由起跳那一幀的動作序列決定）
export function driftKindOf(seqType) {
  if (seqType === 'windup' || seqType === 'windupHesitant' || seqType === 'spike' || seqType === 'tip') return 'attack';
  if (seqType === 'serveJump') return 'serve';
  if (seqType === 'overheadJump') return 'set';
  return null; // block／blockJump／cheer／highfive／站發小跳…：恆 0
}

export function createJumpDrift() {
  return {
    phase: 'ground', kind: null, px: 0, pz: 0, vx: 0, vz: 0,
    ax: 0, az: 0, target: null, hitLocked: false, t: 0, d0x: 0, d0z: 0,
    lastSimX: null, lastSimZ: null, x: 0, z: 0,
  };
}

function moveToward(x, z, tx, tz, maxStep) {
  const dx = tx - x; const dz = tz - z;
  const d = Math.hypot(dx, dz);
  if (d <= maxStep || d < 1e-9) return [tx, tz];
  return [x + (dx / d) * maxStep, z + (dz / d) * maxStep];
}

// 每幀呼叫一次。inp：
//   airborne   動畫是否在跳躍弧上（animator 的 jumpY>0）
//   seqType    目前動作序列（起跳那一幀用來判種類）
//   simX/simZ  本幀 sim 插值位置
//   side       TEAM_SIDE（+1＝z>0 半場）；前進＝−side·z
//   dt         本幀時間（秒，已含慢動作倍率）
//   nominal    名目前飄距離（m；攻擊類在還沒有擊球點估計時用）
//   aim        擊球點估計 {x,z,tLeft}｜null（tLeft＝距擊球秒數）
//   hit        本幀觸球的球位置 {x,z}｜null（有＝擊球點定案）
//   apexLeft   距跳躍弧頂的秒數（沒有 aim 時當作預計擊球時刻）
//   reset      強制歸零（魚躍、圍圈、非 rally…）
// 回傳 { x, z }＝加在 sim 位置上的水平偏移（m）
export function stepJumpDrift(st, inp) {
  const C = JUMP_DRIFT;
  const { simX, simZ, dt } = inp;
  const teleported = st.lastSimX != null
    && Math.hypot(simX - st.lastSimX, simZ - st.lastSimZ) > C.TELEPORT;
  st.lastSimX = simX; st.lastSimZ = simZ;
  if (inp.reset || teleported) {
    st.phase = 'ground'; st.kind = null; st.x = 0; st.z = 0;
    return st;
  }
  const fwdZ = -inp.side;
  // 起跳沿：從地面（或正在併回）重新離地
  if (inp.airborne && st.phase !== 'air' && st.phase !== 'still') {
    const kind = driftKindOf(inp.seqType);
    if (!kind) { st.phase = 'still'; st.x = 0; st.z = 0; st.kind = null; }
    else {
      st.phase = 'air'; st.kind = kind;
      // 起點＝畫面上的人現在在哪（併回途中再起跳也連續）
      st.px = simX + st.x; st.pz = simZ + st.z;
      st.ax = st.px; st.az = st.pz;
      st.vx = 0; st.vz = 0; st.hitLocked = false; st.t = 0;
    }
  }
  if (st.phase === 'still') {
    if (!inp.airborne) st.phase = 'ground';
    st.x = 0; st.z = 0;
    return st;
  }
  if (st.phase === 'air') {
    if (!inp.airborne) {
      st.phase = 'hold'; st.t = 0;
    } else {
      st.t += dt;
      // 目標：觸球定案 > 擊球點估計 > 名目
      let tx; let tz; let tLeft;
      if (inp.hit && !st.hitLocked && st.kind !== 'serve') {
        st.hitLocked = true;
        st.target = { x: inp.hit.x, z: inp.hit.z };
      }
      if (st.kind === 'serve') {
        tx = st.ax; tz = st.az + fwdZ * C.SERVE_DIST;
        tLeft = C.SERVE_HIT_SEC - st.t;
      } else if (st.hitLocked) {
        tx = st.target.x; tz = st.target.z; tLeft = 0;
      } else if (inp.aim) {
        tx = inp.aim.x; tz = inp.aim.z; tLeft = inp.aim.tLeft;
      } else {
        tx = st.ax; tz = st.az + fwdZ * (st.kind === 'set' ? 0 : inp.nominal);
        tLeft = inp.apexLeft;
      }
      // 只准往前（朝網）飄，不往後退；跳舉另限總量
      if ((tz - st.az) * fwdZ < 0) tz = st.az;
      if (st.kind === 'set') {
        const dx = tx - st.ax; const dz = tz - st.az; const d = Math.hypot(dx, dz);
        if (d > C.SET_MAX) { tx = st.ax + (dx / d) * C.SET_MAX; tz = st.az + (dz / d) * C.SET_MAX; }
      }
      // 不過網：目標離網面至少 NET_MIN（在己方側）
      if (tz * inp.side < C.NET_MIN) tz = inp.side * C.NET_MIN;
      const dx = tx - st.px; const dz = tz - st.pz; const d = Math.hypot(dx, dz);
      // 需要的速度＝剩餘距離／剩餘時間（已過擊球時刻＝盡快到，仍受上限）
      const need = d / Math.max(tLeft ?? 0, 0.1);
      const sp = Math.min(need, C.MAX_SPEED);
      const wantVx = d > 1e-9 ? (dx / d) * sp : 0;
      const wantVz = d > 1e-9 ? (dz / d) * sp : 0;
      const k = 1 - Math.exp(-C.VEL_K * dt);
      st.vx += (wantVx - st.vx) * k;
      st.vz += (wantVz - st.vz) * k;
      // 不倒退（沿前進方向）、不超速
      if (st.vz * fwdZ < 0) st.vz = 0;
      const v = Math.hypot(st.vx, st.vz);
      if (v > C.MAX_SPEED) { st.vx *= C.MAX_SPEED / v; st.vz *= C.MAX_SPEED / v; }
      let step = Math.hypot(st.vx, st.vz) * dt;
      step = Math.min(step, d);
      [st.px, st.pz] = moveToward(st.px, st.pz, tx, tz, step);
      if (st.pz * inp.side < C.NET_MIN) st.pz = inp.side * C.NET_MIN;
      st.x = st.px - simX; st.z = st.pz - simZ;
      return st;
    }
  }
  if (st.phase === 'hold') {
    st.t += dt;
    st.x = st.px - simX; st.z = st.pz - simZ;
    if (st.t >= C.HOLD_SEC) { st.phase = 'merge'; st.t = 0; st.d0x = st.x; st.d0z = st.z; }
    return st;
  }
  if (st.phase === 'merge') {
    st.t += dt;
    const e = Math.min(st.t / C.MERGE_SEC, 1);
    // 近似等速（兩端各留一點緩起緩收），峰值速度＝平均的 1.25 倍——smoothstep 的 1.5 倍
    // 在 1 m 偏移時會超過每幀 0.05 m
    const ease = e - (0.25 / (2 * Math.PI)) * Math.sin(2 * Math.PI * e);
    const wantX = st.d0x * (1 - ease); const wantZ = st.d0z * (1 - ease);
    const cap = C.MAX_SPEED * dt;
    [st.x, st.z] = moveToward(st.x, st.z, wantX, wantZ, cap);
    // 併回期間不得把人推過網（sim 本身在己方，偏移收斂中）
    if ((simZ + st.z) * inp.side < C.NET_MIN) st.z = inp.side * C.NET_MIN - simZ;
    if (e >= 1 && Math.hypot(st.x, st.z) < 1e-6) { st.phase = 'ground'; st.x = 0; st.z = 0; }
    return st;
  }
  st.phase = 'ground'; st.x = 0; st.z = 0;
  return st;
}
