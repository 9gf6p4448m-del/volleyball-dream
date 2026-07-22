// H1 五動作輸入（輸入層）：鍵盤/滑鼠＋觸控 → 與 AI 同型的 Intent，同一條管線進 sim
// 統一向量邏輯：按下＝蓄力起點與視線(gaze)、拖曳＝瞄準、放開＝出手(action+aim+timing)
// 接發＝走位到位自動觸發（一傳是反射不是瞄準）；細部手感靠試玩調參
import * as THREE from 'three';
import { createIntent } from '../sim/intent.js';
import { serverId } from '../sim/match.js';
import {
  TEAM_SIDE, isFrontRow, localToWorld, positionOf, basePosition,
} from '../sim/rotation.js';
import { standingReach } from '../sim/player.js';
import { TUNING } from '../sim/game.js';
import { attackZonesFor, crossingXOf } from './attackZones.js';
import { dutyPosition } from '../sim/ai.js';

const CHARGE_MS = 600;       // 蓄力到滿的毫秒數（timing 質量曲線，H1 可調）
const JOYSTICK_RADIUS = 64;  // 虛擬搖桿最大半徑（px）
const AUTO_RECEIVE_DIST = TUNING.REACH_RADIUS * 0.9;
const BUFFER_TICKS = 36;     // 出手緩衝：放開後持續嘗試 0.6 秒（球一進可及範圍就出手）
const SALVAGE_Y = 2.15;      // 第三擊球掉到此高度以下＝錯過扣球窗，保底送安全球
const JUMP_WINDOW_MS = 900;  // 放開＝起跳揮擊後的出手有效窗

export function createMatchControls(domElement, camera, initialPlayerId, rig) {
  let playerId = initialPlayerId; // 全隊輪控：main 依球權切換（setPlayerId）
  const keys = new Set();
  let joystick = null;              // { pointerId, ox, oy, dx, dy }
  let charge = null;                // { pointerId, startedAt, gaze }
  let queuedAction = null;          // { action, aim, gaze, timing }
  let pointerNdc = { x: 0, y: 0 };
  let pointerPx = { x: 0, y: 0 };   // 螢幕像素座標（觸控 UI 疊層用）
  let jumpSignal = false;           // 本次按下觸發了起跳（main 轉給表現層播 windup）
  let jumpStartedAt = 0;
  let blockSignal = false;          // 本次出手是攔網（main 轉給表現層立即播跳攔）
  let attackChosen = false;         // 進攻決策：本次扣球已選區（面板不再彈、緩衝不過期）
  let blockPlan = null;             // 攔網決策：{ x:攔網站位|null(退防), jumped, until }

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  window.addEventListener('keydown', (e) => {
    if ((e.code === 'KeyJ' || e.code === 'Space') && !e.repeat) {
      e.preventDefault();
      beginCharge('key'); // J／空白鍵＝主動作蓄力
      return;
    }
    if (e.code === 'KeyK' && !e.repeat) { blockTap(); return; } // K＝攔網
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    if ((e.code === 'KeyJ' || e.code === 'Space') && charge?.pointerId === 'key') {
      releaseCharge();
      return;
    }
    keys.delete(e.code);
  });
  // 失焦：清走位鍵，並作廢蓄力——否則失焦期間放開的鍵收不到 keyup，
  // 回來後 charge 殘留會吞掉下次按鍵、或用過期 startedAt 出爆表 timing 的怪球
  window.addEventListener('blur', () => {
    keys.clear();
    charge = null;
    jumpSignal = false;
    blockSignal = false;
  });

  // 攔網：一點即出（獨立按鈕/K 鍵；不經蓄力）
  function blockTap() {
    queuedAction = {
      timing: 1, gaze: null, aimNdc: null, aimVec: null,
      forceAction: 'block', expiresTick: null, jumpAt: null,
    };
    blockSignal = true;
  }

  let lastGame = null;    // pointer 事件在 collect 之外發生，需要最近一次的比賽狀態判情境
  let lastAiState = null; // 判「舉球是不是給我」（claim/attacker）用

  // 開始蓄力（指標路徑與按鈕路徑共用；扣球情境＝同時自動助跑，見 collect）
  function beginCharge(source) {
    if (charge) return;
    charge = {
      pointerId: source, startedAt: performance.now(),
      gaze: null,
      btnDrag: source === 'button' ? { dx: 0, dy: 0 } : null,
    };
  }

  // 結束蓄力 → 出手排 queue；扣球情境＝放開那一刻起跳揮擊（一體化）
  // timing 不封頂：>1.15 ＝超蓄（sim 判品質劣化，如 2K 出手太晚）
  function releaseCharge() {
    if (!charge) return;
    const held = performance.now() - charge.startedAt;
    const drag = charge.btnDrag;
    const ctx = lastGame ? contextAction(lastGame) : null;
    const spikeCtx = ctx === 'spike';
    if (spikeCtx) {
      jumpSignal = true; // 起跳＝放開瞬間（windup 由 main 轉表現層）
      jumpStartedAt = performance.now();
    }
    let timing = held / CHARGE_MS;
    if (ctx === 'receive' && lastGame) {
      // Perfect 接球：放開瞬間球正好進可及範圍且下墜＝1.0（一傳最準）；
      // 提前按＝0.7（緩衝出手的標準品質）。只加分不懲罰
      const me = lastGame.players[playerId];
      const a = lastGame.actors[playerId];
      const b = lastGame.ball;
      const near = Math.hypot(b.x - a.x, b.z - a.z) <= TUNING.REACH_RADIUS * 1.1;
      timing = near && b.vy < 0 && b.y <= standingReach(me) + 0.6 ? 1 : 0.7;
    }
    queuedAction = {
      timing,
      gaze: charge.gaze,
      aimNdc: drag ? null : { ...pointerNdc },
      aimVec: drag && Math.hypot(drag.dx, drag.dy) > 14 ? { ...drag } : null,
      expiresTick: null,
      jumpAt: spikeCtx ? performance.now() : null, // 起跳時刻（滯空窗判定，活時間比較）
    };
    charge = null;
  }

  domElement.addEventListener('pointerdown', (e) => {
    // 觸控：左 40% 螢幕＝走位搖桿；其餘不做事（出手一律走右側按鈕，防誤觸）
    if (e.pointerType === 'touch') {
      if (e.clientX < window.innerWidth * 0.4 && !joystick) {
        joystick = { pointerId: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
      }
      return;
    }
    // 滑鼠：球場指標瞄準＋蓄力（桌機仍可用滑鼠玩）
    updateNdc(e);
    if (!charge) {
      beginCharge(e.pointerId);
    }
  });

  domElement.addEventListener('pointermove', (e) => {
    if (joystick && e.pointerId === joystick.pointerId) {
      joystick.dx = e.clientX - joystick.ox;
      joystick.dy = e.clientY - joystick.oy;
      return;
    }
    updateNdc(e);
  });

  const endPointer = (e) => {
    if (joystick && e.pointerId === joystick.pointerId) {
      joystick = null;
      return;
    }
    if (charge && e.pointerId === charge.pointerId) {
      updateNdc(e);
      releaseCharge();
    }
  };
  domElement.addEventListener('pointerup', endPointer);
  domElement.addEventListener('pointercancel', endPointer);

  function updateNdc(e) {
    pointerPx = { x: e.clientX, y: e.clientY };
    pointerNdc = {
      x: (e.clientX / window.innerWidth) * 2 - 1,
      y: -(e.clientY / window.innerHeight) * 2 + 1,
    };
    rig.setLook(pointerNdc.x, pointerNdc.y);
  }

  // 指標 → 地面座標（瞄準用）
  function groundPoint(ndc) {
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, hit)) return { x: hit.x, z: hit.z };
    return null;
  }

  // 依比賽狀態決定這一下是哪個動作（玩家不用記按鍵表，情境即語意）
  function contextAction(game) {
    const me = game.players[playerId];
    if (game.phase === 'serve') {
      return serverId(game.match) === playerId ? 'serve' : null;
    }
    if (game.phase !== 'rally') return null;
    const r = game.rally;
    if (r.possession === me.teamId && r.touches === 2) return 'spike';
    if (r.possession === me.teamId && r.touches === 1) return 'set';
    const a = game.actors[playerId];
    const nearNet = Math.abs(a.z) < 4.2; // 前區＋一步內都可起攔（手機容錯）
    if (r.possession && r.possession !== me.teamId &&
        isFrontRow(game.match.rotations[me.teamId], playerId) && nearNet) {
      return 'block';
    }
    return 'receive';
  }

  return {
    // 主迴圈每個固定步長呼叫；輸出與 AI 同型的 Intent（sim 不知來源）
    // aiState：唯讀參考 AI 協調層的呼叫鎖定（誰的球）與攻擊手選擇，做輔助判斷
    collect(game, aiState = null) {
      lastGame = game;
      lastAiState = aiState;
      // 非扣球時刻＝重置進攻選擇旗標（下次進攻重新彈面板）
      if (attackChosen && !this.isAttackMoment(game)) attackChosen = false;
      const tick = game.tick;
      const me = game.players[playerId];
      const a = game.actors[playerId];
      let move = readMove(keys, joystick, TEAM_SIDE[me.teamId]);

      // 攔網決策執行：自動走到封線位；對方起扣瞬間自動跳攔（決策＝選線，時機自動）
      if (blockPlan) {
        const r = game.rally;
        const expired = performance.now() > blockPlan.until ||
          game.phase !== 'rally' || r.possession === me.teamId;
        if (expired) {
          blockPlan = null;
        } else {
          if (blockPlan.x !== null && Math.hypot(move.x, move.z) < 0.1) {
            const tx = blockPlan.x;
            const tz = TEAM_SIDE[me.teamId] * 0.6; // 網前攔網位
            const dx = tx - a.x;
            const dz = tz - a.z;
            const len = Math.hypot(dx, dz);
            if (len > 0.12) move = { x: dx / len, z: dz / len };
          }
          if (blockPlan.x !== null && !blockPlan.jumped && r.profile === 'spike') {
            blockPlan.jumped = true; // 對方扣了 → 跳攔
            blockTap();
          }
        }
      }

      // 發球階段自動歸位（FIVB 7.5：發球瞬間站位違規＝對方得分）——
      // 沒推搖桿就走回輪轉基準位；堅持推著亂站＝吃真實站位犯規（發球員不歸位）
      if (game.phase === 'serve' && playerId !== serverId(game.match) &&
          Math.hypot(move.x, move.z) < 0.1) {
        const pos = positionOf(game.match.rotations[me.teamId], playerId);
        const t = basePosition(me.teamId, pos);
        const dx = t.x - a.x;
        const dz = t.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.3) move = { x: dx / len, z: dz / len };
      }

      // 自動走位（The Spike 式，設計主軸）：歸你的球自動跑到位——
      // 含扣球助跑、接發、二傳；搖桿有輸入時尊重手動微調。走位挫折歸零，時機才是玩家的表達
      if (game.phase === 'rally' && aiState?.landing &&
          aiState.claimId === playerId && Math.hypot(move.x, move.z) < 0.1) {
        const b = game.ball;
        const sp = Math.hypot(b.vx, b.vz);
        const off = sp > 0.5 ? 0.3 : 0; // 站落點下游側，觸球點在身前
        const tx = aiState.landing.x + (off ? (b.vx / sp) * off : 0);
        const tz = aiState.landing.z + (off ? (b.vz / sp) * off : 0);
        const dx = tx - a.x;
        const dz = tz - a.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.12) move = { x: dx / len, z: dz / len };
      } else if (game.phase === 'rally' && !charge && !blockPlan &&
          Math.hypot(move.x, move.z) < 0.1) {
        const r = game.rally;
        const atkId = aiState?.attackerId;
        if (r.possession === me.teamId && r.touches >= 1 &&
            atkId && atkId !== playerId && aiState.claimId !== playerId) {
          // 退防補位（攔網保護）：舉球給隊友時，自動退到攻擊手身後——
          // 被攔回彈的球落在這裡，你救得起（也壓低「攔網直接得分」比例）
          const atk = game.actors[atkId];
          const side = TEAM_SIDE[me.teamId];
          const tx = atk.x * 0.6;         // 略收向中線
          const tz = atk.z + side * 2.3;  // 攻擊手身後（本方場內）
          const dx = tx - a.x;
          const dz = tz - a.z;
          const len = Math.hypot(dx, dz);
          if (len > 0.25) move = { x: dx / len, z: dz / len };
        } else if (aiState?.claimId !== playerId) {
          // 站位交換（真實排球）：待命時自動跑職責位——前排 OH 左翼/MB 中/OPP 右翼
          // （發球觸球後換位；後排回輪轉基準位）。搖桿有輸入時尊重手動
          const t = dutyPosition(game, me.teamId, playerId);
          const dx = t.x - a.x;
          const dz = t.z - a.z;
          const len = Math.hypot(dx, dz);
          if (len > 0.3) move = { x: dx / len, z: dz / len };
        }
      }

      let action = null;
      let aim = { x: 0, z: -6.5 * TEAM_SIDE[me.teamId] }; // 預設瞄對方深區
      let gaze = null;
      let timing = 1;

      if (queuedAction) {
        // 出手緩衝：放開後持續投遞到成功（onEvents 清除）或逾時——按了就會打
        if (queuedAction.expiresTick === null) {
          queuedAction.expiresTick = tick + BUFFER_TICKS;
        }
        action = queuedAction.forceAction ?? contextAction(game);
        if (action === 'block' && !queuedAction.forceAction) blockSignal = true;
        // 起跳滯空窗：放開起跳後 JUMP_WINDOW_MS 內是扣球窗，超過（落地了）降級安全球
        // 用「現在」與起跳時刻比較（活時間）；jumpAt/releasedAt 同時設定會讓比較恆真＝死邏輯
        if (action === 'spike') {
          const airborneMs = queuedAction.jumpAt === null
            ? Infinity
            : performance.now() - queuedAction.jumpAt;
          if (airborneMs > JUMP_WINDOW_MS) action = 'receive';
        }
        if (queuedAction.aimWorld) {
          aim = queuedAction.aimWorld; // 進攻決策：直接指定世界落點（點選攻擊區）
        } else if (queuedAction.aimVec) {
          // 按鈕拖曳瞄準：螢幕向量→場地方向（上＝朝對場、右＝+x），距離隨拖曳長度 3–9m
          const d = queuedAction.aimVec;
          const len = Math.hypot(d.dx, d.dy) || 1;
          const dist = 3 + (Math.min(len, 130) / 130) * 6;
          aim = { x: a.x + (d.dx / len) * dist, z: a.z + (d.dy / len) * dist };
        } else if (queuedAction.aimNdc) {
          const ground = groundPoint(queuedAction.aimNdc);
          if (ground) aim = ground;
        }
        gaze = queuedAction.gaze ?? rig.gazePoint(game);
        timing = queuedAction.timing;
        // 進攻決策的扣球：保持有效到球可扣（不用 36-tick 緩衝），球掉太低才放棄讓 auto 保底
        // 發球等哨音沒有時限；其餘動作逾時作廢
        const waitingServe = game.phase === 'serve' && action === 'serve';
        if (queuedAction.attack) {
          if (game.ball.y < 1.3) queuedAction = null;
        } else if (!waitingServe && tick >= queuedAction.expiresTick) {
          queuedAction = null;
        }
      } else if (charge && rig.getMode() === 'first' && !charge.gaze) {
        // 一人稱蓄力中：按下當下的視線＝gaze（看哪），之後拖到別處放開＝aim（打哪）
        charge.gaze = rig.gazePoint(game);
      } else if (game.phase === 'rally' && !charge) {
        // 自動輔助（玩家沒出手時的反射與保底；主動操作永遠優先）
        const r = game.rally;
        const b = game.ball;
        const canTouch = r.touches < 3 &&
          !(r.profile === 'serve' && r.lastTouchTeam === me.teamId) &&
          r.lastToucherId !== playerId;
        const near = Math.hypot(b.x - a.x, b.z - a.z) <= AUTO_RECEIVE_DIST;
        const reachable = near && b.vy < 0 && b.y <= standingReach(me) + 0.3;
        const claimedToMe = aiState?.claimId === playerId;
        if (canTouch && reachable && r.touches === 0) {
          // 到位自動接（一傳是反射不是瞄準）；品質 0.6——主動抓 Perfect 才有更準的一傳
          action = 'receive';
          aim = localToWorld(me.teamId, 1.2, 1.2);
          timing = 0.6;
        } else if (canTouch && reachable && claimedToMe && r.touches === 1) {
          // 這球歸你的二傳保底：自動舉給攻擊手
          action = 'set';
          const atk = aiState?.attackerId && game.actors[aiState.attackerId];
          const lane = atk ? -TEAM_SIDE[me.teamId] * atk.x : 2;
          aim = localToWorld(me.teamId, lane, 1.3);
          timing = 0.75;
        } else if (canTouch && reachable && claimedToMe && r.touches === 2 &&
            b.y < SALVAGE_Y) {
          // 錯過扣球窗的保底：送安全球過網（主動跳扣永遠更強）
          action = 'receive';
          aim = localToWorld(me.teamId === 'A' ? 'B' : 'A', 0, 6.5);
          timing = 0.6;
        }
      }

      return [createIntent({ playerId, tick, move, action, aim, gaze, timing })];
    },
    // 出手成功（sim 發出我的觸球/發球事件）→ 清掉緩衝
    onEvents(events) {
      if (!queuedAction) return;
      for (const e of events) {
        if ((e.type === 'TOUCH' || e.type === 'SERVE') && e.playerId === playerId) {
          queuedAction = null;
          return;
        }
      }
    },
    isCharging() { return charge !== null; },
    // 全隊輪控：切換受控球員（清掉舊人的蓄力/緩衝，避免指令錯掛）
    setPlayerId(id) {
      if (id === playerId) return;
      playerId = id;
      queuedAction = null;
      charge = null;
      jumpSignal = false;
      blockSignal = false;
      blockPlan = null;
    },
    getPlayerId() { return playerId; },
    // NBA2K 式按鈕路徑（actionButtons UI 呼叫）；px/py＝拇指螢幕座標（蓄力圈定位用）
    beginAction(px, py) {
      if (px != null) pointerPx = { x: px, y: py };
      beginCharge('button');
    },
    dragAction(dx, dy, px, py) {
      if (!charge?.btnDrag) return;
      charge.btnDrag = { dx, dy };
      if (px != null) pointerPx = { x: px, y: py };
    },
    endAction() { if (charge?.btnDrag) releaseCharge(); },
    pressBlock() { blockTap(); },
    // 當前情境動作（按鈕標籤用）：'serve'|'spike'|'set'|'block'|'receive'|null
    currentContext() { return lastGame ? contextAction(lastGame) : null; },

    // ---- 進攻決策模式（簡化操作：讀攔網選攻擊區）----
    // 是否輪到玩家扣球：我方第三擊、且**這顆舉球分配給我**（claim 指到我）
    // ——不限前排：後排被分配 pipe 也觸發（起跳點合法性由 AI 舉球目標＋sim 規則把關）
    isAttackMoment(game) {
      const me = game.players[playerId];
      const r = game.rally;
      if (game.phase !== 'rally' || r.possession !== me.teamId || r.touches !== 2) return false;
      if (r.lastToucherId === playerId) return false; // 舉球員不是攻擊手
      if (lastAiState?.claimId !== playerId) return false; // 這球舉給隊友
      return true;
    },
    // 目前可選攻擊區（含讀攔網）；非扣球時刻回傳 null
    attackZones(game) {
      return this.isAttackMoment(game) ? attackZonesFor(game, playerId) : null;
    },
    // 選定攻擊區 → 排入強制扣球（自動起跳、球到即扣，瞄該區）
    chooseAttack(zone) {
      jumpSignal = true;
      attackChosen = true;
      queuedAction = {
        timing: zone.power, gaze: null, aimWorld: zone.aim,
        aimNdc: null, aimVec: null, forceAction: 'spike',
        expiresTick: null, jumpAt: performance.now(), attack: true,
      };
    },
    // 本次扣球是否已選區（main 用來停止彈面板）
    attackPending() { return attackChosen; },
    // 發球（決策選區；未指定則發預設深區）
    serveNow(game, aim = null) {
      const me = game.players[playerId];
      if (game.phase !== 'serve' || serverId(game.match) !== playerId) return;
      const oppTeam = me.teamId === 'A' ? 'B' : 'A';
      const target = aim ?? localToWorld(oppTeam, 1.5, 7.5);
      queuedAction = {
        timing: 1, gaze: null, aimWorld: target, aimNdc: null, aimVec: null,
        forceAction: 'serve', expiresTick: null, jumpAt: null,
      };
    },
    // 發球目標區選項（對方半場，隊伍視角換算世界座標）
    serveZones(game) {
      const me = game.players[playerId];
      const opp = me.teamId === 'A' ? 'B' : 'A';
      return [
        { key: 'dl', label: '深左', aim: localToWorld(opp, 2.8, 7.8) },
        { key: 'dm', label: '深中', aim: localToWorld(opp, 0, 8.0) },
        { key: 'dr', label: '深右', aim: localToWorld(opp, -2.8, 7.8) },
        { key: 'short', label: '短球', aim: localToWorld(opp, 0, 3.6) },
      ];
    },

    // ---- 攔網決策（防守面的讀取：他選線、你封線）----
    // 對方第三擊將至且我在前排＝攔網決策時刻
    isDefendMoment(game, aiState) {
      const me = game.players[playerId];
      const r = game.rally;
      if (game.phase !== 'rally' || !r.possession || r.possession === me.teamId) return false;
      if (r.touches !== 2) return false;
      if (!isFrontRow(game.match.rotations[me.teamId], playerId)) return false;
      return !!(aiState?.claimId && game.players[aiState.claimId]?.teamId === r.possession);
    },
    // 攔網選項：封直線/封斜線（站到該線過網點）/退防（不攔）
    blockOptions(game, aiState) {
      const atkId = aiState?.claimId;
      if (!atkId) return null;
      const zones = attackZonesFor(game, atkId); // 對方攻擊手的可打路線
      const atk = game.actors[atkId];
      const opts = [];
      for (const z of zones) {
        if (z.key === 'line') opts.push({ key: 'line', label: '封直線', x: crossingXOf(atk, z.aim) });
        if (z.key === 'cross') opts.push({ key: 'cross', label: '封斜線', x: crossingXOf(atk, z.aim) });
      }
      opts.push({ key: 'off', label: '退防', x: null });
      return opts;
    },
    chooseBlock(option) {
      blockPlan = { x: option.x, jumped: false, until: performance.now() + 5000 };
    },
    blockPlanPending() { return blockPlan !== null; },
    // 玩家剛按下起跳（一次性訊號；main 轉給表現層播 windup 跳躍）
    consumeJumpSignal() {
      const s = jumpSignal;
      jumpSignal = false;
      return s;
    },
    consumeBlockSignal() {
      const s = blockSignal;
      blockSignal = false;
      return s;
    },

    // 觸控 UI 疊層讀這裡畫搖桿/蓄力圈；render 層讀 aim 畫地面瞄準標記
    uiState() {
      if (!charge) return { joystick: joystick ? { ...joystick } : null, charge: null };
      const p = (performance.now() - charge.startedAt) / CHARGE_MS;
      return {
        joystick: joystick ? { ...joystick } : null,
        charge: {
          x: pointerPx.x, y: pointerPx.y,
          progress: p,
          sweet: p >= 0.7 && p <= 1.05, // 甜蜜區：放開＝最準（綠）
          over: p > 1.15,               // 超蓄：品質劣化（紅）
        },
      };
    },
    // 蓄力中的即時瞄準落點（地面圈）：按鈕路徑＝從球員投射拖曳方向（與出手一致）；
    // 滑鼠路徑＝指標落地點。回傳 null＝不顯示
    currentAimPoint(game) {
      if (!charge) return null;
      const g = game ?? lastGame;
      if (!g) return null;
      if (charge.btnDrag) {
        const a = g.actors[playerId];
        const d = charge.btnDrag;
        const len = Math.hypot(d.dx, d.dy);
        const side = TEAM_SIDE[g.players[playerId].teamId];
        // 拖曳夠長＝該方向；未拖＝預設朝對場（給個起始參考點）
        const dirx = len > 14 ? d.dx / len : 0;
        const dirz = len > 14 ? d.dy / len : -side;
        const dist = 3 + (Math.min(len, 130) / 130) * 6;
        return { x: a.x + dirx * dist, z: a.z + dirz * dist };
      }
      return groundPoint(pointerNdc);
    },
  };
}

// 走位向量：WASD/方向鍵 或 觸控搖桿 → 世界座標方向（W＝朝網）
function readMove(keys, joystick, side) {
  let x = 0;
  let z = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (side === -1) { x = -x; z = -z; } // B 隊視角鏡像（Phase 1 玩家固定 A 隊，預留）

  if (joystick) {
    x = joystick.dx / JOYSTICK_RADIUS;
    z = joystick.dy / JOYSTICK_RADIUS;
    if (side === -1) { x = -x; z = -z; }
  }
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  return { x, z };
}
