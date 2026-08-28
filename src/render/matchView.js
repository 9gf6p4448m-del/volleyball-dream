// 比賽球員視覺：12 名幾何關節球員對映 sim actors（只讀 sim 狀態＋插值，絕不寫回）
// vow3d 路線：零模型檔（無 GLTF/骨架/mixer），角色由 geoCharacter 程式拼裝、
// 動畫由 geoAnimator 程序化驅動——載入零等待、軸向全掌控
import * as THREE from 'three';
import { SIM_DT } from '../sim/constants.js';
import { TEAM_SIDE, isFrontRow } from '../sim/rotation.js';
import { serverId } from '../sim/match.js';
import {
  createGeoCharacter, createGeoPool, BASE_H, getNumberTexture,
} from './geoCharacter.js';
import { numbersForRoster, initialOnCourtIds } from '../career/teamKit.js';
import { createGeoAnimator, contactSeqFor } from './geoAnimator.js';
import { STAMINA, tierOf, staminaPerfMul } from '../sim/stamina.js';
import { TUNING } from '../sim/game.js';
import { HUDDLE, huddleSlot, coachPos } from './huddleLayout.js';
import { createHuddleProps } from './huddleProps.js';
import { FACING, facingTarget, approachYaw, shortestArc } from './facing.js';
import {
  REACH, reachWindow, reachBias, applyReachBias, localBallOffset, worldReachOffset,
} from './reachAssist.js';
import { REACH_ACTION } from '../sim/reach.js';

// 提前觸發的有效期（秒）：這麼久還沒觸到球就作廢、放行 TOUCH 重播一次——寧可補一次
// 動作，也不要整拍沒動作。探針實測「提前觸發→實際觸球」最長 41 tick（0.68s，舉球提前量
// 29 tick ＋ 球最多晚到 12 tick），取 1.0s 留裕度：實跑 2284 次接管中，
// 「壓住 TOUCH 卻已播完（該拍無動作）」0 次
const CONTACT_ARM_TTL = 1.0;
const TAG_COLORS = { A: '#6ee7ff', B: '#ff9d7a' };
// 頭上標籤＝排球標準角色縮寫（命名統一：廢除 P1–P6 泛稱）
const ROLE_TAG = { setter: 'S', outside: 'OH', middle: 'MB', opposite: 'OPP', libero: 'L' };

// 轉身收斂率／轉速上限／近身混合帶皆在 facing.js 的 FACING（純函式可單測）
// 魚躍飛撲視覺（純表現，sim 不含位移）：沿朝向撲出一段＋身體前傾接近水平
const DIVE_RECOVER = 42;   // 同 sim TUNING.DIVE_RECOVER_TICKS（魚躍倒地恢復＝撲救動畫時長）
const DIVE_LUNGE = 1.35;   // 撲出水平距離（m）
const DIVE_TILT = 1.2;     // 撲出時身體前傾（rad，接近水平 1.57）
const DIVE_HOP = 0.22;     // 撲出微騰空（m，飛撲離地的弧）
// W7.1 #3A：暫停集合帶位（純視覺，不動 sim actors——比照魚躍純視覺位移前例）
// W8 暫停演出（07-26 拍板 B 案）：幾何改圍圈弧（huddleLayout 單一事實源）、
// 兩隊各自圍自家教練（真實排球任一方暫停雙方都回板凳圈）、教練＋戰術板道具
const HUDDLE_K = 3.2;              // 走位插值收斂率（指數平滑，同 TURN_K 家族手感）
// 夠球視覺補償（reachAssist.js）：哪些動作用哪一組手臂——舉球/接球＝雙手平墊、
// 扣球/發球＝慣用手。未列出的動作（cheer/wave/nod/block…）不改變上一次的設定，
// 真正該關掉補償的情境（攔網/魚躍/非 rally/圍圈）由 sync 內的閘門負責
const REACH_KIND = {
  bump: 'both', overhead: 'both', receiveReady: 'both', setReady: 'both', dive: 'both',
  spike: 'dominant', windup: 'dominant', windupHesitant: 'dominant',
  approach3: 'dominant', approach4: 'dominant',
  serve: 'dominant', serveJump: 'dominant', serveFloat: 'dominant',
};
// 07-30：reachWindow 的水平全開半徑改吃 reachRadiusFor（單一真相），依「動作別」
// 而不只是「雙手/慣用手」——三動作可及半徑不同（接 0.38H＜舉 0.45H＜扣 0.55H）。
// 這張表跟上面 REACH_KIND 分開維護，因為粒度不同：'overhead' 同時是舉球正式動作、
// 也是（罕見）高手接球的死碼分支（見 geoAnimator.contactSeqFor），這裡近似算 SET——
// 半徑比接球寬，寧可窗開早一點也不要把該補的接球關掉。未列出的動作
// （windup/approach/serve…非「碰別人來的球」）沿用最後一次登記值，初始值 SPIKE
// （見 units 初始化）——三動作中最寬，同一份保守預設
const REACH_KIND_ACTION = {
  bump: REACH_ACTION.RECEIVE, receiveReady: REACH_ACTION.RECEIVE,
  overhead: REACH_ACTION.SET, setReady: REACH_ACTION.SET,
  spike: REACH_ACTION.SPIKE, dive: REACH_ACTION.DIVE,
};

// kits（配色卷批 1）：{ A?, B? } 各側隊伍 kit（career/teamKit.js 形狀）；
// null/缺鍵＝該側穿 geoCharacter 側別預設（快速比賽、練習賽、無 kit 的隊）
// teamName（配色卷階段二 E4）：現在的隊名字串，只餵給暫停戰術板（huddleProps）；
// null＝該檔沿用內建預設字面值（快速比賽/練習賽/無 careerCtx）。★render 層不得
// 自查章節★——這個值必須從呼叫端（matchStage←matchConfig.currentTeamName）傳進來。
export async function createMatchView(
  scene, quality, game, initialControlledId, forcePose = null, kits = null, teamName = null,
) {
  let highlightId = initialControlledId;
  let huddleTeam = null; // W7.1 #3A：目前正在集合帶位的隊伍（'A'|'B'|null）——matchLoop 逐幀灌入
  let huddleViewOn = false; // W8：圈內第一人稱進行中——隱藏受控者本體（鏡頭＝他的眼睛）
  // 4.5B §7 局間 3D 圍攏：外部進度覆蓋（{team, w 0..1}｜null）——牆鐘驅動、
  // sim 凍結相容（set_break 下 tick 不動，tick 制圍圈管線不可用＝W4 §8-8 癥結的解）
  let breakHuddle = null;
  let hideOwnTag = false;   // 近身視角（defend/attack/first）：藏自己的頭上標籤
  let tagsVisible = true;   // 4.6 §2 重演特寫：全員標籤總開關（賽中恆 true）
  const castShadow = quality.shadowSize > 0;

  // InstancedMesh 池（每種幾何一池＝12 draw calls，取代每人 16+ 個獨立 Mesh）；
  // root 骨架不再加入 scene——它只是不可見的關節 Object3D 樹，逐幀由 sync() 手動
  // updateMatrixWorld 後讀 matrixWorld 寫進池（見下方 sync 尾端）
  const playerList = Object.values(game.players);
  const pool = createGeoPool(scene, castShadow, playerList.length);

  // 背號（配色卷批 2 N2/N4，F1/F2 對抗覆審修正 2026-08-24）：全名冊決定論配號——
  // 涵蓋板凳，賽中換人上場的替補在建 game 當下就已經有號碼（numbersForRoster，
  // src/career/teamKit.js，純函式、與測試共用同一份實作，見 F2）。
  // ★ F1 修前這裡只給「開場上場 7 人」配號——applySubstitution 把板凳 id 寫進
  // rotations 後，該球員 numberSlots=null，整場沒背號。現在號碼與「現在站不站在
  // 場上」脫鉤：numberSlots 一律建（cheap，只是關節樹裡的 Object3D，不是 Mesh），
  // 只有「要不要現在就建看得見的 Mesh」才分開場/惰性兩批（見下方 eagerNumberIds）。
  const numberMap = numbersForRoster(playerList);
  // 開場就建 Mesh 的名單＝上場 14 人（N4 mesh 上限＝14×2＝28≤30，見 initialOnCourtIds）；
  // 其餘板凳球員的 Mesh 留到 routeEvents 的 SUBSTITUTION 分支惰性補建，不計入這個上限。
  const eagerNumberIds = new Set([
    ...initialOnCourtIds(game, 'A'), ...initialOnCourtIds(game, 'B'),
  ]);

  const units = {};
  for (const p of playerList) {
    // p.name＝慣用手的雜湊鍵（見 geoCharacter.isLeftHanded）：id 母體只有十幾個固定
    // 字面，餵名字才會有真正的左手分佈，且慣用手跟著人不跟著輪轉槽位
    const rig = createGeoCharacter(
      pool, p.id, p.teamId, p.height.current, p.currentRole === 'libero', p.name,
      kits?.[p.teamId] ?? null, numberMap[p.id] ?? null,
    );
    rig.root.rotation.order = 'YXZ'; // 先朝向(y)再前傾(x)——魚躍飛撲沿朝向前方傾倒才正確
    rig.root.rotation.y = TEAM_SIDE[p.teamId] === 1 ? Math.PI : 0; // 面向球網
    // 背號面片（N4）：只有開場上場者現在就建 Mesh；其餘 rig.numberSlots 仍在，
    // 等 SUBSTITUTION 事件把他換上場時才惰性補建（見 routeEvents）
    const buildNow = rig.numberSlots && eagerNumberIds.has(p.id);
    const numberBack = buildNow ? makeNumberPlate(scene, rig.numberSlots.back) : null;
    const numberFront = buildNow ? makeNumberPlate(scene, rig.numberSlots.front) : null;
    units[p.id] = {
      rig,
      animator: createGeoAnimator(rig),
      yaw: rig.root.rotation.y,
      tag: makeTag(scene),
      tagText: '',
      tagY: p.height.current + 0.45,
      reachKind: 'both', // 夠球補償的手臂組（見 REACH_KIND；由 setPose 逐次更新）
      reachAction: REACH_ACTION.SPIKE, // reachWindow 的動作別（見 REACH_KIND_ACTION）
      reachW: 0,         // 夠球包絡的平滑值（0..1）
      contactArm: null,  // 擊球動作提前觸發的登記（見 triggerContact／CONTACT_ARM_TTL）
      numberBack,
      numberFront,
    };
  }
  // 觸發動作＝同時記下這個動作該用哪一組手臂夠球、以及該用哪個可及半徑（表格未列＝沿用上次）
  function setPose(u, type, opts = null) {
    u.animator.trigger(type, opts);
    const kind = REACH_KIND[type];
    if (kind) u.reachKind = kind;
    const action = REACH_KIND_ACTION[type];
    if (action) u.reachAction = action;
  }
  pool.finishColors();

  // 灰塵粒子池（跳躍落地/死球落點的塵土——夜賽聚光燈下的空氣感）
  const dust = createDust(scene);

  // W8 暫停演出：兩隊教練＋戰術板（暫停圍圈時現身；我方板的戰術由 matchLoop 灌入）
  const huddleProps = {
    A: createHuddleProps(scene, TEAM_SIDE.A, teamName),
    B: createHuddleProps(scene, TEAM_SIDE.B, teamName),
  };

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
  function routeEvents(events, gameState) {
    for (const e of events) {
      // F1（背號對抗覆審修正）：SUBSTITUTION 沒有 e.playerId（形狀是
      // {type,tick,team,inId,outId}，見 sim/game.js:1683），走獨立分支——進場者
      // （e.inId）在建 game 時就已經有號碼（numbersForRoster 涵蓋全名冊），只是
      // 開場沒建看得見的 Mesh（省 mesh 預算，見上方 eagerNumberIds／N4）；這裡補上，
      // 且只補一次（numberBack 已存在＝之前建過，不重建；不動 e.outId——他仍保留
      // 原本的背號 Mesh，繼續跟著板凳位置畫，同真實球員坐板凳仍穿著球衣號碼）
      if (e.type === 'SUBSTITUTION') {
        const inU = units[e.inId];
        if (inU && !inU.numberBack && inU.rig.numberSlots) {
          inU.numberBack = makeNumberPlate(scene, inU.rig.numberSlots.back);
          inU.numberFront = makeNumberPlate(scene, inU.rig.numberSlots.front);
        }
        continue;
      }
      const u = units[e.playerId];
      if (!u) continue;
      if (e.type === 'SERVE') {
        // 發球分式（07-24）：依本球式樣選動畫——跳發高跳全揮／飄浮站立推擊／穩定原樣
        const style = gameState.rally.serveStyle;
        setPose(u, style === 'power' ? 'serveJump' : style === 'float' ? 'serveFloat' : 'serve');
      }
      // 4.5B §8 重量感版（蹲→蹬→滯空→落地）；W2 補課④：graze（擦手）另播較保守的
      // blockJumpGraze（見 geoAnimator POSES.blockTouch 註解）——solid 與 graze 從此
      // 畫面不同，clean（乾淨過網）沒有 BLOCK_TOUCH 事件，不受影響
      else if (e.type === 'BLOCK_TOUCH') setPose(u, e.graze ? 'blockJumpGraze' : 'blockJump');
      else if (e.type === 'TOUCH') {
        // 07-29 提前觸發：這一拍的擊球動畫可能已由 matchLoop 依 contactPoint 倒數起播
        // （contactArm 記著在播哪一支）。該播什麼／要不要重播的判準全在 contactSeqFor；
        // 不論用不用得上，觸球即消耗——arm 不得跨拍殘留
        const armed = u.contactArm;
        u.contactArm = null;
        const next = contactSeqFor(e.kind, e.ballY, armed?.type ?? null, e.jumpSet);
        if (next) setPose(u, next);
        // 提前觸發的那一支還沒播到擊球關鍵幀就觸球了（預測比實際晚 1–9 tick）⇒ 追上去。
        // 只前進不回退，最壞情況＝改制前的「觸球當下才擺出擊球姿勢」，不會更差。
        // 三段式（W2 核心-1）的擊球弧特別依賴這道保險：它是預測觸發的，沒有它，
        // 預測偏晚的那些拍會在球飛走之後才壓腕
        // （魚躍除外：那一拍的動畫由 divedUntil 偵測負責，提前登記的墊球不該被推快）
        else if (armed && e.kind !== 'dive') u.animator.catchUpToHit();
      }
    }
    // 死球落點塵土（e.at＝球落地/犯規點）
    for (const e of events) {
      if (e.type === 'DEAD_BALL' && e.at) dust.burst(e.at.x, e.at.z, 16, 1.05); // 批3擴充【試玩必調】
    }
  }

  return {
    count: Object.keys(units).length,
    triggerPose(playerId, type, opts = null) {
      const u = units[playerId];
      if (u) setPose(u, type, opts); // opts 穿透（2026-08-10 快攻滯空修正：hangTicks）
    },
    // 07-29 擊球動作提前觸發（matchLoop 依 aiState.contactPoint 倒數呼叫）：讓擊球
    // 關鍵幀落在 sim 的觸球那一 tick，而不是觸球後 0.2–0.3s。與 triggerPose 的差別
    // 只在**登記 arm**——後續的 TOUCH 事件看到同型別就不重播（見 routeEvents）
    // hitInTicks＝呼叫端預估「還有幾 tick 觸球」（可省略）：擊球弧用它做短滯空壓縮
    // （見 geoAnimator startSeq；三段式 W2 核心-1）
    triggerContact(playerId, type, hitInTicks = null) {
      const u = units[playerId];
      if (!u) return;
      setPose(u, type, hitInTicks != null ? { hitInTicks } : null);
      u.contactArm = { type, ttl: CONTACT_ARM_TTL };
    },
    setControlled(id) { highlightId = id; },
    setTimeoutHuddle(team) { huddleTeam = team; }, // W7.1 #3A：null＝無人集合
    // W8 暫停演出：教練在戰術板上畫本次選項（'calm'/'fire'；散場自動重置）
    setHuddlePlay(team, play) { huddleProps[team]?.drawPlay(play); },
    setHuddleView(v) { huddleViewOn = v; }, // 與 cameraRig 同一顆布林（matchLoop 灌入）
    // 4.5B §7：局間圍攏進度（team＋w 0..1；null＝關）——演出時鐘逐幀灌入
    setBreakHuddle(team, w = 0) { breakHuddle = team ? { team, w } : null; },
    // 07-26：近身視角（防守/攻擊/一人稱）隱藏「自己的」頭上標籤——近距離下標籤爆大
    // 橫在畫面中央擋住讀線；身分已由視角本身確立，不需要再標「你·OH」
    setHideOwnTag(v) { hideOwnTag = v; },
    // 4.6 §2：重演特寫時收掉全部頭上標籤（回放是記憶不是 HUD——近身構圖下
    // 名牌會爆大擋住那一拍）。預設 true＝賽中行為零改變
    setTagsVisible(v) { tagsVisible = v; },
    setHot(hot) {
      if (hot === ringHot) return;
      ringHot = hot;
      ring.material.color.setHex(hot ? 0xff8c42 : 0x6ee7ff);
      ring.scale.setScalar(hot ? 1.35 : 1);
    },
    // alpha＝步間插值；dt＝畫面幀時間；frameEvents＝本幀 sim 事件（驅動姿勢）
    sync(gameState, alpha, dt, frameEvents = []) {
      routeEvents(frameEvents, gameState);
      // W8 暫停演出：教練與戰術板只在圍圈窗內現身（與隊員聚攏同一組判準）
      const huddleActive = huddleTeam != null && gameState.phase === 'serve' &&
        (gameState.serveReadyTick - gameState.tick) > HUDDLE.WALK_BACK_TICKS;
      huddleProps.A.setVisible(huddleActive || (breakHuddle?.team === 'A' && breakHuddle.w > 0.05));
      huddleProps.B.setVisible(huddleActive || (breakHuddle?.team === 'B' && breakHuddle.w > 0.05));
      // W7 B4④：氣勢極端不利方（僅正負滿檔 ±MOMENTUM_MAX 才觸發，讀原始 value 不做粗訊號分級）
      const dejectedTeam = gameState.momentum && Math.abs(gameState.momentum.value) === TUNING.MOMENTUM_MAX
        ? (gameState.momentum.value > 0 ? 'B' : 'A')
        : null;
      for (const [id, u] of Object.entries(units)) {
        const pTeam = gameState.players[id].teamId;
        // 提前觸發逾時作廢（預測失準、球改道或這球根本不是他碰）：放行後續 TOUCH 重播
        if (u.contactArm && (u.contactArm.ttl -= dt) <= 0) u.contactArm = null;
        // 魚躍：偵測新倒地（divedUntil 剛跳到未來）→ 撲救動畫；撲到有 TOUCH、撲空無事件，
        // 都靠這裡演，修「按魚躍站著不動」bug（sim 端已倒地、缺的是視覺）
        const diveActor = gameState.actors[id];
        if (diveActor.divedUntil > gameState.tick && diveActor.divedUntil !== u.lastDived) {
          u.animator.trigger('dive');
          // 4.5B §8 小件：魚躍塵土（落地擦出的塵——重量感；同 DEAD_BALL 塵土管線）
          dust.burst(diveActor.x, diveActor.z, 8, 0.7);
        }
        u.lastDived = diveActor.divedUntil;
        // 4.5B §8（07-28 二輪，Sawmah：「重量感怎麼變回以前」）：攔網重量感綁
        // 「起跳」不綁「碰球」——偵測 sim 起跳沿（blockUntil 前沿，魚躍同範式），
        // 每次真跳都播蹲→蹬→滯空→落地；待命牆姿維持舉手 hold（合攔的牆不動）
        if (diveActor.blockUntil > gameState.tick && diveActor.blockUntil !== u.lastBlockUntil) {
          u.animator.trigger('blockJump');
        }
        u.lastBlockUntil = diveActor.blockUntil;
        // 舉手備戰：①攔網窗開著②對方進攻組織中且我在網前——攻擊方讀攔網看得到手牆
        let blockDuty = false;
        const onCourt = gameState.match.rotations[pTeam].includes(id);
        // W7 A4③：喘氣 idle——場上（雙方）跌破 50% 者，死球間隙以撐膝彎腰取代待命姿勢
        // （原始檔位——這是可讀訊號不是效果；發球員例外，見下方 else if 先攔）
        // N1（2026-07-30 疲勞可視化）：重度檔（<25%）撐膝彎腰演出加深——單一真相仍是
        // tierOf/staminaPerfMul（src/sim/stamina.js），這裡只挑選演出姿勢，不算第二份數值
        const staminaTierVal = gameState.stamina && onCourt ? tierOf(gameState.stamina[id] ?? 1) : 0;
        const tired = staminaTierVal >= 1;
        if (forcePose) {
          u.animator.setHold(forcePose);
        } else if (gameState.phase === 'serve' && serverId(gameState.match) === id
          && u.animator.isIdle()) {
          // 發球前持球預備（07-24 連貫性）：等哨/等面板期間捧球站位——
          // 發球瞬間直接銜接分式揮擊，不再「罰站→憑空揮手」
          u.animator.setHold('serveReady');
        } else if (gameState.phase === 'serve' && tired) {
          // 體力喘氣優先於氣勢低落（拍板：兩者相撞時喘氣贏）；重度檔換更深的撐膝彎腰
          u.animator.setHold(staminaTierVal >= 2 ? 'gaspHeavy' : 'gasp');
        } else if (gameState.phase === 'serve' && onCourt && pTeam === dejectedTeam) {
          u.animator.setHold('dejected');
        } else {
          const teamB = pTeam;
          const r = gameState.rally;
          const ready =
            gameState.phase === 'rally' &&
            r.possession && r.possession !== teamB && r.touches >= 1 &&
            isFrontRow(gameState.match.rotations[teamB], id) &&
            Math.abs(gameState.actors[id].z) < 2.2;
          blockDuty = gameState.actors[id].blockUntil >= gameState.tick || ready;
          u.animator.setHold(blockDuty ? 'block' : null);
        }
        // W8 圈內第一人稱：鏡頭就是受控者的眼睛——隱藏他的本體與標籤（防身體擋鏡）
        const hideMe = huddleViewOn && id === highlightId;
        u.rig.root.scale.setScalar(hideMe ? 0.0001 : 1);
        // 標籤另加近身視角條件（07-26）：自己的標籤在防守/攻擊/一人稱下爆大擋讀線
        u.tag.sprite.visible = tagsVisible && !hideMe && !(hideOwnTag && id === highlightId);

        const a = gameState.actors[id];
        let x = a.px + (a.x - a.px) * alpha;
        let z = a.pz + (a.z - a.pz) * alpha;

        // W7.1 #3A→W8 暫停圍圈（07-26 二輪：真圓圈）：任一方喊暫停＝兩隊各自圍自家
        // 教練；我方主角恆佔圈口（slot 0＝固定視角），隊友依輪轉序填 1..5 環繞。
        // 倒數剩 1.5s 散開走回。純顯示位移（比照魚躍前例）
        const inHuddleWindow = huddleTeam != null && onCourt && gameState.phase === 'serve' &&
          (gameState.serveReadyTick - gameState.tick) > HUDDLE.WALK_BACK_TICKS;
        // 4.5B §7：局間圍攏＝外部進度直接定權重（牆鐘演出時鐘驅動；跳過＝定 1，
        // 與播完逐值一致）；否則沿 tick 制暫停圍圈的指數平滑
        const breakW = breakHuddle && onCourt && pTeam === breakHuddle.team
          ? breakHuddle.w : null;
        u.huddleW = breakW ?? ((u.huddleW ?? 0) +
          ((inHuddleWindow ? 1 : 0) - (u.huddleW ?? 0)) * (1 - Math.exp(-HUDDLE_K * dt)));
        if (u.huddleW > 0.001) {
          const rot = gameState.match.rotations[pTeam] ?? [];
          let slotIdx;
          if (pTeam === gameState.players[highlightId]?.teamId) {
            slotIdx = id === highlightId
              ? 0
              : rot.filter((pid) => pid !== highlightId).indexOf(id) + 1;
          } else {
            slotIdx = Math.max(0, rot.indexOf(id));
          }
          const hp = huddleSlot(TEAM_SIDE[pTeam], slotIdx);
          x += (hp.x - x) * u.huddleW;
          z += (hp.z - z) * u.huddleW;
        }

        // 頭上標籤：角色縮寫（S/OH/MB/OPP；玩家標「你·」前綴）＋
        // W7 A4/A6 低體力變色：我方 <25% 轉紅、對手 <50% 轉黃（原始檔位，粗訊號不做精確條）
        const team0 = pTeam;
        const text = (id === highlightId ? '你·' : '') +
          (ROLE_TAG[gameState.players[id].currentRole] ?? '?');
        const staminaColor = staminaTagColor(gameState, id);
        const color = staminaColor ?? TAG_COLORS[team0];
        // 07-26 拍板（Sawmah 定稿）：迷你體力條——死球間隙雙方全員浮現、開球即收；
        // 顏色三段雙方一致（綠/<50% 黃/<25% 紅）＝顯示「真實疲勞」。對手的
        // heavyExempt 效果豁免是幕後平衡手段，玩家不需從顯示得知。量化 5% 檔控 redraw
        const barQ = gameState.stamina && gameState.phase === 'serve' && onCourt
          ? Math.max(0, Math.min(1, Math.round((gameState.stamina[id] ?? 1) * 20) / 20))
          : null;
        if (text !== u.tagText || color !== u.tagColor || barQ !== u.tagBar) {
          u.tagText = text;
          u.tagColor = color;
          u.tagBar = barQ;
          drawTag(u.tag, text, color, barQ);
        }
        u.tag.sprite.position.set(x, u.tagY, z);

        const vx = (a.x - a.px) / SIM_DT;
        const vz = (a.z - a.pz) / SIM_DT;
        const speed = Math.hypot(vx, vz);

        // 朝向（職責制）：攔網職責鎖面向網；其餘追球；圍圈轉向教練。
        // 決策全在 facing.js 的純函式（可 node 單測）——07-28 修「扣球時角色會轉圈」：
        // 原本 1.1m 硬門檻把「面向球位置」與「面向來球方向」硬切，加上舉球弧頂球速
        // 方向純屬雜訊，三次同號跳變把人捲滿一圈；現改連續混合＋球速可信門檻＋轉速上限
        const team = gameState.players[id].teamId;
        const netYaw = TEAM_SIDE[team] === 1 ? Math.PI : 0;
        const b = gameState.ball;
        // W8 圍圈朝向（四輪回饋：站定後背對教練不合理）：權重夠高才取教練座標
        const cp = (u.huddleW ?? 0) > FACING.HUDDLE_FACE_W ? coachPos(TEAM_SIDE[team]) : null;
        const targetYaw = facingTarget({
          phase: gameState.phase,
          netYaw,
          blockDuty,
          x,
          z,
          ballX: b.x,
          ballZ: b.z,
          ballDx: b.x - b.px,
          ballDz: b.z - b.pz,
          simDt: SIM_DT,
          currentYaw: u.yaw,
          huddleW: u.huddleW,
          coachX: cp?.x,
          coachZ: cp?.z,
        });
        u.yaw = approachYaw(u.yaw, targetYaw, dt);

        // 4.7 根運動：移動方向相對朝向的橫向分量——沿網橫移＝側併步（見 geoAnimator）
        const lateral = speed > 0.25
          ? Math.sin(shortestArc(u.yaw, Math.atan2(vx, vz)))
          : 0;
        // N1 疲勞可視化：助跑/起跳幅度吃 staminaPerfMul——與 sim 的彈跳折損（jumpMul，
        // game.js:479）同一個函式、同一組數字，演出只是把既有的 sim 事實做到看得見，
        // 未啟用體力系統時 staminaPerfMul 恆回 1（零副作用，行為不變）
        const staminaMul = staminaPerfMul(gameState, gameState.players[id]);
        const bodyY = u.animator.update(dt, speed, lateral, staminaMul);
        // 魚躍飛撲（純視覺）：dive 期間沿朝向前撲一段＋微騰空落地＋身體前傾接近水平——
        // sim 只有原地觸球＋倒地，往前撲的距離與傾倒全在這裡補（不寫回 sim）
        let diveX = 0; let diveZ = 0; let diveTilt = 0; let diveY = 0;
        if (a.divedUntil > gameState.tick) {
          const remain = a.divedUntil - gameState.tick; // 42→0
          const p = 1 - Math.max(0, remain) / DIVE_RECOVER; // 撲救進度 0→1
          // 爬起自然化（Sawmah 07-23：原「滑回與立起同時」＝站著溜冰＋線性回正＝殭屍彈起）：
          // 滑回提前且緩動——大半發生在身體仍前傾時（低姿爬行感）；前傾晚收尾、緩動回正
          const ease = (t) => t * t * (3 - 2 * t); // smoothstep：起緩收緩
          // 撲出位移三段：0-0.3 快速撲出、0.3-0.5 趴住、0.5-0.86 低姿爬回；0.86 後原地起身
          let lungeP;
          if (p < 0.3) lungeP = (p / 0.3) ** 0.6;
          else if (p < 0.5) lungeP = 1;
          else lungeP = 1 - ease(Math.min((p - 0.5) / 0.36, 1));
          diveX = Math.sin(u.yaw) * DIVE_LUNGE * lungeP;
          diveZ = Math.cos(u.yaw) * DIVE_LUNGE * lungeP;
          // 前傾三段：0-0.24 前撲、0.24-0.62 貼地、0.62-1 撐起回正（先爬後起，收尾放緩）
          let tiltP;
          if (p < 0.24) tiltP = p / 0.24;
          else if (p < 0.62) tiltP = 1;
          else tiltP = 1 - ease((p - 0.62) / 0.38);
          diveTilt = DIVE_TILT * tiltP;
          diveY = p < 0.4 ? DIVE_HOP * Math.sin((p / 0.4) * Math.PI) : 0; // 只撲出段微騰空、落地貼地
        }
        // 跳躍落地塵土：從空中回到地面的瞬間（含魚躍落地）
        const totalY = bodyY + diveY;
        if ((u.lastBodyY ?? 0) > 0.18 && totalY <= 0.03) dust.burst(x + diveX, z + diveZ, 8, 0.7);
        u.lastBodyY = totalY;

        // 夠球視覺補償（純表現，見 reachAssist.js）：sim 觸球判定已收斂成手點球體
        // （reach.js，t=1：接 0.38H／舉 0.45H／扣 0.55H），但 reach-probe 實測手到
        // 球心仍有落差（07-30 重測 p50 receive 0.62m／set 0.74m／spike 0.63m，
        // 垂直分量主導）——改讓人去夠球——軀幹傾／轉＋手臂延伸＋小幅根位移。
        // 閘門：只在 rally、魚躍（自己有撲出位移）／攔網（合攔的牆不該歪）／圍圈一律關閉
        const assistOff = gameState.phase !== 'rally'
          || a.divedUntil > gameState.tick
          || blockDuty || a.blockUntil >= gameState.tick
          || (u.huddleW ?? 0) > 0.05;
        const wTarget = assistOff ? 0 : reachWindow(
          Math.hypot(b.x - x, b.z - z), b.y - totalY, gameState.players[id].height.current,
          u.reachAction,
        );
        // 包絡另加時間平滑：閘門翻面／sim 逐幀跳動不得讓身體瞬間彈一下
        u.reachW += (wTarget - u.reachW) * (1 - Math.exp(-REACH.SMOOTH_K * dt));
        const off = localBallOffset(b.x - x, b.z - z, u.yaw);
        const bias = reachBias({
          right: off.right,
          fwd: off.fwd,
          up: b.y - totalY,
          w: u.reachW,
          kind: u.reachKind,
          armXR: u.rig.joints.rShoulder.rotation.x,
          armXL: u.rig.joints.lShoulder.rotation.x,
          elbowXR: u.rig.joints.rElbow.rotation.x,
          elbowXL: u.rig.joints.lElbow.rotation.x,
          trunkX: u.rig.joints.spine.rotation.x + u.rig.joints.spineUpper.rotation.x,
          scale: gameState.players[id].height.current / BASE_H,
        });
        applyReachBias(u.rig.joints, bias); // 必須無條件呼叫：spine.rotation.z 只有這裡寫
        const rOff = worldReachOffset(bias.rootRight, bias.rootFwd, u.yaw);

        // 垂直伸展加在 dust 判定之後：落地塵土仍只看動畫的跳躍弧，不被伸展誤觸
        u.rig.root.position.set(x + diveX + rOff.dx, totalY + bias.rootUp, z + diveZ + rOff.dz);
        u.rig.root.rotation.set(diveTilt, u.yaw, 0);

        // root 不在 scene 裡（無 Mesh 可畫），手動推一次 matrixWorld，
        // 再把各部件 slot 的世界矩陣寫進 InstancedMesh 池
        u.rig.root.updateMatrixWorld(true);
        for (const part of u.rig.parts) pool.writeMatrix(part, part.node.matrixWorld);
        // 背號面片（N4）：貼齊點的世界矩陣直接整份複製到獨立 Mesh——同上一行的手法，
        // 不重算一次位置/旋轉數學。numberBack 有值代表 numberFront／rig.numberSlots 皆有值
        if (u.numberBack) {
          u.numberBack.matrix.copy(u.rig.numberSlots.back.node.matrixWorld);
          u.numberBack.matrixWorldNeedsUpdate = true;
          u.numberFront.matrix.copy(u.rig.numberSlots.front.node.matrixWorld);
          u.numberFront.matrixWorldNeedsUpdate = true;
        }

        if (id === highlightId) {
          ring.position.x = x;
          ring.position.z = z;
          ring.visible = !huddleViewOn; // W8：圈內第一人稱時光圈一併藏（本體已隱藏）
        }
      }
      pool.markDirty();
      dust.update(dt);
    },
  };
}

// ---- 灰塵粒子池（單一 Points、96 槽循環使用；死粒子藏到地下）----
function createDust(scene) {
  const N = 144; // 批3擴充：死球爆塵加量後 96 槽會提早回收未死粒子【試玩必調】
  const pos = new Float32Array(N * 3).fill(-100);
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xb9a389, size: 0.09, transparent: true, opacity: 0.55,
    depthWrite: false,
  }));
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0;
  let h = 2166136261; // 決定論偽亂數（視覺層；不碰 sim rng）
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    return ((h >>> 0) % 1000) / 1000;
  };
  return {
    burst(x, z, n, power) {
      for (let k = 0; k < n; k += 1) {
        const i = cursor;
        cursor = (cursor + 1) % N;
        const ang = rnd() * Math.PI * 2;
        const sp = (0.4 + rnd() * 0.9) * power;
        pos[i * 3] = x; pos[i * 3 + 1] = 0.06; pos[i * 3 + 2] = z;
        vel[i * 3] = Math.cos(ang) * sp;
        vel[i * 3 + 1] = 0.8 + rnd() * 1.2 * power;
        vel[i * 3 + 2] = Math.sin(ang) * sp;
        life[i] = 0.4 + rnd() * 0.25;
      }
    },
    update(dt) {
      let alive = false;
      for (let i = 0; i < N; i += 1) {
        if (life[i] <= 0) continue;
        alive = true;
        life[i] -= dt;
        if (life[i] <= 0) { pos[i * 3 + 1] = -100; continue; }
        vel[i * 3 + 1] -= 4.5 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] = Math.max(0.02, pos[i * 3 + 1] + vel[i * 3 + 1] * dt);
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      if (alive) geo.attributes.position.needsUpdate = true;
    },
  };
}

// W7 A4/A6→07-26 定稿：頭上標籤低體力變色——雙方同語意 <50% 黃、<25% 紅
// （顯示「真實疲勞」；對手 heavyExempt 效果豁免是幕後平衡手段，不反映在顯示）。
// 仍是粗訊號檔位變色（精確值在死球迷你條與 ⚙ 面板）；未啟用/未跨檔＝隊色
function staminaTagColor(gameState, id) {
  if (!gameState.stamina) return null;
  const v = gameState.stamina[id] ?? 1;
  if (v < STAMINA.TIER2_BELOW) return '#ff5b5b';
  return v < STAMINA.TIER1_BELOW ? '#ffd166' : null;
}

// ---- 背號面片（配色卷批 2，N2/N4）----
// rig.numberSlots.{back,front} 只是關節樹裡的貼齊點（Object3D，不進 scene）；這裡才建
// 真正要畫的 Mesh，加進 scene，逐幀由 sync() 把貼齊點的 matrixWorld 複製過來（同 pool
// writeMatrix 的手法）。alphaTest 而非 transparent 混色：數字是二值鏤空貼圖，用 cutout
// 避免透明排序在快速移動的球員身上抖動。
function makeNumberPlate(scene, slot) {
  const geo = new THREE.PlaneGeometry(slot.size, slot.size);
  const mat = new THREE.MeshBasicMaterial({
    map: getNumberTexture(slot.number, slot.color),
    alphaTest: 0.4,
    side: THREE.DoubleSide, // 背號貼齊點的 rotation.y 已定向；雙面保險，防浮空/穿模量測誤差下被剔
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.matrixAutoUpdate = false; // 手動整矩陣複製（見 sync()），不吃 position/rotation/scale
  mesh.renderOrder = 3;
  mesh.frustumCulled = false; // 同球員本體池的理由：緊貼快速移動角色，靜態 bbox 常誤剔
  scene.add(mesh);
  return mesh;
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

// bar（07-26 拍板：死球間隙浮現的迷你體力條，雙方全員）：null＝不畫；0..1＝條長，
// 三段色雙方一致（同主角條/⚙面板）。rally 中一律 null＝畫面乾淨
function drawTag(tag, text, color, bar = null) {
  const ctx = tag.canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 56);
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(12,16,26,0.85)';
  ctx.strokeText(text, 64, bar === null ? 28 : 22);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, bar === null ? 28 : 22);
  if (bar !== null) {
    ctx.fillStyle = 'rgba(12,16,26,0.82)';
    ctx.fillRect(22, 43, 84, 11);
    ctx.fillStyle = bar < STAMINA.TIER2_BELOW ? '#ff5b5b'
      : bar < STAMINA.TIER1_BELOW ? '#ffd166' : '#60ffa0'; // 三色同主角條/⚙面板
    ctx.fillRect(24, 45, 80 * bar, 7);
  }
  tag.texture.needsUpdate = true;
}
