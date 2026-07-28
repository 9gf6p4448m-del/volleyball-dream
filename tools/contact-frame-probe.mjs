// 07-29 量化驗收：**sim 的 TOUCH 事件那一 tick，擊球動畫播到哪一格**（t 0..1）。
// 用法：node tools/contact-frame-probe.mjs [seeds] [old]
//   old ＝ 關掉「擊球動作提前觸發」，重現修前的 matchLoop 行為（geoAnimator 的
//         carry 上限改動無法用旗標關，修前基準請在改動前先跑一次存檔）
//
// 為什麼量這個：Sawmah 回報「球還沒碰到手就被接／舉起來」。前一輪查到的根因是
// **觸球那一幀播的是預備姿勢**——matchView 在 TOUCH 事件當下才 trigger 擊球動作，
// 擊球關鍵幀（bump 0.45／overhead 0.56／spike 0.42）要 0.2–0.3s 後才到。
// 這支探針用**與遊戲同一份 geoAnimator**逐 tick 驅動每個球員，在 TOUCH 那一 tick
// 讀 animator.peek()，直接量出「差幾格」。
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isBackRow } from '../src/sim/rotation.js';
import { TUNING } from '../src/sim/game.js';
import {
  createGeoAnimator, hitLeadTicks, contactSeqFor, SEQ_HIT, OVERHAND_Y,
} from '../src/render/geoAnimator.js';

const SEEDS = Number(process.argv[2] ?? 8);
const ADVANCE = process.argv[3] !== 'old';
const DT = 1 / 60;

// ---- matchLoop 的觸發條件在此重現（常數同 src/app/matchLoop.js 檔頭） ----
const RECEIVE_READY_LEAD = 26;
const SET_READY_LEAD = 34;
const TAKEOFF_LEAD_TICKS = TUNING.TAKEOFF_LOOKBACK_TICKS;
const APPROACH_LEAD_FRONT_TICKS = TAKEOFF_LEAD_TICKS + 45;
const APPROACH_LEAD_BACK_TICKS = TAKEOFF_LEAD_TICKS + 60;
// 舉球的實際接觸點比 contactPoint（用接發高度 1.35m 算）早到——同 SET_READY_LEAD 的偏差
const SET_CONTACT_BIAS = 11;
// 觸發當下人離預測接觸點的上限（m）——超過就不提前播（見 matchLoop 同名常數）
const CONTACT_NEAR_MAX = 2.5;
const CONTACT_ARM_TTL = 1.0; // 秒；提前觸發後這段時間內的 TOUCH 不重播（見 matchView）

const JOINT_NAMES = ['rHip', 'lHip', 'rKnee', 'lKnee', 'spine', 'spineUpper', 'neck',
  'pelvis', 'rShoulder', 'lShoulder', 'rElbow', 'lElbow', 'rWrist', 'lWrist'];
function mkRig() {
  const joints = {};
  for (const n of JOINT_NAMES) joints[n] = { rotation: { x: 0, y: 0, z: 0 } };
  return { joints, root: { rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 } } };
}

const rows = { receive: [], set: [], spike: [] };
const armStats = { fired: 0, consumed: 0, expired: 0, mismatched: 0, leadErr: [], gapHit: [], gapMiss: [] };
let starved = 0; // 提前觸發已播完卻仍壓住 TOUCH ⇒ 觸球那一拍沒有任何擊球動作
const early = { receive: [], set: [] }; // 預測接觸 tick − 實際觸球 tick（＋＝球比預測早到）
const predStat = { n: 0, wrong: 0 };    // 事前型別判定 vs TOUCH 實際高度

for (let seed = 1; seed <= SEEDS; seed += 1) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const anim = {};
  const arm = {};   // pid → { type, ttl, tick }（提前觸發已接手）
  const pred = {};  // pid → 事前判定的觸球型別（診斷用；ADVANCE 關掉也算）
  const last = {};  // pid → { dived, blocked }
  for (const id of Object.keys(g.players)) {
    anim[id] = createGeoAnimator(mkRig());
    last[id] = { dived: 0, blocked: 0 };
  }
  let flight = -1;
  let fired = {}; // 每 flight 一次的旗標（ready/contact/approach/windup/wait）
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const events = stepGame(g, aiCollectIntents(g, ai));
    // 每 flight 一次的旗標鍵＝**aiState.flightId**（同 matchLoop 的 lastXxxFlight）：
    // rally.flightId 在 TOUCH 當下就 +1，用它會讓觸球那一 tick 誤判成新 flight
    if (ai.flightId !== flight) {
      flight = ai.flightId;
      fired = {};
      for (const k of Object.keys(pred)) delete pred[k];
    }
    const rally = g.phase === 'rally';
    const touches = g.rally.touches;

    // --- matchLoop.updateAssistAndPoses（提前觸發，先於 TOUCH 路由） ---
    if (rally && ai.claimId && ai.contactPoint?.ticks != null && touches <= 1) {
      const toContact = ai.contactPoint.ticks - (g.tick - ai.planTick);
      if (!fired.ready) {
        const lead = touches === 1 ? SET_READY_LEAD : RECEIVE_READY_LEAD;
        if (toContact <= lead) {
          fired.ready = true;
          anim[ai.claimId].trigger(touches === 1 ? 'setReady' : 'receiveReady');
        }
      }
      if (!fired.contact) {
        // 觸球型別的事前判定：舉球恆高手；接球一律低手（見 matchLoop 同段註解）
        const type = touches === 1 ? 'overhead' : 'bump';
        const lead = hitLeadTicks(type) + (touches === 1 ? SET_CONTACT_BIAS : 0);
        const ac = g.actors[ai.claimId];
        const gap = Math.hypot(ai.contactPoint.x - ac.x, ai.contactPoint.z - ac.z);
        if (toContact >= 0 && toContact <= lead && gap <= CONTACT_NEAR_MAX) {
          fired.contact = true;
          pred[ai.claimId] = type;
          if (ADVANCE) {
            armStats.fired += 1;
            anim[ai.claimId].trigger(type);
            arm[ai.claimId] = { type, ttl: CONTACT_ARM_TTL, tick: g.tick, lead, gap };
          }
        }
      }
    }
    if (rally && touches === 2 && ai.claimId) {
      const atk = g.actors[ai.claimId];
      const b = g.ball;
      const ticksToHit = ai.hitPoint?.ticks != null ? ai.hitPoint.ticks - (g.tick - ai.planTick) : null;
      const near = Math.hypot(b.x - atk.x, b.z - atk.z);
      const back = isBackRow(g.match.rotations[g.players[ai.claimId].teamId], ai.claimId);
      const approachLead = back ? APPROACH_LEAD_BACK_TICKS : APPROACH_LEAD_FRONT_TICKS;
      if (!fired.approach && ticksToHit !== null && ticksToHit <= approachLead && near < 4.5) {
        fired.approach = true;
        anim[ai.claimId].trigger(back ? 'approach4' : 'approach3');
      }
      const timed = ticksToHit !== null && ticksToHit <= TAKEOFF_LEAD_TICKS;
      if (!fired.windup && (timed || (b.vy < 0 && b.y < 3.6 && near < 2.2))) {
        fired.windup = true;
        anim[ai.claimId].trigger('windup');
      }
    }

    // --- matchView.routeEvents（TOUCH → 擊球動畫；提前觸發過就不重播） ---
    const touched = [];
    for (const e of events) {
      if (!anim[e.playerId]) continue;
      if (e.type === 'SERVE') anim[e.playerId].trigger('serve');
      else if (e.type === 'BLOCK_TOUCH') anim[e.playerId].trigger('blockJump');
      else if (e.type === 'TOUCH') {
        if (e.kind === 'dive') continue;
        const type = contactSeqFor(e.kind, e.ballY);
        const a = arm[e.playerId];
        arm[e.playerId] = null; // 觸球即消耗（不論用不用得上）
        if (a && a.ttl > 0) {
          armStats.consumed += 1;
          armStats.leadErr.push(g.tick - a.tick - a.lead); // ＋＝球比預測晚到
          armStats.gapHit.push(a.gap);
          if (a.type !== type) armStats.mismatched += 1;
        }
        const next = contactSeqFor(e.kind, e.ballY, a && a.ttl > 0 ? a.type : null);
        if (next) anim[e.playerId].trigger(next);
        // 壓住 TOUCH 卻已經播完＝這一拍完全沒有擊球動作（比重播還糟，必須是 0）
        if (!next && anim[e.playerId].peek()?.type !== type) starved += 1;
        if (['receive', 'set', 'spike'].includes(e.kind)) {
          touched.push({ id: e.playerId, kind: e.kind, want: type, ballY: e.ballY });
          // 診斷：contactPoint 的預測接觸 tick 與實際觸球差多少（＋＝球比預測早到）
          if (e.kind !== 'spike' && ai.contactPoint?.ticks != null) {
            early[e.kind].push(ai.planTick + ai.contactPoint.ticks - g.tick);
          }
          if (e.kind === 'receive' && pred[e.playerId]) {
            predStat.n += 1;
            if (pred[e.playerId] !== type) predStat.wrong += 1;
          }
        }
      }
    }

    // --- matchView.sync（魚躍/攔網起跳偵測 → 動畫；再逐幀 update） ---
    for (const id of Object.keys(anim)) {
      const a = g.actors[id];
      if (a.divedUntil > g.tick && a.divedUntil !== last[id].dived) anim[id].trigger('dive');
      last[id].dived = a.divedUntil;
      if (a.blockUntil > g.tick && a.blockUntil !== last[id].blocked) anim[id].trigger('blockJump');
      last[id].blocked = a.blockUntil;
      if (arm[id]) {
        arm[id].ttl -= DT;
        if (arm[id].ttl <= 0) { armStats.expired += 1; armStats.gapMiss.push(arm[id].gap); arm[id] = null; }
      }
      anim[id].update(DT, 0, 0);
    }

    // --- 量測：觸球那一幀，擊球動畫播到哪 ---
    for (const t of touched) {
      const p = anim[t.id].peek();
      const hit = SEQ_HIT[t.want];
      rows[t.kind].push({
        type: p?.type ?? '(idle)',
        want: t.want,
        tNorm: p ? p.tNorm : null,
        // 差幾 tick：＋＝擊球關鍵幀還要多久才到（＝球先飛走、人後動）
        errTicks: p && p.type === t.want ? (hit - p.tNorm) * p.dur * 60 : null,
        ballY: t.ballY,
      });
    }
  }
}

// ---- 報表 ----
const q = (arr, p) => {
  const a = arr.filter((x) => x != null).sort((x, y) => x - y);
  if (!a.length) return NaN;
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
};
const f = (n, d = 3) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');

console.log(`模式：${ADVANCE ? '擊球動作提前觸發（修後）' : '修前（TOUCH 當下才觸發）'}　樣本 ${SEEDS} 場單局`);
console.log('');
console.log('【觸球那一 tick，擊球動畫的播放進度 t（0..1）】目標＝擊球關鍵幀');
console.log('觸球型別  動畫       目標t   n     實際 t p50/p90    落後幾 tick p50/p90（＋＝人比球慢）');
for (const [kind, list] of Object.entries(rows)) {
  const byType = {};
  for (const r of list) (byType[r.want] ??= []).push(r);
  for (const [want, rs] of Object.entries(byType)) {
    const onSeq = rs.filter((r) => r.type === want);
    const tN = onSeq.map((r) => r.tNorm);
    const err = onSeq.map((r) => r.errTicks);
    console.log(
      `${kind.padEnd(9)} ${want.padEnd(10)} ${f(SEQ_HIT[want], 2)}    ${String(rs.length).padEnd(5)} `
      + `${f(q(tN, 0.5))}/${f(q(tN, 0.9))}       ${f(q(err, 0.5), 1)}/${f(q(err, 0.9), 1)}`
      + (onSeq.length < rs.length ? `　（${rs.length - onSeq.length} 次沒播到該序列）` : ''),
    );
  }
}
console.log('');
console.log('【接球的擊球高度】決定 bump vs overhead（門檻 1.6m）');
const rec = rows.receive;
console.log(`n=${rec.length}　高手接球（ballY≥1.6）占比 ${(rec.filter((r) => r.ballY >= OVERHAND_Y).length / Math.max(rec.length, 1) * 100).toFixed(1)}%`);
console.log('');
console.log(`事前型別判定錯誤率 ${(predStat.wrong / Math.max(predStat.n, 1) * 100).toFixed(1)}%（n=${predStat.n}）`);
console.log('');
console.log('【contactPoint 預測 vs 實際觸球（tick；＋＝球比預測早到，提前量要再加這麼多）】');
for (const [k, arr] of Object.entries(early)) {
  console.log(`${k.padEnd(9)} n=${arr.length} p10=${f(q(arr, 0.1), 1)} p50=${f(q(arr, 0.5), 1)} p90=${f(q(arr, 0.9), 1)}`);
}
if (ADVANCE) {
  console.log('');
  console.log('【提前觸發的命中率】');
  const le = armStats.leadErr;
  console.log(`觸發 ${armStats.fired} 次：被 TOUCH 消耗 ${armStats.consumed}（${(armStats.consumed / Math.max(armStats.fired, 1) * 100).toFixed(1)}%）`
    + `／逾時作廢 ${armStats.expired}（＝對空氣揮擊）／型別誤判 ${armStats.mismatched}`);
  console.log(`預測誤差（實際觸球 − 預定提前量）tick：p10=${f(q(le, 0.1), 1)} p50=${f(q(le, 0.5), 1)} p90=${f(q(le, 0.9), 1)} max=${le.length ? Math.max(...le) : 'n/a'}`);
  console.log(`壓住 TOUCH 卻已播完（該拍無動作）：${starved} 次`);
  const gq = (a) => `p50=${f(q(a, 0.5), 2)} p90=${f(q(a, 0.9), 2)} p99=${f(q(a, 0.99), 2)}`;
  console.log(`觸發當下「人到預測接觸點」的水平距離：命中 ${gq(armStats.gapHit)}／落空 ${gq(armStats.gapMiss)}`);
}
