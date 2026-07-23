// 幾何關節球員的程序化動畫（表現層，唯讀 sim）
// 取代 Mixamo 疊加層：關節軸向自訂（肩/髖 x 負＝往前擺、spine x 正＝前傾），
// 動作＝分段關鍵姿勢插值（引臂→觸球→收勢，時長沿用實測調參值）＋跑動/待命循環
// 【試玩必調】角度全在 POSES、時序全在 SEQUENCES
const RUN_FULL_SPEED = 4.5;  // 此移速＝跑姿權重 1
const STRIDE_BASE = 5.0;     // 步頻底速（rad/s）
const STRIDE_PER_MS = 2.4;   // 每 m/s 增加的步頻

// 姿勢：rSh/lSh=[肩x, 肩z]、rEl/lEl=肘x、spine/neck=x、crouch=下蹲深度(m)
const POSES = {
  bumpReady: { rSh: [-0.95, -0.24], lSh: [-0.95, 0.24], rEl: 0, lEl: 0, spine: 0.5, neck: -0.35, crouch: 0.2 },
  bumpHit: { rSh: [-1.2, -0.24], lSh: [-1.2, 0.24], rEl: 0, lEl: 0, spine: 0.32, neck: -0.3, crouch: 0.08 },
  setReach: { rSh: [-2.3, 0.3], lSh: [-2.3, -0.3], rEl: -1.0, lEl: -1.0, spine: -0.04, neck: -0.45, crouch: 0.06 },
  setPush: { rSh: [-2.72, 0.26], lSh: [-2.72, -0.26], rEl: -0.25, lEl: -0.25, spine: 0, neck: -0.3 },
  spikeWind: { rSh: [-2.5, -0.38], lSh: [-2.1, 0.15], rEl: -1.9, lEl: -0.3, spine: -0.24, neck: -0.2 },
  spikeHit: { rSh: [-2.82, -0.05], lSh: [-0.85, 0.2], rEl: -0.08, lEl: -0.4, spine: 0.18, neck: -0.05 },
  spikeFollow: { rSh: [-0.6, -0.1], lSh: [-0.45, 0.15], rEl: -0.5, lEl: -0.3, spine: 0.46, neck: 0.1 },
  blockUp: { rSh: [-2.95, 0.12], lSh: [-2.95, -0.12], rEl: 0, lEl: 0, spine: 0.04, neck: -0.15 },
  blockPunch: { rSh: [-2.52, 0.1], lSh: [-2.52, -0.1], rEl: 0, lEl: 0, spine: 0.3, neck: -0.2 },
  windup: { rSh: [-2.35, -0.35], lSh: [-2.0, 0.15], rEl: -1.8, lEl: -0.3, spine: -0.2, neck: -0.18 },
  land: { spine: 0.2, crouch: 0.26 },
  // 魚躍撲救（身體前傾由 matchView 的 root.rotation.x 主導＝接近水平飛撲）：這裡只管
  // 手臂大幅前伸夠球＋抬頭看球。diveReach＝撲出觸球（雙臂前伸平墊）、diveSprawl＝落地撐地
  diveReach: { rSh: [-1.78, -0.3], lSh: [-1.78, 0.3], rEl: 0, lEl: 0, spine: 0.1, neck: 0.42, crouch: 0.1 },
  diveSprawl: { rSh: [-1.35, -0.26], lSh: [-1.35, 0.26], rEl: -0.12, lEl: -0.12, spine: 0.22, neck: 0.26, crouch: 0.32 },
  // 爬起：雙手撐地（肘大彎）、身體半推起、收腿——恢復期的過渡，避免「垂直彈起」殭屍感
  divePush: { rSh: [-0.5, -0.34], lSh: [-0.5, 0.34], rEl: -0.98, lEl: -0.98, spine: 0.32, neck: 0.05, crouch: 0.55 },
};

// 動作序列（at: 0..1；jump=跳高 m；時長為既有實測調參值，勿隨意動）
const SEQUENCES = {
  bump: { dur: 0.5, jump: 0, land: false, keys: [{ at: 0, p: 'bumpReady' }, { at: 0.45, p: 'bumpHit' }, { at: 1, p: 'bumpReady' }] },
  overhead: { dur: 0.55, jump: 0, land: false, keys: [{ at: 0, p: 'setReach' }, { at: 0.5, p: 'setPush' }, { at: 1, p: 'setReach' }] },
  spike: { dur: 0.6, jump: 0.55, land: true, keys: [{ at: 0, p: 'spikeWind' }, { at: 0.42, p: 'spikeHit' }, { at: 1, p: 'spikeFollow' }] },
  serve: { dur: 0.72, jump: 0.3, land: false, keys: [{ at: 0, p: 'spikeWind' }, { at: 0.5, p: 'spikeHit' }, { at: 1, p: 'spikeFollow' }] },
  block: { dur: 0.7, jump: 0.34, land: true, keys: [{ at: 0, p: 'blockUp' }, { at: 0.4, p: 'blockPunch' }, { at: 1, p: 'blockUp' }] },
  windup: { dur: 0.75, jump: 0.5, land: false, keys: [{ at: 0, p: 'windup' }, { at: 1, p: 'windup' }] },
  cheer: { dur: 0.9, jump: 0.26, land: false, keys: [{ at: 0, p: 'blockUp' }, { at: 1, p: 'blockUp' }] },
  // 魚躍：備戰→撲出手臂前伸→趴地；dur≈倒地恢復（42tick/60≈0.7s），撲空也演完整套
  // 備戰→撲出手臂前伸→趴地→撐地爬起→站回；爬起段(diveSprawl→divePush→bumpReady)避免殭屍彈起
  dive: { dur: 0.72, jump: 0, land: false, keys: [{ at: 0, p: 'bumpReady' }, { at: 0.16, p: 'diveReach' }, { at: 0.46, p: 'diveSprawl' }, { at: 0.72, p: 'divePush' }, { at: 1, p: 'bumpReady' }] },
};

const ATTACK_MS = 0.08;
const RELEASE_MS = 0.2;
const LAND_FROM = 0.72;

function lerp(a, b, f) { return a + (b - a) * f; }
function poseVal(p, key, def = 0) { return p[key] ?? def; }
function poseArm(p, key) { return p[key] ?? REST_ARM; }
const REST_ARM = [0, 0];

export function createGeoAnimator(rig) {
  const j = rig.joints;
  let current = null; // { seq, t }
  let hold = null;
  let runW = 0;
  let phase = 0;
  const blended = {};

  function blendKeys(seq, t, out) {
    const keys = seq.keys;
    let i = 0;
    while (i < keys.length - 1 && t > keys[i + 1].at) i += 1;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    const span = Math.max(b.at - a.at, 1e-4);
    const f = Math.min(Math.max((t - a.at) / span, 0), 1);
    const pa = POSES[a.p];
    const pb = POSES[b.p];
    for (const k of ['rSh', 'lSh']) {
      const ra = poseArm(pa, k);
      const rb = poseArm(pb, k);
      out[k] = [lerp(ra[0], rb[0], f), lerp(ra[1], rb[1], f)];
    }
    for (const k of ['rEl', 'lEl', 'spine', 'neck', 'crouch']) {
      out[k] = lerp(poseVal(pa, k), poseVal(pb, k), f);
    }
  }

  return {
    trigger(type) {
      const seq = SEQUENCES[type];
      if (!seq) return;
      // 空中接續（windup→spike）：延續跳躍弧、不落地重跳
      const carry = current && current.seq.jump > 0 && seq.jump > 0
        ? Math.min(current.t / current.seq.dur, 0.5) * seq.dur
        : 0;
      current = { seq, t: carry };
    },
    setHold(type) { hold = type; },
    isIdle() { return current === null; },

    // 每幀驅動全部關節；回傳 bodyY（跳躍－下蹲的垂直位移，由呼叫端寫進 root.position.y）
    update(dt, speed) {
      // 跑姿權重與步相位（幀率無關的指數收斂）
      const runTarget = Math.min(speed / RUN_FULL_SPEED, 1);
      runW += (runTarget - runW) * (1 - Math.exp(-10 * dt));
      phase += dt * (STRIDE_BASE + speed * STRIDE_PER_MS);
      const s = Math.sin(phase);

      // 動作層權重
      let w = 0;
      let jumpY = 0;
      let pose = null;
      if (current) {
        current.t += dt;
        const { seq } = current;
        if (current.t >= seq.dur) {
          current = null;
        } else {
          const t = current.t / seq.dur;
          w = Math.min(Math.min(current.t / ATTACK_MS, 1), Math.min((seq.dur - current.t) / RELEASE_MS, 1));
          blendKeys(seq, t, blended);
          pose = blended;
          if (seq.jump > 0) jumpY = seq.jump * Math.sin(t * Math.PI);
          if (seq.land && t > LAND_FROM) {
            const lf = (t - LAND_FROM) / (1 - LAND_FROM);
            blended.crouch += POSES.land.crouch * lf;
            blended.spine += POSES.land.spine * lf;
          }
        }
      }
      if (!pose && hold && SEQUENCES[hold]) {
        blendKeys(SEQUENCES[hold], 0, blended);
        pose = blended;
        w = 1;
      }

      // 底層：待命（微蹲備戰＋呼吸）↔ 跑動（擺腿擺臂＋前傾＋起伏）
      const breath = Math.sin(phase * 0.35) * 0.02;
      const legSwing = 0.62 * runW;
      const armSwing = 0.5 * runW;
      const idleW = 1 - runW;
      const baseSpine = 0.16 * runW + 0.07 * idleW + breath;
      const crouch = (pose ? blended.crouch * w : 0) + 0.02 * idleW;

      // 腿：跑動擺動＋下蹲屈膝（動作層的 crouch 轉成膝/髖角度——蹲得像蹲不像沉地）
      j.rHip.rotation.x = -legSwing * s - crouch * 1.1;
      j.lHip.rotation.x = legSwing * s - crouch * 1.1;
      j.rKnee.rotation.x = (0.12 + Math.max(0, -s) * 0.95) * runW + 0.14 * idleW + crouch * 2.2;
      j.lKnee.rotation.x = (0.12 + Math.max(0, s) * 0.95) * runW + 0.14 * idleW + crouch * 2.2;

      // 軀幹/頭
      j.spine.rotation.x = pose ? lerp(baseSpine, blended.spine, w) : baseSpine;
      j.spine.rotation.y = 0;
      j.neck.rotation.x = pose ? lerp(-0.04, blended.neck, w) : -0.04;

      // 手臂：跑動反向擺（無動作時）→ 動作姿勢（有動作時）
      const restElbow = -0.35 * idleW - 0.6 * runW;
      const armX = { r: armSwing * s - 0.12 * idleW, l: -armSwing * s - 0.12 * idleW };
      for (const side of ['r', 'l']) {
        const sh = j[`${side}Shoulder`];
        const el = j[`${side}Elbow`];
        const arm = pose ? blended[`${side}Sh`] : null;
        sh.rotation.x = pose ? lerp(armX[side], arm[0], w) : armX[side];
        sh.rotation.z = pose ? lerp(0, arm[1], w) : 0;
        el.rotation.x = pose ? lerp(restElbow, blended[`${side}El`], w) : restElbow;
      }

      // 垂直位移：跳躍弧－下蹲；跑動小起伏
      const bob = -0.03 * runW * (0.5 + 0.5 * Math.cos(phase * 2));
      return jumpY - crouch * 0.55 + bob;
    },
  };
}
