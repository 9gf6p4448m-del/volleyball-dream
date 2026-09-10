// Free Ball 街機手感核心：完整三拍攻防閉環（接球 ➔ 舉球 ➔ 扣球/吊球）、單手真實吊球、連續穿網攔網碰撞與直線/斜線扣殺
import * as THREE from 'three';
import {
  calculateLaunchVelocity,
  calculateSpikeVelocity,
  calculateDigVelocity,
  calculateTipVelocity,
  checkBlockCollision,
  checkNetCrossingCollision,
  TIMING_GRADE,
} from '../sim/physicsMath.js';
import { createBallIndicator } from '../render/ballIndicator.js';
import { createFreeballJuice } from '../render/freeballJuice.js';
import { createFreeballVfx } from '../render/freeballVfx.js';
import { createFreeballControls } from '../input/freeballControls.js';
import { createGeoPool, createGeoCharacter } from '../render/geoCharacter.js';
import { createGeoAnimator } from '../render/geoAnimator.js';
import { approachYaw, shortestArc } from '../render/facing.js';

// 回合攻防狀態機
const RALLY_PHASE = {
  SERVE_INBOUND: 'SERVE_INBOUND',   // 一傳接球：發球進場，玩家自主跑位迎球墊球
  SETTER_TOSS: 'SETTER_TOSS',       // 二傳舉球：球飛向二傳手，二傳手到位托出美味開網高球
  APPROACH_SPIKE: 'APPROACH_SPIKE', // 助跑起跳：動能起跳、空中子彈時間、直線/斜線/單手吊球博弈
  BALL_DEAD: 'BALL_DEAD',           // 死球結算：攔網碰撞、落地得分或出界
};

export async function runFreeballSandbox(ctx) {
  const { renderer, scene, camera, quality, ballView, loadingEl, postFx } = ctx;

  if (loadingEl) loadingEl.remove();

  if (renderer && renderer.domElement) {
    renderer.domElement.style.touchAction = 'none';
  }
  document.body.style.touchAction = 'none';
  window.addEventListener(
    'touchmove',
    (e) => {
      // 避免手機瀏覽器下拉重新整理 (pull-to-refresh) 與邊緣滑動切頁
      if (e.touches && e.touches.length <= 1) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // 1. 特效、打擊感與指示圈
  const juice = createFreeballJuice();
  const vfx = createFreeballVfx(scene);
  const indicator = createBallIndicator(scene);

  // 2. 訓練場地邊界與對打裝飾
  const wallGeo = new THREE.BoxGeometry(10, 4.5, 0.3);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1a2336,
    roughness: 0.5,
    metalness: 0.2,
  });
  const trainingWall = new THREE.Mesh(wallGeo, wallMat);
  trainingWall.position.set(0, 2.25, -4.5);
  scene.add(trainingWall);

  const targetGeo = new THREE.RingGeometry(0.8, 1.05, 32);
  const targetMat = new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide });
  const wallTarget = new THREE.Mesh(targetGeo, targetMat);
  wallTarget.position.set(0, 2.2, -4.34);
  scene.add(wallTarget);

  // 空中慢動作瞄準指示落點圈（對手場地）
  const aimMarkerGeo = new THREE.RingGeometry(0.35, 0.5, 32);
  const aimMarkerMat = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const aimMarker = new THREE.Mesh(aimMarkerGeo, aimMarkerMat);
  aimMarker.rotation.x = -Math.PI / 2;
  aimMarker.position.set(0, 0.025, -3.8);
  aimMarker.visible = false;
  scene.add(aimMarker);

  // 3. 建立 3 位 3D 幾何角色（主角、二傳手、對手攔網手）
  const pool = createGeoPool(scene, quality?.shadowSize > 0, 3);
  const playerRig = createGeoCharacter(pool, 'A2', 'A', 1.88, false, '主角');
  const setterRig = createGeoCharacter(pool, 'A1', 'A', 1.82, false, '二傳手');
  const blockerRig = createGeoCharacter(pool, 'B1', 'B', 1.96, false, '攔網手');
  playerRig.root.rotation.order = 'YXZ';
  setterRig.root.rotation.order = 'YXZ';
  blockerRig.root.rotation.order = 'YXZ';
  pool.finishColors();

  const playerAnimator = createGeoAnimator(playerRig);
  const setterAnimator = createGeoAnimator(setterRig);
  const blockerAnimator = createGeoAnimator(blockerRig);

  // 4. 球員狀態
  const player = {
    x: 0,
    y: 0,
    z: 4.6,
    vx: 0,
    vz: 0,
    facingAngle: Math.PI,
    isAirborne: false,
    jumpTime: 0,
    jumpDuration: 0.76,
    jumpApex: 1.15,
    baseReach: 1.88 * 1.31,
  };

  const setter = {
    x: 1.2,
    y: 0,
    z: 1.5,
    facingAngle: -Math.PI * 0.45,
    hasSet: false,
  };

  const blocker = {
    x: 0,
    y: 0,
    z: -0.32,
    vx: 0,
    facingAngle: 0, // 面向己方半場 (+Z)
    isAirborne: false,
    jumpTime: 0,
    jumpDuration: 0.75,
    jumpApex: 0.82,
    reachY: 2.58,
  };

  // 5. 排球物理狀態
  const ball = {
    x: 0,
    y: 2.4,
    z: -4.8,
    vx: 0,
    vy: 0,
    vz: 0,
    radius: 0.105,
    isSpiked: false,
  };

  // 回合狀態機與子彈時間控制
  let rallyPhase = RALLY_PHASE.SERVE_INBOUND;
  let timeScale = 1.0;
  let targetTimeScale = 1.0;

  let comboCount = 0;
  let totalScore = 0;
  let isPhasePending = false;

  // 6. 控制器初始化
  const controls = createFreeballControls(renderer.domElement, camera);

  // 7. 動作按鈕處理（地面：墊球或助跑起跳；空中：直線/斜線扣殺或單手輕吊）
  controls.onAction(({ isAirborne, dragAim, actionType }) => {
    if (!isAirborne) {
      if (rallyPhase === RALLY_PHASE.SERVE_INBOUND) {
        // 地面接球：自主墊球給二傳手
        attemptPlayerDig();
      } else {
        // 地面起跳：助跑動能起跳（Approach Jump）
        const runSpeed = Math.hypot(player.vx, player.vz);
        player.jumpApex = 1.1 + Math.min(runSpeed, 5.0) * 0.12;
        player.isAirborne = true;
        player.jumpTime = 0;
        controls.setAirborne(true, player.jumpApex);
        playerAnimator.trigger('windup');
        vfx.spawnJumpDust(player.x, player.z);

        // 對手攔網手同步起跳！
        triggerBlockerJump();
      }
    } else {
      // 空中動作：單手輕吊 (TIP) 或 直線/斜線扣殺 (LINE / CROSS / SMASH)
      if (actionType === 'TIP') {
        attemptSoftTip();
      } else {
        attemptHardSmash(actionType, dragAim);
      }
    }
  });

  // ── 階段一：發球進場（Serve Inbound）──
  function serveInbound() {
    isPhasePending = false;
    rallyPhase = RALLY_PHASE.SERVE_INBOUND;
    ball.isSpiked = false;

    // 二傳手回網前待命位置（真實排球二傳站位：x ≈ 1.6, z ≈ 1.2）
    setter.x = 1.6;
    setter.y = 0;
    setter.z = 1.2;
    setter.vx = 0;
    setter.vz = 0;
    setter.facingAngle = -Math.PI * 0.45;
    setter.hasSet = false;

    // 攔網手回網前待命
    blocker.x = 0;
    blocker.isAirborne = false;

    // 發球從對手後場發出，劃出弧線飛向我方後場
    const serveStartX = (Math.random() - 0.5) * 2.8;
    ball.x = serveStartX;
    ball.y = 2.4;
    ball.z = -4.8;

    const targetX = THREE.MathUtils.clamp(serveStartX * 0.6 + (Math.random() - 0.5) * 1.6, -2.4, 2.4);
    const targetZ = 4.2 + Math.random() * 1.1;
    const launch = calculateLaunchVelocity(ball, { x: targetX, y: 0.1, z: targetZ }, 3.5);

    ball.vx = launch.vx;
    ball.vy = launch.vy;
    ball.vz = launch.vz;

    showHitBanner('🏐 INBOUND SERVE! 走位接球', '#6ee7ff');
  }

  // ── 階段二：自主走位墊球（Receive / Dig）──
  function attemptPlayerDig() {
    if (rallyPhase !== RALLY_PHASE.SERVE_INBOUND) return;

    playerAnimator.trigger('bump');
    juice.vibrate('dig');

    const horizDist = Math.hypot(ball.x - player.x, ball.z - player.z);
    const heightDelta = ball.y - 0.9;

    if (horizDist <= 1.8 && heightDelta >= -0.7 && heightDelta <= 1.2) {
      // 一傳墊向網前二傳專屬戰術位 (x ≈ 1.1, z ≈ 1.6, y = 2.2)
      const setterTargetPos = { x: 1.1, y: 2.2, z: 1.6 };
      const digResult = calculateDigVelocity(
        ball,
        player,
        setterTargetPos,
        horizDist <= 0.6 ? 1.0 : 0.75
      );

      ball.vx = digResult.vx;
      ball.vy = digResult.vy;
      ball.vz = digResult.vz;
      ball.isSpiked = false;

      vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 1, 0), 0x38ef7d, 2.4);
      showHitBanner('🏐 CLEAN DIG! 一傳到位', '#38ef7d');
      rallyPhase = RALLY_PHASE.SETTER_TOSS;
    } else {
      showHitBanner('MISS! 接球失誤', '#ff6b6b');
      resetCombo();
    }
  }

  // ── 階段三：二傳手頭頂托球（Setter Overhead Toss）──
  function executeSetterToss() {
    setter.hasSet = true;
    setterAnimator.trigger('overhead');
    juice.vibrate('dig');

    // ★ 排球從二傳手頭頂手掌位置發出 ★
    ball.x = setter.x;
    ball.y = 2.18;
    ball.z = setter.z;

    // 開網高球目標點：網前攻擊區 (4號位，x 靠近玩家前方, z = 1.85, 摸高頂點 3.9m)
    const attackX = THREE.MathUtils.clamp(player.x * 0.55, -1.8, 1.8);
    const tossTarget = { x: attackX, y: 1.0, z: 1.85 };

    const launch = calculateLaunchVelocity(ball, tossTarget, 3.9);
    ball.vx = launch.vx;
    ball.vy = launch.vy;
    ball.vz = launch.vz;

    vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 1, 0), 0xffd166, 2.4);
    showHitBanner('⭐ OPEN TOSS! 舉球到位', '#ffd166');

    rallyPhase = RALLY_PHASE.APPROACH_SPIKE;

    // 攔網手提前橫向預判攻擊點
    blocker.x = attackX * 0.75;
  }

  // 對手攔網手起跳
  function triggerBlockerJump() {
    blocker.isAirborne = true;
    blocker.jumpTime = 0;
    // 橫向滑步精準對齊攻擊手扣球點
    const attackX = THREE.MathUtils.clamp(player.x * 0.7, -2.0, 2.0);
    blocker.x = attackX;
    blockerAnimator.trigger('blockJump');
  }

  // ── 階段四 A：真實排球空中單手輕吊球（Airborne Single-Hand Tip）──
  function attemptSoftTip() {
    // ★ 參照真實排球技術：單手高舉過網、指尖/手腕前挑輕送，非雙手托球 ★
    playerAnimator.trigger('tip');

    const currentReachY = player.baseReach + player.y;
    const deltaY = Math.abs(ball.y - currentReachY);
    const horizDist = Math.hypot(ball.x - player.x, ball.z - player.z);

    // 結束慢動作子彈時間
    targetTimeScale = 1.0;
    timeScale = 1.0;

    if (horizDist <= 2.2 && deltaY <= 0.95) {
      // 吊球目標點：越過攔網手頭頂，落入三米線前空檔（Donut Hole: z ≈ -1.35）
      const tipVel = calculateTipVelocity(ball, { x: player.x * 0.35, z: -1.35 });
      ball.vx = tipVel.vx;
      ball.vy = tipVel.vy;
      ball.vz = tipVel.vz;
      ball.isSpiked = true;

      juice.shake(0.04, 0.12);
      vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 1, 0), 0x38ef7d, 2.5);
      showHitBanner('🎯 DOUGHNUT TIP! 單手吊球', '#38ef7d');
      addCombo(150);
      rallyPhase = RALLY_PHASE.BALL_DEAD;
    } else {
      showHitBanner('MISS!', '#ff6b6b');
    }
  }

  // ── 階段四 B：爆裂下釘扣殺（直線 Line vs 斜線 Cross）──
  function attemptHardSmash(actionType, dragAim) {
    playerAnimator.trigger('spike');

    const currentReachY = player.baseReach + player.y;
    const deltaY = Math.abs(ball.y - currentReachY);
    const horizDist = Math.hypot(ball.x - player.x, ball.z - player.z);

    // 結束慢動作子彈時間，瞬間恢復全速
    targetTimeScale = 1.0;
    timeScale = 1.0;

    if (horizDist <= 2.2 && deltaY <= 0.95) {
      let grade = TIMING_GRADE.GOOD;
      let score = 0.8;
      if (deltaY <= 0.22) {
        grade = TIMING_GRADE.PERFECT;
        score = 1.0;
      } else if (deltaY <= 0.45) {
        grade = TIMING_GRADE.GOOD;
        score = 0.75;
      } else {
        grade = TIMING_GRADE.LATE;
        score = 0.4;
      }

      // ★ 根據手勢/輸入判斷：直線 (Line Shot) vs 大斜線 (Cross Shot) ★
      let targetX = 0;
      let targetZ = -4.0;
      let shotLabel = '⚡ GOOD SPIKE';

      if (actionType === 'LINE') {
        // 直線扣殺：沿著球員當前 X 軸平行直釘對手底線邊角！
        targetX = THREE.MathUtils.clamp(player.x, -3.6, 3.6);
        targetZ = -4.6;
        shotLabel = '🔥 LINE SHOT 直線重扣!';
      } else if (actionType === 'CROSS_LEFT') {
        // 大斜線（左）：銳利斜向對手左側半場
        targetX = -3.4;
        targetZ = -3.8;
        shotLabel = '⚡ CROSS SHOT 銳利左斜線!';
      } else if (actionType === 'CROSS_RIGHT') {
        // 大斜線（右）：銳利斜向對手右側半場
        targetX = 3.4;
        targetZ = -3.8;
        shotLabel = '⚡ CROSS SHOT 銳利右斜線!';
      } else {
        // 預設或搖桿微調
        const aimDir = controls.getAimDirection();
        if (aimDir) {
          targetX = THREE.MathUtils.clamp(player.x + aimDir.x * 6.5, -4.0, 4.0);
          targetZ = THREE.MathUtils.clamp(player.z + aimDir.z * 6.5, -5.2, -2.5);
          shotLabel = Math.abs(targetX - player.x) > 1.8 ? '⚡ CROSS SHOT 斜線重扣!' : '🔥 LINE SHOT 直線重扣!';
        } else {
          // 根據球員站位智能分流：左側扣大右斜線，右側扣大左斜線
          targetX = player.x > 0 ? -2.6 : 2.6;
          targetZ = -4.2;
          shotLabel = '⚡ CROSS SHOT 斜線重扣!';
        }
      }

      const spikeVel = calculateSpikeVelocity(ball, { x: targetX, z: targetZ }, 24, score, grade);
      ball.vx = spikeVel.vx;
      ball.vy = spikeVel.vy;
      ball.vz = spikeVel.vz;
      ball.isSpiked = true;
      rallyPhase = RALLY_PHASE.BALL_DEAD;

      // 擊球打擊反饋
      if (grade === TIMING_GRADE.PERFECT) {
        juice.impactPerfect();
        vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, -0.4, 0.9), 0x38ef7d, 4.5);
        showHitBanner(shotLabel, '#38ef7d');
        addCombo(250);
      } else {
        juice.shake(0.08, 0.15);
        juice.vibrate('spike');
        vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, -0.4, 0.9), 0xffd166, 3.0);
        showHitBanner(shotLabel, '#ffd166');
        addCombo(120);
      }
    } else {
      showHitBanner('MISS!', '#ff6b6b');
    }
  }

  function addCombo(pts) {
    comboCount += 1;
    totalScore += pts * Math.min(comboCount, 5);
    ui.updateScore(totalScore, comboCount);
  }

  function resetCombo() {
    comboCount = 0;
    ui.updateScore(totalScore, comboCount);
  }

  // 8. 建立沙盒 UI 疊層（純手勢全螢幕沉浸介面）
  const ui = buildSandboxUi({
    onResetBall: serveInbound,
    onExit: () => {
      window.location.href = window.location.pathname;
    },
  });

  function showHitBanner(text, color) {
    ui.banner.textContent = text;
    ui.banner.style.color = color;
    ui.banner.style.opacity = '1';
    ui.banner.style.transform = 'translate(-50%, -50%) scale(1.15)';
    setTimeout(() => {
      ui.banner.style.opacity = '0';
      ui.banner.style.transform = 'translate(-50%, -50%) scale(0.9)';
    }, 850);
  }

  // 開局發第一球！
  serveInbound();

  // 9. 主模擬與渲染迴圈
  let lastTime = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // ★ Free Ball 空中慢動作子彈時間（Bullet Time / Focus Mode）★
    const inSpikeZone = player.isAirborne && !ball.isSpiked && ball.y >= 2.0 && ball.z >= 0.6 && ball.z <= 3.4;
    if (inSpikeZone) {
      targetTimeScale = 0.28;
    } else {
      targetTimeScale = 1.0;
    }
    timeScale = THREE.MathUtils.lerp(timeScale, targetTimeScale, 0.2);

    const simDt = dt * timeScale;

    // 結算打擊頓幀與動態 FOV
    const juiceResult = juice.update(dt);
    if (juiceResult.isFrozen) {
      if (postFx) postFx.render(scene, camera);
      else renderer.render(scene, camera);
      return;
    }

    // 動態 FOV 更新（子彈時間微推 52°，扣殺暴衝 63°）
    if (camera.isPerspectiveCamera) {
      const slowMoFovOffset = inSpikeZone ? -3.0 : 0;
      camera.fov = juiceResult.fov + slowMoFovOffset;
      camera.updateProjectionMatrix();
    }

    // A. 玩家跑位與面向
    const moveInput = controls.getMoveInput();
    const speed = 5.0;
    player.vx = THREE.MathUtils.lerp(player.vx, moveInput.x * speed, 0.22);
    player.vz = THREE.MathUtils.lerp(player.vz, moveInput.z * speed, 0.22);

    player.x += player.vx * simDt;
    player.z += player.vz * simDt;

    player.x = THREE.MathUtils.clamp(player.x, -4.2, 4.2);
    player.z = THREE.MathUtils.clamp(player.z, 0.4, 7.8);

    const moveMag = Math.hypot(player.vx, player.vz);
    let targetYaw = Math.PI;

    if (player.isAirborne) {
      const aimDir = controls.getAimDirection();
      if (aimDir) targetYaw = Math.atan2(aimDir.x, aimDir.z);
      else targetYaw = Math.atan2(0 - player.x, -2.5 - player.z);
    } else if (moveMag > 0.25) {
      targetYaw = Math.atan2(player.vx, player.vz);
    } else {
      targetYaw = Math.PI;
    }

    player.facingAngle = approachYaw(player.facingAngle, targetYaw, simDt);

    // 玩家起跳滯空
    if (player.isAirborne) {
      player.jumpTime += simDt;
      const prog = player.jumpTime / player.jumpDuration;
      if (prog < 1.0) {
        player.y = player.jumpApex * Math.sin(prog * Math.PI);
      } else {
        player.y = 0;
        player.isAirborne = false;
        controls.setAirborne(false, 0);
        playerAnimator.trigger('landSoft');
        targetTimeScale = 1.0;
      }
    } else {
      player.y = 0;
    }

    const lateral = moveMag > 0.25
      ? Math.sin(shortestArc(player.facingAngle, Math.atan2(player.vx, player.vz)))
      : 0;
    const bodyY = playerAnimator.update(simDt, moveMag, lateral, 1.0);

    const groundOffset = player.isAirborne ? 0 : bodyY;
    playerRig.root.position.set(player.x, player.y + groundOffset, player.z);
    playerRig.root.rotation.y = player.facingAngle;

    // B. 二傳手 AI（主動奔跑追球、計算落點，手掌精確觸球瞬間托出）
    if (rallyPhase === RALLY_PHASE.SETTER_TOSS && !setter.hasSet) {
      // 根據排球拋物線解出球下落至頭頂觸球高度 (y ≈ 2.15m) 時的精確攔截點
      let interceptX = ball.x;
      let interceptZ = ball.z;
      const disc = ball.vy * ball.vy + 19.62 * (ball.y - 2.15);
      if (disc >= 0) {
        const tDescend = (ball.vy + Math.sqrt(disc)) / 9.81;
        if (tDescend > 0) {
          interceptX = THREE.MathUtils.clamp(ball.x + ball.vx * tDescend, -1.8, 3.2);
          interceptZ = THREE.MathUtils.clamp(ball.z + ball.vz * tDescend, 0.8, 3.0);
        }
      }

      const dx = interceptX - setter.x;
      const dz = interceptZ - setter.z;
      const distToTarget = Math.hypot(dx, dz);

      let setterRunSpeed = 0;
      if (distToTarget > 0.08) {
        setterRunSpeed = Math.min(distToTarget / Math.max(simDt, 0.016), 5.5);
        const dirX = dx / distToTarget;
        const dirZ = dz / distToTarget;
        setter.vx = THREE.MathUtils.lerp(setter.vx, dirX * setterRunSpeed, 0.35);
        setter.vz = THREE.MathUtils.lerp(setter.vz, dirZ * setterRunSpeed, 0.35);
        setter.x += setter.vx * simDt;
        setter.z += setter.vz * simDt;
        setter.facingAngle = approachYaw(setter.facingAngle, Math.atan2(setter.vx, setter.vz), simDt * 9.0);
      } else {
        setter.vx = 0;
        setter.vz = 0;
        // 站定位後面向 4 號位主攻手預備托球
        setter.facingAngle = approachYaw(setter.facingAngle, -Math.PI * 0.45, simDt * 6.0);
      }

      // 驅動二傳手跑步步態（腿部真正邁步奔跑！）
      const setterBodyY = setterAnimator.update(simDt, setterRunSpeed, 0, 1.0);
      setterRig.root.position.set(setter.x, setter.y + setterBodyY, setter.z);
      setterRig.root.rotation.y = setter.facingAngle;

      // ★ 觸球判定關鍵修復：球必須下落到二傳手摸高頭頂、且二傳手真正接觸到球才托出！ ★
      const horizDistToBall = Math.hypot(ball.x - setter.x, ball.z - setter.z);
      const isDescending = ball.vy <= 0.6; // 球已過弧線頂點開始下落
      const isAtHandHeight = ball.y <= 2.30 && ball.y >= 1.85; // 手掌頭頂高度
      const isTouchingBall = horizDistToBall <= 0.45; // 真正觸球距離

      if (isDescending && isAtHandHeight && isTouchingBall) {
        executeSetterToss();
      }
    } else {
      const setterBodyY = setterAnimator.update(simDt, 0, 0, 1.0);
      setterRig.root.position.set(setter.x, setter.y + setterBodyY, setter.z);
      setterRig.root.rotation.y = setter.facingAngle;
    }

    // C. 攔網手 AI（在慢動作下同步起跳封網）
    if (blocker.isAirborne) {
      blocker.jumpTime += simDt;
      const prog = blocker.jumpTime / blocker.jumpDuration;
      if (prog < 1.0) {
        blocker.y = blocker.jumpApex * Math.sin(prog * Math.PI);
      } else {
        blocker.y = 0;
        blocker.isAirborne = false;
      }
    } else if (rallyPhase === RALLY_PHASE.APPROACH_SPIKE) {
      // 橫向平移對齊扣球點
      blocker.x = THREE.MathUtils.lerp(blocker.x, THREE.MathUtils.clamp(player.x * 0.7, -2.0, 2.0), 0.1);
    }
    const blockerBodyY = blockerAnimator.update(simDt, 0, 0, 1.0);
    blockerRig.root.position.set(blocker.x, blocker.y + blockerBodyY, blocker.z);
    blockerRig.root.rotation.y = blocker.facingAngle;

    // 更新幾何球員 InstancedMesh 池矩陣
    playerRig.root.updateMatrixWorld(true);
    setterRig.root.updateMatrixWorld(true);
    blockerRig.root.updateMatrixWorld(true);

    for (const part of playerRig.parts) pool.writeMatrix(part, part.node.matrixWorld);
    for (const part of setterRig.parts) pool.writeMatrix(part, part.node.matrixWorld);
    for (const part of blockerRig.parts) pool.writeMatrix(part, part.node.matrixWorld);
    pool.markDirty();

    // D. 排球物理模擬與連續穿網攔網碰撞檢測
    const prevBallPos = { x: ball.x, y: ball.y, z: ball.z };
    ball.vy -= 9.81 * simDt;
    ball.x += ball.vx * simDt;
    ball.y += ball.vy * simDt;
    ball.z += ball.vz * simDt;
    const currBallPos = { x: ball.x, y: ball.y, z: ball.z };

    // 自主防守走位兜底（若玩家直接走位貼近落點自動墊球）
    if (rallyPhase === RALLY_PHASE.SERVE_INBOUND && ball.y <= 1.6 && ball.vz > 0) {
      const d = Math.hypot(ball.x - player.x, ball.z - player.z);
      if (d <= 0.9) {
        attemptPlayerDig();
      }
    }

    // ★ 關鍵修正：連續穿網攔網碰撞檢測（Continuous Net-Crossing Check）★
    // 當球向對手半場高速飛越球網平面 (z ≈ 0) 時，進行射線與攔網手阻擋盒相交檢測
    if (ball.isSpiked && ball.vz < 0 && blocker.isAirborne) {
      const blockerActualReach = blocker.reachY + blocker.y;
      const blockCol = checkNetCrossingCollision(
        prevBallPos,
        currBallPos,
        { vx: ball.vx, vy: ball.vy, vz: ball.vz },
        blocker,
        blockerActualReach,
        0.95 // block width
      );

      if (blockCol.hit) {
        ball.x = blockCol.contactPoint.x;
        ball.y = blockCol.contactPoint.y;
        ball.z = blockCol.contactPoint.z;
        ball.vx = blockCol.reflectedVel.vx;
        ball.vy = blockCol.reflectedVel.vy;
        ball.vz = blockCol.reflectedVel.vz;

        if (blockCol.type === 'ROOF') {
          // 正面攔死（Solid Roof Block）
          juice.impactRoofBlock();
          vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 0, 1), 0xff4b4b, 4.0);
          showHitBanner('🚫 ROOF BLOCKED! 正面攔死', '#ff4b4b');
          resetCombo();
        } else {
          // 打手出界（Tool / Wipe Off Block）
          juice.impactTool();
          vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(1, 0, 0), 0xffd166, 3.6);
          showHitBanner('⚡ TOOL OFF BLOCK! 打手出界', '#ffd166');
          addCombo(200);
        }
      }
    }

    // 牆面反彈判定
    if (ball.z <= -4.25 && ball.vz < 0) {
      ball.z = -4.25;
      ball.vz = -ball.vz * 0.7;
      ball.vy = Math.max(ball.vy * 0.6, 3.2);
      ball.vx *= 0.8;
      juice.shake(0.08, 0.14);
      vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 0, 1), 0xffd166, 3.0);
    }

    // 地面著地判定
    if (ball.y <= ball.radius) {
      ball.y = ball.radius;
      vfx.spawnFloorImpact(ball.x, ball.z, ball.isSpiked ? 0xff416c : 0xffd166);

      if (ball.isSpiked) {
        ball.vy = Math.abs(ball.vy) * 0.55;
        if (!isPhasePending) {
          isPhasePending = true;
          if (ball.z < 0) {
            showHitBanner('🔥 POINT SCORED! 得分', '#38ef7d');
            addCombo(100);
          } else {
            showHitBanner('✕ BALL DOWN! 落地', '#ff4b4b');
            resetCombo();
          }
          setTimeout(serveInbound, 750);
        }
      } else if (!isPhasePending) {
        isPhasePending = true;
        resetCombo();
        showHitBanner('✕ BALL DOWN! 未接起', '#ff4b4b');
        setTimeout(serveInbound, 750);
      }
      ball.vx *= 0.85;
      ball.vz *= 0.85;
    }

    // 出界保護
    if ((ball.z > 11 || ball.z < -8 || Math.abs(ball.x) > 9 || ball.y < -1) && !isPhasePending) {
      isPhasePending = true;
      resetCombo();
      setTimeout(serveInbound, 550);
    }

    // 同步排球視覺
    if (ballView && typeof ballView.sync === 'function') {
      const ballSim = {
        x: ball.x,
        y: ball.y,
        z: ball.z,
        px: prevBallPos.x,
        py: prevBallPos.y,
        pz: prevBallPos.z,
        vx: ball.vx,
        vy: ball.vy,
        vz: ball.vz,
      };
      ballView.sync(ballSim, 1.0, simDt, false, ball.isSpiked ? 0.85 : 0);
    }

    // E. 雙環指示圈更新
    let targetHitHeight = 0.9;
    if (rallyPhase === RALLY_PHASE.SETTER_TOSS) targetHitHeight = 2.2;
    else if (player.isAirborne) targetHitHeight = player.baseReach + player.jumpApex * 0.85;
    indicator.update(ball, targetHitHeight, ball.vy);

    // 空中慢動作落點瞄準光環即時更新
    if (inSpikeZone) {
      aimMarker.visible = true;
      const aimState = controls.getAimState();
      let targetX = 0;
      let targetZ = -4.0;
      if (aimState.shotType === 'LINE') {
        targetX = THREE.MathUtils.clamp(player.x, -3.6, 3.6);
        targetZ = -4.6;
        aimMarkerMat.color.setHex(0xff416c);
        ui.focusBadge.textContent = '⏳ FOCUS: 直線重扣 (LINE)';
      } else if (aimState.shotType === 'CROSS_LEFT') {
        targetX = -3.4;
        targetZ = -3.8;
        aimMarkerMat.color.setHex(0xffd166);
        ui.focusBadge.textContent = '⏳ FOCUS: 左斜線 (CROSS ◀)';
      } else if (aimState.shotType === 'CROSS_RIGHT') {
        targetX = 3.4;
        targetZ = -3.8;
        aimMarkerMat.color.setHex(0xffd166);
        ui.focusBadge.textContent = '⏳ FOCUS: 右斜線 (CROSS ▶)';
      } else if (aimState.shotType === 'TIP') {
        targetX = player.x * 0.35;
        targetZ = -1.35;
        aimMarkerMat.color.setHex(0x38ef7d);
        ui.focusBadge.textContent = '⏳ FOCUS: 單手吊球 (TIP 🎯)';
      } else {
        targetX = player.x > 0 ? -2.6 : 2.6;
        targetZ = -4.0;
        aimMarkerMat.color.setHex(0x6ee7ff);
        ui.focusBadge.textContent = '⏳ FOCUS SLOW-MO (滑動選線路)';
      }
      aimMarker.position.set(targetX, 0.025, targetZ);
    } else {
      aimMarker.visible = false;
    }

    // F. 特效更新（不受慢動作影響，保持流暢）
    vfx.update(dt);

    // G. 第三人稱動態相機（手機直向/橫向自適應）
    const isPortrait = window.innerWidth < window.innerHeight;
    const targetCamX = player.x * 0.65;
    const targetCamY = 3.6 + player.y * 0.35 + (isPortrait ? 1.4 : 0);
    const targetCamZ = player.z + 5.2 + (isPortrait ? 2.8 : 0);

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.08) + juiceResult.shakeOffset.x;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.08) + juiceResult.shakeOffset.y;
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.08) + juiceResult.shakeOffset.z;
    camera.lookAt(player.x * 0.35, 1.8 + player.y * 0.2, player.z - 4.5);

    // H. 更新 UI 狀態（手機搖桿、情境動作鈕與戰術提示）
    const uiState = controls.getUiState();
    ui.update({
      uiState,
      rallyPhase,
      inSpikeZone,
      isAirborne: player.isAirborne,
    });

    // 渲染畫面
    if (postFx) postFx.render(scene, camera);
    else renderer.render(scene, camera);
  }

  requestAnimationFrame(frame);
}

// 構建手機原生手感專屬 UI（純手勢全螢幕沉浸介面）
function buildSandboxUi({ onResetBall, onExit }) {
  const root = document.createElement('div');
  root.id = 'freeball-sandbox-ui';
  root.style.cssText = [
    'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:20',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'touch-action:none', 'user-select:none', '-webkit-user-select:none',
  ].join(';');
  document.body.appendChild(root);

  // 輕微觸覺回饋
  function haptic(ms = 18) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(ms);
      }
    } catch {
      // ignore
    }
  }

  // 1. 頂部安全區狀態列
  const topBar = document.createElement('div');
  topBar.style.cssText = [
    'position:absolute', 'top:calc(env(safe-area-inset-top, 0px) + 12px)',
    'left:50%', 'transform:translateX(-50%)',
    'background:rgba(18,24,38,0.88)', 'border:1px solid rgba(110,231,255,0.4)',
    'padding:6px 16px', 'border-radius:24px', 'color:#eef2fa',
    'display:flex', 'align-items:center', 'gap:12px', 'font-size:clamp(11px, 2.8vw, 13px)', 'font-weight:700',
    'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)',
    'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
    'pointer-events:none', 'white-space:nowrap', 'max-width:92vw', 'overflow:hidden',
  ].join(';');
  topBar.innerHTML = `
    <span style="color:#6ee7ff;">🏐 FREE BALL</span>
    <span style="color:#8b9bb4;">|</span>
    <span id="fb-score" style="color:#ffd166;">SCORE: 0</span>
    <span id="fb-combo" style="color:#ff416c;font-size:13px;">COMBO x0</span>
  `;
  root.appendChild(topBar);

  const scoreEl = topBar.querySelector('#fb-score');
  const comboEl = topBar.querySelector('#fb-combo');

  // 2. 戰術引導教練提示條（手機端即時戰術語音/文字引導）
  const coachHint = document.createElement('div');
  coachHint.id = 'fb-coach-hint';
  coachHint.style.cssText = [
    'position:absolute', 'top:calc(env(safe-area-inset-top, 0px) + 48px)',
    'left:50%', 'transform:translateX(-50%)',
    'background:rgba(14,20,32,0.85)', 'border:1px solid rgba(110,231,255,0.3)',
    'padding:5px 14px', 'border-radius:18px', 'color:#eef2fa',
    'font-size:clamp(11px, 2.9vw, 13px)', 'font-weight:700',
    'backdrop-filter:blur(6px)', '-webkit-backdrop-filter:blur(6px)',
    'box-shadow:0 4px 14px rgba(0,0,0,0.4)', 'pointer-events:none',
    'white-space:nowrap', 'max-width:90vw', 'overflow:hidden', 'text-overflow:ellipsis',
    'transition:opacity 0.2s ease, transform 0.2s ease',
  ].join(';');
  coachHint.textContent = '🏐 準備接球';
  root.appendChild(coachHint);

  // 3. 子彈時間慢動作徽章
  const focusBadge = document.createElement('div');
  focusBadge.textContent = '⏳ FOCUS SLOW-MO (滑動選線路)';
  focusBadge.style.cssText = [
    'position:absolute', 'top:calc(env(safe-area-inset-top, 0px) + 82px)',
    'left:50%', 'transform:translateX(-50%)',
    'background:rgba(255,209,102,0.92)', 'color:#121826',
    'font-size:clamp(11px, 2.8vw, 12px)', 'font-weight:900',
    'padding:4px 14px', 'border-radius:12px',
    'box-shadow:0 0 16px rgba(255,209,102,0.8)',
    'display:none', 'letter-spacing:1px', 'pointer-events:none',
  ].join(';');
  root.appendChild(focusBadge);

  // 4. 返回按鈕
  const exitBtn = document.createElement('button');
  exitBtn.textContent = '✕ 返回';
  exitBtn.style.cssText = [
    'position:absolute', 'top:calc(env(safe-area-inset-top, 0px) + 12px)',
    'left:calc(env(safe-area-inset-left, 0px) + 12px)',
    'background:#1e2738', 'color:#eef2fa', 'border:1px solid #4a5c7a',
    'padding:6px 14px', 'border-radius:16px', 'font-weight:700', 'cursor:pointer',
    'pointer-events:auto', 'font-size:12px', 'backdrop-filter:blur(6px)',
    'touch-action:none',
  ].join(';');
  exitBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    haptic(15);
    onExit();
  });
  root.appendChild(exitBtn);

  // 5. 重新發球按鈕
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '↺ 發球';
  resetBtn.style.cssText = [
    'position:absolute', 'top:calc(env(safe-area-inset-top, 0px) + 12px)',
    'right:calc(env(safe-area-inset-right, 0px) + 12px)',
    'background:#2a364f', 'color:#ffd166', 'border:1px solid #ffd166',
    'padding:6px 14px', 'border-radius:16px', 'font-weight:700', 'cursor:pointer',
    'pointer-events:auto', 'font-size:12px', 'backdrop-filter:blur(6px)',
    'touch-action:none',
  ].join(';');
  resetBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    haptic(15);
    onResetBall();
  });
  root.appendChild(resetBtn);

  // 6. 左手浮動虛擬搖桿（現代手遊玻璃擬態風格）
  const joystickBase = document.createElement('div');
  joystickBase.style.cssText = [
    'position:absolute', 'width:116px', 'height:116px', 'border-radius:50%',
    'border:2px solid rgba(110,231,255,0.5)', 'background:radial-gradient(circle, rgba(110,231,255,0.12) 0%, rgba(18,28,45,0.6) 75%)',
    'transform:translate(-50%, -50%)', 'pointer-events:none', 'display:none',
    'box-shadow:0 0 20px rgba(110,231,255,0.3)', 'backdrop-filter:blur(4px)',
  ].join(';');
  root.appendChild(joystickBase);

  const joystickKnob = document.createElement('div');
  joystickKnob.style.cssText = [
    'position:absolute', 'width:48px', 'height:48px', 'border-radius:50%',
    'background:linear-gradient(135deg, #6ee7ff, #0077ff)', 'transform:translate(-50%, -50%)',
    'pointer-events:none', 'display:none', 'box-shadow:0 0 16px rgba(110,231,255,0.85)',
  ].join(';');
  root.appendChild(joystickKnob);

  // 7. 打擊反饋 Banner
  const banner = document.createElement('div');
  banner.style.cssText = [
    'position:absolute', 'top:38%', 'left:50%', 'transform:translate(-50%, -50%) scale(0.9)',
    'font-size:clamp(24px, 6vw, 32px)', 'font-weight:900', 'text-shadow:0 3px 14px rgba(0,0,0,0.9)',
    'letter-spacing:1px', 'opacity:0', 'transition:all 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    'pointer-events:none', 'white-space:nowrap',
  ].join(';');
  root.appendChild(banner);

  return {
    root,
    banner,
    focusBadge,
    coachHint,
    joystickBase,
    joystickKnob,

    updateScore: (score, combo) => {
      scoreEl.textContent = `SCORE: ${score}`;
      comboEl.textContent = combo > 1 ? `🔥 COMBO x${combo}` : '';
    },

    update: ({ uiState, rallyPhase, inSpikeZone, isAirborne }) => {
      // 1. 搖桿更新
      if (uiState.joystick.active) {
        joystickBase.style.display = 'block';
        joystickBase.style.left = `${uiState.joystick.ox}px`;
        joystickBase.style.top = `${uiState.joystick.oy}px`;
        joystickKnob.style.display = 'block';
        joystickKnob.style.left = `${uiState.joystick.x}px`;
        joystickKnob.style.top = `${uiState.joystick.y}px`;
      } else {
        joystickBase.style.display = 'none';
        joystickKnob.style.display = 'none';
      }

      // 2. 慢動作焦點徽章更新
      focusBadge.style.display = inSpikeZone ? 'block' : 'none';

      // 3. 戰術引導教練提示更新
      if (rallyPhase === 'SERVE_INBOUND') {
        coachHint.textContent = '🏐 走位迎球，右側點擊【墊球】';
        coachHint.style.color = '#6ee7ff';
        coachHint.style.borderColor = 'rgba(110,231,255,0.45)';
      } else if (rallyPhase === 'SETTER_TOSS') {
        coachHint.textContent = '⭐ 舉球員積極跑位就位中！右側點擊【助跑起跳】';
        coachHint.style.color = '#ffd166';
        coachHint.style.borderColor = 'rgba(255,209,102,0.45)';
      } else if (inSpikeZone) {
        coachHint.textContent = '⏳ 空中慢動作：上滑吊球 ｜ 下滑直線 ｜ 斜滑斜線';
        coachHint.style.color = '#ff416c';
        coachHint.style.borderColor = 'rgba(255,65,108,0.5)';
      } else if (isAirborne) {
        coachHint.textContent = '⚡ 滯空瞄準中...';
        coachHint.style.color = '#ffd166';
        coachHint.style.borderColor = 'rgba(255,209,102,0.45)';
      } else {
        coachHint.textContent = '🏐 準備下一波進攻';
        coachHint.style.color = '#eef2fa';
        coachHint.style.borderColor = 'rgba(110,231,255,0.3)';
      }
    },
  };
}
