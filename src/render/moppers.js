// 池底卷 批1 P2：完整擦地員（純表現層，不碰 sim——同 officials.js R1-3 規範）。
// 局間（set_break 窗）與暫停（timeoutHuddleTeam 非 null 窗）觸發：小人快步進場→
// 彎腰擦地來回→退場。仿 officials.js 的 person() 程序化人偶；步態借 geoAnimator
// 髖膝交替慣例（髖/膝反向擺動製造跑步感，見 geoAnimator.js:645-651）——不掛整套
// geoAnimator/geoCharacter 骨架（擦地員是背景小人，不需要完整動作混合系統）。
// 觸發模型仿 crowdAnim.js 的「edge 觸發＋固定時長窗」（不連續輪詢 game.phase/
// timeoutHuddleTeam）：matchLoop 只在窗剛打開那一刻呼叫一次（同 onScore/onSetBreak
// 慣例），演出總長（enterMs+wipeMs*wipeReps+exitMs）遠短於實際窗長（局間卡片要等
// 玩家按繼續、暫停 TIMEOUT_DEAD_TICKS=30s）——確保「窗內出現、窗外不在場景」在
// 真實時序下成立，不必反過來監聽窗何時關閉。
// 崩潰自我停用（永不致死，動畫死了比賽照打）。
import * as THREE from 'three';
import { COURT } from '../sim/constants.js';

// 【試玩必調】擦地演出時間軸（ms）——進場快步／擦地來回單趟／擦地趟數／退場快步
export const MOPPERS = { enterMs: 900, wipeMs: 550, wipeReps: 4, exitMs: 900 };

// 純函式（供測試直測，node 無 THREE 也能驗）：elapsedMs（觸發起算的牆鐘經過時間）
// → 演出階段。phase：'idle'（窗外／播畢，場上不該有人）｜'enter'｜'wipe'｜'exit'；
// t＝該階段內 0..1 進度；wipeIndex＝擦地第幾趟（0-based，只在 phase==='wipe' 有意義）。
export function moppersStateAt(elapsedMs) {
  if (!(elapsedMs >= 0)) return { phase: 'idle', t: 0, wipeIndex: 0 };
  const { enterMs, wipeMs, wipeReps, exitMs } = MOPPERS;
  if (elapsedMs < enterMs) return { phase: 'enter', t: enterMs > 0 ? elapsedMs / enterMs : 1, wipeIndex: 0 };
  const wipeTotal = wipeMs * wipeReps;
  const inWipe = elapsedMs - enterMs;
  if (inWipe < wipeTotal) {
    const idx = Math.min(wipeReps - 1, Math.floor(inWipe / wipeMs));
    return { phase: 'wipe', t: wipeMs > 0 ? (inWipe % wipeMs) / wipeMs : 1, wipeIndex: idx };
  }
  const inExit = inWipe - wipeTotal;
  if (inExit < exitMs) return { phase: 'exit', t: exitMs > 0 ? inExit / exitMs : 1, wipeIndex: wipeReps - 1 };
  return { phase: 'idle', t: 0, wipeIndex: 0 };
}

// 演出總長（ms）——供呼叫端／測試驗算「播畢」邊界
export function moppersTotalMs() {
  return MOPPERS.enterMs + MOPPERS.wipeMs * MOPPERS.wipeReps + MOPPERS.exitMs;
}

const SHIRT = 0x3f7a52; // 場館工作綠背心（與 officials.js 主審深藍 CLOTH 區隔開，一眼認得出身份不同）
const SKIN = 0xc9a58a;
const PANTS = 0x2a2e38;
const MOP_WOOD = 0x8a6a45;
const MOP_HEAD = 0xd8d0c0;

function limb(len, r, color) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 0.85, len, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  m.position.y = -len / 2; // 從樞紐垂下
  return m;
}

// 帶髖/膝關節的一條腿（geoAnimator 髖膝交替慣例：hip 樞紐掛小腿前的 knee 樞紐）
function leg(color) {
  const hip = new THREE.Group();
  hip.add(limb(0.32, 0.05, color));
  const knee = new THREE.Group();
  knee.position.y = -0.32;
  knee.add(limb(0.3, 0.045, color));
  hip.add(knee);
  return { hip, knee };
}

function mopperPerson() {
  const g = new THREE.Group();
  const hipY = 0.62;
  const legs = [leg(PANTS), leg(PANTS)];
  legs[0].hip.position.set(0.08, hipY, 0);
  legs[1].hip.position.set(-0.08, hipY, 0);
  g.add(legs[0].hip, legs[1].hip);

  // 上半身樞紐（彎腰用）——掛在髖之上，身體/頭/拖把手都掛在這裡才會一起前傾
  const waist = new THREE.Group();
  waist.position.set(0, hipY, 0);
  g.add(waist);
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.15, 0.42, 3, 8),
    new THREE.MeshStandardMaterial({ color: SHIRT, roughness: 0.95 }),
  );
  body.position.y = 0.34;
  waist.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 10, 8),
    new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.9 }),
  );
  head.position.y = 0.72;
  waist.add(head);

  // 拖把：肩點樞紐（擦地來回時左右擺）＋斜下桿子＋拖把頭
  const mopArm = new THREE.Group();
  mopArm.position.set(0.16, 0.5, 0.04);
  waist.add(mopArm);
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.95, 6),
    new THREE.MeshStandardMaterial({ color: MOP_WOOD, roughness: 0.8 }),
  );
  handle.position.set(0, -0.42, 0.28);
  handle.rotation.x = -0.5;
  mopArm.add(handle);
  const mopHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.06, 0.16),
    new THREE.MeshStandardMaterial({ color: MOP_HEAD, roughness: 1 }),
  );
  mopHead.position.set(0, -0.85, 0.56);
  mopArm.add(mopHead);

  return { group: g, waist, mopArm, legs };
}

// 跑動步態（借 geoAnimator 髖膝交替慣例）：running=false 時定住（原地小幅屈膝）
function applyGait(legs, tSec, running) {
  const s = running ? Math.sin(tSec * 9) : 0;
  const amp = running ? 0.9 : 0;
  legs[0].hip.rotation.x = -amp * s * 0.6;
  legs[1].hip.rotation.x = amp * s * 0.6;
  legs[0].knee.rotation.x = 0.15 + Math.max(0, amp * s) * 1.1;
  legs[1].knee.rotation.x = 0.15 + Math.max(0, -amp * s) * 1.1;
}

// 入口在場邊（球場外側，A 側後方）、擦地落點在後場一角——簡單直線走位，
// 演出用小人不需要精準路徑規劃（真實感標準線由 officials.js 承擔）
const ENTRY = { x: -(COURT.WIDTH / 2 + 1.6), z: COURT.LENGTH / 2 + 1.4 };
const SPOT = { x: -1.2, z: COURT.LENGTH / 2 - 1.6 };

export function createMoppers(scene) {
  let dead = false;
  let group = null;
  let waist = null;
  let mopArm = null;
  let legs = null;
  let startedAt = -1; // 觸發起算的牆鐘時間；-1＝目前沒有窗在跑
  let visible = false;

  try {
    const built = mopperPerson();
    group = built.group;
    waist = built.waist;
    mopArm = built.mopArm;
    legs = built.legs;
    group.visible = false;
    scene.add(group);
  } catch {
    dead = true; // 建不起來＝整批退場，比賽照打（永不致死）
  }

  function trigger(now) {
    if (dead) return;
    startedAt = now; // 局間/暫停不會同幀重疊，重新起算即可
  }

  return {
    // matchLoop 在 set_break 剛進入那一刻呼叫一次（同 crowdAnim.onSetBreak 慣例）
    onSetBreak(now) { trigger(now); },
    // matchLoop 在暫停集合 edge（timeoutHuddleTeam 剛設值）呼叫一次
    onTimeoutHuddle(now) { trigger(now); },
    update(now) {
      if (dead || startedAt < 0) return; // 窗外零成本早退
      try {
        const st = moppersStateAt(now - startedAt);
        if (st.phase === 'idle') {
          if (visible) { group.visible = false; visible = false; }
          startedAt = -1;
          return;
        }
        if (!visible) { group.visible = true; visible = true; }
        const tSec = now / 1000;
        let x;
        let z;
        let bow;
        let running;
        if (st.phase === 'enter') {
          x = ENTRY.x + (SPOT.x - ENTRY.x) * st.t;
          z = ENTRY.z + (SPOT.z - ENTRY.z) * st.t;
          bow = 0.12;
          running = true;
        } else if (st.phase === 'exit') {
          x = SPOT.x + (ENTRY.x - SPOT.x) * st.t;
          z = SPOT.z + (ENTRY.z - SPOT.z) * st.t;
          bow = 0.12;
          running = true;
        } else {
          // wipe：站定 SPOT，身體隨趟數左右小幅位移＋彎腰＋拖把跟著擺
          const side = st.wipeIndex % 2 === 0 ? 1 : -1;
          const w = Math.sin(Math.PI * st.t); // 0→1→0 單趟包絡
          x = SPOT.x + side * 0.5 * w;
          z = SPOT.z;
          bow = 0.85;
          running = false;
          if (mopArm) mopArm.rotation.z = -side * 0.35 * w;
        }
        group.position.set(x, 0, z);
        if (st.phase !== 'wipe') {
          const dx = st.phase === 'enter' ? SPOT.x - ENTRY.x : ENTRY.x - SPOT.x;
          const dz = st.phase === 'enter' ? SPOT.z - ENTRY.z : ENTRY.z - SPOT.z;
          if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) {
            group.rotation.y = Math.atan2(dx, dz);
          }
          if (mopArm) mopArm.rotation.z = 0;
        } else {
          group.rotation.y = Math.PI; // 擦地時面朝場內
        }
        if (waist) waist.rotation.x = bow;
        applyGait(legs, tSec, running);
      } catch {
        dead = true; // 永不致死：停用自己，比賽照打（無法保證還原可見度，故直接藏起來）
        try { if (group) group.visible = false; } catch { /* 連隱藏都失敗＝放棄，不擋比賽 */ }
      }
    },
  };
}
