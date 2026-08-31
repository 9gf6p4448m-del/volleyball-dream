// 真實感卷 批1：裁判可視化（純表現層，不碰 sim——R1-3）
// 主審（網柱側裁判台，得分＝手臂指向得分方半場）＋兩名司線員（對角後角，
// OUT＝落點側舉旗）。程序化剪影（沿 arena 零模型檔路線），死球窗外零更新（R1-4）。
// 時序對齊既有哨音：與 sfx 同一批 DEAD_BALL/SCORE 事件驅動，不自己判定任何規則。
import * as THREE from 'three';
import { COURT } from '../sim/constants.js';

// 【試玩必調】手勢/舉旗演出窗長（ms）
export const OFFICIALS = { gestureMs: 1800, flagMs: 1800, swingMs: 220 };

const CLOTH = 0x2a3350; // 深藍制服（夜賽剪影色系）
const SKIN = 0xc9a58a;

function limb(len, r, color) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 0.85, len, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  m.position.y = -len / 2; // 從樞紐垂下
  return m;
}

function person(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.16, 0.5, 3, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
  );
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.9 }),
  );
  head.position.y = 1.55;
  g.add(head);
  return g;
}

export function createOfficials(scene) {
  let dead = false;
  let group = null;
  let refArm = null; // 主審右臂樞紐（指向手勢＝繞 x 旋轉）
  const judges = []; // { pivot, corner:{x,z}, flagUntil, raised }
  let gesture = null; // { targetRotX, until }
  let idle = true; // 窗外零更新閘
  let lastNow = null; // 擺臂用實際 dt（不鎖幀：rAF 跟裝置更新率）

  try {
    group = new THREE.Group();
    const postX = COURT.WIDTH / 2 + (COURT.NET_OVERHANG ?? 0.5);

    // 主審：網柱外側裁判台＋人（站高過網，俯視全場）
    const standX = -(postX + 0.55);
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 1.35, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x39404f, roughness: 0.9 }),
    );
    stand.position.set(standX, 0.675, 0);
    group.add(stand);
    const ref = person(CLOTH);
    ref.position.set(standX, 1.35, 0);
    ref.rotation.y = Math.PI / 2; // 面向球場（+x）
    group.add(ref);
    refArm = new THREE.Group();
    refArm.position.set(0.2, 1.42, 0); // 肩點（人局部座標）
    refArm.add(limb(0.5, 0.045, CLOTH));
    ref.add(refArm);

    // 司線員 ×2（對角後角，面向場中）＋手持旗
    for (const s of [1, -1]) {
      const corner = { x: s * (COURT.WIDTH / 2 + 0.9), z: -s * (COURT.LENGTH / 2 + 0.9) };
      const j = person(0x40485c);
      j.position.set(corner.x, 0, corner.z);
      j.lookAt(0, 1.0, 0);
      group.add(j);
      const pivot = new THREE.Group();
      pivot.position.set(0.2, 1.42, 0);
      const arm = limb(0.42, 0.04, 0x40485c);
      pivot.add(arm);
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.22),
        new THREE.MeshBasicMaterial({ color: 0xd94f4f, side: THREE.DoubleSide }),
      );
      flag.position.set(0.15, -0.5, 0);
      pivot.add(flag);
      j.add(pivot);
      judges.push({ pivot, corner, flagUntil: 0 });
    }
    scene.add(group);
  } catch {
    dead = true; // 建不起來＝整批退場，比賽照打（R1-4 永不致死）
  }

  return {
    // matchLoop applyEvents 餵同一批事件（與 sfx 同源時序，R1-2）
    onEvents(events) {
      if (dead) return;
      try {
        let winner = null;
        let db = null;
        for (const e of events) {
          if (e.type === 'SCORE') winner = e.team;
          if (e.type === 'DEAD_BALL') db = e;
        }
        if (!db || !winner) return;
        const now = performance.now();
        // A 半場在 z>0（TEAM_SIDE.A=1）：指向手勢＝臂朝該側擺平
        gesture = { targetRotX: winner === 'A' ? -1.35 : 1.35, until: now + OFFICIALS.gestureMs };
        if (db.reason === 'OUT' && db.at) {
          let best = null;
          let bd = Infinity;
          for (const j of judges) {
            const d = Math.hypot(j.corner.x - db.at.x, j.corner.z - db.at.z);
            if (d < bd) { bd = d; best = j; }
          }
          if (best) best.flagUntil = now + OFFICIALS.flagMs;
        }
        idle = false;
      } catch {
        dead = true;
      }
    },
    update(now) {
      if (dead || idle) { lastNow = now; return; } // 死球窗外零更新（R1-4）
      try {
        const dt = Math.min(64, Math.max(1, lastNow == null ? 16 : now - lastNow));
        lastNow = now;
        const step = (dt / OFFICIALS.swingMs) * 1.6; // 全程擺幅 ~1.35rad / swingMs
        let active = false;
        if (refArm) {
          const target = gesture && now < gesture.until ? gesture.targetRotX : 0;
          const d = target - refArm.rotation.x;
          if (Math.abs(d) > 0.01) {
            refArm.rotation.x += Math.sign(d) * Math.min(Math.abs(d), step);
            active = true;
          } else {
            refArm.rotation.x = target;
          }
          if (target !== 0) active = true;
        }
        for (const j of judges) {
          const target = now < j.flagUntil ? Math.PI : 0; // 舉正上方
          const d = target - j.pivot.rotation.x;
          if (Math.abs(d) > 0.01) {
            j.pivot.rotation.x += Math.sign(d) * Math.min(Math.abs(d), step);
            active = true;
          } else {
            j.pivot.rotation.x = target;
          }
          if (target !== 0) active = true;
        }
        if (!active) idle = true; // 全部歸位＝回到零更新
      } catch {
        dead = true;
      }
    },
  };
}
