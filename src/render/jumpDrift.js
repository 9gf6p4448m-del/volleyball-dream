// 跳躍前飄（純表現層，docs/kickoffs/jump-drift-acceptance.md）：sim 的攻擊手「到位即停、
// 原地拔起」（src/sim/ai.js 起跳點分支；起跳點刻意退在擊球點後方 approach.js TAKEOFF），
// 畫面上就是垂直起跳。本模組只算「畫面上的 root 該比 sim 位置多偏多少」，不寫回 sim。
//
// 兩種模式：
// ● 自由飛行（攻擊／跳發）：離地那一幀接手「上一幀畫面上的 root」，之後 root 在空中**完全
//   不跟 sim**——人在空中改不了水平軌跡；sim 還在助跑、到位停下或擊球後立刻回防，都不影響
//   畫面。初速＝起跳當下 sim 的跑速（助跑慣性，只取朝網那一半），之後以每幀 ≤FRAME_STEP 朝
//   擊球點前進、預計在擊球時刻到達；擊球後停在擊球點上空。只准朝網、不准倒退、不過網。
//   落地：先停 HOLD_SEC，再在 MERGE_SEC 內近似等速併回 sim。
//   reachAssist 的根位移在飛行／停留期間權重歸 0、併回期間線性加回 1（reachW）：理由見
//   matchView 接線處——前飄本身就是把身體送到球下，兩者疊加是重複補償，且根位移逐幀跟著
//   球跳，會讓空中 root 抖動（改前 J3 的 0.07–0.10 m／幀即此來源）。起跳那一幀的根位移
//   已經包含在「上一幀畫面上的 root」裡被接手，所以權重歸 0 不會讓人往回彈。
// ● 相對偏移（跳舉）：root 仍跟 sim 走，只加一個朝球、總長 ≤SET_MAX 的小偏移，落地後收回。
// 攔網、歡呼、站發小跳等其他跳躍：偏移恆 0（x/z 皆為 0，加上去與原值逐位相同）。
//
// 純函式、無 three.js 依賴，node 可單測（tests/jump-drift.test.mjs）。

export const JUMP_DRIFT = Object.freeze({
  // 助跑慣性上限（m/s）：起跳當下 sim 跑速換成每幀步長前先夾在這裡
  MAX_SPEED: 3.9,
  // 不過網：root 離網面（z=0）至少這麼遠（驗收 J5 ≥0.15 m，留 0.05 餘裕）
  NET_MIN: 0.2,
  // 跳舉只准微量（驗收 J6 ≤0.15 m）
  SET_MAX: 0.12,
  SET_SPEED: 1.2, // 跳舉偏移的變化速度上限（m/s）
  // 跳發：sim 的發球擊球點就在腳下（game.js performServe ball=actor），沒有「擊球點」可飄；
  // 沿發球方向往場內飄一段名目距離（驗收 J2 修訂 R3：0.6–1.5 m）【試玩必調】
  SERVE_DIST: 1.45, // R3 上限 1.5：server 在滯空 0.85 s 內 sim 已往場內跑 2–3.4 m，飄得越接近上限、落地要併回的越少
  SERVE_HIT_SEC: 0.34, // serveJump 擊球關鍵幀（0.4×0.85 s）
  // 落地：先停 HOLD_SEC，再 MERGE_SEC 併回（驗收 J7：落地後 ≤0.5 s 併回）
  HOLD_SEC: 0.017, // 一幀
  MERGE_SEC: 0.42,
  // 併回速度上限（m/s）：J7 併回期間每幀 ≤0.07 m（R1）＝4.2 m/s。sim 擊球後立刻回防，
  // 落地時偏移可達 ~1.8 m，要在 0.5 s 內收完只能用到接近上限
  // 每幀位移絕對上限（m／畫面幀）：驗收以畫面幀量（60fps 每幀 ≤0.07 m），慢動作幀的 dt 很小、
  // 抖動幀的 dt 可能略大於 1/60——上限直接綁「一幀」而不是綁速度×dt，才不會在 dt 偏大的幀超標
  FRAME_STEP: 0.069,
  MERGE_EASE_SEC: 0.0, // 併回起步的緩起時間（0＝不緩起：sim 回防快，落地偏移常近 2 m，0.5 s 內要收完得一開始就全速）
  ARRIVED: 0.01, // 離目標這麼近就算到了（m）
  BRAKE: 25, // 接近目標的減速度（m/s²，換算成每幀 /60）
  STEP_K: 0.45, // 每幀步長的逐幀平滑係數
  PRE_HIT_CONE: 0.2, // 擊球前每一步沿估計前進方向的分量至少佔步長的這個比例（≈與前進方向夾角 ≤78°）
  // 沿前進方向飄多遠＝起跳點→擊球點距離 D 的 reachFrac(D) 倍（驗收 J2 下限 0.8）：
  // D≤0.8 m 飄滿（短距離時擊球點估計的幾公分誤差佔比大，要留餘裕）；D 越長越留一點
  // （≥1.3 m 取 0.87）——球留在身前一點，且落地時要併回的量少 ~0.2 m（J7：0.5 s 內併回，
  // sim 擊球後立刻回防，長距離那幾筆落地偏移最大）
  FRAC_MIN: 0.87, FRAC_FROM: 0.8, FRAC_TO: 1.3,
  FOLLOW_SEC: 0.25, // 擊球後空中橫向靠回 sim 的時間常數（秒）
  // sim 位置單幀跳動超過此值＝得分後重新佈陣的瞬移／重演切換：前飄立即作廢
  TELEPORT: 0.5,
});

// 會前飄的跳躍種類（由起跳那一幀的動作序列決定）
export function driftKindOf(seqType) {
  if (seqType === 'windup' || seqType === 'windupHesitant' || seqType === 'spike' || seqType === 'tip') return 'attack';
  if (seqType === 'serveJump') return 'serve';
  if (seqType === 'overheadJump') return 'set';
  return null;
}

export function reachFrac(D) {
  const C = JUMP_DRIFT;
  const k = Math.min(Math.max((D - C.FRAC_FROM) / (C.FRAC_TO - C.FRAC_FROM), 0), 1);
  return 1 - (1 - C.FRAC_MIN) * k;
}

export function createJumpDrift() {
  return {
    phase: 'ground', kind: null, px: 0, pz: 0, s: 0, ax: 0, az: 0,
    dirX: 0, dirZ: 0, target: null, hitLocked: false, t: 0,
    lastSimX: null, lastSimZ: null, x: 0, z: 0, reachW: 1,
  };
}

function toward(x, z, tx, tz, maxStep) {
  const dx = tx - x; const dz = tz - z;
  const d = Math.hypot(dx, dz);
  if (d <= maxStep || d < 1e-12) return [tx, tz];
  return [x + (dx / d) * maxStep, z + (dz / d) * maxStep];
}

// 每幀呼叫一次。inp：
//   airborne        動畫是否在跳躍弧上（animator 的 jumpY>0）
//   seqType         目前動作序列（起跳那一幀用來判種類）
//   simX/simZ       本幀 sim 插值位置；simVx/simVz 本幀 sim 速度（m/s）
//   rootX/rootZ     上一幀畫面上的 root 水平位置（起跳接手點）
//   side            TEAM_SIDE（+1＝z>0 半場）；前進（朝網）＝−side·z
//   dt              本幀時間（秒，已含慢動作倍率）
//   nominal         名目前飄距離（m；攻擊類還沒有擊球點估計時用）
//   aim             擊球點估計 {x,z,tLeft}｜null
//   hit             本幀觸球的球位置 {x,z}｜null（有＝擊球點定案）
//   apexLeft        距跳躍弧頂的秒數（沒有 aim 時當作預計擊球時刻）
//   ballX/ballZ、ballVx/ballVz  球的水平位置／速度（跳舉朝球、跳發取發球方向）
//   reset           強制歸零（魚躍、圍圈）
// 回傳 st：st.x/st.z＝加在 sim 位置上的水平偏移（m）；st.reachW＝reachAssist 根位移權重
export function stepJumpDrift(st, inp) {
  const C = JUMP_DRIFT;
  const { simX, simZ, dt } = inp;
  const teleported = st.lastSimX != null
    && Math.hypot(simX - st.lastSimX, simZ - st.lastSimZ) > C.TELEPORT;
  st.lastSimX = simX; st.lastSimZ = simZ;
  if (inp.reset || teleported) {
    st.phase = 'ground'; st.kind = null; st.x = 0; st.z = 0; st.reachW = 1;
    return st;
  }
  const side = inp.side;
  const fwdZ = -side;
  // 起跳沿（地面或併回途中再離地）
  if (inp.airborne && st.phase !== 'air' && st.phase !== 'still') {
    const kind = driftKindOf(inp.seqType);
    if (!kind) {
      st.phase = 'still'; st.kind = null; st.x = 0; st.z = 0; st.reachW = 1;
    } else if (kind === 'set') {
      st.phase = 'air'; st.kind = 'set'; st.x = 0; st.z = 0; st.reachW = 1; st.hitLocked = false;
    } else {
      st.phase = 'air'; st.kind = kind; st.t = 0; st.hitLocked = false; st.target = null;
      st.px = inp.rootX; st.pz = inp.rootZ;
      st.ax = st.px; st.az = st.pz;
      st.sx0 = simX; st.sz0 = simZ; // 起跳那一幀的 sim 位置＝「前進方向」的起點
      // 助跑慣性：起跳當下 sim 的跑速，只留朝網分量為正的部分
      let vx = inp.simVx ?? 0; let vz = inp.simVz ?? 0;
      if (vz * fwdZ < 0) vz = 0;
      const v = Math.hypot(vx, vz);
      if (v > C.MAX_SPEED) { vx *= C.MAX_SPEED / v; vz *= C.MAX_SPEED / v; }
      st.s = Math.min(Math.hypot(vx, vz) / 60, C.FRAME_STEP); // 起跳當下的每幀步長＝助跑慣性（以 60fps 一幀計）
      if (kind === 'serve') {
        const bx = inp.ballVx ?? 0; const bz = inp.ballVz ?? 0; const b = Math.hypot(bx, bz);
        [st.dirX, st.dirZ] = b > 1 && bz * fwdZ > 0 ? [bx / b, bz / b] : [0, fwdZ];
        st.s = 0; // 發球前是站定拋球，沒有助跑慣性
      }
      st.reachW = 0;
    }
  }
  if (st.phase === 'still') {
    if (!inp.airborne) st.phase = 'ground';
    st.x = 0; st.z = 0; st.reachW = 1;
    return st;
  }
  if (st.phase === 'air' && st.kind === 'set') return stepSet(st, inp);
  if (st.phase === 'setBack') return stepSet(st, inp);
  if (st.phase === 'air') {
    if (!inp.airborne) {
      // 落地：畫面上的人停在前方（相對 sim 的偏移凍結 HOLD_SEC，不再變），再併回
      st.phase = 'hold'; st.t = 0;
      st.x = st.px - simX; st.z = st.pz - simZ; st.reachW = 0;
      return st;
    } else {
      st.t += dt;
      let tx; let tz; let tLeft;
      if (inp.hit && !st.hitLocked && st.kind === 'attack') {
        st.hitLocked = true;
        st.target = { x: inp.hit.x, z: inp.hit.z };
      }
      if (st.kind === 'serve') {
        // 沿發球方向：從起跳時畫面上的人往場內 SERVE_DIST；橫向（垂直發球方向）跟 sim——
        // 發球員落地後就往防守位置跑，橫向先收，落地後要併回的量才在 0.5 s 內收得完
        const sPerp = -(simX - st.ax) * st.dirZ + (simZ - st.az) * st.dirX;
        tx = st.ax + st.dirX * C.SERVE_DIST - st.dirZ * sPerp;
        tz = st.az + st.dirZ * C.SERVE_DIST + st.dirX * sPerp;
        tLeft = C.SERVE_HIT_SEC - st.t;
      } else if (st.hitLocked) {
        // 擊球後：沿前進方向停在擊球點（不准往回），橫向（垂直前進方向）可以慢慢靠回 sim——
        // sim 擊球後立刻回防，橫向先收一段，落地後要併回的量才不會超過 0.5 s 收得完的範圍
        const ux = st.target.x - st.sx0; const uz = st.target.z - st.sz0; const ul = Math.hypot(ux, uz) || 1;
        const nx = ux / ul; const nz = uz / ul;
        // 目標＝沿前進方向停在原處（擊球後不再往前衝：sim 已在回防，多飄只會讓落地後要併回的
        // 量超過 0.5 s 收得完的範圍）；垂直前進方向取 sim 的橫向座標
        const aT = (st.px - st.sx0) * nx + (st.pz - st.sz0) * nz;
        const sPerp = -(simX - st.sx0) * nz + (simZ - st.sz0) * nx;
        tx = st.sx0 + nx * aT - nz * sPerp; tz = st.sz0 + nz * aT + nx * sPerp;
        tLeft = C.FOLLOW_SEC;
      } else if (inp.aim) {
        // 沿「起跳點→估計擊球點」方向：從起跳那一刻畫面上的人（可能已被 reachAssist 往前帶了
        // 一點）再往前 reachFrac(D)·D；橫向對準擊球點
        const ex = inp.aim.x - st.sx0; const ez = inp.aim.z - st.sz0; const D = Math.hypot(ex, ez);
        if (D > 1e-6) {
          const nx = ex / D; const nz = ez / D;
          const a0 = Math.max(0, (st.ax - st.sx0) * nx + (st.az - st.sz0) * nz);
          const along = a0 + D * reachFrac(D);
          tx = st.sx0 + nx * along; tz = st.sz0 + nz * along;
        } else { tx = st.px; tz = st.pz; }
        tLeft = inp.aim.tLeft;
      } else {
        tx = st.ax; tz = st.az + fwdZ * inp.nominal; tLeft = inp.apexLeft;
      }
      // 不往後（朝自家底線）；不過網
      if ((tz - st.pz) * fwdZ < 0) tz = st.pz;
      if (tz * side < C.NET_MIN) tz = side * C.NET_MIN;
      const dx = tx - st.px; const dz = tz - st.pz; const d = Math.hypot(dx, dz);
      // 已到（擊球點估計逐幀微抖，到位後還追著抖會出現毫米級的來回）：停住
      if (d < C.ARRIVED && !st.hitLocked) {
        st.s = 0;
        st.x = st.px - simX; st.z = st.pz - simZ; st.reachW = 0;
        return st;
      }
      // 每幀步長（m／畫面幀）：驗收 J3／J7 以畫面幀量，慢動作時 dt 很小——步長綁「幀」而不是
      // 「速度×dt」，慢動作裡擊球前的幀數夠多就來得及飄到（否則 0.4× 決策窗裡的扣球全到不了）。
      // 攻擊類：盡快到（每幀 FRAME_STEP），接近目標依 BRAKE 減速，到了就停在那裡等球——擊球
      // 時刻只是估計，玩家本人的出手由 sim 在球一進手點範圍就判定（常比估計早），寧可早到。
      // 跳發／擊球後橫向靠回 sim：照剩餘時間 tLeft 平均分配（不必急）。
      const timed = st.kind === 'serve' || st.hitLocked;
      let want = timed ? d * Math.min(1, dt / Math.max(tLeft ?? 0, dt)) : C.FRAME_STEP;
      want = Math.min(want, Math.sqrt(2 * C.BRAKE * d) / 60, C.FRAME_STEP);
      st.s += (want - st.s) * C.STEP_K; // 逐幀平滑：起步不急衝、到位不急停
      const ox = st.px; const oz = st.pz;
      [st.px, st.pz] = toward(st.px, st.pz, tx, tz, Math.min(st.s, d, C.FRAME_STEP));
      if (st.pz * side < C.NET_MIN) st.pz = side * C.NET_MIN;
      // 跳發：沿發球方向的總位移不超過 SERVE_DIST（驗收 J2 修訂 R3 上限 1.5 m；橫向靠回 sim
      // 的那一步若斜向帶到發球方向，超出的部分扣掉）
      if (st.kind === 'serve') {
        const al = (st.px - st.ax) * st.dirX + (st.pz - st.az) * st.dirZ;
        if (al > C.SERVE_DIST) { st.px -= st.dirX * (al - C.SERVE_DIST); st.pz -= st.dirZ * (al - C.SERVE_DIST); }
      }
      // 最後一道：這一步沿前進方向（起跳點→擊球點／目前目標）不得為負、朝網分量不得為負
      {
        const gx = (st.hitLocked ? st.target.x : tx) - st.sx0;
        const gz = (st.hitLocked ? st.target.z : tz) - st.sz0;
        const gl = Math.hypot(gx, gz);
        let mx = st.px - ox; let mz = st.pz - oz;
        if (gl > 1e-6) {
          const a = (mx * gx + mz * gz) / gl;
          if (st.hitLocked) {
            // 擊球點已定案：前進方向就是驗收量的那一個，倒退分量剛好扣掉即可
            if (a < 0) { mx -= (a * gx) / gl; mz -= (a * gz) / gl; }
          } else if (a < C.PRE_HIT_CONE * Math.hypot(mx, mz)) {
            // 擊球前方向只是估計（估計點隨球下墜逐幀修正幾公分）：幾乎橫著走的一步，對最後真正
            // 的擊球方向可能是微小倒退——這一步不走，等方向明確（只准明顯朝前的步）
            mx = 0; mz = 0;
          }
        }
        if (mz * fwdZ < 0) { mx = 0; mz = 0; }
        st.px = ox + mx; st.pz = oz + mz;
      }
      st.x = st.px - simX; st.z = st.pz - simZ;
      st.reachW = 0;
      return st;
    }
  }
  if (st.phase === 'hold') {
    st.t += dt;
    st.reachW = 0;
    if (st.t >= C.HOLD_SEC) { st.phase = 'merge'; st.t = 0; }
    return st;
  }
  if (st.phase === 'merge') {
    st.t += dt;
    // 近似等速：每幀需要的步長＝剩餘偏移×dt／剩餘時間，起步 MERGE_EASE_SEC 緩起，受 FRAME_STEP 限
    const d = Math.hypot(st.x, st.z);
    const left = Math.max(C.MERGE_SEC - st.t, dt);
    const ease = C.MERGE_EASE_SEC > 0 ? Math.min(st.t / C.MERGE_EASE_SEC, 1) : 1;
    const step = Math.min((d / left) * dt * Math.max(ease, 0.35), C.FRAME_STEP);
    [st.x, st.z] = toward(st.x, st.z, 0, 0, step);
    if ((simZ + st.z) * side < C.NET_MIN) st.z = side * C.NET_MIN - simZ;
    st.reachW = Math.min(st.t / C.MERGE_SEC, 1);
    if (Math.hypot(st.x, st.z) < 1e-9) { st.x = 0; st.z = 0; }
    if (st.t >= C.MERGE_SEC && st.x === 0 && st.z === 0) { st.phase = 'ground'; st.reachW = 1; }
    return st;
  }
  st.phase = 'ground'; st.x = 0; st.z = 0; st.reachW = 1;
  return st;
}

// 跳舉：相對 sim 的小偏移——朝球（觸球後朝觸球點）、總長 ≤SET_MAX，落地後以同速收回
function stepSet(st, inp) {
  const C = JUMP_DRIFT;
  const cap = C.SET_SPEED * inp.dt;
  st.reachW = 1;
  if (st.phase === 'air' && !inp.airborne) st.phase = 'setBack';
  if (st.phase === 'setBack') {
    [st.x, st.z] = toward(st.x, st.z, 0, 0, cap);
    if (st.x === 0 && st.z === 0) st.phase = 'ground';
    return st;
  }
  if (inp.hit && !st.hitLocked) { st.hitLocked = true; st.target = { x: inp.hit.x, z: inp.hit.z }; }
  const bx = st.hitLocked ? st.target.x : (inp.ballX ?? inp.simX);
  const bz = st.hitLocked ? st.target.z : (inp.ballZ ?? inp.simZ);
  let tx = bx - inp.simX; let tz = bz - inp.simZ;
  const d = Math.hypot(tx, tz);
  if (d > C.SET_MAX) { tx *= C.SET_MAX / d; tz *= C.SET_MAX / d; }
  if ((inp.simZ + tz) * inp.side < C.NET_MIN) tz = inp.side * C.NET_MIN - inp.simZ;
  [st.x, st.z] = toward(st.x, st.z, tx, tz, cap);
  return st;
}
