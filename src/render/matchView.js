// 比賽球員視覺：12 名模型對映 sim actors（只讀 sim 狀態＋插值，絕不寫回）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { SIM_DT } from '../sim/constants.js';
import { TEAM_SIDE, positionOf, isFrontRow } from '../sim/rotation.js';
import { createAnimator } from './animator.js';

const OVERHAND_Y = 1.6; // 擊球高度高於此＝高手動作，低於＝低手墊球（表現層判定）
const TAG_COLORS = { A: '#6ee7ff', B: '#ff9d7a' };

const RUN_BLEND_SPEED = 3.0; // 每秒動畫權重切換速率
const TURN_K = 25;           // 轉身收斂率（1/秒，指數衰減；排球轉身要快，慢了像背對球）
const RUN_AT = 1.2;          // 高於此移速（m/s）視為跑動

export async function createMatchView(scene, quality, game, initialControlledId, forcePose = null) {
  let highlightId = initialControlledId; // 全隊輪控：光圈與「你」標籤跟著受控者
  const gltf = await new GLTFLoader().loadAsync(
    `${import.meta.env.BASE_URL}models/${quality.model}`,
  );
  const source = gltf.scene;
  const clips = gltf.animations;
  const bbox = new THREE.Box3().setFromObject(source);
  const baseHeight = bbox.max.y - bbox.min.y || 1;
  const castShadow = quality.shadowSize > 0;

  const idleClip = clips.find((c) => c.name === 'Idle') ?? clips[0] ?? null;
  const runClip = clips.find((c) => c.name === 'Run')
    ?? clips.find((c) => c.name === 'Walk') ?? idleClip;
  const tposeClip = clips.find((c) => c.name === 'TPose') ?? null;

  // 隊服顏色：兩隊各一組共享材質（A＝藍白、B＝暗紅）——第一眼分隊
  const teamMats = { A: new Map(), B: new Map() };
  const TEAM_TINT = { A: new THREE.Color(0.62, 0.78, 1.15), B: new THREE.Color(1.2, 0.62, 0.58) };
  function jerseyMaterial(orig, teamId) {
    const cache = teamMats[teamId];
    if (!cache.has(orig)) {
      const m = orig.clone();
      m.color = m.color.clone().multiply(TEAM_TINT[teamId]);
      cache.set(orig, m);
    }
    return cache.get(orig);
  }

  const units = {};
  for (const p of Object.values(game.players)) {
    const inst = cloneSkeleton(source);
    inst.scale.setScalar(p.height.current / baseHeight);
    inst.rotation.y = TEAM_SIDE[p.teamId] === 1 ? Math.PI : 0; // 面向球網
    inst.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = castShadow;
        o.frustumCulled = false; // 蒙皮動作超出原始包圍盒，關掉避免消失
        o.material = jerseyMaterial(o.material, p.teamId); // 隊服套色
      }
    });
    scene.add(inst);

    const mixer = new THREE.AnimationMixer(inst);
    const idle = idleClip ? mixer.clipAction(idleClip) : null;
    const run = runClip && runClip !== idleClip ? mixer.clipAction(runClip) : null;

    // 取 T-Pose 基準（絕對姿勢用）：暫時只播 TPose 取樣一幀、記下手臂鏈的局部旋轉
    let tposeRef = null;
    if (tposeClip) {
      const tp = mixer.clipAction(tposeClip);
      tp.play();
      tp.setEffectiveWeight(1);
      mixer.update(0.001);
      tposeRef = captureArmRef(inst);
      tp.stop();
      mixer.uncacheAction(tposeClip);
    }
    if (idle) { idle.play(); idle.setEffectiveWeight(1); }
    if (run) { run.play(); run.setEffectiveWeight(0); }

    units[p.id] = {
      inst, mixer, idle, run, runWeight: 0, yaw: inst.rotation.y,
      animator: createAnimator(inst, tposeRef),
      tag: makeTag(scene),
      tagText: '',
      tagY: p.height.current + 0.45,
    };
  }

  // 玩家操控者足下光圈（一眼找到自己；「這球歸你」時轉橘紅示警）
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.55, 40),
    new THREE.MeshBasicMaterial({ color: 0x6ee7ff, transparent: true, opacity: 0.85 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  scene.add(ring);
  let ringHot = false;

  // 比賽事件 → 姿勢觸發（表現層唯讀路由）
  function routeEvents(events) {
    for (const e of events) {
      const u = units[e.playerId];
      if (!u) continue;
      if (e.type === 'SERVE') u.animator.trigger('serve');
      else if (e.type === 'BLOCK_TOUCH') u.animator.trigger('block');
      else if (e.type === 'TOUCH') {
        if (e.kind === 'spike') u.animator.trigger('spike');
        else if (e.kind === 'set') u.animator.trigger('overhead');
        else u.animator.trigger(e.ballY >= OVERHAND_Y ? 'overhead' : 'bump');
      }
    }
  }

  return {
    count: Object.keys(units).length,
    // 輸入層要求播放姿勢（如玩家按下起跳的 windup；sim 事件觸發的仍走 routeEvents）
    triggerPose(playerId, type) {
      units[playerId]?.animator.trigger(type);
    },
    setControlled(id) { highlightId = id; },
    // 「這球歸你」：光圈變橘紅＋放大脈動
    setHot(hot) {
      if (hot === ringHot) return;
      ringHot = hot;
      ring.material.color.setHex(hot ? 0xff8c42 : 0x6ee7ff);
      ring.scale.setScalar(hot ? 1.35 : 1);
    },
    // alpha＝步間插值；dt＝畫面幀時間；frameEvents＝本幀 sim 事件（驅動姿勢）
    sync(gameState, alpha, dt, frameEvents = []) {
      routeEvents(frameEvents);
      for (const [id, u] of Object.entries(units)) {
        // 舉手備戰：①攔網窗開著（真的在攔）②對方進攻組織中且我在網前（攔網就位）
        // ——②讓攻擊方「讀攔網」時真的看得到那道手牆與縫隙（純視覺，起跳時機仍歸 sim）
        if (forcePose) {
          u.animator.setHold(forcePose);
        } else {
          const teamB = gameState.players[id].teamId;
          const r = gameState.rally;
          const ready =
            gameState.phase === 'rally' &&
            r.possession && r.possession !== teamB && r.touches >= 1 &&
            isFrontRow(gameState.match.rotations[teamB], id) &&
            Math.abs(gameState.actors[id].z) < 2.2;
          u.animator.setHold(
            gameState.actors[id].blockUntil >= gameState.tick || ready ? 'block' : null,
          );
        }
        const a = gameState.actors[id];
        const x = a.px + (a.x - a.px) * alpha;
        const z = a.pz + (a.z - a.pz) * alpha;
        u.inst.position.set(x, 0, z);

        // 頭上標籤：輪轉位置編號（P1–P6；玩家標「你」）——輪轉可目視驗證
        const team0 = gameState.players[id].teamId;
        const pos = positionOf(gameState.match.rotations[team0], id);
        const text = (id === highlightId ? '你P' : 'P') + pos;
        if (text !== u.tagText) {
          u.tagText = text;
          drawTag(u.tag, text, TAG_COLORS[team0]);
        }
        u.tag.sprite.position.set(x, u.tagY, z);

        const vx = (a.x - a.px) / SIM_DT;
        const vz = (a.z - a.pz) / SIM_DT;
        const speed = Math.hypot(vx, vz);

        // 朝向：rally 中所有人面向球（真實排球全程追球，後退＝墊步）；
        // 球到近身/頭頂時改面向「來球方向」（球速反向）——接球者面對球飛來的那側
        const team = gameState.players[id].teamId;
        const netYaw = TEAM_SIDE[team] === 1 ? Math.PI : 0;
        let targetYaw = netYaw;
        if (gameState.phase === 'rally') {
          const b = gameState.ball;
          const bdx = b.x - x;
          const bdz = b.z - z;
          if (Math.hypot(bdx, bdz) > 1.1) {
            targetYaw = Math.atan2(bdx, bdz);
          } else {
            const bvx = b.x - b.px;
            const bvz = b.z - b.pz;
            targetYaw = Math.hypot(bvx, bvz) > 1e-4
              ? Math.atan2(-bvx, -bvz) // 面向來球
              : u.yaw;
          }
        }
        u.yaw += shortestArc(u.yaw, targetYaw) * (1 - Math.exp(-TURN_K * dt));
        u.inst.rotation.y = u.yaw;

        // 動畫：Idle ↔ Run 權重混合
        const want = speed > RUN_AT ? 1 : 0;
        u.runWeight += Math.sign(want - u.runWeight) *
          Math.min(Math.abs(want - u.runWeight), RUN_BLEND_SPEED * dt);
        if (u.run) u.run.setEffectiveWeight(u.runWeight);
        if (u.idle) u.idle.setEffectiveWeight(1 - u.runWeight * 0.85);
        u.mixer.update(dt);
        // 姿勢層疊在 mixer 取樣之上；回傳值＝跳躍/屈膝的垂直位移
        u.inst.position.y = u.animator.update(dt);

        if (id === highlightId) {
          ring.position.x = x;
          ring.position.z = z;
        }
      }
    },
  };
}

// 取樣手臂鏈（肩/上臂/前臂/手）在 T-Pose 的局部旋轉——絕對姿勢的乾淨基準
const ARM_REF_KEYS = [
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
];
function captureArmRef(inst) {
  const ref = {};
  for (const key of ARM_REF_KEYS) {
    const bone = inst.getObjectByName(`mixamorig${key}`)
      ?? inst.getObjectByName(`mixamorig:${key}`);
    if (bone) ref[key] = bone.quaternion.clone();
  }
  return ref;
}

function shortestArc(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---- 頭上標籤（canvas sprite）----

function makeTag(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 56;
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  sprite.scale.set(0.9, 0.4, 1);
  sprite.renderOrder = 5;
  scene.add(sprite);
  return { sprite, canvas, texture };
}

function drawTag(tag, text, color) {
  const ctx = tag.canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 56);
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(12,16,26,0.85)';
  ctx.strokeText(text, 64, 28);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 28);
  tag.texture.needsUpdate = true;
}
