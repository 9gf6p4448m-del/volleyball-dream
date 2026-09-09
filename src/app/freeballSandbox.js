// Free Ball 物理沙盒模式（Free Ball Arcade Physics Sandbox）
// 提供自主跑位、助跑動能起跳、雙環時機收斂、空中下釘扣殺與對打牆循環
import * as THREE from 'three';
import { calculateLaunchVelocity, calculateSpikeVelocity, evaluateTiming, TIMING_GRADE } from '../sim/physicsMath.js';
import { createBallIndicator } from '../render/ballIndicator.js';
import { createFreeballJuice } from '../render/freeballJuice.js';
import { createFreeballControls } from '../input/freeballControls.js';
import { createGeoPool, createGeoCharacter, BASE_H } from '../render/geoCharacter.js';
import { createGeoAnimator } from '../render/geoAnimator.js';

export async function runFreeballSandbox(ctx) {
  const { renderer, scene, camera, quality, ballView, loadingEl, postFx } = ctx;

  if (loadingEl) loadingEl.remove();

  // 1. 初始化 Juice 與指示圈
  const juice = createFreeballJuice();
  const indicator = createBallIndicator(scene);

  // 2. 初始化訓練彈力牆（Training Wall）
  // 置於球網對面 z = -1.8 處，作為反彈對打牆
  const wallGeo = new THREE.BoxGeometry(10, 4.5, 0.3);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1f293d,
    roughness: 0.4,
    metalness: 0.2,
  });
  const trainingWall = new THREE.Mesh(wallGeo, wallMat);
  trainingWall.position.set(0, 2.25, -2.5);
  scene.add(trainingWall);

  // 牆面裝飾條紋與標靶
  const targetGeo = new THREE.RingGeometry(0.8, 1.0, 32);
  const targetMat = new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide });
  const wallTarget = new THREE.Mesh(targetGeo, targetMat);
  wallTarget.position.set(0, 2.2, -2.34);
  scene.add(wallTarget);

  // 3. 建立幾何球員模型與動畫器
  const pool = createGeoPool(scene, quality.shadowSize > 0, 1);
  const playerRig = createGeoCharacter(pool, 'A2', 'A', 1.88, false, '主角');
  playerRig.root.rotation.order = 'YXZ';
  scene.add(playerRig.root);

  const animator = createGeoAnimator(playerRig);

  // 4. 球員物理與運動狀態
  const player = {
    x: 0,
    y: 0,
    z: 4.5,
    vx: 0,
    vz: 0,
    facingAngle: Math.PI, // 面向球網 (-z)
    isAirborne: false,
    jumpTime: 0,
    jumpDuration: 0.72,
    jumpApex: 1.1,
    baseReach: 1.88 * 1.31, // 站立摸高 ≈ 2.46m
  };

  // 5. 排球物理狀態
  const ball = {
    x: 0,
    y: 3.5,
    z: 2.0,
    vx: 0,
    vy: 2.0,
    vz: 0,
    radius: 0.105,
    isSpiked: false,
  };

  // 6. 控制器初始化
  const controls = createFreeballControls(renderer.domElement, camera);

  // 動作按鈕點擊處理
  controls.onAction(({ isAirborne, dragAim }) => {
    if (!isAirborne) {
      // 地面按下：觸發助跑起跳（Approach Jump）
      const runSpeed = Math.hypot(player.vx, player.vz);
      // 助跑動能轉換：跑得越快，起跳摸高越高
      player.jumpApex = 1.05 + Math.min(runSpeed, 5.0) * 0.12;
      player.isAirborne = true;
      player.jumpTime = 0;
      controls.setAirborne(true, player.jumpApex);
      animator.playWindup();
    } else {
      // 空中按下：觸發扣殺揮臂（Spike Hit）
      handleSpikeAttempt(dragAim);
    }
  });

  // 發球/給球函式：發出一記舒服的二傳高球至進攻區域
  function feedToss() {
    ball.x = (Math.random() * 2 - 1) * 1.5;
    ball.y = 1.2;
    ball.z = 1.0;
    ball.isSpiked = false;

    // 解出飛向玩家助跑點的高弧 (apex ≈ 4.0m)
    const target = { x: player.x * 0.5, y: 1.0, z: 2.8 };
    const launch = calculateLaunchVelocity(ball, target, 3.8);
    ball.vx = launch.vx;
    ball.vy = launch.vy;
    ball.vz = launch.vz;
  }

  // 扣殺判定邏輯
  function handleSpikeAttempt(dragAim) {
    const currentReachY = player.baseReach + player.y;
    const horizDist = Math.hypot(ball.x - player.x, ball.z - player.z);
    const deltaY = Math.abs(ball.y - currentReachY);

    // 擊球範圍判定（水平 1.8m，垂直 0.7m 內）
    if (horizDist <= 2.0 && deltaY <= 0.75) {
      // 評估時機窗口（以高度差換算時機評分）
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

      // 瞄準點：若有拖曳瞄準依瞄準方向，否則預設砸向對面靶心
      let targetX = 0;
      let targetZ = -2.5;
      const aimDir = controls.getAimDirection();
      if (aimDir) {
        targetX = player.x + aimDir.x * 6;
        targetZ = player.z + aimDir.z * 6;
      }

      // 計算下釘速度向量
      const spikeVel = calculateSpikeVelocity(
        ball,
        { x: targetX, z: targetZ },
        22, // 基礎球速
        score,
        grade,
      );

      ball.vx = spikeVel.vx;
      ball.vy = spikeVel.vy;
      ball.vz = spikeVel.vz;
      ball.isSpiked = true;

      // 打擊感反饋
      if (grade === TIMING_GRADE.PERFECT) {
        juice.impactPerfect();
        showHitBanner('🔥 PERFECT SMASH!', '#38ef7d');
      } else if (grade === TIMING_GRADE.GOOD) {
        juice.shake(0.06, 0.12);
        juice.vibrate('spike');
        showHitBanner('⚡ GOOD SPIKE', '#ffd166');
      } else {
        showHitBanner('LATE / WEAK', '#ff6b6b');
      }

      controls.setLastHitResult({
        grade,
        score,
        speed: spikeVel.speed,
        time: performance.now(),
      });

      animator.playContact('spike', 1.0);
    }
  }

  // 7. 建立 UI 疊層
  const ui = buildSandboxUi({
    onResetBall: feedToss,
  });

  function showHitBanner(text, color) {
    ui.banner.textContent = text;
    ui.banner.style.color = color;
    ui.banner.style.opacity = '1';
    ui.banner.style.transform = 'translate(-50%, -50%) scale(1.15)';
    setTimeout(() => {
      ui.banner.style.opacity = '0';
      ui.banner.style.transform = 'translate(-50%, -50%) scale(0.9)';
    }, 800);
  }

  // 開局給第一顆球
  feedToss();

  // 8. 主渲染與模擬迴圈
  let lastTime = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // 結算打擊頓幀（Hitstop）
    const { isFrozen, shakeOffset } = juice.update(dt);
    if (isFrozen) {
      renderer.render(scene, camera);
      return;
    }

    // A. 球員跑位更新
    const moveInput = controls.getMoveInput();
    const speed = 4.8;
    // 順滑加速度
    player.vx = THREE.MathUtils.lerp(player.vx, moveInput.x * speed, 0.22);
    player.vz = THREE.MathUtils.lerp(player.vz, moveInput.z * speed, 0.22);

    player.x += player.vx * dt;
    player.z += player.vz * dt;

    // 場地邊界限制（己方半場）
    player.x = THREE.MathUtils.clamp(player.x, -4.2, 4.2);
    player.z = THREE.MathUtils.clamp(player.z, 0.4, 8.2);

    // 面向朝向更新
    if (Math.hypot(player.vx, player.vz) > 0.3) {
      player.facingAngle = Math.atan2(-player.vx, -player.vz);
    } else {
      player.facingAngle = THREE.MathUtils.lerp(player.facingAngle, Math.PI, 0.1);
    }

    // B. 起跳滯空高度更新
    if (player.isAirborne) {
      player.jumpTime += dt;
      const progress = player.jumpTime / player.jumpDuration;
      if (progress < 1.0) {
        // 半正弦跳躍弧度
        player.y = player.jumpApex * Math.sin(progress * Math.PI);
      } else {
        // 落地
        player.y = 0;
        player.isAirborne = false;
        controls.setAirborne(false, 0);
      }
    } else {
      player.y = 0;
    }

    // 同步球員模型 Transform
    playerRig.root.position.set(player.x, player.y, player.z);
    playerRig.root.rotation.y = player.facingAngle;

    // 播放跑步/靜止動畫
    const moveMag = Math.hypot(player.vx, player.vz);
    if (!player.isAirborne) {
      if (moveMag > 0.4) {
        animator.playRun(moveMag / speed);
      } else {
        animator.playIdle();
      }
    }
    animator.update(playerRig, 0, dt);

    // C. 球體物理模擬
    ball.vy -= 9.81 * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;

    // 牆面反彈判定（在 z = -2.35 彈回）
    if (ball.z <= -2.25 && ball.vz < 0) {
      ball.z = -2.25;
      ball.vz = -ball.vz * 0.75;
      ball.vy = Math.max(ball.vy * 0.6, 2.5); // 反彈帶有微拋
      ball.vx *= 0.8;
      juice.shake(0.08, 0.14);
    }

    // 地面碰撞判定
    if (ball.y <= ball.radius) {
      ball.y = ball.radius;
      if (ball.isSpiked) {
        // 扣殺落地後自動彈起循環
        ball.vy = Math.abs(ball.vy) * 0.55;
        if (ball.vy < 1.0) {
          setTimeout(feedToss, 500);
        }
      } else {
        // 未扣殺自然著地：重新發球
        setTimeout(feedToss, 400);
      }
      ball.vx *= 0.9;
      ball.vz *= 0.9;
    }

    // 同步球體視覺
    if (ballView && ballView.mesh) {
      ballView.mesh.position.set(ball.x, ball.y, ball.z);
    }

    // D. 更新動態收斂指示光圈
    // 目標擊球高度：扣球時為摸高點，平時為前臂墊球點 (0.9m)
    const targetHitHeight = player.isAirborne ? (player.baseReach + player.jumpApex * 0.85) : 0.9;
    indicator.update(ball, targetHitHeight, ball.vy);

    // E. 第三人稱追尾相機更新（Smooth Chase Camera）
    // 永遠在球員後上方，平滑看向球員前方與球網
    const targetCamX = player.x * 0.65;
    const targetCamY = 3.6 + player.y * 0.3;
    const targetCamZ = player.z + 5.2;

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.08) + shakeOffset.x;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.08) + shakeOffset.y;
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.08) + shakeOffset.z;

    camera.lookAt(player.x * 0.4, 1.8, player.z - 4.5);

    // F. 更新 UI 按鈕情境文字
    const uiState = controls.getUiState();
    if (uiState.actionState === 'SPIKE') {
      ui.actionBtn.textContent = '⚡ 扣殺';
      ui.actionBtn.style.background = 'linear-gradient(135deg, #ff416c, #ff4b2b)';
      ui.actionBtn.style.boxShadow = '0 0 18px rgba(255, 75, 43, 0.6)';
    } else {
      ui.actionBtn.textContent = '助跑起跳';
      ui.actionBtn.style.background = 'linear-gradient(135deg, #2193b0, #6dd5ed)';
      ui.actionBtn.style.boxShadow = '0 0 14px rgba(33, 147, 176, 0.4)';
    }

    // 渲染畫面
    if (postFx) {
      postFx.render(scene, camera);
    } else {
      renderer.render(scene, camera);
    }
  }

  requestAnimationFrame(frame);
}

// 構建沙盒專屬 UI
function buildSandboxUi({ onResetBall }) {
  const root = document.createElement('div');
  root.id = 'freeball-sandbox-ui';
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:20;font-family:system-ui,sans-serif;';
  document.body.appendChild(root);

  // 頂部狀態列
  const topBar = document.createElement('div');
  topBar.style.cssText = [
    'position:absolute', 'top:16px', 'left:50%', 'transform:translateX(-50%)',
    'background:rgba(18,24,38,0.85)', 'border:1px solid rgba(110,231,255,0.4)',
    'padding:8px 20px', 'border-radius:24px', 'color:#eef2fa',
    'display:flex', 'align-items:center', 'gap:16px', 'font-size:14px', 'font-weight:600',
    'backdrop-filter:blur(8px)', 'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
  ].join(';');
  topBar.innerHTML = `
    <span style="color:#6ee7ff;">🏐 Free Ball 物理沙盒</span>
    <span style="color:#8b9bb4;">|</span>
    <span>操作：左半邊拖動走位 ｜ 右按鍵 [助跑起跳 ➔ 空中扣殺]</span>
  `;
  root.appendChild(topBar);

  // 重新發球按鈕
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '↺ 重發高球';
  resetBtn.style.cssText = [
    'position:absolute', 'top:16px', 'right:18px',
    'background:#2a364f', 'color:#ffd166', 'border:1px solid #ffd166',
    'padding:8px 14px', 'border-radius:18px', 'font-weight:700', 'cursor:pointer',
    'pointer-events:auto',
  ].join(';');
  resetBtn.onclick = onResetBall;
  root.appendChild(resetBtn);

  // 扣球打擊反饋橫幅 (Banner)
  const banner = document.createElement('div');
  banner.style.cssText = [
    'position:absolute', 'top:42%', 'left:50%', 'transform:translate(-50%, -50%) scale(0.9)',
    'font-size:32px', 'font-weight:900', 'text-shadow:0 3px 12px rgba(0,0,0,0.8)',
    'letter-spacing:1px', 'opacity:0', 'transition:all 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    'pointer-events:none',
  ].join(';');
  root.appendChild(banner);

  // 右下角情境動作大按鈕
  const actionBtn = document.createElement('div');
  actionBtn.textContent = '助跑起跳';
  actionBtn.style.cssText = [
    'position:absolute',
    'right:calc(env(safe-area-inset-right, 0px) + 24px)',
    'bottom:calc(env(safe-area-inset-bottom, 0px) + 36px)',
    'width:104px', 'height:104px', 'border-radius:50%',
    'color:#ffffff', 'font-size:20px', 'font-weight:800',
    'display:flex', 'align-items:center', 'justify-content:center',
    'pointer-events:none', 'user-select:none',
    'transition:background 0.15s ease, transform 0.1s ease',
  ].join(';');
  root.appendChild(actionBtn);

  return { root, banner, actionBtn };
}
