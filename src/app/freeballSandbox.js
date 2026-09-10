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

// 回合攻防模式
const ROUND_MODE = {
  OFFENSE: 'OFFENSE', // 我方進攻：接發 ➔ 二傳 ➔ 扣球突破對手雙人攔網
  DEFENSE: 'DEFENSE', // 我方防守：發球 ➔ 對手一傳二傳 ➔ 主角網前橫移雙人起跳攔網
};

// 回合攻防狀態機
const RALLY_PHASE = {
  // 進攻回合 (Offense Phase)
  SERVE_INBOUND: 'SERVE_INBOUND',   // 一傳接球：B隊發球過網，A隊接發球陣型
  SETTER_TOSS: 'SETTER_TOSS',       // 二傳舉球：A1 二傳手托出美味開網高球
  APPROACH_SPIKE: 'APPROACH_SPIKE', // 助跑扣殺：主角起跳、對手雙人攔網封死角度、玩家手勢扣殺/吊球
  // 防守回合 (Defense / Blocking Phase)
  DEF_SERVE: 'DEF_SERVE',           // 我方發球進場
  DEF_SET: 'DEF_SET',               // 對手一傳到位，對手二傳手 B1 網前托出 4 號位大砲高球
  DEF_BLOCK_DUEL: 'DEF_BLOCK_DUEL', // 對手攻手助跑起跳下扣，主角與副攻網前橫移起跳攔網！
  // 結算
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
  aimMarker.position.set(0, 0.025, -4.5);
  aimMarker.visible = false;
  scene.add(aimMarker);

  // 3. 建立 12 位 3D 幾何角色（A 隊 6 人、B 隊 6 人，標準 6v6 全隊）
  const pool = createGeoPool(scene, quality?.shadowSize > 0, 12);

  // A 隊配置（藍色球衣，自由人金黃色；主角在標準助跑進攻起步位）
  const teamARoster = [
    { id: 'A1', role: 'S', name: '二傳手', h: 1.82, isLibero: false, base: { x: 1.4, z: 1.8 } },
    { id: 'A2', role: 'OH1', name: '主角', h: 1.88, isLibero: false, base: { x: -0.6, z: 4.6 } },
    { id: 'A3', role: 'MB1', name: '副攻手', h: 1.98, isLibero: false, base: { x: 0.0, z: 2.8 } },
    { id: 'A4', role: 'OPP', name: '接應', h: 1.92, isLibero: false, base: { x: 2.8, z: 4.5 } },
    { id: 'A5', role: 'OH2', name: '主攻二', h: 1.86, isLibero: false, base: { x: -2.8, z: 6.2 } },
    { id: 'A6', role: 'L', name: '自由人', h: 1.74, isLibero: true, base: { x: 0.6, z: 6.5 } },
  ];

  // B 隊配置（紅色球衣，自由人白色）
  const teamBRoster = [
    { id: 'B1', role: 'S', name: '對手發球員', h: 1.84, isLibero: false, base: { x: 0.0, z: -4.0 } },
    { id: 'B2', role: 'OH1', name: '對手邊攻', h: 1.90, isLibero: false, base: { x: 2.8, z: -3.2 } },
    { id: 'B3', role: 'MB1', name: '對手副攻', h: 2.00, isLibero: false, base: { x: -1.0, z: -1.0 } },
    { id: 'B4', role: 'OPP', name: '對手接應', h: 1.94, isLibero: false, base: { x: -1.8, z: -1.0 } },
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
      jumpApex: 0.84,
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
    z: -4.8,
    vx: 0,
    vy: 0,
    vz: 0,
    radius: 0.105,
    isSpiked: false,
  };

  // 回合狀態機與比分
  let currentRoundMode = ROUND_MODE.OFFENSE;
  let rallyPhase = RALLY_PHASE.SERVE_INBOUND;
  let timeScale = 1.0;
  let targetTimeScale = 1.0;

  let comboCount = 0;
  let scoreA = 0;
  let scoreB = 0;
  let isPhasePending = false;

  // ── 我方前排主動起跳攔網（Player Block Jump）──
  function attemptPlayerBlock() {
    if (player.isAirborne) return;

    player.isAirborne = true;
    player.jumpTime = 0;
    player.jumpApex = 1.05;
    controls.setAirborne(true, player.jumpApex);
    player.animator.trigger('blockJump');
    juice.vibrate('dig');

    // 我方副攻手 mbA 快速橫移靠攏形成雙人攔網壁壘！
    mbA.isAirborne = true;
    mbA.jumpTime = 0;
    mbA.animator.trigger('blockJump');
    mbA.x = THREE.MathUtils.clamp(player.x + (player.x > -1.0 ? -0.65 : 0.65), -2.4, 0.6);
    vfx.spawnJumpDust(player.x, player.z);
    showHitBanner('🛡️ BLOCK! 雙人起跳攔網', '#6ee7ff');
  }

  // 5. 控制器初始化（純全螢幕手勢觸控）
  const controls = createFreeballControls(renderer.domElement, camera);

  // 6. 動作手勢處理（地面：自主墊球、助跑起跳或網前起跳攔網；空中：扣殺/輕吊）
  controls.onAction(({ isAirborne, dragAim, actionType }) => {
    if (!isAirborne) {
      // 防守攔網回合：點擊即為網前雙人起跳攔網！
      if (currentRoundMode === ROUND_MODE.DEFENSE) {
        if (rallyPhase === RALLY_PHASE.DEF_BLOCK_DUEL || rallyPhase === RALLY_PHASE.DEF_SET) {
          attemptPlayerBlock();
        }
        return;
      }

      if (rallyPhase === RALLY_PHASE.SERVE_INBOUND) {
        // 地面接發球階段：只能執行接球，絕不跳躍！
        const horizDist = Math.hypot(ball.x - player.x, ball.z - player.z);
        if (horizDist <= 3.2 && ball.y <= 2.6) {
          attemptPlayerDig();
        }
        return; // 接發球階段直接 return，絕不誤觸助跑起跳！
      }

      // 地面起跳：助跑動能起跳（Approach Jump）
      const runSpeed = Math.hypot(player.vx, player.vz);
      player.jumpApex = 1.15 + Math.min(runSpeed, 5.0) * 0.12;
      player.isAirborne = true;
      player.jumpTime = 0;
      controls.setAirborne(true, player.jumpApex);
      player.animator.trigger('windup');
      vfx.spawnJumpDust(player.x, player.z);

      // 對手雙人攔網同步起跳封阻！
      triggerDoubleBlockJump();
    } else {
      // 空中動作：單手真實輕吊 (TIP) 或 直線/斜線扣殺 (LINE / CROSS / SMASH)
      if (actionType === 'TIP') {
        attemptSoftTip();
      } else {
        attemptHardSmash(actionType, dragAim);
      }
    }
  });

  // ── 攻守輪替分發器（Round Mode Dispatcher）──
  function startNextRound(modeOverride = null) {
    if (modeOverride) {
      currentRoundMode = modeOverride;
    } else {
      currentRoundMode = currentRoundMode === ROUND_MODE.OFFENSE ? ROUND_MODE.DEFENSE : ROUND_MODE.OFFENSE;
    }

    if (currentRoundMode === ROUND_MODE.OFFENSE) {
      serveOffenseInbound();
    } else {
      serveDefenseInbound();
    }
    ui.updateScoreboard(scoreA, scoreB, comboCount, currentRoundMode);
  }

  // ── 進攻回合初始化：B 隊發球進場（Serve Inbound）──
  function serveOffenseInbound() {
    isPhasePending = false;
    currentRoundMode = ROUND_MODE.OFFENSE;
    rallyPhase = RALLY_PHASE.SERVE_INBOUND;
    ball.isSpiked = false;

    // 重置 A 隊全體站位（接發陣型）
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
      p.hasSet = false;
    }

    // B 隊發球員從底線附近發出舒適弧度發球
    serverB.x = (Math.random() - 0.5) * 2.4;
    serverB.z = -6.5;
    serverB.animator.trigger('serve');

    // 排球從對手半場劃出優美拋物線飛向我方後場
    ball.x = serverB.x;
    ball.y = 2.4;
    ball.z = serverB.z;

    const targetX = THREE.MathUtils.clamp(serverB.x * 0.4 + (Math.random() - 0.5) * 1.4, -1.6, 1.6);
    const targetZ = 4.4 + Math.random() * 0.8;
    const launch = calculateLaunchVelocity(ball, { x: targetX, y: 0.1, z: targetZ }, 3.65);

    ball.vx = launch.vx;
    ball.vy = launch.vy;
    ball.vz = launch.vz;

    showHitBanner('⚡ ATTACK ROUND! 我方進攻回合', '#38ef7d');
    ui.coachHint.textContent = '🏐 走位迎球墊球（或隊友自由人協防呼應）';
  }

  // ── 防守回合初始化：我方發球 ➔ 網前雙人攔網（Defense & Block Round）──
  function serveDefenseInbound() {
    isPhasePending = false;
    currentRoundMode = ROUND_MODE.DEFENSE;
    rallyPhase = RALLY_PHASE.DEF_SERVE;
    ball.isSpiked = false;

    // 重置 A 隊站位（主角與副攻移至網前待命，A5 後排發球）
    for (const info of teamARoster) {
      const p = players[info.id];
      p.vx = 0;
      p.vz = 0;
      p.facingAngle = Math.PI;
      p.isAirborne = false;
      p.hasSet = false;
      p.y = 0;
    }
    player.x = -1.6;
    player.z = 1.1; // 主角站在網前左翼
    mbA.x = -0.6;
    mbA.z = 1.1;    // 副攻站在網前中路
    setter.x = 1.4;
    setter.z = 1.8;
    oppA.x = 2.4;
    oppA.z = 4.5;
    liberoA.x = 0.0;
    liberoA.z = 5.8;
    oh2A.x = -1.2;
    oh2A.z = 8.6;   // 主攻二在底線發球

    // 重置 B 隊站位（對手接發與進攻陣型）
    for (const info of teamBRoster) {
      const p = players[info.id];
      p.vx = 0;
      p.vz = 0;
      p.facingAngle = 0;
      p.isAirborne = false;
      p.hasSet = false;
      p.y = 0;
    }
    serverB.x = 1.2;
    serverB.z = -1.6; // B1 二傳手在網前待命
    oh1B.x = -2.0;
    oh1B.z = -4.5;    // B2 對手主攻手在 4 號位助跑起點
    mbB.x = 0.0;
    mbB.z = -1.5;
    oppB.x = 2.4;
    oppB.z = -1.8;
    oh2B.x = 1.8;
    oh2B.z = -5.8;
    liberoB.x = -0.8;
    liberoB.z = -5.2; // B6 對手自由人接發球

    // 我方 A5 發球過網
    oh2A.animator.trigger('serve');
    ball.x = oh2A.x;
    ball.y = 2.2;
    ball.z = oh2A.z;

    // 發球飛向對手自由人區域
    const launch = calculateLaunchVelocity(ball, { x: liberoB.x, y: 0.1, z: liberoB.z }, 3.65);
    ball.vx = launch.vx;
    ball.vy = launch.vy;
    ball.vz = launch.vz;

    showHitBanner('🛡️ DEFENSE ROUND! 網前準備攔網', '#ffd166');
    ui.coachHint.textContent = '🛡️ 左右滑步對齊對手攻手！攻手揮臂時點擊【攔網起跳】！';
  }

  // ── 階段二 A：玩家主動墊球（Receive / Dig）──
  function attemptPlayerDig() {
    if (rallyPhase !== RALLY_PHASE.SERVE_INBOUND) return;

    player.animator.trigger('bump');
    juice.vibrate('dig');

    // ★ 關鍵修復：主角走位與墊球動作對齊球體，並完美起球給二傳手 ★
    player.x = THREE.MathUtils.lerp(player.x, ball.x, 0.45);
    player.z = THREE.MathUtils.lerp(player.z, ball.z + 0.35, 0.45);

    const setterTarget = { x: 1.3, y: 2.2, z: 1.6 };
    const launch = calculateLaunchVelocity(ball, setterTarget, 3.85);

    ball.vx = launch.vx;
    ball.vy = launch.vy;
    ball.vz = launch.vz;
    ball.isSpiked = false;

    vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 1, 0), 0x38ef7d, 2.5);
    showHitBanner('🏐 CLEAN DIG! 主角一傳到位', '#38ef7d');
    rallyPhase = RALLY_PHASE.SETTER_TOSS;
  }

  // ── 階段二 B：隊友（自由人）協防起球──
  function executeTeammateDig(mate) {
    if (rallyPhase !== RALLY_PHASE.SERVE_INBOUND) return;
    mate.animator.trigger('bump');
    juice.vibrate('dig');

    // 自由人直接移至落點墊球
    mate.x = ball.x;
    mate.z = ball.z + 0.35;

    const setterTarget = { x: 1.3, y: 2.2, z: 1.6 };
    const launch = calculateLaunchVelocity(ball, setterTarget, 3.85);

    ball.vx = launch.vx;
    ball.vy = launch.vy;
    ball.vz = launch.vz;
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

    // 排球從二傳手頭頂位置托出
    ball.x = setter.x;
    ball.y = 2.2;
    ball.z = setter.z;

    // 開網高球目標點：4 號位攻擊區 (x 靠近玩家助跑攻擊線, z = 1.85, 摸高頂點 3.95m)
    const attackX = THREE.MathUtils.clamp(player.x * 0.65 - 0.4, -2.2, -0.6);
    const tossTarget = { x: attackX, y: 1.0, z: 1.85 };

    const launch = calculateLaunchVelocity(ball, tossTarget, 3.95);
    ball.vx = launch.vx;
    ball.vy = launch.vy;
    ball.vz = launch.vz;

    vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 1, 0), 0xffd166, 2.4);
    showHitBanner('⭐ OPEN TOSS! 舉球到位', '#ffd166');

    rallyPhase = RALLY_PHASE.APPROACH_SPIKE;

    // 隊友副攻 A3 執行快球跑動假動作，接應 A4 向右翼拉開
    mbA.animator.trigger('windup');
    oppA.animator.trigger('run');

    // 對手雙人攔網滑步封堵 4 號位
    mbB.x = attackX + 0.42;
    oppB.x = attackX - 0.38;
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
    const attackX = THREE.MathUtils.clamp(player.x * 0.75, -2.4, -0.6);
    oppB.x = attackX - 0.38; // 外側攔網手（封直線）
    mbB.x = attackX + 0.42;  // 內側攔網手（封斜線）
  }

  // ── 階段四 A：真實排球單手高舉輕吊球（Airborne Single-Hand Tip）──
  function attemptSoftTip() {
    player.animator.trigger('tip');

    const currentReachY = player.baseReach + player.y;
    const deltaY = Math.abs(ball.y - currentReachY);
    const horizDist = Math.hypot(ball.x - player.x, ball.z - player.z);

    targetTimeScale = 1.0;
    timeScale = 1.0;

    if (horizDist <= 2.6 && deltaY <= 1.2) {
      // 吊球目標點：越過雙人攔網手臂，落入三米線前空檔（Donut Hole: z ≈ -1.45, x 靠近中路）
      const tipTargetX = THREE.MathUtils.clamp(player.x * 0.4, -1.8, 0.5);
      const tipVel = calculateTipVelocity(ball, { x: tipTargetX, z: -1.45 });
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

    if (horizDist <= 2.6 && deltaY <= 1.2) {
      let grade = TIMING_GRADE.GOOD;
      let score = 0.8;
      if (deltaY <= 0.28) {
        grade = TIMING_GRADE.PERFECT;
        score = 1.0;
      } else if (deltaY <= 0.55) {
        grade = TIMING_GRADE.GOOD;
        score = 0.75;
      } else {
        grade = TIMING_GRADE.LATE;
        score = 0.45;
      }

      let targetX = 0;
      let targetZ = -4.5;
      let shotLabel = '⚡ GOOD SPIKE';

      if (actionType === 'LINE') {
        // 直線重扣：沿著我方左邊線直釘對手底角，避開副攻內側！
        targetX = THREE.MathUtils.clamp(player.x - 0.4, -3.8, -2.6);
        targetZ = -7.5;
        shotLabel = '🔥 LINE SHOT 直線重扣!';
      } else if (actionType === 'CROSS_LEFT') {
        // 銳利左斜線：向對手左側深區大角度切入！
        targetX = -3.4;
        targetZ = -4.2;
        shotLabel = '⚡ CROSS SHOT 銳利左斜線!';
      } else if (actionType === 'CROSS_RIGHT' || actionType === 'CROSS') {
        // 銳利右斜線：大角度斜向對手右側深處！
        targetX = 3.4;
        targetZ = -5.0;
        shotLabel = '⚡ CROSS SHOT 銳利右斜線!';
      } else {
        const aimDir = controls.getAimDirection();
        if (aimDir) {
          targetX = THREE.MathUtils.clamp(player.x + aimDir.x * 7.5, -4.0, 4.0);
          targetZ = THREE.MathUtils.clamp(player.z + aimDir.z * 7.5, -8.0, -2.5);
          shotLabel = targetX < player.x ? '⚡ CROSS SHOT 銳利左斜線!' : '⚡ CROSS SHOT 銳利右斜線!';
        } else {
          targetX = THREE.MathUtils.clamp(player.x - 0.4, -3.8, -2.6);
          targetZ = -7.5;
          shotLabel = '🔥 LINE SHOT 直線重扣!';
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

    ui.updateScoreboard(scoreA, scoreB, comboCount, currentRoundMode);
    setTimeout(() => {
      startNextRound();
    }, 1150);
  }

  // 7. 建立全螢幕純手勢 UI 與 6v6 比分板
  const ui = buildSandboxUi({
    onResetBall: () => {
      startNextRound(currentRoundMode);
    },
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

  // 開局以我方進攻發第一球！
  startNextRound(ROUND_MODE.OFFENSE);

  // 8. 主模擬與渲染迴圈
  let lastTime = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // ★ Free Ball 空中慢動作子彈時間（Bullet Time / Focus Mode）★
    // 進攻：只要玩家滯空、球未扣出且處於舉球或助跑扣球階段，立即進入 0.28x 子彈時間！
    const inSpikeZone = currentRoundMode === ROUND_MODE.OFFENSE && player.isAirborne && !ball.isSpiked && (
      rallyPhase === RALLY_PHASE.APPROACH_SPIKE ||
      (rallyPhase === RALLY_PHASE.SETTER_TOSS && ball.vy <= 0) ||
      (ball.y >= 1.6 && ball.z >= 0.4 && ball.z <= 3.5 && rallyPhase !== RALLY_PHASE.SERVE_INBOUND)
    );

    // 防守：對手主攻手起跳下扣時進入 0.32x 子彈時間，給玩家充裕時間觀察揮臂並起跳攔網！
    const inDefBlockZone = currentRoundMode === ROUND_MODE.DEFENSE &&
      rallyPhase === RALLY_PHASE.DEF_BLOCK_DUEL &&
      oh1B.isAirborne && !ball.isSpiked;

    if (inSpikeZone) {
      targetTimeScale = 0.28;
    } else if (inDefBlockZone) {
      targetTimeScale = 0.32;
    } else {
      targetTimeScale = 1.0;
    }
    timeScale = THREE.MathUtils.lerp(timeScale, targetTimeScale, 0.22);

    const simDt = dt * timeScale;

    // 打擊感頓幀與動態 FOV 更新
    const juiceResult = juice.update(dt);
    if (juiceResult.isFrozen) {
      if (postFx) postFx.render(scene, camera);
      else renderer.render(scene, camera);
      return;
    }

    if (camera.isPerspectiveCamera) {
      const slowMoFovOffset = (inSpikeZone || inDefBlockZone) ? -3.0 : 0;
      camera.fov = juiceResult.fov + slowMoFovOffset;
      camera.updateProjectionMatrix();
    }

    // A. 玩家跑位與面向
    const moveInput = controls.getMoveInput();

    if (currentRoundMode === ROUND_MODE.DEFENSE) {
      // 🛡️ 防守回合：玩家在網前橫向滑步（Lateral shuffle along net at z ≈ 1.1）
      const blockSlideSpeed = 5.8;
      player.vx = THREE.MathUtils.lerp(player.vx, moveInput.x * blockSlideSpeed, 0.26);
      player.vz = THREE.MathUtils.lerp(player.vz, (1.1 - player.z) * 4.0, 0.25);

      player.x += player.vx * simDt;
      player.z += player.vz * simDt;

      player.x = THREE.MathUtils.clamp(player.x, -3.8, 1.8);
      player.z = THREE.MathUtils.clamp(player.z, 0.95, 1.25);

      // 防守時始終面向球網與對手半場（facingAngle = Math.PI）
      player.facingAngle = approachYaw(player.facingAngle, Math.PI, simDt * 8.0);
    } else {
      // ⚡ 進攻回合：全場自由跑位與助跑
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
    }

    const moveMag = Math.hypot(player.vx, player.vz);

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
    if (currentRoundMode === ROUND_MODE.OFFENSE) {
      // 1. 二傳手主動跑位托球
      if (rallyPhase === RALLY_PHASE.SETTER_TOSS && !setter.hasSet) {
        let interceptX = 1.3;
        let interceptZ = 1.6;
        const disc = ball.vy * ball.vy + 19.62 * (ball.y - 2.15);
        if (disc >= 0) {
          const tDescend = (ball.vy + Math.sqrt(disc)) / 9.81;
          if (tDescend > 0) {
            interceptX = THREE.MathUtils.clamp(ball.x + ball.vx * tDescend, 0.2, 2.4);
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
        const isDescending = ball.vy <= 0.8;
        const isAtHandHeight = ball.y <= 2.55 && ball.y >= 1.6;
        const isNearSetter = horizDistToBall <= 1.5;

        if ((isDescending && isAtHandHeight && isNearSetter) || (ball.y <= 2.1 && ball.z <= 2.8 && ball.z >= 0.5)) {
          executeSetterToss();
        }
      } else {
        const setterBodyY = setter.animator.update(simDt, 0, 0, 1.0);
        setter.rig.root.position.set(setter.x, setter.y + setterBodyY, setter.z);
        setter.rig.root.rotation.y = setter.facingAngle;
      }

      // 2. 接發球時自由人或自動保底協防
      if (rallyPhase === RALLY_PHASE.SERVE_INBOUND) {
        const distBallToPlayer = Math.hypot(ball.x - player.x, ball.z - player.z);

        if (distBallToPlayer <= 2.0 && ball.y <= 2.2 && ball.vz > 0) {
          attemptPlayerDig();
        } else if (ball.y <= 1.4 && ball.vz > 0) {
          executeTeammateDig(liberoA);
        }
      }

      // 更新 A 隊其餘隊友視覺
      for (const mate of [liberoA, mbA, oppA, oh2A]) {
        const mateBodyY = mate.animator.update(simDt, 0, 0, 1.0);
        mate.rig.root.position.set(mate.x, mate.y + mateBodyY, mate.z);
        mate.rig.root.rotation.y = mate.facingAngle;
      }
    } else {
      // 🛡️ 防守回合：我方副攻手 mbA 在網前橫移並網＋雙人起跳
      if (mbA.isAirborne) {
        mbA.jumpTime += simDt;
        const prog = mbA.jumpTime / mbA.jumpDuration;
        if (prog < 1.0) {
          mbA.y = mbA.jumpApex * Math.sin(prog * Math.PI);
        } else {
          mbA.y = 0;
          mbA.isAirborne = false;
        }
      } else {
        // 在地面跟隨主角橫移靠攏，準備雙人起跳並網！
        const targetMbX = THREE.MathUtils.clamp(player.x + (player.x > -1.0 ? -0.65 : 0.65), -2.4, 0.6);
        mbA.x = THREE.MathUtils.lerp(mbA.x, targetMbX, 0.18);
        mbA.z = 1.1;
        mbA.facingAngle = Math.PI;
      }
      const mbBodyY = mbA.animator.update(simDt, 0, 0, 1.0);
      mbA.rig.root.position.set(mbA.x, mbA.y + mbBodyY, mbA.z);
      mbA.rig.root.rotation.y = mbA.facingAngle;

      for (const mate of [setter, liberoA, oppA, oh2A]) {
        const mateBodyY = mate.animator.update(simDt, 0, 0, 1.0);
        mate.rig.root.position.set(mate.x, mate.y + mateBodyY, mate.z);
        mate.rig.root.rotation.y = mate.facingAngle;
      }
    }

    // C. B 隊雙人攔網手與進攻 AI
    if (currentRoundMode === ROUND_MODE.OFFENSE) {
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
          const targetX = THREE.MathUtils.clamp(player.x * 0.75, -2.4, -0.6);
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
    } else {
      // 🛡️ 防守回合：B 隊接發球 ➔ 二傳 ➔ 4 號位大砲扣球
      if (rallyPhase === RALLY_PHASE.DEF_SERVE) {
        // 對手自由人 liberoB 接球
        if ((ball.z <= -3.8 && ball.vz < 0) || (ball.y <= 1.8 && ball.z < -2.0)) {
          liberoB.animator.trigger('bump');
          juice.vibrate('dig');
          liberoB.x = ball.x;
          liberoB.z = ball.z - 0.35;

          const setterTargetB = { x: 1.2, y: 2.2, z: -1.6 };
          const launch = calculateLaunchVelocity(ball, setterTargetB, 3.65);
          ball.vx = launch.vx;
          ball.vy = launch.vy;
          ball.vz = launch.vz;
          ball.isSpiked = false;

          vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 1, 0), 0x6ee7ff, 2.4);
          showHitBanner('🏐 B 隊自由人一傳到位！', '#6ee7ff');
          rallyPhase = RALLY_PHASE.DEF_SET;
        }
      } else if (rallyPhase === RALLY_PHASE.DEF_SET) {
        // 對手二傳手 serverB (B1) 托球
        const horizDistToSetterB = Math.hypot(ball.x - serverB.x, ball.z - serverB.z);
        if (!serverB.hasSet && ((ball.vy <= 0.8 && ball.y <= 2.55 && ball.y >= 1.6 && horizDistToSetterB <= 1.6) || (ball.y <= 2.1 && ball.z >= -2.8 && ball.z <= -0.5))) {
          serverB.hasSet = true;
          serverB.animator.trigger('overhead');
          juice.vibrate('dig');

          ball.x = serverB.x;
          ball.y = 2.2;
          ball.z = serverB.z;

          // 托出 4 號位開網高球給 oh1B (B2)
          const attackPos = { x: -2.0, y: 1.0, z: -1.85 };
          const launch = calculateLaunchVelocity(ball, attackPos, 3.85);
          ball.vx = launch.vx;
          ball.vy = launch.vy;
          ball.vz = launch.vz;

          vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 1, 0), 0xffd166, 2.4);
          showHitBanner('⭐ B 隊二傳高球托出！', '#ffd166');
          rallyPhase = RALLY_PHASE.DEF_BLOCK_DUEL;
          oh1B.animator.trigger('run');
        }
      } else if (rallyPhase === RALLY_PHASE.DEF_BLOCK_DUEL) {
        // 對手主攻手 oh1B (B2) 助跑起跳下扣
        const dx = -2.0 - oh1B.x;
        const dz = -1.85 - oh1B.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.08 && !oh1B.isAirborne) {
          oh1B.vx = THREE.MathUtils.lerp(oh1B.vx, (dx / dist) * 4.6, 0.25);
          oh1B.vz = THREE.MathUtils.lerp(oh1B.vz, (dz / dist) * 4.6, 0.25);
          oh1B.x += oh1B.vx * simDt;
          oh1B.z += oh1B.vz * simDt;
          oh1B.facingAngle = approachYaw(oh1B.facingAngle, 0, simDt * 8.0);
        }

        // 當球下落至擊球窗口，對手主攻手起跳
        if (ball.y <= 3.15 && ball.vy <= 0 && !oh1B.isAirborne && !ball.isSpiked) {
          oh1B.isAirborne = true;
          oh1B.jumpTime = 0;
          oh1B.jumpApex = 1.05;
          oh1B.animator.trigger('spike');
          vfx.spawnJumpDust(oh1B.x, oh1B.z);
        }

        if (oh1B.isAirborne) {
          oh1B.jumpTime += simDt;
          const prog = oh1B.jumpTime / oh1B.jumpDuration;
          if (prog < 1.0) {
            oh1B.y = oh1B.jumpApex * Math.sin(prog * Math.PI);
          } else {
            oh1B.y = 0;
            oh1B.isAirborne = false;
          }

          // 在起跳最高點揮臂重扣！
          if (prog >= 0.42 && !ball.isSpiked) {
            ball.isSpiked = true;
            const targetX = Math.random() < 0.5 ? -2.2 : 0.8;
            const targetZ = 4.8 + Math.random() * 1.5;
            const spikeVel = calculateSpikeVelocity(ball, { x: targetX, z: targetZ }, 23, 0.85, TIMING_GRADE.GOOD);
            ball.vx = spikeVel.vx;
            ball.vy = spikeVel.vy;
            ball.vz = spikeVel.vz; // vz > 0, 飛向我方半場！

            juice.shake(0.06, 0.12);
            vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, -0.3, -0.9), 0xff416c, 3.2);
            showHitBanner('💥 對手 4 號位扣殺!', '#ff416c');
          }
        }
      }

      // 更新 B 隊所有球員姿態視覺
      for (const mate of [serverB, oh1B, mbB, oppB, oh2B, liberoB]) {
        const mBodyY = mate.animator.update(simDt, 0, 0, 1.0);
        mate.rig.root.position.set(mate.x, mate.y + mBodyY, mate.z);
        mate.rig.root.rotation.y = mate.facingAngle;
      }
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

    // ★ 關鍵：雙人穿網連續射線碰撞檢測（進攻與防守）★
    if (currentRoundMode === ROUND_MODE.OFFENSE) {
      if (ball.isSpiked && ball.vz < 0 && (mbB.isAirborne || oppB.isAirborne)) {
        const blockCol = checkMultiBlockerCrossingCollision(
          prevBallPos,
          currBallPos,
          { vx: ball.vx, vy: ball.vy, vz: ball.vz },
          [
            { ...mbB, reachY: mbB.reachY + mbB.y, blockWidth: 0.8 },
            { ...oppB, reachY: oppB.reachY + oppB.y, blockWidth: 0.8 },
          ],
          -1
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
    } else if (currentRoundMode === ROUND_MODE.DEFENSE) {
      // 🛡️ 防守回合：我方主角 A2 與副攻 A3 雙人起跳封鎖對手攻球 (attackDirZ = 1)
      if (ball.isSpiked && ball.vz > 0 && (player.isAirborne || mbA.isAirborne)) {
        const blockCol = checkMultiBlockerCrossingCollision(
          prevBallPos,
          currBallPos,
          { vx: ball.vx, vy: ball.vy, vz: ball.vz },
          [
            { ...player, reachY: player.baseReach + player.y, blockWidth: 0.85 },
            { ...mbA, reachY: mbA.reachY + mbA.y, blockWidth: 0.85 },
          ],
          1
        );

        if (blockCol.hit) {
          ball.x = blockCol.contactPoint.x;
          ball.y = blockCol.contactPoint.y;
          ball.z = blockCol.contactPoint.z;
          ball.vx = blockCol.reflectedVel.vx;
          ball.vy = blockCol.reflectedVel.vy;
          ball.vz = blockCol.reflectedVel.vz;

          if (blockCol.type === 'ROOF') {
            // 我方雙人攔截成功！直接下釘回對手場地！
            juice.impactRoofBlock();
            vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 0, -1), 0x38ef7d, 4.5);
            showHitBanner('🚫 ROOF MONSTER BLOCK! 雙人正面攔死!!', '#38ef7d');
          } else {
            // 擦手減速 / One-Touch
            juice.impactTool();
            vfx.spawnShockwave(new THREE.Vector3(ball.x, ball.y, ball.z), new THREE.Vector3(0, 1, 0), 0xffd166, 3.2);
            showHitBanner('🖐️ ONE TOUCH! 攔網觸球減速', '#ffd166');
          }
        }
      }
    }

    // 地面著地與得分結算
    if (ball.y <= ball.radius) {
      ball.y = ball.radius;
      vfx.spawnFloorImpact(ball.x, ball.z, ball.isSpiked ? 0xff416c : 0xffd166);

      if (currentRoundMode === ROUND_MODE.DEFENSE) {
        if (!isPhasePending) {
          if (ball.z < 0 && Math.abs(ball.x) <= 4.5 && ball.z >= -9.0) {
            // 球落在對手半場界內：攔死得分！
            scorePoint('A', '攔死得分！');
          } else if (ball.z > 0 && Math.abs(ball.x) <= 4.5 && ball.z <= 9.0) {
            // 球落在己方半場界內：對手扣殺得分
            scorePoint('B', '對手扣殺落地');
          } else if (ball.z < -9.0 || Math.abs(ball.x) > 4.5) {
            // 出界判定
            if (ball.vz < 0) {
              scorePoint('A', '攔網反彈出界得分');
            } else {
              scorePoint('B', '攔網出界');
            }
          } else {
            scorePoint('A', '對手扣球出界');
          }
        }
      } else {
        if (ball.isSpiked) {
          ball.vy = Math.abs(ball.vy) * 0.5;
          if (!isPhasePending) {
            if (ball.z < 0 && Math.abs(ball.x) <= 4.5 && ball.z >= -9.0) {
              scorePoint('A', '落地得分');
            } else if (ball.z > 0 && Math.abs(ball.x) <= 4.5) {
              scorePoint('B', '攔截落地');
            } else {
              scorePoint('B', '扣球出界');
            }
          }
        } else if (!isPhasePending) {
          scorePoint('B', '接球未救起');
        }
      }
      ball.vx *= 0.82;
      ball.vz *= 0.82;
    }

    // 界外安全保護
    if ((ball.z > 12 || ball.z < -12 || Math.abs(ball.x) > 8 || ball.y < -1) && !isPhasePending) {
      scorePoint(currentRoundMode === ROUND_MODE.DEFENSE ? 'A' : 'B', '出界');
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
        targetX = THREE.MathUtils.clamp(player.x - 0.4, -3.8, -2.6);
        targetZ = -7.5;
        aimMarkerMat.color.setHex(0xff416c);
        ui.focusBadge.textContent = '⏳ FOCUS: 直線重扣 (LINE 🔥)';
      } else if (aimState.shotType === 'CROSS_LEFT') {
        targetX = -3.4;
        targetZ = -4.2;
        aimMarkerMat.color.setHex(0x6ee7ff);
        ui.focusBadge.textContent = '⏳ FOCUS: 銳利左斜線 (CROSS ◀)';
      } else if (aimState.shotType === 'CROSS_RIGHT' || aimState.shotType === 'CROSS') {
        targetX = 3.4;
        targetZ = -5.0;
        aimMarkerMat.color.setHex(0xffd166);
        ui.focusBadge.textContent = '⏳ FOCUS: 銳利右斜線 (CROSS ▶)';
      } else if (aimState.shotType === 'TIP') {
        targetX = THREE.MathUtils.clamp(player.x * 0.4, -1.8, 0.5);
        targetZ = -1.45;
        aimMarkerMat.color.setHex(0x38ef7d);
        ui.focusBadge.textContent = '⏳ FOCUS: 單手吊球 (TIP 🎯)';
      } else {
        targetX = THREE.MathUtils.clamp(player.x - 0.4, -3.8, -2.6);
        targetZ = -7.5;
        aimMarkerMat.color.setHex(0xff416c);
        ui.focusBadge.textContent = '⏳ FOCUS SLOW-MO (滑動選線: ◀左斜/▼直線/▶右斜/▲吊球)';
      }
      aimMarker.position.set(targetX, 0.025, targetZ);
    } else {
      aimMarker.visible = false;
    }

    // F. 特效更新
    vfx.update(dt);

    // G. 第三人稱動態相機（視角覆蓋 6v6 全場，防守時採用 Free Ball 經典網前俯瞰越肩視角）
    const isPortrait = window.innerWidth < window.innerHeight;
    let targetCamX, targetCamY, targetCamZ, lookAtX, lookAtY, lookAtZ;

    if (currentRoundMode === ROUND_MODE.DEFENSE) {
      // 🛡️ Free Ball 經典攔網視角：抬高機位俯瞰網前（Over-The-Shoulder looking down over net）
      // 機位高度約 4.3m，位於球員後上方 4.1m 處，避免球員模型遮擋對手攻手，清楚洞察對手攻手起跳與揮臂！
      targetCamX = player.x * 0.7;
      targetCamY = 4.3 + player.y * 0.25 + (isPortrait ? 1.5 : 0);
      targetCamZ = player.z + 4.1 + (isPortrait ? 2.2 : 0);
      lookAtX = player.x * 0.35;
      lookAtY = 2.15 + player.y * 0.15;
      lookAtZ = -2.8;
    } else {
      // ⚡ 進攻視角：第三人稱助跑扣殺跟隨
      targetCamX = player.x * 0.55;
      targetCamY = 3.6 + player.y * 0.3 + (isPortrait ? 1.4 : 0);
      targetCamZ = player.z + 5.2 + (isPortrait ? 2.6 : 0);
      lookAtX = player.x * 0.25;
      lookAtY = 1.8 + player.y * 0.2;
      lookAtZ = player.z - 5.0;
    }

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.09) + juiceResult.shakeOffset.x;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.09) + juiceResult.shakeOffset.y;
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.09) + juiceResult.shakeOffset.z;
    camera.lookAt(lookAtX, lookAtY, lookAtZ);

    // H. UI 更新
    const uiState = controls.getUiState();
    const compass = controls.getAimCompass();
    ui.update({
      uiState,
      compass,
      rallyPhase,
      inSpikeZone,
      inDefBlockZone,
      isAirborne: player.isAirborne,
      currentRoundMode,
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
    <span id="fb-mode-badge" style="background:#38ef7d;color:#121826;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:900;">⚡ ATTACK</span>
    <span id="fb-combo" style="color:#ff416c;font-size:13px;font-weight:900;"></span>
  `;
  root.appendChild(topBar);

  const scoreEl = topBar.querySelector('#fb-score');
  const comboEl = topBar.querySelector('#fb-combo');
  const modeBadge = topBar.querySelector('#fb-mode-badge');

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

  // 8. 手指拖曳手勢瞄準羅盤（Aim Compass）
  const aimCompass = document.createElement('div');
  aimCompass.style.cssText = [
    'position:absolute', 'width:124px', 'height:124px', 'border-radius:50%',
    'border:2px dashed rgba(255,255,255,0.4)', 'background:rgba(18,24,38,0.72)',
    'transform:translate(-50%, -50%)', 'pointer-events:none', 'display:none',
    'backdrop-filter:blur(6px)', 'box-shadow:0 0 20px rgba(0,0,0,0.6)', 'z-index:25',
  ].join(';');
  aimCompass.innerHTML = `
    <div style="position:absolute;top:6px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:900;color:#38ef7d;">▲ 吊球</div>
    <div style="position:absolute;top:50%;left:6px;transform:translateY(-50%);font-size:10px;font-weight:900;color:#6ee7ff;">◀ 左斜</div>
    <div style="position:absolute;top:50%;right:6px;transform:translateY(-50%);font-size:10px;font-weight:900;color:#ffd166;">右斜 ▶</div>
    <div style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:900;color:#ff416c;">▼ 直線</div>
    <div id="cmp-knob" style="position:absolute;width:26px;height:26px;border-radius:50%;background:#ffffff;box-shadow:0 0 10px #ffffff;transform:translate(-50%, -50%);top:50%;left:50%;transition:background 0.1s ease;"></div>
  `;
  root.appendChild(aimCompass);

  return {
    root,
    banner,
    focusBadge,
    coachHint,
    joystickBase,
    joystickKnob,

    updateScoreboard: (sA, sB, combo, mode = 'OFFENSE') => {
      scoreEl.textContent = `A ${sA} - ${sB} B`;
      comboEl.textContent = combo > 1 ? `🔥 COMBO x${combo}` : '';
      if (modeBadge) {
        if (mode === 'DEFENSE') {
          modeBadge.textContent = '🛡️ BLOCK';
          modeBadge.style.background = '#ffd166';
          modeBadge.style.color = '#121826';
        } else {
          modeBadge.textContent = '⚡ ATTACK';
          modeBadge.style.background = '#38ef7d';
          modeBadge.style.color = '#121826';
        }
      }
    },

    update: ({ uiState, compass, rallyPhase, inSpikeZone, inDefBlockZone, isAirborne, currentRoundMode }) => {
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

      focusBadge.style.display = (inSpikeZone || inDefBlockZone) ? 'block' : 'none';
      if (inDefBlockZone) {
        focusBadge.textContent = '⏳ FOCUS SLOW-MO (對手起跳揮臂！點擊起跳攔網)';
        focusBadge.style.background = 'rgba(255,107,107,0.92)';
      } else if (inSpikeZone) {
        focusBadge.style.background = 'rgba(255,209,102,0.92)';
      }

      // 瞄準羅盤視覺（僅進攻扣殺時顯示）
      if (compass && compass.active && inSpikeZone) {
        aimCompass.style.display = 'block';
        aimCompass.style.left = `${compass.currX}px`;
        aimCompass.style.top = `${compass.currY}px`;
        const knob = aimCompass.querySelector('#cmp-knob');
        if (knob) {
          const clampedX = THREE.MathUtils.clamp(compass.dx, -42, 42);
          const clampedY = THREE.MathUtils.clamp(compass.dy, -42, 42);
          knob.style.left = `calc(50% + ${clampedX}px)`;
          knob.style.top = `calc(50% + ${clampedY}px)`;
          if (compass.shotType === 'CROSS_LEFT') knob.style.background = '#6ee7ff';
          else if (compass.shotType === 'CROSS_RIGHT') knob.style.background = '#ffd166';
          else if (compass.shotType === 'TIP') knob.style.background = '#38ef7d';
          else knob.style.background = '#ff416c';
        }
      } else {
        aimCompass.style.display = 'none';
      }

      // 教練戰術指引
      if (currentRoundMode === 'DEFENSE') {
        if (rallyPhase === 'DEF_SERVE') {
          coachHint.textContent = '🏐 我方發球過網！迅速在網前橫向滑步就位';
          coachHint.style.color = '#ffd166';
          coachHint.style.borderColor = 'rgba(255,209,102,0.45)';
        } else if (rallyPhase === 'DEF_SET') {
          coachHint.textContent = '🛡️ 對手二傳托球！滑步對齊對手 4 號位主攻手！';
          coachHint.style.color = '#ffd166';
          coachHint.style.borderColor = 'rgba(255,209,102,0.45)';
        } else if (rallyPhase === 'DEF_BLOCK_DUEL') {
          if (isAirborne) {
            coachHint.textContent = '🛡️ 雙人起跳封死角度！雙手下壓罩頂！';
            coachHint.style.color = '#38ef7d';
            coachHint.style.borderColor = 'rgba(56,239,125,0.5)';
          } else {
            coachHint.textContent = '⚡ 對手主攻起跳！點擊螢幕【起跳攔網】！';
            coachHint.style.color = '#ff416c';
            coachHint.style.borderColor = 'rgba(255,65,108,0.5)';
          }
        } else {
          coachHint.textContent = '🛡️ 防守回合結算中';
          coachHint.style.color = '#eef2fa';
          coachHint.style.borderColor = 'rgba(110,231,255,0.3)';
        }
        return;
      }

      if (rallyPhase === 'SERVE_INBOUND') {
        coachHint.textContent = '🏐 走位迎球墊球（或由隊友自由人協防起球）';
        coachHint.style.color = '#6ee7ff';
        coachHint.style.borderColor = 'rgba(110,231,255,0.45)';
      } else if (rallyPhase === 'SETTER_TOSS') {
        coachHint.textContent = '⭐ 舉球員到位托出開網高球！點擊【助跑起跳】';
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
