// Free Ball 街機手感核心：空中子彈時間 (Slow-Mo Focus)、二傳高托與同步攔網博弈
import * as THREE from 'three';
import {
  calculateLaunchVelocity,
  calculateSpikeVelocity,
  calculateDigVelocity,
  calculateTipVelocity,
  checkBlockCollision,
  TIMING_GRADE,
} from '../sim/physicsMath.js';
import { createBallIndicator } from '../render/ballIndicator.js';
import { createFreeballJuice } from '../render/freeballJuice.js';
import { createFreeballVfx } from '../render/freeballVfx.js';
import { createFreeballControls } from '../input/freeballControls.js';
import { createGeoPool, createGeoCharacter } from '../render/geoCharacter.js';
import { createGeoAnimator } from '../render/geoAnimator.js';
import { approachYaw, shortestArc } from '../render/facing.js';

export async function runFreeballSandbox(ctx) {
  const { renderer, scene, camera, quality, ballView, loadingEl, postFx } = ctx;

  if (loadingEl) loadingEl.remove();

  if (renderer && renderer.domElement) {
    renderer.domElement.style.touchAction = 'none';
  }

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
    jumpApex: 0.78,
    reachY: 2.58,
  };

  // 5. 排球物理狀態
  const ball = {
    x: 0,
    y: 3.5,
    z: 2.0,
    vx: 0,
    vy: 0,
    vz: 0,
    radius: 0.105,
    isSpiked: false,
  };

  // 子彈時間（Bullet Time / Slow Motion）控制
  let timeScale = 1.0;
  let targetTimeScale = 1.0;

  let comboCount = 0;
  let totalScore = 0;
  let isTossLoopPending = false;

  // 6. 控制器初始化
  const controls = createFreeballControls(renderer.domElement, camera);

  // 7. 動作按鈕處理
  controls.onAction(({ isAirborne, dragAim, actionType }) => {
    if (!isAirborne) {
      // 地面動作：助跑動能起跳（Approach Jump）
      const runSpeed = Math.hypot(player.vx, player.vz);
      player.jumpApex = 1.1 + Math.min(runSpeed, 5.0) * 0.12;
      player.isAirborne = true;
      player.jumpTime = 0;
      controls.setAirborne(true, player.jumpApex);
      playerAnimator.trigger('windup');
      vfx.spawnJumpDust(player.x, player.z);

      // 對手攔網手同步起跳！
      triggerBlockerJump();
    } else {
      // 空中動作：扣殺 (SMASH) 或 輕吊 (TIP)
      if (actionType === 'TIP') {
        attemptSoftTip();
      } else {
        attemptHardSmash(dragAim);
      }
    }
  });

  // 二傳手主動托出美味開網高球（100% 穩定，帶 overhead 托球動作）
  function feedSetterToss() {
    isTossLoopPending = false;
    ball.isSpiked = false;

    // 二傳手站位與面向
    setter.x = 1.2;
    setter.z = 1.5;
    setter.facingAngle = -Math.PI * 0.45;

    // 播放二傳手 overhead 舉球動畫
    setterAnimator.trigger('overhead');
    juice.vibrate('dig');

    // 球從二傳手頭頂位置送出
    ball.x = setter.x;
    ball.y = 2.15;
    ball.z = setter.z;

    // 攻擊目標點：網前開網區 (x 靠近玩家前方, z = 1.9, apex = 3.9m)
    const attackX = THREE.MathUtils.clamp(player.x * 0.5, -1.8, 1.8);
    const tossTarget = { x: attackX, y: 1.0, z: 1.9 };

    const launch = calculateLaunchVelocity(ball, tossTarget, 3.9);
    ball.vx = launch.vx;
    ball.vy = launch.vy;
    ball.vz = launch.vz;

    vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 1, 0), 0xffd166, 2.2);
    showHitBanner('── 🏐 OPEN TOSS! ──', '#ffd166');
  }

  // 對手攔網手起跳
  function triggerBlockerJump() {
    blocker.isAirborne = true;
    blocker.jumpTime = 0;
    // 橫向滑步對齊扣球點
    const attackX = THREE.MathUtils.clamp(player.x * 0.65, -2.0, 2.0);
    blocker.x = attackX;
    blockerAnimator.trigger('blockJump');
  }

  // 輕吊球（Soft Tip / Roll Shot）
  function attemptSoftTip() {
    playerAnimator.trigger('overhead');
    const currentReachY = player.baseReach + player.y;
    const deltaY = Math.abs(ball.y - currentReachY);
    const horizDist = Math.hypot(ball.x - player.x, ball.z - player.z);

    // 結束慢動作子彈時間
    targetTimeScale = 1.0;
    timeScale = 1.0;

    if (horizDist <= 2.2 && deltaY <= 0.85) {
      const tipVel = calculateTipVelocity(ball, { x: player.x * 0.3, z: -1.6 });
      ball.vx = tipVel.vx;
      ball.vy = tipVel.vy;
      ball.vz = tipVel.vz;
      ball.isSpiked = true;

      juice.shake(0.04, 0.12);
      vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 1, 0), 0x38ef7d, 2.5);
      showHitBanner('🎯 DOUGHNUT TIP!', '#38ef7d');
      addCombo(150);
    } else {
      showHitBanner('MISS!', '#ff6b6b');
    }
  }

  // 爆裂下釘扣殺（Power Smash）
  function attemptHardSmash(dragAim) {
    playerAnimator.trigger('spike');
    const currentReachY = player.baseReach + player.y;
    const deltaY = Math.abs(ball.y - currentReachY);
    const horizDist = Math.hypot(ball.x - player.x, ball.z - player.z);

    // 結束慢動作子彈時間，瞬間恢復全速！
    targetTimeScale = 1.0;
    timeScale = 1.0;

    if (horizDist <= 2.2 && deltaY <= 0.85) {
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

      // 瞄準點計算
      let targetX = 0;
      let targetZ = -3.5;
      const aimDir = controls.getAimDirection();
      if (aimDir) {
        targetX = player.x + aimDir.x * 6.5;
        targetZ = player.z + aimDir.z * 6.5;
      }

      const spikeVel = calculateSpikeVelocity(ball, { x: targetX, z: targetZ }, 24, score, grade);

      ball.vx = spikeVel.vx;
      ball.vy = spikeVel.vy;
      ball.vz = spikeVel.vz;
      ball.isSpiked = true;

      // 攔網手碰撞檢測（攔網手在空中）
      const blockerActualReach = blocker.reachY + blocker.y;
      const blockCollision = checkBlockCollision(
        ball,
        spikeVel,
        blocker,
        blockerActualReach,
        0.9
      );

      if (blocker.isAirborne && blockCollision.hit) {
        if (blockCollision.type === 'ROOF') {
          // 正面攔死（Solid Roof Block）
          ball.vx = blockCollision.reflectedVel.vx;
          ball.vy = blockCollision.reflectedVel.vy;
          ball.vz = blockCollision.reflectedVel.vz;
          juice.impactRoofBlock();
          vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 0, 1), 0xff4b4b, 3.8);
          showHitBanner('🚫 ROOF BLOCKED!', '#ff4b4b');
          resetCombo();
        } else {
          // 打手出界（Tool / Wipe off block）
          ball.vx = blockCollision.reflectedVel.vx;
          ball.vy = blockCollision.reflectedVel.vy;
          ball.vz = blockCollision.reflectedVel.vz;
          juice.impactTool();
          vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(1, 0, 0), 0xffd166, 3.5);
          showHitBanner('⚡ TOOL OFF BLOCK!', '#ffd166');
          addCombo(200);
        }
      } else {
        // 清爽超音速重扣
        if (grade === TIMING_GRADE.PERFECT) {
          juice.impactPerfect();
          vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, -0.4, 0.9), 0x38ef7d, 4.5);
          showHitBanner('🔥 PERFECT SMASH!', '#38ef7d');
          addCombo(250);
        } else {
          juice.shake(0.08, 0.15);
          juice.vibrate('spike');
          vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, -0.4, 0.9), 0xffd166, 3.0);
          showHitBanner('⚡ GOOD SPIKE', '#ffd166');
          addCombo(120);
        }
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

  // 8. 建立沙盒 UI 疊層
  const ui = buildSandboxUi({
    onResetBall: feedSetterToss,
    onTipClick: () => controls.triggerAction('TIP'),
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

  // 開局二傳手直接托出第一球！
  feedSetterToss();

  // 9. 主模擬與渲染迴圈
  let lastTime = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // ★ Free Ball 空中慢動作子彈時間（Bullet Time / Focus Mode）★
    // 當玩家處於起跳滯空狀態且球正在下落、尚未擊出時：
    // 時間流速降為 0.28x（慢動作），給玩家充足的時機瞄準、觀察攔網手與選擇扣殺/吊球！
    const inSpikeZone = player.isAirborne && !ball.isSpiked && ball.y >= 2.0 && ball.z >= 0.6 && ball.z <= 3.2;
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

    // B. 二傳手更新（待命與 overhead 動畫驅動）
    const setterBodyY = setterAnimator.update(simDt, 0, 0, 1.0);
    setterRig.root.position.set(setter.x, setter.y + setterBodyY, setter.z);
    setterRig.root.rotation.y = setter.facingAngle;

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
    } else {
      // 橫向平移對齊球的 X 座標
      blocker.x = THREE.MathUtils.lerp(blocker.x, THREE.MathUtils.clamp(ball.x * 0.75, -2.0, 2.0), 0.1);
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

    // D. 排球物理模擬
    ball.vy -= 9.81 * simDt;
    ball.x += ball.vx * simDt;
    ball.y += ball.vy * simDt;
    ball.z += ball.vz * simDt;

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
        if (ball.vy < 1.0 && !isTossLoopPending) {
          isTossLoopPending = true;
          setTimeout(feedSetterToss, 650);
        }
      } else if (!isTossLoopPending) {
        isTossLoopPending = true;
        resetCombo();
        setTimeout(feedSetterToss, 650);
      }
      ball.vx *= 0.85;
      ball.vz *= 0.85;
    }

    // 出界保護
    if ((ball.z > 11 || ball.z < -8 || Math.abs(ball.x) > 9 || ball.y < -1) && !isTossLoopPending) {
      isTossLoopPending = true;
      resetCombo();
      setTimeout(feedSetterToss, 450);
    }

    // 同步排球視覺
    if (ballView && typeof ballView.sync === 'function') {
      const ballSim = {
        x: ball.x,
        y: ball.y,
        z: ball.z,
        px: ball.x - ball.vx * simDt,
        py: ball.y - ball.vy * simDt,
        pz: ball.z - ball.vz * simDt,
        vx: ball.vx,
        vy: ball.vy,
        vz: ball.vz,
      };
      ballView.sync(ballSim, 1.0, simDt, false, ball.isSpiked ? 0.85 : 0);
    }

    // E. 雙環指示圈更新
    const targetHitHeight = player.isAirborne ? (player.baseReach + player.jumpApex * 0.85) : 0.9;
    indicator.update(ball, targetHitHeight, ball.vy);

    // F. 特效更新（不受慢動作影響，保持流暢）
    vfx.update(dt);

    // G. 第三人稱動態相機
    const targetCamX = player.x * 0.65;
    const targetCamY = 3.6 + player.y * 0.35;
    const targetCamZ = player.z + 5.2;

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.08) + juiceResult.shakeOffset.x;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.08) + juiceResult.shakeOffset.y;
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.08) + juiceResult.shakeOffset.z;
    camera.lookAt(player.x * 0.35, 1.8 + player.y * 0.2, player.z - 4.5);

    // H. 更新 UI 狀態
    const uiState = controls.getUiState();
    if (uiState.actionState === 'SPIKE') {
      ui.actionBtn.textContent = '⚡ 扣殺 (下劃)';
      ui.actionBtn.style.background = 'linear-gradient(135deg, #ff416c, #ff4b2b)';
      ui.actionBtn.style.boxShadow = '0 0 20px rgba(255, 75, 43, 0.7)';
      ui.tipBtn.style.display = 'flex';
      ui.focusBadge.style.display = inSpikeZone ? 'block' : 'none';
    } else {
      ui.actionBtn.textContent = '助跑起跳 (JUMP)';
      ui.actionBtn.style.background = 'linear-gradient(135deg, #2193b0, #6dd5ed)';
      ui.actionBtn.style.boxShadow = '0 0 14px rgba(33, 147, 176, 0.4)';
      ui.tipBtn.style.display = 'none';
      ui.focusBadge.style.display = 'none';
    }

    if (uiState.joystick.active) {
      ui.joystickBase.style.display = 'block';
      ui.joystickBase.style.left = `${uiState.joystick.ox}px`;
      ui.joystickBase.style.top = `${uiState.joystick.oy}px`;
      ui.joystickKnob.style.display = 'block';
      ui.joystickKnob.style.left = `${uiState.joystick.x}px`;
      ui.joystickKnob.style.top = `${uiState.joystick.y}px`;
    } else {
      ui.joystickBase.style.display = 'none';
      ui.joystickKnob.style.display = 'none';
    }

    // 渲染畫面
    if (postFx) postFx.render(scene, camera);
    else renderer.render(scene, camera);
  }

  requestAnimationFrame(frame);
}

// 構建沙盒專屬 UI
function buildSandboxUi({ onResetBall, onTipClick, onExit }) {
  const root = document.createElement('div');
  root.id = 'freeball-sandbox-ui';
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:20;font-family:system-ui,sans-serif;';
  document.body.appendChild(root);

  // 頂部狀態列
  const topBar = document.createElement('div');
  topBar.style.cssText = [
    'position:absolute', 'top:16px', 'left:50%', 'transform:translateX(-50%)',
    'background:rgba(18,24,38,0.85)', 'border:1px solid rgba(110,231,255,0.4)',
    'padding:8px 18px', 'border-radius:24px', 'color:#eef2fa',
    'display:flex', 'align-items:center', 'gap:14px', 'font-size:13px', 'font-weight:700',
    'backdrop-filter:blur(8px)', 'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
    'pointer-events:none', 'white-space:nowrap', 'max-width:92vw', 'overflow:hidden',
  ].join(';');
  topBar.innerHTML = `
    <span style="color:#6ee7ff;">🏐 Free Ball 物理進攻</span>
    <span style="color:#8b9bb4;">|</span>
    <span id="fb-score" style="color:#ffd166;">SCORE: 0</span>
    <span id="fb-combo" style="color:#ff416c;font-size:14px;">COMBO x0</span>
  `;
  root.appendChild(topBar);

  const scoreEl = topBar.querySelector('#fb-score');
  const comboEl = topBar.querySelector('#fb-combo');

  // 子彈時間慢動作提示徽章
  const focusBadge = document.createElement('div');
  focusBadge.textContent = '⏳ FOCUS SLOW-MO';
  focusBadge.style.cssText = [
    'position:absolute', 'top:72px', 'left:50%', 'transform:translateX(-50%)',
    'background:rgba(255,209,102,0.9)', 'color:#121826', 'font-size:12px', 'font-weight:900',
    'padding:4px 14px', 'border-radius:12px', 'box-shadow:0 0 16px rgba(255,209,102,0.8)',
    'display:none', 'letter-spacing:1px',
  ].join(';');
  root.appendChild(focusBadge);

  // 返回按鈕
  const exitBtn = document.createElement('button');
  exitBtn.textContent = '✕ 返回';
  exitBtn.style.cssText = [
    'position:absolute', 'top:16px', 'left:16px',
    'background:#1e2738', 'color:#eef2fa', 'border:1px solid #4a5c7a',
    'padding:6px 14px', 'border-radius:16px', 'font-weight:700', 'cursor:pointer',
    'pointer-events:auto', 'font-size:12px', 'backdrop-filter:blur(6px)',
  ].join(';');
  exitBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  exitBtn.onclick = onExit;
  root.appendChild(exitBtn);

  // 重發二傳高球按鈕
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '↺ 二傳托球';
  resetBtn.style.cssText = [
    'position:absolute', 'top:16px', 'right:16px',
    'background:#2a364f', 'color:#ffd166', 'border:1px solid #ffd166',
    'padding:6px 14px', 'border-radius:16px', 'font-weight:700', 'cursor:pointer',
    'pointer-events:auto', 'font-size:12px', 'backdrop-filter:blur(6px)',
  ].join(';');
  resetBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  resetBtn.onclick = onResetBall;
  root.appendChild(resetBtn);

  // 浮動搖桿視覺
  const joystickBase = document.createElement('div');
  joystickBase.style.cssText = [
    'position:absolute', 'width:110px', 'height:110px', 'border-radius:50%',
    'border:2px solid rgba(110,231,255,0.45)', 'background:rgba(18,28,45,0.45)',
    'transform:translate(-50%, -50%)', 'pointer-events:none', 'display:none',
    'box-shadow:0 0 16px rgba(110,231,255,0.25)',
  ].join(';');
  root.appendChild(joystickBase);

  const joystickKnob = document.createElement('div');
  joystickKnob.style.cssText = [
    'position:absolute', 'width:46px', 'height:46px', 'border-radius:50%',
    'background:linear-gradient(135deg, #6ee7ff, #0099ff)', 'transform:translate(-50%, -50%)',
    'pointer-events:none', 'display:none', 'box-shadow:0 0 12px rgba(110,231,255,0.7)',
  ].join(';');
  root.appendChild(joystickKnob);

  // 打擊反饋 Banner
  const banner = document.createElement('div');
  banner.style.cssText = [
    'position:absolute', 'top:38%', 'left:50%', 'transform:translate(-50%, -50%) scale(0.9)',
    'font-size:30px', 'font-weight:900', 'text-shadow:0 3px 14px rgba(0,0,0,0.9)',
    'letter-spacing:1px', 'opacity:0', 'transition:all 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    'pointer-events:none',
  ].join(';');
  root.appendChild(banner);

  // 空中輕吊球副按鈕（位於主按鈕上方）
  const tipBtn = document.createElement('div');
  tipBtn.textContent = '🎯 輕吊 (上劃)';
  tipBtn.style.cssText = [
    'position:absolute',
    'right:calc(env(safe-area-inset-right, 0px) + 32px)',
    'bottom:calc(env(safe-area-inset-bottom, 0px) + 152px)',
    'width:88px', 'height:44px', 'border-radius:22px',
    'background:linear-gradient(135deg, #11998e, #38ef7d)',
    'color:#ffffff', 'font-size:13px', 'font-weight:800',
    'display:none', 'align-items:center', 'justify-content:center',
    'pointer-events:auto', 'user-select:none', 'cursor:pointer',
    'box-shadow:0 0 14px rgba(56,239,125,0.5)',
    'transition:transform 0.1s ease',
  ].join(';');
  tipBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    onTipClick();
  });
  root.appendChild(tipBtn);

  // 右下角情境動作大按鈕
  const actionBtn = document.createElement('div');
  actionBtn.textContent = '助跑起跳';
  actionBtn.style.cssText = [
    'position:absolute',
    'right:calc(env(safe-area-inset-right, 0px) + 24px)',
    'bottom:calc(env(safe-area-inset-bottom, 0px) + 36px)',
    'width:104px', 'height:104px', 'border-radius:50%',
    'color:#ffffff', 'font-size:16px', 'font-weight:800',
    'display:flex', 'align-items:center', 'justify-content:center',
    'pointer-events:none', 'user-select:none',
    'transition:background 0.15s ease, transform 0.1s ease',
  ].join(';');
  root.appendChild(actionBtn);

  return {
    root,
    banner,
    actionBtn,
    tipBtn,
    focusBadge,
    joystickBase,
    joystickKnob,
    updateScore: (score, combo) => {
      scoreEl.textContent = `SCORE: ${score}`;
      comboEl.textContent = combo > 1 ? `🔥 COMBO x${combo}` : '';
    },
  };
}
