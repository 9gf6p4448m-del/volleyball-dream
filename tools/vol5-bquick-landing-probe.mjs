// 卷五 B 快「落地後必做」量測 — 項目①助跑穿越餘裕（靜態幾何＋真實路徑）＋項目②罰站率複驗
//
// ★ 取得路徑（`02 §6.1` 條 4）★
//   本檔**不重刻任何 route 計算**。B 快唯一的產生路徑就是玩家叫戰術：
//   `ai.replanCall = { type:'bquick' }` → `applyReplanCall`（src/sim/ai.js:886 起）
//   → `resolveCalledPlay` → `applySoloRoute` → `approachRoutesFor`。
//   本檔只在規劃窗（`touches === 1`）把那個欄位塞進去，其餘一律讀 sim 的實際狀態
//   （`g.actors[pid].x/z`、`ai.approach.routes`、`ai.attackKind`）。
//
// ★ 量測位置（`02 §6.1` 條 5）★
//   逐 tick 距離取在 `stepGame` **回來之後**——`separateTeammates` 在 game.js:333
//   （applyMove 之後、其餘物理之前）就跑完了，之後這一 tick 不再動 actor 座標。
//   ⇒ 量到的是「避讓已經作用過」的殘餘距離：
//     d < SEP_RADIUS 0.55           ⇒ 這一 tick 避讓**必定**觸發過（且沒推開）
//     0.55 ≤ d < 0.55+2*SEP_PUSH    ⇒ 避讓**可能**在本 tick 觸發並剛好推出半徑
//     d ≥ 0.71                      ⇒ 本 tick **必定沒有**觸發
//
// 跑法：
//   node tools/vol5-bquick-landing-probe.mjs call [局數=40]   ← 每個規劃窗都叫 B 快
//   node tools/vol5-bquick-landing-probe.mjs base [局數=40]   ← 不叫戰術的對照（MB 跑 A 快）
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { approachStartFor, takeoffSpotFor, setAimFor } from '../src/sim/approach.js';
import { localToWorld } from '../src/sim/rotation.js';

const MODE = process.argv[2] ?? 'call';
const SETS = Number(process.argv[3] ?? 40);
const SEP_RADIUS = 0.55;   // game.js:426（同一個字面量，避讓的判準）
// ★ 觸發判準的推導（game.js:429-458 的算式，不是猜的）★
// 避讓在 d < 0.55 時對兩人各推 push = min((0.55−d)/2, 0.08)，並帶 SEP_SLIDE 0.6 的切向。
// 相對位移＝2×push 徑向 ＋ 1.2×push 切向 ⇒ 推完的距離
//   = hypot(min(0.55, d+2push), 1.2×push) ≤ hypot(0.55, 1.2×0.08) = 0.5583
// ⇒ **本 tick 觸發過 ⇒ 量到的 d ≤ 0.5583**（逆命題不成立，故此值是「觸發或貼著門檻」）
//   而 d > 0.5583 ⇒ **本 tick 必定沒觸發**。
const SEP_FIRED = Math.hypot(SEP_RADIUS, 1.2 * 0.08);
const SEP_NEAR = 0.55 + 2 * 0.08; // 觀察用的「接近帶」上緣
const ARRIVE_GAP = 0.6;    // 罰站口徑：抄 tools/attack-flow-probe.mjs:8
const STALL_TICKS = 30;    // 罰站口徑：抄 tools/attack-flow-probe.mjs:134（0.5s 硬線）
const OH_KINDS = ['left', 'left_inside', 'cross'];
const MB_KIND = MODE === 'call' ? 'bquick' : 'quick';

const q = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(3) : 'n/a');
const f4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : 'n/a');

// ---- 靜態幾何（對照組，非判準）：兩條助跑線段的關係 ----
// 線段端點一律取自**真實函式** approachStartFor / takeoffSpotFor，不抄常數。
function segMinDist(a0, a1, b0, b1) {
  const ux = a1.x - a0.x; const uz = a1.z - a0.z;
  const vx = b1.x - b0.x; const vz = b1.z - b0.z;
  const wx = a0.x - b0.x; const wz = a0.z - b0.z;
  const a = ux * ux + uz * uz; const b = ux * vx + uz * vz; const c = vx * vx + vz * vz;
  const d = ux * wx + uz * wz; const e = vx * wx + vz * wz;
  const den = a * c - b * b;
  let s = 0; let t = 0;
  if (den > 1e-9) { s = (b * e - c * d) / den; t = (a * e - b * d) / den; }
  else { s = 0; t = c > 1e-9 ? e / c : 0; }
  s = Math.max(0, Math.min(1, s)); t = Math.max(0, Math.min(1, t));
  const px = a0.x + s * ux - (b0.x + t * vx);
  const pz = a0.z + s * uz - (b0.z + t * vz);
  return Math.hypot(px, pz);
}

function staticGeometry() {
  const team = 'A';
  const ms = approachStartFor(team, 'bquick');
  const mt = takeoffSpotFor(team, 'bquick');
  console.log('── ①(a) 靜態幾何餘裕（推導，非判準）──');
  console.log(`B 快助跑線段：起點(${f2(ms.x)}, ${f2(ms.z)}) → 起跳點(${f2(mt.x)}, ${f2(mt.z)})`
    + `　長 ${f2(Math.hypot(mt.x - ms.x, mt.z - ms.z))}m`);
  for (const k of OH_KINDS) {
    const os = approachStartFor(team, k);
    const ot = takeoffSpotFor(team, k);
    // 範式（approach.js:150-152）：對方線段在**我的起跳點 lx** 處的 lz，減我的起跳點 lz。
    // 世界座標下 A 隊的 lx/lz 與 x/z 差一個 TEAM_SIDE 號誌；只取差值故號誌自銷。
    const spanLo = Math.min(os.x, ot.x); const spanHi = Math.max(os.x, ot.x);
    let lane = null;
    if (mt.x >= spanLo && mt.x <= spanHi && Math.abs(ot.x - os.x) > 1e-9) {
      const r = (mt.x - os.x) / (ot.x - os.x);
      const zAt = os.z + r * (ot.z - os.z);
      lane = Math.abs(zAt) - Math.abs(mt.z); // 離網距離差（＝範式的「餘裕」）
    }
    const seg = segMinDist(ms, mt, os, ot);
    const startGap = Math.hypot(os.x - ms.x, os.z - ms.z);
    console.log(`${k.padEnd(11)} 起點(${f2(os.x)}, ${f2(os.z)})→起跳(${f2(ot.x)}, ${f2(ot.z)})`
      + `　範式餘裕 ${lane === null ? '不穿越(n/a)' : f2(lane) + (lane > SEP_RADIUS ? ' ✅' : ' ❌')}`
      + `　線段最小距 ${f2(seg)}${seg > SEP_RADIUS ? ' ✅' : ' ❌'}`
      + `　兩起點距 ${f2(startGap)}`);
  }
  console.log('');
}

// ---- 真實路徑量測 ----
const pairMin = {};      // ohKind → [每球最小距]
const pairMinAt = {};    // ohKind → [最小距發生在建帳後第幾 tick]
const pairTicksDeep = {}; // d < 0.55（推不開的深度重疊）
const pairTicksFired = {}; // d ≤ 0.5583（避讓觸發／貼著門檻）
const pairTicksNear = {};  // 0.5583 < d < 0.71（必定沒觸發，但很近）
const pairTicksTotal = {};
for (const k of OH_KINDS) {
  pairMin[k] = []; pairMinAt[k] = []; pairTicksDeep[k] = 0;
  pairTicksFired[k] = 0; pairTicksNear[k] = 0; pairTicksTotal[k] = 0;
}
const stalls = {};       // attackKind → [到位→擊球 tick]
// ②b 直球量法（口徑抄 tools/tempo-probe.mjs ③，STILL_EPS 逐值相同）：
// 擊球前**連續站著不動**幾 tick。與 ②a 互補——②a 量的是「進了球下的圈之後」，
// 圈裡他可能還在跑；②b 量的是他真的釘在原地不動的那一段。
const STILL_EPS = 0.005;
const standBy = {};      // attackKind → [擊球前連續靜止 tick]
const spikes = {};       // attackKind → 該線實際擊球（TOUCH spike）次數＝罰站率的分母
let callAttempts = 0;
const callOutcomes = {};
let tracked = 0;
const winLens = [];      // 每個助跑窗被追蹤的 tick 數（窗界自我檢查）
const runWin = [];       // 每個窗的 [MB 起步, MB 起跳] 相對建帳 tick（判斷擠壓發生在哪一段）
const firedCases = [];   // 觸發避讓的球：最小距當下的兩人位置與時序（診斷「哪個常數要調」）

// ════ 第二輪（協調者追問）：位移量與機能性後果 ════
//
// ★ 誠實標註：**每 tick 的「避讓造成的位移」無法從 stepGame 外面直接量到** ★
//   game.js:319-320 的 px/pz 快照取在 applyMove **之前**（＝上一 tick 末的位置），
//   而 separateTeammates（game.js:333）是本 tick 最後一個動 actor 的東西
//   ⇒ 「applyMove 之後、避讓之前」那一格座標沒有任何對外出口。
//   要直接量到它就得改 src（本輪禁區），也無法把避讓關掉做 A/B 軌跡差（SEP_RADIUS
//   是 module-level const，不是 TUNING/AI 那種可 patch 的物件）。
//   因此本節給**兩個都不是代理指標**的量：
//     (i) 推導值：把 game.js:445-452 的算式對觀測到的 d 做反解（見 pushFromD）
//     (ii) 直接值：MB／OH 該 tick 的**實際總位移**——它是 (i) 的**上界**
//         （實際位移 ＝ 自己要走的 ＋ 避讓推的），也是「玩家眼睛看得到多少移動」的上界。
const sepDisp = { mb: [], oh: [] };   // 每顆受影響球：推導的避讓位移累計（m）
const sepMaxTick = { mb: [], oh: [] }; // 每顆受影響球：推導的單 tick 最大避讓位移（m）
const actDisp = { mb: [], oh: [] };   // 每顆受影響球：觸發 tick 內的**實際**總位移（上界）
const actMaxTick = { mb: [], oh: [] };
// 機能性後果：兩組（fired＝該窗曾觸發避讓／clean＝沒觸發）
const func = {
  fired: { atStart: [], atTakeoff: [], hitOff: [], spiked: 0, n: 0 },
  clean: { atStart: [], atTakeoff: [], hitOff: [], spiked: 0, n: 0 },
};
// 反解 push：避讓推完的距離 d = hypot(min(0.55, d_pre+2push), 1.2*push)
//   未觸頂支（push < SEP_PUSH）⇒ 徑向分量恰好收在 0.55 ⇒ 1.2*push = sqrt(d² − 0.55²)
//   觸頂支（push = 0.08，需 d_pre < 0.39）在本批**從未發生**（d < 0.55 的 tick 數 = 0，
//   且觸頂時 d = hypot(d_pre+0.16, 0.096) 會落在 0.55 以下 ⇒ 觀測不到）。
// 一個人的實際位移量 = |n| = push * hypot(1, SEP_SLIDE 0.6) = push * 1.1662
const pushFromD = (d) => (d > SEP_RADIUS ? Math.sqrt(d * d - SEP_RADIUS * SEP_RADIUS) / 1.2 : 0);
const SEP_DISP_MUL = Math.hypot(1, 0.6);
const aimLocal = setAimFor(null, 'A', null, MB_KIND, 'one');
const aimWorld = localToWorld('A', aimLocal.lx, aimLocal.lz);

function tallyStall(kind, ticks) {
  if (!stalls[kind]) stalls[kind] = [];
  stalls[kind].push(ticks);
}

for (let seed = 1; seed <= SETS; seed += 1) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  let lastCallFlight = -1;
  let pending = false;
  let lastTrackFlight = -1;
  let track = null;   // { flight, mb, pairs:[{kind,pid,min}], endTick, ticks }
  let atk = null;     // 罰站帳（口徑抄 attack-flow-probe §2）
  let stillRun = {};  // pid → 目前連續靜止了幾 tick（②b）
  // 機能窗關帳：距離窗若還沒關就一併補關（未扣球的短波）
  const closeTrack = () => {
    if (!track) return;
    if (!track.distClosed) {
      track.distClosed = true;
      track.fired = track.pairs.some((p) => p.min <= SEP_FIRED);
      winLens.push(track.ticks);
      for (const p of track.pairs) {
        if (!Number.isFinite(p.min)) continue;
        pairMin[p.kind].push(p.min); pairMinAt[p.kind].push(p.minAt);
        if (p.min <= SEP_FIRED) firedCases.push({ kind: p.kind, min: p.min, minAt: p.minAt, ...p.at });
      }
      if (track.fired) {
        sepDisp.mb.push(track.sd.mb); sepDisp.oh.push(track.sd.oh);
        sepMaxTick.mb.push(track.sm.mb); sepMaxTick.oh.push(track.sm.oh);
        actDisp.mb.push(track.ad.mb); actDisp.oh.push(track.ad.oh);
        actMaxTick.mb.push(track.am.mb); actMaxTick.oh.push(track.am.oh);
      }
    }
    const b = func[track.fired ? 'fired' : 'clean'];
    b.n += 1;
    if (track.atStart != null) b.atStart.push(track.atStart);
    if (track.atTakeoff != null) b.atTakeoff.push(track.atTakeoff);
    if (track.hitOff != null) b.hitOff.push(track.hitOff);
    if (track.spiked) b.spiked += 1;
  };
  let allPrev = {};
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 400000) {
    guard += 1;
    const r = g.rally;
    // ★ 唯一的注入點：規劃窗（applyReplanCall 的窗界，ai.js:892）★
    if (MODE === 'call' && g.phase === 'rally' && r.possession === 'A'
      && r.touches === 1 && r.flightId !== lastCallFlight) {
      lastCallFlight = r.flightId;
      ai.replanCall = { type: 'bquick', callerId: ai.claimId ?? null };
      pending = true;
      callAttempts += 1;
    }
    // 罰站：到位時刻（attack-flow-probe.mjs:40-50 同一份判準）
    if (r.touches === 2 && ai.attackerId && ai.landing) {
      const a = g.actors[ai.attackerId];
      const gap = Math.hypot(ai.landing.x - a.x, ai.landing.z - a.z);
      if (gap <= ARRIVE_GAP && (!atk || atk.pid !== ai.attackerId)) {
        atk = { pid: ai.attackerId, arrivedTick: g.tick, kind: ai.attackKind };
      }
    }
    for (const pid of Object.keys(g.actors)) {
      const a = g.actors[pid];
      const p0 = allPrev[pid];
      const st = p0 ? Math.hypot(a.x - p0.x, a.z - p0.z) : 1;
      stillRun[pid] = st < STILL_EPS ? (stillRun[pid] ?? 0) + 1 : 0;
      allPrev[pid] = { x: a.x, z: a.z };
    }
    const ev = stepGame(g, aiCollectIntents(g, ai));
    // 叫牌結果（只在注入的那一 tick 讀，避免跨 tick 重複計數）
    if (pending) {
      pending = false;
      const o = ai.callOutcome;
      const key = o ? `${o.outcome}${o.reason ? ':' + o.reason : ''}` : 'null';
      callOutcomes[key] = (callOutcomes[key] ?? 0) + 1;
    }
    // 追蹤帳建立：**每個 flight 至多一次**，且只在我方（A）的助跑線剛排好時。
    // 窗界＝[建帳 tick, MB route 的 settleTick]（收勢完成之後人就落回 cover，
    // 那段的擠壓與助跑交叉無關，量進來會污染）。
    if (!track && r.flightId !== lastTrackFlight && g.phase === 'rally'
      && r.possession === 'A' && r.touches === 1
      && ai.approach?.team === 'A' && ai.approach.routes) {
      const routes = ai.approach.routes;
      const mbR = routes.find((x) => x.kind === MB_KIND);
      // call 模式：只認這一波真的叫成了 B 快的（callOutcome 是本 tick 剛寫的）
      const okCall = MODE !== 'call' || ai.callOutcome?.outcome === 'command';
      if (mbR && okCall && mbR.settleTick != null) {
        lastTrackFlight = r.flightId;
        const pairs = routes.filter((x) => OH_KINDS.includes(x.kind))
          .map((x) => ({ kind: x.kind, pid: x.pid, min: Infinity, minAt: -1, at: null }));
        if (pairs.length) {
          track = {
            flight: r.flightId, mb: mbR.pid, pairs, endTick: mbR.settleTick, ticks: 0,
            t0: g.tick,
            runFrom: mbR.startTick - g.tick,
            runTo: mbR.takeoffTick - g.tick,
            route: mbR,
            // 第二輪：位移與機能後果的帳
            oh: pairs[0].pid,           // 唯一會擠到的那條線就是 left（見第一輪 ①(b)）
            sd: { mb: 0, oh: 0 }, sm: { mb: 0, oh: 0 },
            ad: { mb: 0, oh: 0 }, am: { mb: 0, oh: 0 },
            prev: null,
            atStart: null, atTakeoff: null, hitOff: null, spiked: false,
          };
          runWin.push([track.runFrom, track.runTo]);
          tracked += 1;
        }
      }
    }
    // ★ 事件必須在關帳之前處理 ★ 扣球那一 tick flightId 就變了，關帳排在前面的話
    //   這一波的擊球點永遠量不到（第二輪 ② 的 hitOff 會恆為 null）
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.kind === 'spike') {
        const k = ai.attackKind ?? 'unknown';
        spikes[k] = (spikes[k] ?? 0) + 1;
        (standBy[k] ??= []).push(stillRun[e.playerId] ?? 0);
        if (atk && e.playerId === atk.pid) {
          tallyStall(atk.kind ?? 'unknown', g.tick - atk.arrivedTick);
          atk = null;
        }
        // 第二輪 ②：這一波的 MB 真的把 B 快打出去了嗎、打在哪
        if (track && e.playerId === track.mb) {
          const a = g.actors[e.playerId];
          track.spiked = true;
          track.hitOff = Math.hypot(a.x - aimWorld.x, a.z - aimWorld.z);
        }
      }
      if (e.type === 'DEAD_BALL') atk = null;
    }
    if (track) {
      // ★ 兩個窗，刻意分開 ★
      //   距離窗（distAlive）＝第一輪用的那個（flightId 綁定），**數字不得因本輪而變**；
      //   機能窗（alive）要活到扣球——二傳觸球時 flightId 就換了，綁 flightId 的話
      //   `hitOff`／`spiked` 會恆為 null／0（本輪第一版就踩到，115 次扣球量到 0 次）。
      const distAlive = g.phase === 'rally' && r.flightId === track.flight
        && g.tick <= track.endTick;
      const alive = g.phase === 'rally' && r.possession === 'A'
        && g.tick <= track.route.takeoffTick + 90;
      if (distAlive) {
        track.ticks += 1;
        const m = g.actors[track.mb];
        for (const p of track.pairs) {
          const o = g.actors[p.pid];
          const d = Math.hypot(m.x - o.x, m.z - o.z);
          if (d < p.min) {
            p.min = d; p.minAt = g.tick - track.t0;
            p.at = { mx: m.x, mz: m.z, ox: o.x, oz: o.z, rf: track.runFrom, rt: track.runTo };
          }
          pairTicksTotal[p.kind] += 1;
          if (d < SEP_RADIUS) pairTicksDeep[p.kind] += 1;
          if (d <= SEP_FIRED) pairTicksFired[p.kind] += 1;
          else if (d < SEP_NEAR) pairTicksNear[p.kind] += 1;
          // 第二輪 ①：只對「這一 tick 真的觸發了避讓」的那名 OH 累計
          if (p.pid === track.oh && d <= SEP_FIRED) {
            const disp = pushFromD(d) * SEP_DISP_MUL;
            track.sd.mb += disp; track.sd.oh += disp;
            if (disp > track.sm.mb) { track.sm.mb = disp; track.sm.oh = disp; }
            if (track.prev) { // 實際位移（上界）：兩次 post-step 座標的差
              const am = Math.hypot(m.x - track.prev.mx, m.z - track.prev.mz);
              const ao = Math.hypot(o.x - track.prev.ox, o.z - track.prev.oz);
              track.ad.mb += am; track.ad.oh += ao;
              if (am > track.am.mb) track.am.mb = am;
              if (ao > track.am.oh) track.am.oh = ao;
            }
          }
        }
        track.prev = { mx: m.x, mz: m.z, ox: g.actors[track.oh].x, oz: g.actors[track.oh].z };
        // 第二輪 ②：機能性後果——承諾 tick 上的到位程度（route 的值，不是我重算的）
        if (g.tick === track.route.startTick) {
          track.atStart = Math.hypot(m.x - track.route.start.x, m.z - track.route.start.z);
        }
        if (g.tick === track.route.takeoffTick) {
          track.atTakeoff = Math.hypot(m.x - track.route.takeoff.x, m.z - track.route.takeoff.z);
        }
      } else if (!track.distClosed) {
        track.distClosed = true;
        track.fired = track.pairs.some((p) => p.min <= SEP_FIRED);
        winLens.push(track.ticks);
        for (const p of track.pairs) {
          if (!Number.isFinite(p.min)) continue;
          pairMin[p.kind].push(p.min); pairMinAt[p.kind].push(p.minAt);
          if (p.min <= SEP_FIRED) firedCases.push({ kind: p.kind, min: p.min, minAt: p.minAt, ...p.at });
        }
        if (track.fired) {
          sepDisp.mb.push(track.sd.mb); sepDisp.oh.push(track.sd.oh);
          sepMaxTick.mb.push(track.sm.mb); sepMaxTick.oh.push(track.sm.oh);
          actDisp.mb.push(track.ad.mb); actDisp.oh.push(track.ad.oh);
          actMaxTick.mb.push(track.am.mb); actMaxTick.oh.push(track.am.oh);
        }
      }
      if (!alive) { closeTrack(); track = null; }
    }
  }
  if (track) closeTrack();
}

console.log(`=== vol5 B 快落地量測　模式 ${MODE}　${SETS} 局　（MB 線＝${MB_KIND}）===\n`);
if (MODE === 'call') staticGeometry();

if (MODE === 'call') {
  console.log('── 叫牌注入結果（真實路徑：applyReplanCall）──');
  console.log(`注入 ${callAttempts} 次：` + Object.entries(callOutcomes)
    .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('　'));
  console.log('');
}

console.log(`── ①(b) 真實路徑：MB(${MB_KIND}) 與 OH 各線的逐 tick 距離（判準）──`);
console.log(`追蹤到的助跑窗 ${tracked} 個　窗長 tick：p5 ${q(winLens, 0.05)}`
  + ` p50 ${q(winLens, 0.5)} p95 ${q(winLens, 0.95)}`
  + `　MB 起步/起跳（相對建帳）p50 ${q(runWin.map((x) => x[0]), 0.5)}`
  + `/${q(runWin.map((x) => x[1]), 0.5)}`);
for (const k of OH_KINDS) {
  const arr = pairMin[k];
  if (!arr.length) { console.log(`${k.padEnd(11)} 無樣本（這一線本批沒出現）`); continue; }
  const deep = arr.filter((d) => d < SEP_RADIUS).length;
  const fired = arr.filter((d) => d <= SEP_FIRED).length;
  const at = pairMinAt[k];
  console.log(`${k.padEnd(11)} n=${arr.length} 球　最小距 min ${f4(Math.min(...arr))}`
    + ` p5 ${f4(q(arr, 0.05))} p50 ${f4(q(arr, 0.5))} p95 ${f4(q(arr, 0.95))}`);
  console.log(`            曾觸發避讓的球（min ≤ ${f4(SEP_FIRED)}）${fired}`
    + `（${((fired / arr.length) * 100).toFixed(1)}%）　其中推不開(min<0.55) ${deep}`
    + `　最小距發生在建帳後 p50 ${q(at, 0.5)} tick`);
  console.log(`            tick：總 ${pairTicksTotal[k]}　觸發 ${pairTicksFired[k]}`
    + `（${((pairTicksFired[k] / pairTicksTotal[k]) * 100).toFixed(1)}%）`
    + `　其中 d<0.55 ${pairTicksDeep[k]}　接近帶 0.558<d<0.71 ${pairTicksNear[k]}`);
}

if (firedCases.length) {
  console.log('');
  console.log('── ①(b) 附錄：觸發避讓的球，最小距當下的現場（診斷用）──');
  const rel = firedCases.map((c) => c.minAt - c.rf);
  console.log(`n=${firedCases.length}　最小距發生在「MB 起步」之後 ${rel.filter((v) => v >= 0).length} 次`
    + `／之前 ${rel.filter((v) => v < 0).length} 次　(minAt−startTick) p50 ${q(rel, 0.5)} tick`);
  for (const c of firedCases.slice(0, 6)) {
    console.log(`  ${c.kind.padEnd(11)} d=${f4(c.min)}　MB(${f2(c.mx)}, ${f2(c.mz)})`
      + `　OH(${f2(c.ox)}, ${f2(c.oz)})　minAt ${c.minAt}　起步 ${c.rf}／起跳 ${c.rt}`);
  }
}

console.log('');
console.log('══ 第二輪 ①：位移量——玩家看不看得到 ══');
console.log('⚠ 每 tick「避讓造成的位移」無法從 stepGame 外面直接量到（px/pz 快照在 applyMove 之前、');
console.log('  separateTeammates 是最後一個動 actor 的）⇒ 下面 (i) 是**推導**、(ii) 是**直接量**且為上界。');
console.log(`受影響球 n=${sepDisp.mb.length}（＝曾觸發避讓的球）`);
for (const [name, who] of [['MB', 'mb'], ['OH', 'oh']]) {
  const cum = sepDisp[who]; const mx = sepMaxTick[who];
  const ac = actDisp[who]; const am = actMaxTick[who];
  if (!cum.length) { console.log(`${name}：無樣本`); continue; }
  console.log(`${name} (i)推導・避讓位移　累計 p50 ${f4(q(cum, 0.5))}m　p90 ${f4(q(cum, 0.9))}m`
    + `　max ${f4(Math.max(...cum))}m　│ 單 tick 最大 p50 ${f4(q(mx, 0.5))}m`
    + `　p90 ${f4(q(mx, 0.9))}m　max ${f4(Math.max(...mx))}m`);
  console.log(`${name} (ii)直接・觸發 tick 內**實際**總位移（上界）`
    + `　累計 p50 ${f4(q(ac, 0.5))}m　p90 ${f4(q(ac, 0.9))}m　max ${f4(Math.max(...ac))}m`
    + `　│ 單 tick p50 ${f4(q(am, 0.5))}m　max ${f4(Math.max(...am))}m`);
}

console.log('');
console.log('══ 第二輪 ②：機能性後果——有避讓 vs 無避讓 ══');
console.log('（三項都直接讀 sim 狀態：route.startTick/takeoffTick 上的到位距離、擊球點對 setAimFor 的偏離）');
const row = (label, key, unit) => {
  const a = func.fired[key]; const b = func.clean[key];
  const fmt = (arr) => (arr.length
    ? `n=${arr.length} p50 ${f4(q(arr, 0.5))}${unit} p90 ${f4(q(arr, 0.9))}${unit} max ${f4(Math.max(...arr))}${unit}`
    : '無樣本');
  console.log(`${label}`);
  console.log(`   有避讓：${fmt(a)}`);
  console.log(`   無避讓：${fmt(b)}`);
};
console.log(`窗數：有避讓 ${func.fired.n}　無避讓 ${func.clean.n}`);
row('startTick 那一刻離 route.start 的距離（＝有沒有準時站到助跑起點）', 'atStart', 'm');
row('takeoffTick 那一刻離 route.takeoff 的距離（＝有沒有錯過起跳點）', 'atTakeoff', 'm');
row(`擊球點離 setAimFor(${MB_KIND}) 落點 (${aimLocal.lx}, ${aimLocal.lz}) 的水平距離`, 'hitOff', 'm');
const pc = (b) => (b.n ? ((b.spiked / b.n) * 100).toFixed(1) : 'n/a');
console.log(`MB 真的把這條線打出去的比例：有避讓 ${pc(func.fired)}%（${func.fired.spiked}/${func.fired.n}）`
  + `　無避讓 ${pc(func.clean)}%（${func.clean.spiked}/${func.clean.n}）`);

console.log('');
console.log('── ② 罰站（口徑抄 tools/attack-flow-probe.mjs §2：到球下 → 擊球）──');
console.log('（樣本數要配分母看：分母＝該線實際擊球數。前例的「0 筆 → 537 筆」講的是分子本身）');
for (const [k, arr] of Object.entries(stalls).sort((a, b) => b[1].length - a[1].length)) {
  const stall = arr.filter((t) => t >= STALL_TICKS).length;
  console.log(`${String(k).padEnd(11)} 罰站樣本 n=${arr.length} / 該線擊球 ${spikes[k] ?? 0}`
    + `　p50=${q(arr, 0.5)} tick（${(q(arr, 0.5) / 60).toFixed(2)}s）`
    + `　p90=${q(arr, 0.9)}　max=${Math.max(...arr)}`
    + `　站>0.5s ${((stall / arr.length) * 100).toFixed(1)}%`);
}
for (const [k, n] of Object.entries(spikes).sort((a, b) => b[1] - a[1])) {
  if (!stalls[k]) console.log(`${String(k).padEnd(11)} 罰站樣本 n=0 / 該線擊球 ${n}　（零罰站）`);
}
console.log('');
console.log('── ②b 直球量法（口徑抄 tools/tempo-probe.mjs ③）：擊球前**連續站著不動**幾 tick ──');
for (const [k, arr] of Object.entries(standBy).sort((a, b) => b[1].length - a[1].length)) {
  const over = arr.filter((t) => t >= STALL_TICKS).length;
  console.log(`${String(k).padEnd(11)} n=${arr.length}　p50=${q(arr, 0.5)} tick`
    + `（${(q(arr, 0.5) / 60).toFixed(2)}s）　p90=${q(arr, 0.9)}　max=${Math.max(...arr)}`
    + `　站>0.5s ${((over / arr.length) * 100).toFixed(1)}%`);
}
