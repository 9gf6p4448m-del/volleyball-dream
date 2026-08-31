// H1 五動作輸入（輸入層）：鍵盤/滑鼠＋觸控 → 與 AI 同型的 Intent，同一條管線進 sim
// 統一向量邏輯：按下＝蓄力起點與視線(gaze)、拖曳＝瞄準、放開＝出手(action+aim+timing)
// 接發＝走位到位自動觸發（一傳是反射不是瞄準）；細部手感靠試玩調參
import * as THREE from 'three';
import { createIntent } from '../sim/intent.js';
import { serverId } from '../sim/match.js';
import {
  TEAM_SIDE, isFrontRow, isBackRow, localToWorld, positionOf, basePosition, servePosition,
} from '../sim/rotation.js';
import { standingReach } from '../sim/player.js';
import { TUNING } from '../sim/game.js';
import { staminaTier } from '../sim/stamina.js';
// 收斂殘留清算（難度重校卷 題 C）：玩家端的魚躍三閘原本讀 TUNING.REACH_RADIUS(1.3)＝
// 基準 A 舊值，與收斂後的真實可及脫鉤。改向單一真相取值，與 AI 端（ai.js 同一組條件）一致。
import { REACH_ACTION, reachRadiusFor, RECEIVE_HANDPOINT_H_RATIO } from '../sim/reach.js';
import { predictLanding } from '../sim/flight.js';
import { attackZonesFor, crossingXOf } from './attackZones.js';
import { setOptionsFor } from './setOptions.js';
import { mbReadFor, blockReadAllowedFor } from './blockRead.js';
import { digReadFor, digReadCorrect } from './liberoRead.js';
import { dutyPosition, digTargetFor } from '../sim/ai.js';

// W7 C2：受控者是否在場上（板凳教練視角期間為 false）——輸入層零輸入零報錯的判準
function onCourt(game, playerId) {
  const me = game.players[playerId];
  return !!me && game.match.rotations[me.teamId].includes(playerId);
}

const CHARGE_MS = 600;       // 蓄力到滿的毫秒數（timing 品質曲線，H1 可調）
const JOYSTICK_RADIUS = 64;  // 虛擬搖桿最大半徑（px）
// 攔網帶半深（|z| < 此值＝貼網可攔）：contextAction／自動跳攔／MB 讀心共用的單一真相。
// 帶寬理由與實測（tools/block-defend-probe.mjs）見 contextAction 內註解。
export const NEAR_NET_Z = 2.2;

// MB 攔網讀心時刻（W3 MB 玩法：玩家＝前排 MB、對手舉球出手瞬間）。
// 抽成純函式＝node 測試可紅綠（createMatchControls 綁 DOM 建不起來）；
// 方法 isMbMoment 委派此函式，行為單一真相在這裡。
export function mbMomentFor(game, playerId) {
  const me = game.players[playerId];
  const r = game.rally;
  if (game.phase !== 'rally' || !r.possession || r.possession === me.teamId) return false;
  if (r.touches !== 2) return false;
  // ★ 攔網時序卷 段 4（Sawmah 2026-08-01 裁定 3：乙）★
  // 「立即攔網」的時機賭局擴到**前排全員**（S／OH／OPP／MB）——原本只有 MB 有這個窗，
  // 其餘前排只能等自動跳攔，抓不了時機。
  //
  // ★ 憲法留痕 ★ 這是**既有球內輸入元件的位置擴散**，援引 OPP ⚡要球鈕的球內先例：
  // §九 禁止的是新增**決策面板**，本擴散不新增面板、不新增按鈕種類、不新增投遞路徑
  // （同一個 chooseMbTiming → blockTap → 同一條 intent）。
  //
  // MB 的專屬性**上移到資訊層**：面板誰都有，但「讀心」（一傳品質＋哪一翼在助跑，
  // 見 mbOptions）維持 MB 獨有。二次起跳等進一步補償屬 MB 身分後續討論，本卷不做。
  //
  // ⚠ 命名債：本函式與 controls 的 `isMbMoment`／`mbOptions`／`chooseMbTiming` 仍帶
  // `mb` 前綴＝歷史名，語意已不限 MB。併入 Phase 3 收尾的命名工程，本卷不改名
  // （改名要動 matchLoop 的四個呼叫點，與本段的行為改動混在一起會擋住 Δ 歸因）。
  if (!isFrontRow(game.match.rotations[me.teamId], playerId)) return false;
  // B2 修復（試玩回饋 0730 #3）：玩家選擇退防（|z| ≥ 攔網帶）＝不彈攔網賭局——
  // 「攔網站位全交玩家」的拍板下，站位就是退防意圖的唯一可讀訊號（顯式選單已收）
  return Math.abs(game.actors[playerId].z) < NEAR_NET_Z;
}
// ★ 2026-08-03 收斂殘留清算 #5 ★ 原本是模組常數 `TUNING.REACH_RADIUS * 0.9` ＝ 1.17m，
// 但收斂後真實接球可及只有 0.38×身高（175cm ⇒ 0.665）⇒ 玩家在 0.665–1.17m 這段會觸發
// 「走位到位自動接發」、實際卻搆不到 ＝ **空揮**。改成逐球員計算（係數 0.9 的設計意圖不變：
// 可及半徑的九成內才自動觸發，留一點邊界不搶主動操作）。
const AUTO_RECEIVE_MUL = 0.9;
const autoReceiveDistOf = (player) => AUTO_RECEIVE_MUL
  * reachRadiusFor(REACH_ACTION.RECEIVE, TUNING, player?.height?.current ?? null);
const BUFFER_TICKS = 36;     // 出手緩衝：放開後持續嘗試 0.6 秒（球一進可及範圍就出手）
const SALVAGE_Y = 2.15;      // 第三擊球掉到此高度以下＝錯過扣球窗，保底送安全球
const JUMP_WINDOW_MS = 900;  // 放開＝起跳揮擊後的出手有效窗
// 批 4c 拍板丙（MEDIUM-6）：二段變向的最小位移閘——第二段換算後的落點與第一段
// 落點差小於此值（公尺）＝視同誤觸吞掉（同拖曳 14px 閘的語意；桌面點按（無拖曳）
// 路徑原本沒有任何位移閘，點在原落點附近會白收變向全套代價）。0.5m 為提案值
//（未經真人試玩校準）
const RETARGET_MIN_SHIFT_M = 0.5;

// ★ 職業章批 4c「二段時間差」資格（純函式＝node 測試可紅綠，同 mbMomentFor 先例）★
// 滯空第二段變向的輸入層閘：①技術已解鎖（`?? 1` 同 sim 端 game.js 的 dive 先例——
// 快速比賽 createPlayer 預設全開、生涯顯式 0 起步）②非重度疲勞檔（F2-2；
// staminaTier 讀的就是畫面上雙方都看得到的體力條＝對手也讀得到你還能不能變向）。
// sim 端（executeTouch）用同一組條件再守一次——輸入層被繞過也長不出效果。
export function retargetEligible(game, playerId) {
  const me = game?.players?.[playerId];
  if (!me) return false;
  if ((me.techniques?.doubleSpike ?? 1) < 1) return false;
  return staminaTier(game, me) < 2;
}

// simpleMode＝決策模式：Space 讓位給魚躍（蓄力只活在 classic；J 鍵保留給老手）
export function createMatchControls(domElement, camera, initialPlayerId, rig, simpleMode = false) {
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
  let setChosen = false;            // W3 S 玩法：本次舉球已分配（面板不再彈）
  let mbChosen = false;             // W3 MB 玩法：本次讀舉球已決定時機（面板不再彈）
  let digChosen = false;            // W3 L 玩法：本次防守指揮已選/已自動（面板不再彈）
  // 大學卷批 7（08-24）：本波攔網要不要壓手（press）。★不與 mbChosen 同壽★——
  // mbChosen 在「讀舉球時刻」結束就重置（touches!==2），而攔網窗要等對方扣球出手
  // 之後才開；跟著它清會讓 press 永遠送不出去。改成「送出過一次 block intent 就清」
  // （sim 是一窗一態、窗開時定格，見 game.js:589-596，第一次送出即定案）＋球死兜底。
  let pressArmed = false;
  let digHeroSignal = false;        // W3 L 演出武裝：Perfect/魚躍起球——TOUCH 確認後消費
  let manualOwned = false;          // 本球玩家已接管走位（碰過搖桿＝整球歸你；發球階段重置）
  let diveLand = { flightId: -1, landing: null }; // 自動魚躍落點閘的逐 flight 快取
  // 池底卷 批2 P1：照片模式短路（凍結檔驗收⑤）——凍結期間畫布上的觸控交給
  // OrbitControls 環繞相機，這裡的鍵盤/指標監聽必須讓路，否則同一次拖曳會同時
  // 轉鏡頭又餵進 joystick/charge，退出後殘留的 queuedAction 會在下一 tick 誤發動作。
  let suspended = false;

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // W6.1 落點閘（拍板 07-24 Q3-A）：自動魚躍原判定式吃「瞬時球距」——朝我飛來的
  // 低球會在 dist>1.3 時觸發、球其實落在腳邊（探針 456 樣本 16% 誤撲、9% 落點 ≤0.9m）。
  // 加閘＝預測落點仍在站立可及內就不撲，等球到腳邊普通接。
  // 落點逐 flight 快取（彈道不變）；預測不到落地（理論罕見）＝放行維持原行為。
  // 只動玩家自動魚躍（輸入層）；AI 有走位深度天然少誤撲，sim 不動＝balance 零擾動
  // ★ 2026-08-03 題 C 清算：判準從 TUNING.REACH_RADIUS(1.3) 改為該球員**當前動作**的
  // 真實可及半徑。用 1.3 會把「其實站著搆不到」的球判成「等它到腳邊就好」⇒ 不撲 ⇒ 落地。
  const diveLandingOutOfReach = (game, actor, player) => {
    if (diveLand.flightId !== game.rally.flightId) {
      diveLand = { flightId: game.rally.flightId, landing: predictLanding(game.ball) };
    }
    const L = diveLand.landing;
    if (!L) return true;
    const action = game.rally.touches === 0 ? REACH_ACTION.RECEIVE
      : game.rally.touches === 1 ? REACH_ACTION.SET : REACH_ACTION.SPIKE;
    const reach = reachRadiusFor(action, TUNING, player?.height?.current ?? null);
    return Math.hypot(L.x - actor.x, L.z - actor.z) > reach;
  };

  window.addEventListener('keydown', (e) => {
    if (suspended) return; // 照片模式短路：鍵盤操作不進比賽
    if ((e.code === 'KeyJ' || (e.code === 'Space' && !simpleMode)) && !e.repeat) {
      e.preventDefault();
      beginCharge('key'); // J（classic 加空白鍵）＝主動作蓄力；簡化模式 Space＝魚躍
      return;
    }
    if (e.code === 'KeyK' && !e.repeat) { blockTap(); return; } // K＝攔網
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    if (suspended) return; // 照片模式短路：鍵盤操作不進比賽
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
  // W7 C2：主角在板凳（教練視角）不可觸發攔網——lastGame 尚未就緒時放行（開賽前防呆，原行為）
  function blockTap() {
    if (suspended) return; // 照片模式短路：涵蓋 pressBlock()（touchUi 按鈕）繞過 DOM 監聽的路徑
    if (lastGame && !onCourt(lastGame, playerId)) return;
    queuedAction = {
      timing: 1, gaze: null, aimNdc: null, aimVec: null,
      forceAction: 'block', expiresTick: null, jumpAt: null,
    };
    blockSignal = true;
  }

  let lastGame = null;    // pointer 事件在 collect 之外發生，需要最近一次的比賽狀態判情境
  let lastAiState = null; // 判「舉球是不是給我」（claim/attacker）用

  // 開始蓄力（指標路徑與按鈕路徑共用；扣球情境＝同時自動助跑，見 collect）
  // W7 C2：板凳教練視角無身體可蓄力（lastGame 未就緒時放行＝開賽前防呆，原行為）
  function beginCharge(source) {
    // 照片模式短路：涵蓋 beginAction()（actionButtons/classic 面板）繞過 DOM 監聽的路徑
    // ——HUD 在照片模式中可用 👁 鈕切回可見，這些鈕届時仍可觸控，蓄力/攔網一律在這裡擋
    if (suspended) return;
    if (charge) return;
    if (lastGame && !onCourt(lastGame, playerId)) return;
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
    // ★ 職業章批 4c「二段時間差」★ 起跳後（扣球緩衝掛著、人還在滯空窗內）的第二次
    // 拖曳放開＝**變向**，不是重新出手：只記新落點來源，不動 timing／jumpAt／gaze、
    // 不再發 jumpSignal（人已在空中）。★F2-1 非時機軸★：第二段按多久（held）、
    // 窗內何時放開，這裡**一個都不讀**——變向的全部語意就是「改打哪裡」。
    // 資格（技術＋非重度疲勞）不符時不攔截＝落回既有路徑，行為與改制前逐值相同。
    // 按鈕路徑拖曳太短（<14px＝無方向語意）＝這一下沒有落點可言，吞掉不變向也不重出手
    //（落回舊路徑會原地重開滯空窗，那是把變向失手變成白拿的第二跳）。
    if (spikeCtx && queuedAction && queuedAction.jumpAt !== null
      && performance.now() - queuedAction.jumpAt <= JUMP_WINDOW_MS
      && retargetEligible(lastGame, playerId)) {
      const rt = drag
        ? (Math.hypot(drag.dx, drag.dy) > 14 ? { aimVec: { ...drag } } : null)
        : { aimNdc: { ...pointerNdc } };
      if (rt) queuedAction.retarget = rt;
      charge = null;
      return;
    }
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
      // ★★ 2026-08-04 回退（Sawmah 實玩：生涯第一局就輸，以前第一屆能全贏）★★
      //
      // 08-03 的收斂殘留清算把這裡從 `TUNING.REACH_RADIUS * 1.1`（1.43m）改成
      // 「真實接球可及 × 1.1」（0.73m），理由是「玩家在搆不到的距離按下去也判 perfect」。
      // **那個判斷是錯的**——這一條**不是可及判定，是品質判定**，而且是
      // **刻意給玩家的特權**：`ai.js:1235` 明文「AI 觸球品質基準 0.75
      // （**玩家 Perfect＝1.0 才有超越空間**）」，AI 的接球 timing 恆為 0.75、
      // 結構上拿不到 perfect；而 perfect 讓散佈乘數變成 `PERFECT_RECV_ACC = 0.5`（**減半**）。
      // ⇒ 縮窄它＝**單方面砍掉玩家的核心優勢，AI 毫髮無傷**（不對稱削弱）。
      //
      // 教訓：「與收斂後的幾何對不上」不等於「錯」。判斷一個常數該不該跟著收斂走，
      // 要先問**它是幾何量還是遊戲性參數**——這條是後者，窗寬是手感設計、不是可及真相。
      // 幾何誠實與遊戲性的取捨已送裁（`docs/kickoffs/converge-residue-cleanup.md` §七）。
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
    if (suspended) return; // 照片模式短路：畫布觸控交給 OrbitControls，不進比賽操作
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
    if (suspended) return; // 照片模式短路
    if (joystick && e.pointerId === joystick.pointerId) {
      joystick.dx = e.clientX - joystick.ox;
      joystick.dy = e.clientY - joystick.oy;
      return;
    }
    updateNdc(e);
  });

  const endPointer = (e) => {
    if (suspended) return; // 照片模式短路
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
    // 一人稱視線只在蓄力拖瞄中跟指標（classic 的看A打B）；
    // 平時不跟——防「游標停在底部面板 → 一進一人稱就低頭看地板」的視線污染
    if (charge) rig.setLook(pointerNdc.x, pointerNdc.y);
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
    // W7 C2：板凳教練視角無身體可動作
    if (!onCourt(game, playerId)) return null;
    const me = game.players[playerId];
    if (game.phase === 'serve') {
      return serverId(game.match) === playerId ? 'serve' : null;
    }
    if (game.phase !== 'rally') return null;
    const r = game.rally;
    if (r.possession === me.teamId && r.touches === 2) return 'spike';
    if (r.possession === me.teamId && r.touches === 1) return 'set';
    const a = game.actors[playerId];
    // 攔網帶與「自動跳攔」同寬（2.2）：原本 4.2 會讓退到 2.2-4.2 的防守站位仍判 block
    // ——手動點按開出一個必定攔不到的窗（球在別處過網），還把該有的接球意圖吃掉。
    // 實測（tools/block-defend-probe.mjs）：退到 z=3 時第一觸 54 次全是接球，
    // 攔網窗 0 次＝那個帶本來就不該算攔網區
    const nearNet = Math.abs(a.z) < NEAR_NET_Z;
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
      // W7 C2：主角在板凳（教練視角）——零輸入零動作；順手清掉任何殘留蓄力/緩衝，
      // 避免板凳期間誤觸的動作在回場後延遲生效（stale queuedAction）
      if (!onCourt(game, playerId)) {
        queuedAction = null;
        charge = null;
        jumpSignal = false;
        blockSignal = false;
        pressArmed = false; // 批 7：板凳期間留著承諾＝回場後第一次攔網莫名壓手
        return [createIntent({ playerId, tick: game.tick })];
      }
      // 非扣球時刻＝重置進攻選擇旗標（下次進攻重新彈面板）
      if (attackChosen && !this.isAttackMoment(game)) attackChosen = false;
      // 非舉球時刻＝重置分配旗標（下次一傳起球重新彈面板）
      if (setChosen && !this.isSetMoment(game)) setChosen = false;
      // 非讀舉球時刻＝重置 MB 讀心旗標（時機承諾只活在該次對手攻擊）
      if (mbChosen && !this.isMbMoment(game)) mbChosen = false;
      // 非防守指揮時刻＝重置 L 選擇旗標（digBias 本體由 matchLoop 管理生命週期）
      if (digChosen && !this.isLMoment(game)) digChosen = false;
      const tick = game.tick;
      const me = game.players[playerId];
      // 批 7：壓手承諾的壽命＝「這一波的攔網機會」。三個結束條件缺一不可：
      //   ① 球死 ② 球過網到我方（沒被攔，攔網機會過了）
      //   ③ **我方碰過球**（含隊友攔到）
      // ★③ 是第三輪對抗覆審抓出來的★：game.js:1198-1204 只有在**沒被攔到**時才寫
      // possession=toTeam，被攔到時 possession 原封不動留在攻方 ⇒ 「隊友攔到球」
      // 這條路上 ①② 都不成立，承諾清不掉，下一波沒按壓手也會壓手（原 HIGH-1 換一條路活）。
      // 判準用 lastTouchTeam 而不是再列舉一種情境：不論球是被攔、被接還是被誰碰到，
      // 只要**我方碰過**，這一波的攔網就結束了——按危險的效果寫，不按已知的入口寫。
      //
      // 為什麼不乾脆收斂成「由 blockCall 導出、不另存布林」（覆審的建議）：
      // blockCall 自己的清除條件（matchLoop.js:1144-1147）**有同一個洞**，導過去只會
      // 繼承它；而修 blockCall 的壽命會動到 08-03 就定案的封線站位行為，超出本批範圍。
      // ★不能只清「球死」★ 一球之內對手可能舉球多次（我方起球→攻擊→對方防起→再舉），
      // 只清球死會讓上一波沒用掉的 press 殘留到下一波，變成沒按也壓手、而且 blockCall
      // 已經是 null ⇒ B7-3 紅法二「代價落空、玩家白拿 press」。而 press 對非擦頂區
      // 完全沒有副作用（game.js:1287 以下不讀 blockHand），殘留就是純增益。
      if (pressArmed && (game.phase !== 'rally'
        || game.rally.possession === me.teamId
        || game.rally.lastTouchTeam === me.teamId)) {
        pressArmed = false;
      }
      const a = game.actors[playerId];
      let move = readMove(keys, joystick, TEAM_SIDE[me.teamId]);

      // 接管語義（拍板 07-22）：自動走位只負責「帶你就位」——
      // rally 中一碰搖桿＝整球歸你（職責位不再拉回）；發球階段重置重新帶位
      if (game.phase === 'serve') manualOwned = false;
      else if (game.phase === 'rally' && Math.hypot(move.x, move.z) >= 0.1) manualOwned = true;

      // 07-28 追修（Sawmah 試玩：發球員可遊走、甚至走進場內發球）：發球員＝定點
      // 發球——發球前搖桿不生效、自動站回發球區（端線外 1 號位後方，sim 佈陣同源）。
      // FIVB 語意：發球必須在發球區出手；輸入層攔截、sim 零改動
      if (game.phase === 'serve' && playerId === serverId(game.match)) {
        const sp = servePosition(me.teamId);
        const dx = sp.x - a.x;
        const dz = sp.z - a.z;
        const len = Math.hypot(dx, dz);
        move = len > 0.3 ? { x: dx / len, z: dz / len } : { x: 0, z: 0 };
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

      if (game.phase === 'rally' && !charge && !manualOwned &&
          Math.hypot(move.x, move.z) < 0.1) {
        // Cover 掩護不再自動帶位（拍板 07-22 推翻原第 8 題）：該站哪掩護
        // 是排球的隱性知識——玩家實戰中自己體會；AI 隊友的 cover 照舊（ai.js）
        // 前排防守不自動帶位（拍板 07-24 Sawmah：攔網站位全交玩家）——對方持球
        // 組織/進攻時（非發球飛行）你站哪由你決定：站到位＝自動跳攔、站錯＝攔不到；
        // 接發階段與我方持球的站位交換照舊自動
        const defendingFront = game.rally.possession &&
          game.rally.possession !== me.teamId &&
          game.rally.profile !== 'serve' &&
          isFrontRow(game.match.rotations[me.teamId], playerId);
        if (me.currentRole === 'libero' && aiState?.digBias?.team === me.teamId &&
            game.rally.possession && game.rally.possession !== me.teamId &&
            aiState?.claimId !== playerId) {
          // W3 L（附錄 A1）：玩家自己的站位是收縮陣型的一部分——同一指令（digBias）
          // 由 digTargetFor 自動帶動（與 AI 後排同函式；搖桿隨時接管）
          const t = digTargetFor(game, me.teamId, playerId, aiState.digBias.choice);
          const dx = t.x - a.x;
          const dz = t.z - a.z;
          const len = Math.hypot(dx, dz);
          if (len > 0.3) move = { x: dx / len, z: dz / len };
        } else if (aiState?.claimId !== playerId && !defendingFront) {
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
      let retargetAim = null; // 批 4c：滯空第二段變向的新落點（無變向＝null＝不帶欄位）
      // 攔網時序卷 段 1：這次的攔網是不是玩家**手動投遞**的（K 鍵／攔網鈕／
      // 「立即攔網」面板／主動作鈕在攔網情境）。sim 用它豁免物理滯空閘——
      // 玩家的 48-tick 窗是與身體無關的計時器，那段落地資格屬已記債項目。
      // 下方的自動跳攔（simpleMode 反射）**不設**這個旗標＝吃與 AI 同一道閘。
      let manualBlock = false;

      if (queuedAction) {
        // 出手緩衝：放開後持續投遞到成功（onEvents 清除）或逾時——按了就會打
        if (queuedAction.expiresTick === null) {
          queuedAction.expiresTick = tick + BUFFER_TICKS;
        }
        action = queuedAction.forceAction ?? contextAction(game);
        if (action === 'block' && !queuedAction.forceAction) blockSignal = true;
        if (action === 'block') manualBlock = true; // 走緩衝＝玩家按出來的
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
        // 批 4c：第二段變向的落點解算（與第一段 aimVec／aimNdc 同一套換算——同樣的
        // 拖曳語意打同樣的地方）。只在動作仍是扣球時解（滯空窗過期降級 receive＝
        // 變向自然作廢）；解不出（視角射線落空）＝不帶欄位＝沒變向，誠實落空
        if (action === 'spike' && queuedAction.retarget) {
          const rt = queuedAction.retarget;
          if (rt.aimVec) {
            const rlen = Math.hypot(rt.aimVec.dx, rt.aimVec.dy) || 1;
            const rdist = 3 + (Math.min(rlen, 130) / 130) * 6;
            retargetAim = {
              x: a.x + (rt.aimVec.dx / rlen) * rdist,
              z: a.z + (rt.aimVec.dy / rlen) * rdist,
            };
          } else if (rt.aimNdc) {
            retargetAim = groundPoint(rt.aimNdc);
          }
          // 批 4c 拍板丙（MEDIUM-6）：最小位移閘——解算後與第一段落點差
          // <RETARGET_MIN_SHIFT_M＝這一下沒有「改打哪裡」的語意（桌面點按／
          // 極短拖曳），吞掉不生效、不收變向代價。sim 端 computeRetarget 的
          // ε 護欄（1e-6m）保留為最底層
          if (retargetAim
            && Math.hypot(retargetAim.x - aim.x, retargetAim.z - aim.z)
              < RETARGET_MIN_SHIFT_M) {
            retargetAim = null;
          }
        }
        // 進攻決策的扣球：保持有效到球可扣（不用 36-tick 緩衝），球掉太低才放棄讓 auto 保底
        // 發球等哨音沒有時限；其餘動作逾時作廢
        const waitingServe = game.phase === 'serve' && action === 'serve';
        if (queuedAction.attack) {
          if (game.ball.y < 1.3) queuedAction = null;
        } else if (queuedAction.set) {
          // 分配決策的舉球：保持有效到球進舉球帶（不用 36-tick 緩衝）；
          // 球墜破舉球帶＝放棄，讓二傳保底/魚躍體系接手
          if (game.ball.y < 1.2) queuedAction = null;
        } else if (!waitingServe && tick >= queuedAction.expiresTick) {
          queuedAction = null;
        }
        // 攔網＝開窗型動作：一次投遞即生效（sim 開 48-tick 攔網窗），緩衝立即終結——
        // 攔網不產生 TOUCH 事件、onEvents 永遠清不掉它；殘留緩衝會在球過網後被
        // contextAction 重判成 receive、用攔網鍵的預設瞄準把第一觸打回對面
        // （07-24 Sawmah 抓到「主角攔網變成接球」的病根）
        if (action === 'block') queuedAction = null;
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
        const near = Math.hypot(b.x - a.x, b.z - a.z) <= autoReceiveDistOf(me);
        // ★ 對抗審查 MEDIUM-4 修正 ★ 垂直閘原本是 `standingReach(me) + 0.3`
        // ＝1.31H+0.3（175cm ⇒ **2.59m**），那是基準 A 舊圓柱模型的垂直帶。
        // 收斂後 RECEIVE 可及體的頂點＝手點 0.43H(0.752) ＋ 半徑(0.665) ＝ **1.417m**
        // ⇒ 球在 (1.417, 2.59] 且水平夠近時，這裡判「搆得到」而 sim 的 ballInReach 判不到
        // ＝**空揮**。#5 只修了水平半軸，病灶會原封不動搬到垂直軸上，兩軸要一起修。
        const recvReach = reachRadiusFor(REACH_ACTION.RECEIVE, TUNING, me?.height?.current ?? null);
        const reachTopY = RECEIVE_HANDPOINT_H_RATIO * (me?.height?.current ?? 1.75) + recvReach;
        const reachable = near && b.vy < 0 && b.y <= reachTopY;
        const claimedToMe = aiState?.claimId === playerId;
        // 攔網情境不自動墊（07-27 Sawmah 試玩抓包：貼網站位時，對手扣球過網瞬間
        // 球權翻面＋觸球歸零，「到位自動接」搶在攔網體系前把球墊掉＝攔網變接球）：
        // 前排、貼網（|z|<2.2＝自動跳攔同帶）、對方攻擊來球、球還在網帶高度（>2.15m）
        // ＝攔網的球不是墊球的球；輕吊/漏球墜到 2.15 以下照常自動救
        const spikeAtNet = r.profile === 'spike' && r.lastTouchTeam !== me.teamId &&
          isFrontRow(game.match.rotations[me.teamId], playerId) &&
          Math.abs(a.z) < NEAR_NET_Z && b.y > 2.15;
        if (canTouch && reachable && r.touches === 0 && !spikeAtNet) {
          // 到位自動接（一傳是反射不是瞄準）；品質 0.6——主動抓 Perfect 才有更準的一傳
          action = 'receive';
          aim = localToWorld(me.teamId, 1.2, 1.2);
          timing = 0.6;
          // W3 L（附錄 A1）：讀對且球飛向玩家＝Perfect 接球時機窗主動觸發
          // （Phase 1 既有 Perfect 機制首次由玩家決策主動開啟）；A4① 演出武裝
          if (me.currentRole === 'libero' && digReadCorrect(game, aiState)) {
            timing = 1.0;
            digHeroSignal = true;
          }
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
        } else if (simpleMode && canTouch &&
            (aiState?.claimId === playerId || aiState?.backupId === playerId) &&
            (me.techniques?.dive ?? 0) >= 1 &&
            b.vy < 0 && b.y <= TUNING.DIVE_MAX_Y && tick >= a.divedUntil &&
            // ★ 題 C 清算（與 ai.js 的魚躍閘同一組判準，兩端必須一起改）★
            // 下界：站立真的搆不到才撲（原本用 1.3 ⇒ 放生帶）
            // 上界：撲得到才撲（原本用 1.3×MUL=2.34 > 真實 2.0 ⇒ 撲空 27.69%）
            // 玩家端**必撲不擲骰**，所以這兩條的誤差對真人是 100% 生效，比 AI 端更痛。
            // ★ 對抗審查 MEDIUM-5 修正 ★ 與 ai.js 同步：下界一律用 RECEIVE 半徑。
            // 低球（y ≤ DIVE_MAX_Y 1.15）在 sim 端一律走 receive 可及體，
            // 依觸數取 SET/SPIKE 會用 1.80m／2.92m 手點的半徑去量 1.15m 以下的球＝放生帶。
            Math.hypot(b.x - a.x, b.z - a.z)
              > reachRadiusFor(REACH_ACTION.RECEIVE, TUNING, me?.height?.current ?? null) &&
            Math.hypot(b.x - a.x, b.z - a.z)
              <= reachRadiusFor(REACH_ACTION.DIVE, TUNING, me?.height?.current ?? null) &&
            diveLandingOutOfReach(game, a, me)) {
          // 自動魚躍（拍板 07-24：常駐鈕太難用→撤除、改自動判斷）：與 AI 同一組
          // 觸發條件（這球歸我/備援＋站立搆不到＋魚躍可及＋低球下墜），但玩家版
          // 【必撲】不擲骰——機率會變「角色不聽話」；技術表達回到站位（站得好不用撲）。
          // W6.1 追加落點閘：球會落到站立可及內＝不撲（見 diveLandingOutOfReach 註）。
          // aim 鏡像 AI：第三觸撲過網（撲回自家＝白送四擊）、其餘墊回二傳點；
          // L/Space 隱藏手動仍可提前撲
          action = 'dive';
          aim = r.touches === 2
            ? localToWorld(me.teamId === 'A' ? 'B' : 'A', 0, 6.5)
            : localToWorld(me.teamId, 1.2, 1.2);
          timing = 0.5;
          // W3 L（附錄 A4①）：撲對方攻擊的必死球＝演出武裝（TOUCH 確認才播）
          if (me.currentRole === 'libero' && r.profile === 'spike' && r.touches === 0) {
            digHeroSignal = true;
          }
        } else if (simpleMode && contextAction(game) === 'block' &&
            r.profile === 'spike' && aiState?.landingTeam === me.teamId &&
            Math.abs(a.z) < NEAR_NET_Z) {
          // 自動跳攔（07-24 Sawmah：原設計的攔網決策自動跳攔早成死碼被清、玩家不知
          // 攔網變全手動）：前排網前＋對方扣球出手飛向我方＝自動開攔網窗——
          // 時機取球出手瞬間（airTicks 落甜蜜帶）；點螢幕/K 仍可手動提前跳；
          // 退開網前（|z|≥2.2）＝不攔走退防；classic 維持全手動
          action = 'block';
        }
      }

      // Q4 資料層：同 ai.js 的記帳規則——只在「本人正是協調層選定的攻擊手」扣球時
      // 帶上路線種類（純記帳、零判定語意；S 二次球是本人扣球但不是協調層選定的
      // 攻擊手，比對不上 attackerId 就不記，見 ai.js 同段註解）
      const routeKind = action === 'spike' && aiState?.attackerId === playerId
        ? (aiState.attackKind ?? null) : null;
      const it = createIntent({
        playerId, tick, move, action, aim, gaze, timing,
        style: queuedAction?.style ?? null,
        routeKind,
      });
      // 段 1 記債豁免旗標：只在手動攔網時掛上（同 ai.js 掛 `hand` 的既有作法，
      // 不擴充 createIntent 的白名單）——自動跳攔不掛＝與 AI 同閘
      if (manualBlock) it.manual = true;
      // 大學卷批 7（08-24）壓手攔網：與 it.manual／ai.js 掛 hand 同一招——建好 intent
      // 再補屬性，不擴充 createIntent 的白名單（sim 端 game.js:596 讀 intent.hand）。
      // ★手動與自動跳攔都吃★：面板承諾的是「這一波要壓手」，不是「怎麼起跳」——
      // 起跳時機在 08-03 已裁定交回自動跳攔，壓手不重開那個軸。
      // 送出即清：sim 一窗一態、窗開時定格，後續 tick 再帶也不會被讀。
      if (action === 'block' && pressArmed) {
        it.hand = 'press';
        pressArmed = false;
      }
      // 批 4c 二段時間差：與 it.manual／it.hand 同一招——建好 intent 再補屬性，
      // 不擴充 createIntent 的白名單。sim 端消費點＝game.js executeTouch（資格再驗）
      if (action === 'spike' && retargetAim) it.retargetAim = retargetAim;
      return [it];
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
      // 批 7：壓手是**替某一個人**押的方向，不得跟著控制權跑到別人身上
      // （matchLoop 的 syncControlled 在 rally 中就會切人）
      pressArmed = false;
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
        // gaze=aim＝誠實出手（零欺敵、零散佈懲罰）；假動作才走 chooseAttackFake
        timing: zone.power, gaze: { x: zone.aim.x, z: zone.aim.z }, aimWorld: zone.aim,
        aimNdc: null, aimVec: null, forceAction: 'spike',
        expiresTick: null, jumpAt: performance.now(), attack: true,
      };
    },
    // 假動作扣球（按A滑B）：視線鎖假區（gaze）、實打真區——吃 sim 的 H3 欺敵
    // （夾角越大越可能騙過攔網、但自身落點越飄；騙沒騙由 sim 決定論結算）
    chooseAttackFake(fakeZone, realZone) {
      this.chooseAttack(realZone);
      queuedAction.gaze = { x: fakeZone.aim.x, z: fakeZone.aim.z };
    },
    // 本次扣球是否已選區（main 用來停止彈面板）
    attackPending() { return attackChosen; },

    // ---- 二傳分配決策（W3 S 玩法：玩家＝現任舉球員）----
    // 是否輪到玩家舉球：我方第二擊、這球 claim 給我、我是現任舉球員。
    // 範式同 isAttackMoment——決策時刻由 AI 協調層的呼叫鎖定判定，不另闢真相
    //
    // ★ 2026-08-09 Sawmah 裁定：OPP 補舉時同樣開面板 ★
    // S 接了第一球時，協調層**指定 OPP 補舉第二球**（ai.js 的 claim 鏈：S 用掉第一觸
    // 就找 opposite）——AI 對局 168/168 全由 OPP 補、零漏接；但真人坐 OPP 時
    // 完全不知道這回事（無提示、無面板），實測不補＝100% 落地失分。
    // 修法＝不再問「你是不是二傳」，改問「**這球是不是 claim 給你的舉球職責**」：
    // claim 鏈只會在兩種情況把第二觸給你——你是 S、或你是 S 接球後的指定補位。
    // 兩種都該開面板；hint 由 matchLoop 出字卡（僅補位那種，S 本人不需要被提醒）。
    isSetMoment(game) {
      const me = game.players[playerId];
      const r = game.rally;
      if (game.phase !== 'rally' || r.possession !== me.teamId || r.touches !== 1) return false;
      if (lastAiState?.claimId !== playerId) return false;
      if (me.currentRole === 'setter') return true;
      // 補舉情形：第一觸是我方二傳用掉的、而 claim 鏈把第二觸指到我頭上。
      // 不寫死 currentRole==='opposite'——判準跟著 claim 鏈走（單一真相），
      // 它指誰就是誰；今天它指 OPP，哪天 claim 鏈改了這裡不會變成第二份過期真相。
      const firstToucher = game.players[r.lastToucherId];
      return !!firstToucher && firstToucher.teamId === me.teamId
        && firstToucher.currentRole === 'setter';
    },
    // 目前可分配的選項池（一傳品質分支）；非舉球時刻回傳 null
    setOptions(game) {
      return this.isSetMoment(game) ? setOptionsFor(game, lastAiState, playerId) : null;
    },
    // 選定分配 → 排入強制舉球：瞄該攻擊點、timing＝舉球弧線（快攻 t<0.5 低弧）——
    // 與 AI 舉球走同一條 sim 路徑（chooseTouch 的 set 分支），只是選的人換成玩家
    chooseSet(opt) {
      setChosen = true;
      queuedAction = {
        timing: opt.t, gaze: null, aimWorld: opt.aim,
        aimNdc: null, aimVec: null, forceAction: 'set',
        expiresTick: null, jumpAt: null, attack: false, set: true,
      };
    },
    // W4(P4) 題3 S 二次球偷襲：第二擊改攻擊——沿 AI setterDump 同 sim 路徑
    // （spike、輕推 t=0.3、瞄對方淺區；chooseTouch dump 分支同值＝零數值特例）
    chooseSetDump(opt) {
      setChosen = true;
      jumpSignal = true;
      queuedAction = {
        timing: opt.t, gaze: { x: opt.aim.x, z: opt.aim.z }, aimWorld: opt.aim,
        aimNdc: null, aimVec: null, forceAction: 'spike',
        expiresTick: null, jumpAt: performance.now(), attack: true,
      };
    },
    // 本次舉球是否已分配（main 用來停止彈面板）
    setPending() { return setChosen; },

    // ---- MB 攔網讀心（委派模組層純函式 mbMomentFor，單一真相在彼）----
    isMbMoment(game) {
      return mbMomentFor(game, playerId);
    },
    // 讀取面板資料（誠實線索：一傳品質＋助跑動向）；非讀舉球時刻回傳 null。
    // ★ 段 4（裁定 3）：面板本身前排全員都有，**讀心線索維持 MB 獨有** ★
    // 非 MB 拿到的是空線索——面板標題退回通用的「讀舉球！」（mbPanelTitle(null)）、
    // 助跑 tells 為空字串。他有的是「現在跳」這個決定權，沒有的是「看得懂要跳誰」。
    mbOptions(game, aiState) {
      if (!this.isMbMoment(game)) return null;
      if (!blockReadAllowedFor(game, playerId)) return { tier: null, lanes: [] };
      return mbReadFor(game, aiState, playerId);
    },
    // 選定時機（07-27 Sawmah 拍板：站位全交搖桿手動——面板只管時機賭局）：
    // early＝搶快攻＝立即起跳開攔網窗（你自己先站好位負責）；不按＝等高球＝
    // 就位後自動跳攔（07-24 路徑）。賭錯高球＝48-tick 窗過期落地球才來（真實懲罰）
    chooseMbTiming(early = false) {
      mbChosen = true;
      if (early) blockTap();
    },
    mbPending() { return mbChosen; },
    // 批 7 壓手攔網：面板選了「壓手封X」時武裝，下一個 block intent 帶 hand='press'。
    // ★這是唯一的 press 入口★（B7-3：不得有獨立於封線方向的壓手路徑）——
    // 呼叫端 matchLoop 在同一個 callback 裡必定也寫了 aiState.blockCall，兩者咬合。
    armPressBlock() { pressArmed = true; },
    isPressArmed() { return pressArmed; },

    // ---- L 防守指揮（W3 附錄 A1/A2：玩家＝場上自由人、對手舉球出手瞬間）----
    isLMoment(game) {
      const me = game.players[playerId];
      const r = game.rally;
      if (game.phase !== 'rally' || !r.possession || r.possession === me.teamId) return false;
      if (r.touches !== 2) return false;
      if (me.currentRole !== 'libero') return false;
      return onCourt(game, playerId); // 前排輪次被換下＝場外縮時偵察，無面板
    },
    // 面板資料（選項＋AI 建議＋習慣標記線索）；非指揮時刻回傳 null
    digOptions(game, aiState) {
      return this.isLMoment(game) ? digReadFor(game, aiState) : null;
    },
    // 選定收縮方向（點選＝改判；1 秒自動由 matchLoop 呼叫同一入口）——
    // digBias 注入 aiState 由 matchLoop 做（AI 協調層歸它管）
    chooseDig() { digChosen = true; },
    digPending() { return digChosen; },
    // L 演出訊號（一次性）：matchLoop 於玩家起球 TOUCH 當拍消費；死球丟棄殘留
    consumeDigHeroSignal() {
      const v = digHeroSignal;
      digHeroSignal = false;
      return v;
    },
    // 發球（決策選區；power=強力發球：低平快＋散佈大；未指定 aim 則發預設深區）
    // style：null＝穩定、'float'＝飄浮、'jump'＝跳發（timing>1.1 走既有跳發路徑）
    serveNow(game, aim = null, style = null) {
      const me = game.players[playerId];
      if (game.phase !== 'serve' || serverId(game.match) !== playerId) return;
      rig.resetLook(); // 發球一人稱歸正視（清掉殘留視線）
      const oppTeam = me.teamId === 'A' ? 'B' : 'A';
      const target = aim ?? localToWorld(oppTeam, 1.5, 7.5);
      queuedAction = {
        timing: style === 'jump' ? 1.2 : 1, style: style === 'float' ? 'float' : null,
        gaze: null, aimWorld: target, aimNdc: null, aimVec: null,
        forceAction: 'serve', expiresTick: null, jumpAt: null,
      };
    },
    // 魚躍救球（主動技）：撲向來球、球質差但救得到；出手即倒地（sim 端結算風險）
    diveNow(game) {
      const me = game.players[playerId];
      if (game.phase !== 'rally') return;
      queuedAction = {
        timing: 0.5, style: null, gaze: null,
        aimWorld: localToWorld(me.teamId, 1.2, 1.2), // 救向二傳位（能救不能組織）
        aimNdc: null, aimVec: null,
        forceAction: 'dive', expiresTick: null, jumpAt: null,
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

    // 大學卷批 7（08-24）追發（指名發球）：對方**當前輪轉的後排三人**，各自的
    // 陣型基準位換算成發球 aim。這一卷的靈魂＝「大學是我讓對面打不好」——
    // 專打接發最弱的那個人。
    // ★三件事刻意這樣做★
    //   ① 後排＝isBackRow（rotation.js:51，位置 1/5/6），不是寫死名字或列六人；
    //      對方輪轉推進後名單自然跟著變（B7-6）。
    //   ② aim 用 basePosition（陣型基準位）而不是球員當下的 actor 座標——發球那一刻
    //      對方還沒動，基準位才是「他站的地方」；也順帶讓這條路徑決定論、不吃走位抖動。
    //   ③ 三個位置號的基準位互不相同 ⇒ 三個目標的 aim 逐值不同（B7-5 的反向對照）。
    chaseServeTargets(game) {
      const me = game.players[playerId];
      const opp = me.teamId === 'A' ? 'B' : 'A';
      const rot = game.match?.rotations?.[opp];
      if (!Array.isArray(rot)) return [];
      return rot
        .filter((pid) => isBackRow(rot, pid))
        .map((pid) => ({ pid, pos: positionOf(rot, pid) }))
        .sort((a, b) => a.pos - b.pos)
        .map(({ pid, pos }) => ({
          key: 'chase-' + pid,
          pid,
          pos,
          label: game.players[pid]?.name ?? '？',
          aim: basePosition(opp, pos),
          // 發球面板重做（08-28 Sawmah：「追發用來觀察體力低或是破壞陣容」）：
          // 把決策依據放上按鈕——體力值由面板端配 tierOf 顯示，不在這裡算檔位
          stamina: game.stamina?.[pid] ?? 1,
        }));
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
    // 池底卷 批2 P1：照片模式進出時由 matchLoop 呼叫——suspend＝立即丟掉任何進行中的
    // 蓄力/搖桿/緩衝出手（否則凍結期間的拖曳殘留會在退出後的下一 tick 誤發動作）。
    setSuspended(v) {
      suspended = !!v;
      if (suspended) {
        joystick = null;
        charge = null;
        queuedAction = null;
        jumpSignal = false;
        blockSignal = false;
      }
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
