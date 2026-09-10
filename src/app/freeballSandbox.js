// Free Ball 6v6 全隊排球對抗模式：12 人標準排球陣型、雙人攔網壁壘、隊友自由人呼應接球、
// 二傳精確到位托球、空中 0.28x 子彈時間、直線/斜線重扣與真實單手吊球
import * as THREE from 'three';
import {
  calculateLaunchVelocity,
  calculateSpikeVelocity,
  calculateDigVelocity,
  calculateTipVelocity,
  checkBlockCollision,
  checkNetCrossingCollision,
  checkMultiBlockerCrossingCollision,
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
  SERVE_INBOUND: 'SERVE_INBOUND',   // 一傳接球：B隊發球過網，A隊 6 人接發球陣型，自主走位或隊友協防
  SETTER_TOSS: 'SETTER_TOSS',       // 二傳舉球：二傳手主動奔跑至網前托出美味開網高球，隊友掩護跑動
  APPROACH_SPIKE: 'APPROACH_SPIKE', // 助跑起跳：進入 0.28x 子彈時間、對手雙人攔網封死角度、玩家純手勢博弈
  BALL_DEAD: 'BALL_DEAD',           // 死球結算：攔網碰撞、後排撲救判定、落地得分或出界
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
      if (e.touches && e.touches.length <= 1) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // 1. 打擊感、特效與球體落點指示圈
  const juice = createFreeballJuice();
  const vfx = createFreeballVfx(scene);
  const indicator = createBallIndicator(scene);

  // 2. 空中慢動作落點瞄準指示圈（對手場地）
  const aimMarkerGeo = new THREE.RingGeometry(0.35, 0.52, 32);
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

  // 3. 建立 12 位 3D 幾何角色（A 隊 6 人、B 隊 6 人，標準 6v6 全隊）
  const pool = createGeoPool(scene, quality?.shadowSize > 0, 12);

  // A 隊配置（藍色球衣，自由人金黃色）
  const teamARoster = [
    { id: 'A1', role: 'S', name: '二傳手', h: 1.82, isLibero: false, base: { x: 1.6, z: 2.4 } },
    { id: 'A2', role: 'OH1', name: '主角', h: 1.88, isLibero: false, base: { x: -2.8, z: 4.6 } },
    { id: 'A3', role: 'MB1', name: '副攻手', h: 1.98, isLibero: false, base: { x: 0.0, z: 2.8 } },
    { id: 'A4', role: 'OPP', name: '接應', h: 1.92, isLibero: false, base: { x: 2.8, z: 4.5 } },
    { id: 'A5', role: 'OH2', name: '主攻二', h: 1.86, isLibero: false, base: { x: -2.6, z: 6.8 } },
    { id: 'A6', role: 'L', name: '自由人', h: 1.74, isLibero: true, base: { x: 0.0, z: 6.8 } },
  ];

  // B 隊配置（紅色球衣，自由人白色）
  const teamBRoster = [
    { id: 'B1', role: 'S', name: '對手發球員', h: 1.84, isLibero: false, base: { x: -1.2, z: -3.0 } },
    { id: 'B2', role: 'OH1', name: '對手邊攻', h: 1.90, isLibero: false, base: { x: 2.8, z: -3.2 } },
    { id: 'B3', role: 'MB1', name: '對手副攻', h: 2.00, isLibero: false, base: { x: -1.6, z: -1.2 } },
    { id: 'B4', role: 'OPP', name: '對手接應', h: 1.94, isLibero: false, base: { x: -2.4, z: -1.2 } },
    { id: 'B5', role: 'OH2', name: '對手後排', h: 1.88, isLibero: false, base: { x: -2.8, z: -6.5 } },
    { id: 'B6', role: 'L', name: '對手自由人', h: 1.76, isLibero: true, base: { x: 2.2, z: -6.2 } },
  ];

  // 實例化雙方球員 Rig 與 Animator
  const players = {};
  const allPlayerList = [];

  for (const info of teamARoster) {
    const rig = createGeoCharacter(pool, info.id, 'A', info.h, info.isLibero, info.name);
    rig.root.rotation.order = 'YXZ';
    const animator = createGeoAnimator(rig);
    const p = {
      ...info,
      team: 'A',
      rig,
      animator,
      x: info.base.x,
      y: 0,
      z: info.base.z,
      vx: 0,
      vz: 0,
      facingAngle: Math.PI, // 面向球網 (-Z)
      isAirborne: false,
      jumpTime: 0,
      jumpDuration: 0.76,
      jumpApex: 1.15,
      baseReach: info.h * 1.31,
      reachY: info.h * 1.34,
      hasSet: false,
    };
    players[info.id] = p;
    allPlayerList.push(p);
  }

  for (const info of teamBRoster) {
    const rig = createGeoCharacter(pool, info.id, 'B', info.h, info.isLibero, info.name);
    rig.root.rotation.order = 'YXZ';
    const animator = createGeoAnimator(rig);
    const p = {
      ...info,
      team: 'B',
      rig,
      animator,
      x: info.base.x,
      y: 0,
      z: info.base.z,
      vx: 0,
      vz: 0,
      facingAngle: 0, // 面向球網 (+Z)
      isAirborne: false,
      jumpTime: 0,
      jumpDuration: 0.75,
      jumpApex: 0.82,
      baseReach: info.h * 1.31,
      reachY: info.h * 1.35,
      blockWidth: 0.8,
    };
    players[info.id] = p;
    allPlayerList.push(p);
  }

  pool.finishColors();

  // 別名方便存取核心角色
  const player = players['A2'];   // 玩家主攻手
  const setter = players['A1'];   // 二傳手
  const liberoA = players['A6'];  // 我方自由人
  const mbA = players['A3'];      // 我方副攻
  const oppA = players['A4'];     // 我方接應
  const oh2A = players['A5'];     // 我方主攻二

  const serverB = players['B1'];  // 對手發球員
  const mbB = players['B3'];      // 對手前排副攻攔網
  const oppB = players['B4'];     // 對手前排接應攔網（與 MB 形成雙人攔網）
  const oh1B = players['B2'];     // 對手前排左翼
  const oh2B = players['B5'];     // 對手後排邊線防守
  const liberoB = players['B6'];  // 對手後排大斜線自由人

  // 4. 排球物理狀態
  const ball = {
    x: 0,
    y: 2.4,
    z: -7.5,
    vx: 0,
    vy: 0,
    vz: 0,
    radius: 0.105,
    isSpiked: false,
  };

  // 回合狀態機與比分
  let rallyPhase = RALLY_PHASE.SERVE_INBOUND;
  let timeScale = 1.0;
  let targetTimeScale = 1.0;

  let comboCount = 0;
  let scoreA = 0;
  let scoreB = 0;
  let isPhasePending = false;
  let firstTouchByTeammate = false;

  // 5. 控制器初始化（純全螢幕手勢觸控）
  const controls = createFreeballControls(renderer.domElement, camera);

  // 6. 動作手勢處理（地面：自主墊球或助跑起跳；空中：直線/斜線扣殺或單手輕吊）
  controls.onAction(({ isAirborne, dragAim, actionType }) => {
    if (!isAirborne) {
      if (rallyPhase === RALLY_PHASE.SERVE_INBOUND) {
        // 地面接發球：自主走位墊球給二傳手
        attemptPlayerDig();
      } else {
        // 地面起跳：助跑動能起跳（Approach Jump）
        const runSpeed = Math.hypot(player.vx, player.vz);
        player.jumpApex = 1.1 + Math.min(runSpeed, 5.0) * 0.12;
        player.isAirborne = true;
        player.jumpTime = 0;
        controls.setAirborne(true, player.jumpApex);
        player.animator.trigger('windup');
        vfx.spawnJumpDust(player.x, player.z);

        // 對手雙人攔網同步起跳封阻！
        triggerDoubleBlockJump();
      }
    } else {
      // 空中動作：單手真實輕吊 (TIP) 或 直線/斜線扣殺 (LINE / CROSS / SMASH)
      if (actionType === 'TIP') {
        attemptSoftTip();
      } else {
        attemptHardSmash(actionType, dragAim);
      }
    }
  });

  // ── 階段一：B 隊發球進場（Serve Inbound）──
  function serveInbound() {
    isPhasePending = false;
    firstTouchByTeammate = false;
    rallyPhase = RALLY_PHASE.SERVE_INBOUND;
    ball.isSpiked = false;

    // 重置 A 隊全體站位
    for (const info of teamARoster) {
      const p = players[info.id];
      p.x = info.base.x;
      p.y = 0;
      p.z = info.base.z;
      p.vx = 0;
      p.vz = 0;
      p.facingAngle = Math.PI;
      p.isAirborne = false;
      p.hasSet = false;
    }

    // 重置 B 隊全體站位
    for (const info of teamBRoster) {
      const p = players[info.id];
      p.x = info.base.x;
      p.y = 0;
      p.z = info.base.z;
      p.vx = 0;
      p.vz = 0;
      p.facingAngle = 0;
      p.isAirborne = false;
    }

    // B 隊發球員從底線後方起跳發球
    serverB.x = (Math.random() - 0.5) * 3.6;
    serverB.z = -9.2;
    serverB.animator.trigger('serve');

    // 排球從對手底線後方弧線發出
    ball.x = serverB.x;
    ball.y = 2.45;
    ball.z = serverB.z;

    // 發球目標區：我方後場三角防區 (落點靠近玩家、自由人或主攻二)
    const targetX = THREE.MathUtils.clamp(serverB.x * 0.5 + (Math.random() - 0.5) * 2.2, -2.8, 2.8);
    const targetZ = 4.6 + Math.random() * 2.2;
    const launch = calculateLaunchVelocity(ball, { x: targetX, y: 0.1, z: targetZ }, 3.7);

    ball.vx = launch.vx;
    ball.vy = launch.vy;
    ball.vz = launch.vz;

    showHitBanner('🏐 INBOUND SERVE! 對手發球', '#6ee7ff');
    ui.coachHint.textContent = '🏐 走位迎球墊球（或隊友自由人協防呼應）';
  }

  // ── 階段二 A：玩家主動墊球（Receive / Dig）──
  function attemptPlayerDig() {
    if (rallyPhase !== RALLY_PHASE.SERVE_INBOUND) return;

    player.animator.trigger('bump');
    juice.vibrate('dig');

    const horizDist = Math.hypot(ball.x - player.x, ball.z - player.z);
    const heightDelta = ball.y - 0.9;

    if (horizDist <= 2.2 && heightDelta >= -0.75 && heightDelta <= 1.35) {
      // 一傳墊向網前二傳專屬戰術位 (x ≈ 1.2, z ≈ 1.5, y = 2.2)
      const setterTargetPos = { x: 1.2, y: 2.2, z: 1.5 };
      const digResult = calculateDigVelocity(
        ball,
        player,
        setterTargetPos,
        horizDist <= 0.8 ? 1.0 : 0.75
      );

      ball.vx = digResult.vx;
      ball.vy = digResult.vy;
      ball.vz = digResult.vz;
      ball.isSpiked = false;

      vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 1, 0), 0x38ef7d, 2.5);
      showHitBanner('🏐 CLEAN DIG! 主角一傳到位', '#38ef7d');
      rallyPhase = RALLY_PHASE.SETTER_TOSS;
    } else {
      showHitBanner('MISS! 接球失誤', '#ff6b6b');
      scorePoint('B', '接球未到位');
    }
  }

  // ── 階段二 B：隊友（自由人或主攻二）呼應墊球──
  function executeTeammateDig(mate) {
    if (rallyPhase !== RALLY_PHASE.SERVE_INBOUND) return;
    firstTouchByTeammate = true;
    mate.animator.trigger('bump');
    juice.vibrate('dig');

    const setterTargetPos = { x: 1.2, y: 2.2, z: 1.5 };
    const digResult = calculateDigVelocity(ball, mate, setterTargetPos, 0.9);

    ball.vx = digResult.vx;
    ball.vy = digResult.vy;
    ball.vz = digResult.vz;
    ball.isSpiked = false;

    vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 1, 0), 0x6ee7ff, 2.4);
    showHitBanner(`🏐 ${mate.name} 漂亮起球!`, '#6ee7ff');
    rallyPhase = RALLY_PHASE.SETTER_TOSS;
  }

  // ── 階段三：二傳手頭頂托球（Setter Overhead Toss）──
  function executeSetterToss() {
    setter.hasSet = true;
    setter.animator.trigger('overhead');
    juice.vibrate('dig');

    // 排球從二傳手頭頂手掌位置托出
    ball.x = setter.x;
    ball.y = 2.18;
    ball.z = setter.z;

    // 開網高球目標點：4 號位攻擊區 (x 靠近玩家助跑線, z = 1.85, 摸高頂點 3.9m)
    const attackX = THREE.MathUtils.clamp(player.x * 0.55 - 0.8, -3.2, -1.2);
    const tossTarget = { x: attackX, y: 1.0, z: 1.85 };

    const launch = calculateLaunchVelocity(ball, tossTarget, 3.95);
    ball.vx = launch.vx;
    ball.vy = launch.vy;
    ball.vz = launch.vz;

    vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 1, 0), 0xffd166, 2.4);
    showHitBanner('⭐ OPEN TOSS! 舉球到位', '#ffd166');

    rallyPhase = RALLY_PHASE.APPROACH_SPIKE;

    // 隊友副攻 A3 執行中間快球假動作掩護，接應 A4 右翼拉開
    mbA.animator.trigger('windup');
    oppA.animator.trigger('run');

    // 對手雙人攔網提前橫向滑步封鎖 4 號位
    mbB.x = attackX + 0.45;
    oppB.x = attackX - 0.35;
  }

  // ── 對手雙人攔網起跳（Double Block Jump）──
  function triggerDoubleBlockJump() {
    mbB.isAirborne = true;
    mbB.jumpTime = 0;
    mbB.animator.trigger('blockJump');

    oppB.isAirborne = true;
    oppB.jumpTime = 0;
    oppB.animator.trigger('blockJump');

    // 雙人攔網精準收攏封死主要進攻角度
    const attackX = THREE.MathUtils.clamp(player.x * 0.75, -3.0, -1.2);
    oppB.x = attackX - 0.38; // 外側攔網手（封直線）
    mbB.x = attackX + 0.42;  // 內側攔網手（封大斜線）
  }

  // ── 階段四 A：真實排球單手高舉輕吊球（Airborne Single-Hand Tip）──
  function attemptSoftTip() {
    // 參照真實排球技術：單手高舉過網、指尖/手腕前挑輕送，落入三米線前空檔
    player.animator.trigger('tip');

    const currentReachY = player.baseReach + player.y;
    const deltaY = Math.abs(ball.y - currentReachY);
    const horizDist = Math.hypot(ball.x - player.x, ball.z - player.z);

    targetTimeScale = 1.0;
    timeScale = 1.0;

    if (horizDist <= 2.4 && deltaY <= 1.0) {
      // 吊球目標點：越過雙人攔網手臂，落入三米線前空檔（Donut Hole: z ≈ -1.45, x 靠近中路）
      const tipVel = calculateTipVelocity(ball, { x: player.x * 0.35, z: -1.45 });
      ball.vx = tipVel.vx;
      ball.vy = tipVel.vy;
      ball.vz = tipVel.vz;
      ball.isSpiked = true;

      juice.shake(0.04, 0.12);
      vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 1, 0), 0x38ef7d, 2.5);
      showHitBanner('🎯 DOUGHNUT TIP! 單手吊球', '#38ef7d');
      rallyPhase = RALLY_PHASE.BALL_DEAD;
    } else {
      showHitBanner('MISS!', '#ff6b6b');
    }
  }

  // ── 階段四 B：爆裂下釘扣殺（直線 Line vs 大斜線 Cross）──
  function attemptHardSmash(actionType, dragAim) {
    player.animator.trigger('spike');

    const currentReachY = player.baseReach + player.y;
    const deltaY = Math.abs(ball.y - currentReachY);
    const horizDist = Math.hypot(ball.x - player.x, ball.z - player.z);

    targetTimeScale = 1.0;
    timeScale = 1.0;

    if (horizDist <= 2.4 && deltaY <= 1.0) {
      let grade = TIMING_GRADE.GOOD;
      let score = 0.8;
      if (deltaY <= 0.22) {
        grade = TIMING_GRADE.PERFECT;
        score = 1.0;
      } else if (deltaY <= 0.48) {
        grade = TIMING_GRADE.GOOD;
        score = 0.75;
      } else {
        grade = TIMING_GRADE.LATE;
        score = 0.4;
      }

      let targetX = 0;
      let targetZ = -4.5;
      let shotLabel = '⚡ GOOD SPIKE';

      if (actionType === 'LINE') {
        // 直線重扣：沿著我方左邊線直釘對手底角，避開副攻內側！
        targetX = THREE.MathUtils.clamp(player.x - 0.2, -3.8, -3.2);
        targetZ = -7.2;
        shotLabel = '🔥 LINE SHOT 直線重扣!';
      } else if (actionType === 'CROSS_LEFT' || actionType === 'CROSS') {
        // 銳利斜線：穿越雙人攔網縫隙轟向右側深處
        targetX = 3.2;
        targetZ = -5.2;
        shotLabel = '⚡ CROSS SHOT 銳利大斜線!';
      } else if (actionType === 'CROSS_RIGHT') {
        targetX = 3.6;
        targetZ = -4.5;
        shotLabel = '⚡ CROSS SHOT 銳利大斜線!';
      } else {
        const aimDir = controls.getAimDirection();
        if (aimDir) {
          targetX = THREE.MathUtils.clamp(player.x + aimDir.x * 7.5, -4.0, 4.0);
          targetZ = THREE.MathUtils.clamp(player.z + aimDir.z * 7.5, -8.0, -2.5);
          shotLabel = Math.abs(targetX - player.x) > 1.8 ? '⚡ CROSS SHOT 斜線重扣!' : '🔥 LINE SHOT 直線重扣!';
        } else {
          targetX = 2.8;
          targetZ = -5.5;
          shotLabel = '⚡ CROSS SHOT 斜線重扣!';
        }
      }

      const spikeVel = calculateSpikeVelocity(ball, { x: targetX, z: targetZ }, 25, score, grade);
      ball.vx = spikeVel.vx;
      ball.vy = spikeVel.vy;
      ball.vz = spikeVel.vz;
      ball.isSpiked = true;
      rallyPhase = RALLY_PHASE.BALL_DEAD;

      if (grade === TIMING_GRADE.PERFECT) {
        juice.impactPerfect();
        vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, -0.4, 0.9), 0x38ef7d, 4.5);
        showHitBanner(shotLabel, '#38ef7d');
      } else {
        juice.shake(0.08, 0.15);
        juice.vibrate('spike');
        vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, -0.4, 0.9), 0xffd166, 3.0);
        showHitBanner(shotLabel, '#ffd166');
      }
    } else {
      showHitBanner('MISS! 揮空', '#ff6b6b');
    }
  }

  // 得分判定與結算
  function scorePoint(winnerTeam, reason) {
    if (isPhasePending) return;
    isPhasePending = true;

    if (winnerTeam === 'A') {
      scoreA += 1;
      comboCount += 1;
      showHitBanner(`🔥 POINT SCORED! ${reason}`, '#38ef7d');
    } else {
      scoreB += 1;
      comboCount = 0;
      showHitBanner(`✕ POINT TO B! ${reason}`, '#ff4b4b');
    }

    ui.updateScoreboard(scoreA, scoreB, comboCount);
    setTimeout(serveInbound, 950);
  }

  // 7. 建立全螢幕純手勢 UI 與 6v6 比分板
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

  // 8. 主模擬與渲染迴圈
  let lastTime = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // ★ Free Ball 空中慢動作子彈時間（Bullet Time / Focus Mode）★
    const inSpikeZone = player.isAirborne && !ball.isSpiked && ball.y >= 2.0 && ball.z >= 0.5 && ball.z <= 3.6;
    if (inSpikeZone) {
      targetTimeScale = 0.28;
    } else {
      targetTimeScale = 1.0;
    }
    timeScale = THREE.MathUtils.lerp(timeScale, targetTimeScale, 0.2);

    const simDt = dt * timeScale;

    // 打擊感頓幀與動態 FOV 更新
    const juiceResult = juice.update(dt);
    if (juiceResult.isFrozen) {
      if (postFx) postFx.render(scene, camera);
      else renderer.render(scene, camera);
      return;
    }

    if (camera.isPerspectiveCamera) {
      const slowMoFovOffset = inSpikeZone ? -3.0 : 0;
      camera.fov = juiceResult.fov + slowMoFovOffset;
      camera.updateProjectionMatrix();
    }

    // A. 玩家跑位與面向
    const moveInput = controls.getMoveInput();
    const speed = 5.2;
    player.vx = THREE.MathUtils.lerp(player.vx, moveInput.x * speed, 0.22);
    player.vz = THREE.MathUtils.lerp(player.vz, moveInput.z * speed, 0.22);

    player.x += player.vx * simDt;
    player.z += player.vz * simDt;

    player.x = THREE.MathUtils.clamp(player.x, -4.3, 4.3);
    player.z = THREE.MathUtils.clamp(player.z, 0.5, 8.5);

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
        player.animator.trigger('landSoft');
        targetTimeScale = 1.0;
      }
    } else {
      player.y = 0;
    }

    const lateral = moveMag > 0.25
      ? Math.sin(shortestArc(player.facingAngle, Math.atan2(player.vx, player.vz)))
      : 0;
    const bodyY = player.animator.update(simDt, moveMag, lateral, 1.0);
    player.rig.root.position.set(player.x, player.y + (player.isAirborne ? 0 : bodyY), player.z);
    player.rig.root.rotation.y = player.facingAngle;

    // B. A 隊隊友 AI 更新
    // 1. 二傳手主動跑位托球
    if (rallyPhase === RALLY_PHASE.SETTER_TOSS && !setter.hasSet) {
      let interceptX = 1.2;
      let interceptZ = 1.5;
      const disc = ball.vy * ball.vy + 19.62 * (ball.y - 2.15);
      if (disc >= 0) {
        const tDescend = (ball.vy + Math.sqrt(disc)) / 9.81;
        if (tDescend > 0) {
          interceptX = THREE.MathUtils.clamp(ball.x + ball.vx * tDescend, -0.5, 2.5);
          interceptZ = THREE.MathUtils.clamp(ball.z + ball.vz * tDescend, 0.8, 2.5);
        }
      }

      const dx = interceptX - setter.x;
      const dz = interceptZ - setter.z;
      const distToTarget = Math.hypot(dx, dz);

      let setterRunSpeed = 0;
      if (distToTarget > 0.08) {
        setterRunSpeed = Math.min(distToTarget / Math.max(simDt, 0.016), 5.5);
        setter.vx = THREE.MathUtils.lerp(setter.vx, (dx / distToTarget) * setterRunSpeed, 0.35);
        setter.vz = THREE.MathUtils.lerp(setter.vz, (dz / distToTarget) * setterRunSpeed, 0.35);
        setter.x += setter.vx * simDt;
        setter.z += setter.vz * simDt;
        setter.facingAngle = approachYaw(setter.facingAngle, Math.atan2(setter.vx, setter.vz), simDt * 9.0);
      } else {
        setter.vx = 0;
        setter.vz = 0;
        setter.facingAngle = approachYaw(setter.facingAngle, -Math.PI * 0.45, simDt * 6.0);
      }

      const setterBodyY = setter.animator.update(simDt, setterRunSpeed, 0, 1.0);
      setter.rig.root.position.set(setter.x, setter.y + setterBodyY, setter.z);
      setter.rig.root.rotation.y = setter.facingAngle;

      const horizDistToBall = Math.hypot(ball.x - setter.x, ball.z - setter.z);
      const isDescending = ball.vy <= 0.6;
      const isAtHandHeight = ball.y <= 2.30 && ball.y >= 1.85;
      const isTouchingBall = horizDistToBall <= 0.48;

      if (isDescending && isAtHandHeight && isTouchingBall) {
        executeSetterToss();
      }
    } else {
      const setterBodyY = setter.animator.update(simDt, 0, 0, 1.0);
      setter.rig.root.position.set(setter.x, setter.y + setterBodyY, setter.z);
      setter.rig.root.rotation.y = setter.facingAngle;
    }

    // 2. 自由人與其他隊友在接發球時的協防
    if (rallyPhase === RALLY_PHASE.SERVE_INBOUND) {
      const distBallToPlayer = Math.hypot(ball.x - player.x, ball.z - player.z);
      const distBallToLibero = Math.hypot(ball.x - liberoA.x, ball.z - liberoA.z);

      // 若球偏向後排中路且玩家未在落點附近，自由人主動滑步救球
      if (distBallToPlayer > 2.5 && distBallToLibero < 2.8 && ball.y <= 1.4 && ball.vz > 0 && !firstTouchByTeammate) {
        liberoA.x = THREE.MathUtils.lerp(liberoA.x, ball.x, 0.2);
        liberoA.z = THREE.MathUtils.lerp(liberoA.z, ball.z + 0.3, 0.2);
        executeTeammateDig(liberoA);
      }
    }

    // 更新 A 隊其餘隊友視覺
    for (const mate of [liberoA, mbA, oppA, oh2A]) {
      const mateBodyY = mate.animator.update(simDt, 0, 0, 1.0);
      mate.rig.root.position.set(mate.x, mate.y + mateBodyY, mate.z);
      mate.rig.root.rotation.y = mate.facingAngle;
    }

    // C. B 隊雙人攔網手與後排防守 AI
    // 雙人攔網起跳滯空更新
    for (const b of [mbB, oppB]) {
      if (b.isAirborne) {
        b.jumpTime += simDt;
        const prog = b.jumpTime / b.jumpDuration;
        if (prog < 1.0) {
          b.y = b.jumpApex * Math.sin(prog * Math.PI);
        } else {
          b.y = 0;
          b.isAirborne = false;
        }
      } else if (rallyPhase === RALLY_PHASE.APPROACH_SPIKE) {
        // 橫向滑步收攏
        const targetX = THREE.MathUtils.clamp(player.x * 0.75, -3.0, -1.2);
        if (b.id === 'B4') b.x = THREE.MathUtils.lerp(b.x, targetX - 0.38, 0.12);
        if (b.id === 'B3') b.x = THREE.MathUtils.lerp(b.x, targetX + 0.42, 0.12);
      }
      const bBodyY = b.animator.update(simDt, 0, 0, 1.0);
      b.rig.root.position.set(b.x, b.y + bBodyY, b.z);
      b.rig.root.rotation.y = b.facingAngle;
    }

    // B 隊其餘球員更新
    for (const mate of [serverB, oh1B, oh2B, liberoB]) {
      const mBodyY = mate.animator.update(simDt, 0, 0, 1.0);
      mate.rig.root.position.set(mate.x, mate.y + mBodyY, mate.z);
      mate.rig.root.rotation.y = mate.facingAngle;
    }

    // 更新 12 位球員的 InstancedMesh 池矩陣
    for (const p of allPlayerList) {
      p.rig.root.updateMatrixWorld(true);
      for (const part of p.rig.parts) pool.writeMatrix(part, part.node.matrixWorld);
    }
    pool.markDirty();

    // D. 排球物理模擬與雙人穿網攔網射線碰撞檢測
    const prevBallPos = { x: ball.x, y: ball.y, z: ball.z };
    ball.vy -= 9.81 * simDt;
    ball.x += ball.vx * simDt;
    ball.y += ball.vy * simDt;
    ball.z += ball.vz * simDt;
    const currBallPos = { x: ball.x, y: ball.y, z: ball.z };

    // 自主防守走位兜底（玩家走位貼近落點自動墊球）
    if (rallyPhase === RALLY_PHASE.SERVE_INBOUND && ball.y <= 1.5 && ball.vz > 0) {
      const d = Math.hypot(ball.x - player.x, ball.z - player.z);
      if (d <= 1.0) {
        attemptPlayerDig();
      }
    }

    // ★ 關鍵：雙人攔網壁壘穿網連續射線碰撞檢測 ★
    if (ball.isSpiked && ball.vz < 0 && (mbB.isAirborne || oppB.isAirborne)) {
      const blockCol = checkMultiBlockerCrossingCollision(
        prevBallPos,
        currBallPos,
        { vx: ball.vx, vy: ball.vy, vz: ball.vz },
        [
          { ...mbB, reachY: mbB.reachY + mbB.y, blockWidth: 0.8 },
          { ...oppB, reachY: oppB.reachY + oppB.y, blockWidth: 0.8 },
        ]
      );

      if (blockCol.hit) {
        ball.x = blockCol.contactPoint.x;
        ball.y = blockCol.contactPoint.y;
        ball.z = blockCol.contactPoint.z;
        ball.vx = blockCol.reflectedVel.vx;
        ball.vy = blockCol.reflectedVel.vy;
        ball.vz = blockCol.reflectedVel.vz;

        if (blockCol.type === 'ROOF') {
          // 雙人正面攔死
          juice.impactRoofBlock();
          vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 0, 1), 0xff4b4b, 4.2);
          showHitBanner('🚫 ROOF BLOCKED! 雙人攔死', '#ff4b4b');
        } else {
          // 打手出界得分
          juice.impactTool();
          vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(1, 0, 0), 0xffd166, 3.8);
          showHitBanner('⚡ TOOL OFF BLOCK! 打手出界', '#ffd166');
        }
      }
    }

    // 地面著地與得分結算
    if (ball.y <= ball.radius) {
      ball.y = ball.radius;
      vfx.spawnFloorImpact(ball.x, ball.z, ball.isSpiked ? 0xff416c : 0xffd166);

      if (ball.isSpiked) {
        ball.vy = Math.abs(ball.vy) * 0.5;
        if (!isPhasePending) {
          if (ball.z < 0 && Math.abs(ball.x) <= 4.5 && ball.z >= -9.0) {
            // 對手半場界內落地得分！
            scorePoint('A', '落地得分');
          } else if (ball.z > 0 && Math.abs(ball.x) <= 4.5) {
            // 被攔回我方半場落地
            scorePoint('B', '攔截落地');
          } else {
            // 出界判定
            scorePoint('B', '扣球出界');
          }
        }
      } else if (!isPhasePending) {
        // 接發球未接起
        scorePoint('B', '接球未救起');
      }
      ball.vx *= 0.82;
      ball.vz *= 0.82;
    }

    // 界外安全保護
    if ((ball.z > 12 || ball.z < -12 || Math.abs(ball.x) > 8 || ball.y < -1) && !isPhasePending) {
      scorePoint('B', '出界');
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

    // 空中慢動作落點瞄準指示圈
    if (inSpikeZone) {
      aimMarker.visible = true;
      const aimState = controls.getAimState();
      let targetX = 0;
      let targetZ = -4.5;
      if (aimState.shotType === 'LINE') {
        targetX = THREE.MathUtils.clamp(player.x - 0.2, -3.8, -3.2);
        targetZ = -7.2;
        aimMarkerMat.color.setHex(0xff416c);
        ui.focusBadge.textContent = '⏳ FOCUS: 直線重扣 (LINE 🔥)';
      } else if (aimState.shotType === 'CROSS_LEFT' || aimState.shotType === 'CROSS') {
        targetX = 3.2;
        targetZ = -5.2;
        aimMarkerMat.color.setHex(0xffd166);
        ui.focusBadge.textContent = '⏳ FOCUS: 銳利大斜線 (CROSS ⚡)';
      } else if (aimState.shotType === 'CROSS_RIGHT') {
        targetX = 3.6;
        targetZ = -4.5;
        aimMarkerMat.color.setHex(0xffd166);
        ui.focusBadge.textContent = '⏳ FOCUS: 銳利大斜線 (CROSS ⚡)';
      } else if (aimState.shotType === 'TIP') {
        targetX = player.x * 0.35;
        targetZ = -1.45;
        aimMarkerMat.color.setHex(0x38ef7d);
        ui.focusBadge.textContent = '⏳ FOCUS: 單手吊球 (TIP 🎯)';
      } else {
        targetX = 2.8;
        targetZ = -5.5;
        aimMarkerMat.color.setHex(0x6ee7ff);
        ui.focusBadge.textContent = '⏳ FOCUS SLOW-MO (滑動選線路)';
      }
      aimMarker.position.set(targetX, 0.025, targetZ);
    } else {
      aimMarker.visible = false;
    }

    // F. 特效更新
    vfx.update(dt);

    // G. 第三人稱動態相機（視角覆蓋 6v6 全場）
    const isPortrait = window.innerWidth < window.innerHeight;
    const targetCamX = player.x * 0.55;
    const targetCamY = 3.8 + player.y * 0.3 + (isPortrait ? 1.5 : 0);
    const targetCamZ = player.z + 5.5 + (isPortrait ? 2.6 : 0);

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.08) + juiceResult.shakeOffset.x;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.08) + juiceResult.shakeOffset.y;
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.08) + juiceResult.shakeOffset.z;
    camera.lookAt(player.x * 0.25, 1.8 + player.y * 0.2, player.z - 5.5);

    // H. UI 更新
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

// 構建手機 6v6 專屬 UI 與比分板（全螢幕純手勢）
function buildSandboxUi({ onResetBall, onExit }) {
  const root = document.createElement('div');
  root.id = 'freeball-sandbox-ui';
  root.style.cssText = [
    'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:20',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'touch-action:none', 'user-select:none', '-webkit-user-select:none',
  ].join(';');
  document.body.appendChild(root);

  function haptic(ms = 18) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(ms);
      }
    } catch {
      // ignore
    }
  }

  // 1. 頂部 6v6 比分看板
  const topBar = document.createElement('div');
  topBar.style.cssText = [
    'position:absolute', 'top:calc(env(safe-area-inset-top, 0px) + 12px)',
    'left:50%', 'transform:translateX(-50%)',
    'background:rgba(18,24,38,0.9)', 'border:1px solid rgba(110,231,255,0.4)',
    'padding:6px 18px', 'border-radius:24px', 'color:#eef2fa',
    'display:flex', 'align-items:center', 'gap:14px', 'font-size:clamp(12px, 3vw, 14px)', 'font-weight:700',
    'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)',
    'box-shadow:0 4px 18px rgba(0,0,0,0.5)',
    'pointer-events:none', 'white-space:nowrap', 'max-width:92vw', 'overflow:hidden',
  ].join(';');
  topBar.innerHTML = `
    <span style="color:#6ee7ff;">🏐 6v6 MATCH</span>
    <span style="color:#8b9bb4;">|</span>
    <span id="fb-score" style="color:#ffd166;font-size:15px;letter-spacing:1px;">A 0 - 0 B</span>
    <span id="fb-combo" style="color:#ff416c;font-size:13px;font-weight:900;"></span>
  `;
  root.appendChild(topBar);

  const scoreEl = topBar.querySelector('#fb-score');
  const comboEl = topBar.querySelector('#fb-combo');

  // 2. 戰術引導教練提示條
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

  // 3. 子彈時間慢動作焦點徽章
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

  // 6. 左手浮動虛擬搖桿
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
    'font-size:clamp(22px, 5.5vw, 32px)', 'font-weight:900', 'text-shadow:0 3px 14px rgba(0,0,0,0.9)',
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

    updateScoreboard: (sA, sB, combo) => {
      scoreEl.textContent = `A ${sA} - ${sB} B`;
      comboEl.textContent = combo > 1 ? `🔥 COMBO x${combo}` : '';
    },

    update: ({ uiState, rallyPhase, inSpikeZone, isAirborne }) => {
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

      focusBadge.style.display = inSpikeZone ? 'block' : 'none';

      if (rallyPhase === 'SERVE_INBOUND') {
        coachHint.textContent = '🏐 走位迎球墊球（或由隊友自由人協防起球）';
        coachHint.style.color = '#6ee7ff';
        coachHint.style.borderColor = 'rgba(110,231,255,0.45)';
      } else if (rallyPhase === 'SETTER_TOSS') {
        coachHint.textContent = '⭐ 舉球員到位托出開網高球！右側點擊【助跑起跳】';
        coachHint.style.color = '#ffd166';
        coachHint.style.borderColor = 'rgba(255,209,102,0.45)';
      } else if (inSpikeZone) {
        coachHint.textContent = '⏳ 雙人攔網封阻！上滑單手吊球 ｜ 下滑直線 ｜ 斜滑斜線';
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
