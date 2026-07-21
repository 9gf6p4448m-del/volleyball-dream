// 比賽球員視覺：12 名模型對映 sim actors（只讀 sim 狀態＋插值，絕不寫回）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { SIM_DT } from '../sim/constants.js';
import { TEAM_SIDE } from '../sim/rotation.js';
import { createAnimator } from './animator.js';

const OVERHAND_Y = 1.6; // 擊球高度高於此＝高手動作，低於＝低手墊球（表現層判定）

const RUN_BLEND_SPEED = 3.0; // 每秒動畫權重切換速率
const TURN_LERP = 0.18;      // 轉身平滑
const RUN_AT = 1.2;          // 高於此移速（m/s）視為跑動

export async function createMatchView(scene, quality, game, highlightId, forcePose = null) {
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

  const units = {};
  for (const p of Object.values(game.players)) {
    const inst = cloneSkeleton(source);
    inst.scale.setScalar(p.height.current / baseHeight);
    inst.rotation.y = TEAM_SIDE[p.teamId] === 1 ? Math.PI : 0; // 面向球網
    inst.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = castShadow;
        o.frustumCulled = false; // 蒙皮動作超出原始包圍盒，關掉避免消失
      }
    });
    scene.add(inst);

    const mixer = new THREE.AnimationMixer(inst);
    const idle = idleClip ? mixer.clipAction(idleClip) : null;
    const run = runClip && runClip !== idleClip ? mixer.clipAction(runClip) : null;
    if (idle) { idle.play(); idle.setEffectiveWeight(1); }
    if (run) { run.play(); run.setEffectiveWeight(0); }
    units[p.id] = {
      inst, mixer, idle, run, runWeight: 0, yaw: inst.rotation.y,
      animator: createAnimator(inst),
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
        // 攔網窗開著＝持續舉手備戰；forcePose＝恆定持姿（?pose= 調角度用）
        if (forcePose) {
          u.animator.setHold(forcePose);
        } else {
          u.animator.setHold(
            gameState.actors[id].blockUntil >= gameState.tick ? 'block' : null,
          );
        }
        const a = gameState.actors[id];
        const x = a.px + (a.x - a.px) * alpha;
        const z = a.pz + (a.z - a.pz) * alpha;
        u.inst.position.set(x, 0, z);

        const vx = (a.x - a.px) / SIM_DT;
        const vz = (a.z - a.pz) / SIM_DT;
        const speed = Math.hypot(vx, vz);

        // 朝向：移動時面向移動方向，靜止回望球網
        const team = gameState.players[id].teamId;
        const targetYaw = speed > 0.3
          ? Math.atan2(vx, vz)
          : (TEAM_SIDE[team] === 1 ? Math.PI : 0);
        u.yaw += shortestArc(u.yaw, targetYaw) * TURN_LERP;
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

function shortestArc(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
