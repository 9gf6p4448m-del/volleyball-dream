// 幾何關節球員的程序化動畫（表現層，唯讀 sim）
// 取代 Mixamo 疊加層：關節軸向自訂（肩/髖 x 負＝往前擺、spine x 正＝前傾），
// 動作＝分段關鍵姿勢插值（引臂→觸球→收勢，時長沿用實測調參值）＋跑動/待命循環
// 【試玩必調】角度全在 POSES、時序全在 SEQUENCES
const RUN_FULL_SPEED = 4.5;  // 此移速＝跑姿權重 1
const STRIDE_BASE = 5.0;     // 步頻底速（rad/s）
const STRIDE_PER_MS = 2.4;   // 每 m/s 增加的步頻
// 4.7 §6-1 腳鎖地（工單說觀感回報最高於整個骨架擴充）：滑冰的來源是**步幅與位移
// 不匹配**——原本擺腿振幅固定，走得快就變成腳在地上滑。步幅匹配＝解析解：
// 一個半步走過的距離 speed·π/strideRate 必須等於腳掌前後跨距 2·LEG·sin(amp)，
// 反解 amp。這是「支撐腳相對地面不動」的閉式近似（幾何角色無腳踝，做不了真 IK，
// 但滑冰的成因在步幅不在腳踝）
const LEG_LEN = 0.86;        // 髖到腳掌的等效長度（m，BASE_H 比例下量得）
const SWING_MAX = 0.62;      // 擺腿振幅上限（原固定值＝現在的天花板）

// Phase 5 W1 §2-2/§2-4 助跑三步節奏：取代舊版「兩關鍵幀＝走過去然後拔起」。
// 每步一個時間窗（等寬），窗內用 sin 半波（0→峰值→0）驅動該步的擺腿與下沉深度；
// 峰值表＝[小步, 制動步, 併腳]——制動步（idx 1）擺幅與下沉都是全段最深，把水平動能
// 轉垂直的重量感做出來；併腳（idx 2）擺幅收，下沉次深，為雙腳起跳收尾。
// 4 步（後排/長距離）在前面補一個更小的準備步，尾三步沿用 3 步的形狀。
const STEP_SWING_SCALE = 0.85; // 擺腿角度縮放（配合既有 SWING_MAX 量級）
const STEP_AMP_3 = [0.45, 1.0, 0.62];
const STEP_CROUCH_3 = [0.07, 0.24, 0.15];
const STEP_AMP_4 = [0.3, 0.45, 1.0, 0.62];
const STEP_CROUCH_4 = [0.04, 0.08, 0.24, 0.15];
// 步序（哪隻腳在該窗踩前）：右手＝左-右-左（4 步在前補右）；左手鏡像＝右-左-右（前補左）
const STEP_ORDER_R3 = ['l', 'r', 'l'];
const STEP_ORDER_R4 = ['r', 'l', 'r', 'l'];
const STEP_ORDER_L3 = ['r', 'l', 'r'];
const STEP_ORDER_L4 = ['l', 'r', 'l', 'r'];

// t：0..1（相對整段 dur）；回傳該瞬間的步相（idx／半波值／擺腿與下沉量／踩前腳）
function stepPhase(t, order, ampTable, crouchTable) {
  const n = order.length;
  const w = 1 / n;
  let idx = Math.min(Math.floor(t / w), n - 1);
  const local = Math.min(Math.max((t - idx * w) / w, 0), 1);
  const hump = Math.sin(local * Math.PI);
  return {
    idx,
    lead: order[idx],
    swing: STEP_SWING_SCALE * ampTable[idx] * hump,
    crouch: crouchTable[idx] * hump,
  };
}

// 姿勢：rSh/lSh=[肩x, 肩z]、rEl/lEl=肘x、spine/neck=x、crouch=下蹲深度(m)
const POSES = {
  bumpReady: { rSh: [-0.95, -0.24], lSh: [-0.95, 0.24], rEl: 0, lEl: 0, spine: 0.5, neck: -0.35, crouch: 0.2, spineUp: 0.16 },
  bumpHit: { rSh: [-1.2, -0.24], lSh: [-1.2, 0.24], rEl: 0, lEl: 0, spine: 0.32, neck: -0.3, crouch: 0.08, spineUp: -0.1 },
  setReach: { rSh: [-2.3, 0.3], lSh: [-2.3, -0.3], rEl: -1.0, lEl: -1.0, spine: -0.04, neck: -0.45, crouch: 0.06, spineUp: -0.18, wrist: -0.42 },
  setPush: { rSh: [-2.72, 0.26], lSh: [-2.72, -0.26], rEl: -0.25, lEl: -0.25, spine: 0, neck: -0.3, spineUp: 0.1, wrist: 0.4 },
  // 4.7 §P2 上升弓身：胸椎後仰（spineUp 負＝反弓）、骨盆先轉、非慣用手上舉指球
  spikeWind: {
    rSh: [-2.5, -0.38], lSh: [-2.55, 0.1], rEl: -1.9, lEl: -0.25, spine: -0.24, neck: -0.2,
    spineUp: -0.34, pelvisY: 0.26, chestY: 0.06, wrist: -0.5,
  },
  // §P3 鞭打中段：肩已解鎖、肘開始伸、腕仍後倒（三者不得同幀一起轉）
  spikeUnlock: {
    rSh: [-2.75, -0.2], lSh: [-1.7, 0.16], rEl: -0.9, lEl: -0.3, spine: -0.05, neck: -0.12,
    spineUp: -0.1, pelvisY: 0.06, chestY: 0.16, wrist: -0.62,
  },
  // §P3 擊球：收腹前屈、轉體完成、**壓腕 snap**（wrist 由負轉正＝手掌蓋下去）
  spikeHit: {
    rSh: [-2.82, -0.05], lSh: [-0.85, 0.2], rEl: -0.08, lEl: -0.4, spine: 0.18, neck: -0.05,
    spineUp: 0.26, pelvisY: -0.12, chestY: -0.06, wrist: 0.55,
  },
  // §P4 下降收臂：擊球臂沿對角跨體收回（rSh z 轉正＝往左髖方向），身體回中性
  spikeFollow: {
    rSh: [-0.6, 0.34], lSh: [-0.45, 0.15], rEl: -0.5, lEl: -0.3, spine: 0.46, neck: 0.1,
    spineUp: 0.12, pelvisY: -0.06, wrist: 0.2,
  },
  // W2-5（07-30）曾把張臂 z 改成 ∓0.4 對齊 sim 帶寬 1.0m（跨距 0.28→0.92m）——
  // **Sawmah 試玩裁定：原本較好看，寬臂案否決**（`docs/blocking-reference.md` §5 佐證：
  // 真實攔網手型是「肩膀鎖緊上聳、手臂打直、手掌張開虎口對齊肩寬」——帶寬是判定量
  // （身體移動＋穿越覆蓋），不是張手張出來的姿勢量）。
  // W2-6（本輪）回退張臂，但不是逐值抄舊 commit：z=0（雙手直接抬在肩關節正上方、
  // 不再左右外張／內夾）才是「虎口對齊肩寬」的字面意思——真實引擎量測（createGeoCharacter
  // ＋createGeoAnimator 實跑 FK，非重建模型）：z=0 時跨距只由肩關節本身的左右間距決定
  // （與 xrot 無關，兩手在肩正上方的鉛直面內擺動不會再左右移動），身高 1.75 量得
  // 0.426m，落在肩寬帶 0.35~0.55m 內；z 偏離 0 一律讓跨距變窄（正 z）或變寬（負 z）
  // 且非線性（z=∓0.4 才會到 0.92m），比 5fe33a7 之前的 z=∓0.12（0.276m，手在頭頂交叉
  // 到快併攏）更貼近文獻描述、又遠低於否決案的寬臂。sim 判定（BLOCK_HALF_WIDTH／
  // bandContact）從頭到尾沒被這兩輪動過——這裡只改 POSES 常數。
  blockUp: { rSh: [-2.95, 0], lSh: [-2.95, 0], rEl: 0, lEl: 0, spine: 0.04, neck: -0.15, spineUp: -0.08, wrist: -0.45 },
  // punch-through（跳過網不是跳高，見底稿§5）沿用既有機制：spine 比 blockUp 更前傾
  // （0.04→0.3）＝軀幹隨手臂一起向網面前送，肘仍是 0＝手臂全程打直，不需要新欄位
  blockPunch: { rSh: [-2.52, 0], lSh: [-2.52, 0], rEl: 0, lEl: 0, spine: 0.3, neck: -0.2, spineUp: 0.14, wrist: -0.7 },
  // graze（擦手）視覺——三態現況 solid／graze 播同一支 blockJump，玩家分不出
  // 「攔死」與「指尖擦到」。graze 是**沒攔死但碰到邊緣**，做成比 blockPunch 更保守的
  // 觸碰：punch-through 幅度收一半（xrot 只到 blockUp/blockPunch 中間、非全力下壓）、
  // 壓腕量減半（沒有 solid 那種整手拍下去的力道）、身體前傾也收（沒有全力跟進）。
  // W2-6：張臂寬隨 blockUp/blockPunch 一起回窄——z 同樣取 0（擦到的是邊緣、不是張臂
  // 本身變窄，跟寬臂版當時「沿用同一個 z」是同一個邏輯，只是那個 z 現在是 0）。
  blockTouch: { rSh: [-2.75, 0], lSh: [-2.75, 0], rEl: 0, lEl: 0, spine: 0.12, neck: -0.18, spineUp: 0.0, wrist: -0.25 },
  windup: { rSh: [-2.35, -0.35], lSh: [-2.0, 0.15], rEl: -1.8, lEl: -0.3, spine: -0.2, neck: -0.18 },
  // 4.7 §P0 助跑（Sawmah 07-28）：雙臂後擺蓄勢、軀幹前傾——**零跳躍**。
  // 原本助跑與起跳混在同一個 windup（自帶 jump 0.5m），提前觸發就等於提前浮空
  approachBack: { rSh: [0.75, -0.2], lSh: [0.75, 0.2], rEl: -0.45, lEl: -0.45, spine: 0.2, neck: -0.24, crouch: 0.06 },
  approachDrive: { rSh: [-0.5, -0.22], lSh: [-0.5, 0.22], rEl: -0.9, lEl: -0.9, spine: 0.26, neck: -0.26, crouch: 0.16 },
  // Phase 5 W1 §2-3 等待姿勢：一擊完成、攻擊手已轉身拉開到職責位（sim 走位負責），
  // 站定等二傳觸球——重心壓前腳（前傾一點）、視線盯二傳（neck 抬），雙臂放鬆不外張
  transitionWait: { rSh: [0.05, -0.05], lSh: [0.05, 0.05], rEl: -0.15, lEl: -0.15, spine: 0.14, neck: -0.2, crouch: 0.08 },
  land: { spine: 0.2, crouch: 0.26 },
  // 4.7 §P5 落地緩衝：觸地→吸收到最深→推起回中性。
  // 「落地瞬間回站姿」是工單點名的最廉價破綻
  landDeep: { rSh: [-0.35, -0.2], lSh: [-0.35, 0.2], rEl: -0.7, lEl: -0.7, spine: 0.34, neck: 0.05, crouch: 0.38 },
  landRise: { rSh: [-0.2, -0.14], lSh: [-0.2, 0.14], rEl: -0.45, lEl: -0.45, spine: 0.12, neck: -0.02, crouch: 0.08 },
  // 魚躍撲救（身體前傾由 matchView 的 root.rotation.x 主導＝接近水平飛撲）：這裡只管
  // 手臂大幅前伸夠球＋抬頭看球。diveReach＝撲出觸球（雙臂前伸平墊）、diveSprawl＝落地撐地
  diveReach: { rSh: [-1.78, -0.3], lSh: [-1.78, 0.3], rEl: 0, lEl: 0, spine: 0.1, neck: 0.42, crouch: 0.1 },
  diveSprawl: { rSh: [-1.35, -0.26], lSh: [-1.35, 0.26], rEl: -0.12, lEl: -0.12, spine: 0.22, neck: 0.26, crouch: 0.32 },
  // 爬起：雙手撐地（肘大彎）、身體半推起、收腿——恢復期的過渡，避免「垂直彈起」殭屍感
  divePush: { rSh: [-0.5, -0.34], lSh: [-0.5, 0.34], rEl: -0.98, lEl: -0.98, spine: 0.32, neck: 0.05, crouch: 0.55 },
  // 發球分式（07-24 Sawmah）：serveReady＝發球前雙手捧球預備（hold，銜接揮擊的連貫前段）；
  // 飄浮＝站立掌根短促推擊（floatWind 後拉小幅→floatPush 直臂前推、瞬間停腕無隨揮）
  serveReady: { rSh: [-1.15, -0.1], lSh: [-1.15, 0.1], rEl: -0.5, lEl: -0.5, spine: 0.12, neck: -0.1, crouch: 0.06 },
  floatWind: { rSh: [-2.35, -0.15], lSh: [-1.5, 0.15], rEl: -0.55, lEl: -0.25, spine: -0.08, neck: -0.15, spineUp: -0.14, wrist: -0.25 },
  floatPush: { rSh: [-2.6, -0.05], lSh: [-0.9, 0.15], rEl: 0, lEl: -0.3, spine: 0.12, neck: -0.1, spineUp: 0.06, wrist: 0 },
  // W7 A4③：體力喘氣 idle（死球間隙、跌破 50% 的場上球員取代待命姿勢）——
  // 撐膝彎腰：肩前傾下垂＋肘大彎（雙手扶膝）＋軀幹深前傾＋低頭喘氣
  gasp: { rSh: [-0.35, -0.12], lSh: [-0.35, 0.12], rEl: -0.7, lEl: -0.7, spine: 0.85, neck: 0.3, crouch: 0.32 },
  // N1（2026-07-30 疲勞可視化，重度檔 <25% 專用）：同款撐膝彎腰再加深——
  // 蹲更深、軀幹前傾更多、頭垂更低，與 gasp（<50%）拉出可讀的兩段落差
  gaspHeavy: {
    rSh: [-0.42, -0.14], lSh: [-0.42, 0.14], rEl: -0.85, lEl: -0.85,
    spine: 1.05, neck: 0.42, crouch: 0.42,
  },
  // W7 B4④：氣勢極端不利（−3）idle——垂肩低頭，手臂鬆垮下垂、無下蹲（走位回位、非喘氣）
  dejected: { rSh: [0.08, -0.04], lSh: [0.08, 0.04], rEl: -0.15, lEl: -0.15, spine: 0.32, neck: 0.32, crouch: 0.03 },
  // 4.5B §4：S diegetic——高 trust 隊友揮手喊球（右臂高舉左右擺；左臂自然）
  waveUp: { rSh: [-2.9, -0.35], lSh: [0, 0.06], rEl: -0.2, lEl: -0.1, spine: -0.05, neck: -0.2 },
  waveSide: { rSh: [-2.9, 0.3], lSh: [0, 0.06], rEl: -0.2, lEl: -0.1, spine: -0.05, neck: -0.2 },
  // 4.5B §4：L 暗號——攔網手偷瞄點頭確認（頸部小幅點放）
  nodNeutral: { neck: -0.12 },
  nodDown: { neck: 0.3 },
  // 4.5B §8 攔網重量感：起跳前的蹲載入（蹲→蹬→滯空→落地的第一拍）。
  // W2-6：對應底稿 §3C 揮臂式攔網的 LOAD 節點（雙臂下擺至腰際蓄力＋蹲）——FK 量測
  // （直接評估此姿勢、非經 blendKeys 淡入汙染）身高 1.75 時手腕落在 y=1.15m
  // （骨盆 y=0.91m 之上、肩 y=1.40m 之下）＝軀幹下半段＝腰際區間，不需要再調參數。
  blockLoad: { rSh: [-0.6, -0.15], lSh: [-0.6, 0.15], rEl: -0.9, lEl: -0.9, spine: 0.35, neck: -0.2, crouch: 0.3, spineUp: 0.12 },
  // 4.5B §8 助跑遲疑（低 trust 快攻的身體語言）：手臂只抬一半、低頭半拍
  windupHesitant: { rSh: [-1.55, -0.3], lSh: [-1.3, 0.12], rEl: -1.3, lEl: -0.4, spine: -0.06, neck: 0.12 },
};

// 動作序列（at: 0..1；jump=跳高 m；時長為既有實測調參值，勿隨意動）
// hit＝**擊球關鍵幀**在本序列的位置（0..1）。07-29 Sawmah 試玩回報「還沒碰到手就
// 接／舉起來了」的根因就在這裡：原本是 TOUCH 事件當下才 trigger，擊球幀要 0.2–0.3s
// 後才到＝球轉向的那一幀身體還停在預備姿勢。宣告 hit 之後：
//   ① matchLoop 用 hitLeadTicks() 提前觸發（讓擊球幀落在 sim 的觸球 tick 上）
//   ② 空中接續（windup→spike）的 carry 上限改吃 hit（見 trigger）
const SEQUENCES = {
  bump: { dur: 0.5, jump: 0, land: false, hit: 0.45, keys: [{ at: 0, p: 'bumpReady' }, { at: 0.45, p: 'bumpHit' }, { at: 1, p: 'bumpReady' }] },
  // 4.7 動作協調性：二傳出手是短促的一拍——蓄勢長、推出快、回位
  overhead: {
    dur: 0.55, jump: 0, land: false, hit: 0.56,
    keys: [{ at: 0, p: 'setReach' }, { at: 0.42, p: 'setReach' }, { at: 0.56, p: 'setPush' }, { at: 1, p: 'setReach' }],
  },
  // Phase 5 W2 核心-3（跳舉表現層，07-30）：二傳跳起舉球——ai.js 的 jumpSet 純資訊
  // 武器只把「可觸球高度上緣」抬高，動作姿勢沿用 overhead 原班人馬（setReach/setPush，
  // 未加新 pose）；差別只在加了 jump 弧＋落地（land:true 會自動接 landSoft 緩衝）。
  // dur 比 overhead 拉長一截給跳躍留空氣感，hit 維持同一個 keys 形狀與相近分數，
  // 提前量（hitLeadTicks）吃這份 dur/hit 自動重算，不必在 matchLoop 另外調參。
  // jump 高度取 0.32——低於全力扣球起跳（spike/serveJump 0.55）、貼近攔網起跳
  // （block 0.34）量級，因為二傳跳舉是就地小跳非助跑爆發，純表現取捨非 sim 數值。
  overheadJump: {
    dur: 0.62, jump: 0.32, land: true, hit: 0.56,
    keys: [{ at: 0, p: 'setReach' }, { at: 0.42, p: 'setReach' }, { at: 0.56, p: 'setPush' }, { at: 1, p: 'setReach' }],
  },
  // ★ Phase 5 W2 核心-1：完整鞭打**三段式切分**（07-30 Sawmah 裁定方向①）★
  // 病灶：舊版是兩段（起跳 windup → 擊球 spike），spike 在 sim 的 TOUCH 事件當下才
  // 觸發，而空中接續的播放進度 carry 上限＝seq.hit ⇒ spike 一接手 t 就直接落在擊球幀，
  // 4.7 §P3 排好的肩(0.30)→肘(0.36)→腕(0.42) 三個解鎖幀**整段被跳過**——完整鞭打
  // 玩家從沒看過。W1 已證「windup/spike 兩弧直接對相位」會破壞跳躍連續性，是死路。
  // 三段式：
  //   段① windup     助跑弧／起跳：把人送上去（跳躍弧的來源），末幀已擺成引臂
  //   段② spikeHold  滯空 hold：可變長度（滯空多久 hold 多久），等擊球時刻
  //   段③ spike      擊球弧：固定短時長，引臂→解鎖→擊球→收臂，三幀保證播全
  // 段③由 matchLoop 依 hitPoint 倒數 hitLeadTicks('spike') **提前觸發**（同接球/舉球
  // 那一套提前量機制），所以解鎖幀落在觸球之前；觸球那一幀正好是擊球幀。
  // 跳躍弧不再綁在序列上（見 createGeoAnimator 的 air）——段落換手時身體高度連續。
  //
  // 段①：dur 只涵蓋「蹬伸離地→擺成引臂」這一拍；跳躍弧另由 airDur 宣告＝0.75s
  // （改制前 windup 的整段弧，逐值不變，誘餌與早跳路徑的滯空長度不受影響）。
  // 播完自動接段②（chain，同 land→landSoft 的自動接續機制）。
  windup: {
    dur: 0.1, jump: 0.5, airDur: 0.75, land: false, chain: 'spikeHold',
    keys: [{ at: 0, p: 'windup' }, { at: 1, p: 'spikeWind' }],
  },
  // 段②：滯空引臂 hold。sustain:'air'＝觸發當下由 air 算出的**剩餘滯空時間**——
  // 滯空多久就 hold 多久，落地那一刻自然鬆手；被段③接手時提前結束。
  // 沒有攻擊接手的誘餌（W2-2 假動作全員演出）就一路 hold 到落地＝改制前 windup 的
  // 行為，差別只在姿勢換成 4.7 的弓身引臂 spikeWind（誘餌看起來也像要扣球）。
  spikeHold: {
    dur: 0.08, sustain: 'air', jump: 0, airborne: true, land: false,
    keys: [{ at: 0, p: 'spikeWind' }, { at: 1, p: 'spikeWind' }],
  },
  // 段③：擊球弧。0→0.14 引臂（接段②的姿勢，也讓冷觸發時的 ATTACK 漸入在此走完）、
  // 0.14→0.27 肩解鎖、0.27→0.40 肘伸＋壓腕 snap（擊球幀）、0.40→1 收臂。
  // jump 0.55＝**冷觸發時才用得到的退路**（沒有段①的弧可沿用時自己開一條，例如
  // 玩家沒起跳就出手）；正常三段鏈裡跳躍弧一律沿用段①的 air，這個值不參與。
  spike: {
    dur: 0.45, jump: 0.55, airborne: true, land: true, hit: 0.4,
    keys: [
      { at: 0, p: 'spikeWind' },
      { at: 0.14, p: 'spikeWind' },
      { at: 0.27, p: 'spikeUnlock' },
      { at: 0.4, p: 'spikeHit' },
      { at: 1, p: 'spikeFollow' },
    ],
  },
  serve: { dur: 0.72, jump: 0.3, land: false, keys: [{ at: 0, p: 'spikeWind' }, { at: 0.5, p: 'spikeHit' }, { at: 1, p: 'spikeFollow' }] },
  // 發球分式（07-24）：跳發＝扣球家族的高跳全揮（快節奏擊球＋深隨揮＋落地緩衝）；
  // 飄浮＝站立零跳、短促推擊收快（dur 0.5）；serveReady＝發球前持球預備（hold 用）
  serveJump: { dur: 0.85, jump: 0.55, land: true, keys: [{ at: 0, p: 'spikeWind' }, { at: 0.4, p: 'spikeHit' }, { at: 1, p: 'spikeFollow' }] },
  serveFloat: { dur: 0.5, jump: 0, land: false, keys: [{ at: 0, p: 'floatWind' }, { at: 0.45, p: 'floatPush' }, { at: 1, p: 'serveReady' }] },
  serveReady: { dur: 1, jump: 0, land: false, keys: [{ at: 0, p: 'serveReady' }, { at: 1, p: 'serveReady' }] },
  // W7 A4③：喘氣 hold（死球間隙持續姿勢，matchView 依 stamina 檔位切換 setHold）
  gasp: { dur: 1, jump: 0, land: false, keys: [{ at: 0, p: 'gasp' }, { at: 1, p: 'gasp' }] },
  // N1：重度檔（<25%）喘氣 hold（matchView tierOf>=2 時切換到這支）
  gaspHeavy: { dur: 1, jump: 0, land: false, keys: [{ at: 0, p: 'gaspHeavy' }, { at: 1, p: 'gaspHeavy' }] },
  // W7 B4④：氣勢極端不利 idle hold（死球間隙低頭慢走回位；喘氣優先於此，見 matchView 判斷序）
  dejected: { dur: 1, jump: 0, land: false, keys: [{ at: 0, p: 'dejected' }, { at: 1, p: 'dejected' }] },
  // block＝攔網待命牆姿的 hold 源（matchView setHold 播 t=0 幀）——**t=0 必須是
  // 舉手 blockUp**：07-27 試玩追修——曾把蹲載入插在 t=0，整排待命攔網手變蹲姿
  // ＝「單人攔網感」（合攔的牆看不見了）。真正起跳的重量感拆到 blockJump。
  // 對應底稿 §80-89 狀態機的 READY 節點（雙手前舉預備）——本輪 W2-6 維持 hold 不動。
  block: { dur: 0.7, jump: 0.34, land: true, keys: [{ at: 0, p: 'blockUp' }, { at: 0.4, p: 'blockPunch' }, { at: 1, p: 'blockUp' }] },
  // 4.5B §8 攔網重量感（僅實際起跳觸發）：蹲（load）→蹬（up）→滯空（punch）→落地；
  // dur 不動（0.7＝實測調參值，sim 的 blockUntil/jumpAt 時間戳照舊照播、不重算時機）。
  // W2-6：四關鍵幀對應底稿 §3C／§80-89 揮臂式攔網的四個節點——
  //   0    blockLoad  ：LOAD（雙臂下擺至腰際蓄力＋蹲，見 POSES.blockLoad 註解）
  //   0.22 blockUp    ：JUMP（短蓄力蹲跳的上升段，雙臂由腰際同步上擺，非長助跑式）
  //   0.45 blockPunch ：ARM_EXTEND（雙臂鎖肩打直穿越網面，punch-through 前傾收尾）
  //   1    blockUp    ：落地前收回待命牆姿
  // 上擺幅度沿用既有 blendKeys 線性插值（LOAD→JUMP 之間是連續漸變，不是瞬間甩臂）＝
  // 底稿 §49-51 警告的「有控制的擺臂」而非亂甩；四幀時間點與時長本身不動，只調過 POSES。
  blockJump: { dur: 0.7, jump: 0.34, land: true, keys: [{ at: 0, p: 'blockLoad' }, { at: 0.22, p: 'blockUp' }, { at: 0.45, p: 'blockPunch' }, { at: 1, p: 'blockUp' }] },
  // W2 補課④：graze（擦手）版——同一套蹲→蹬→滯空→落地節奏，中段換成較保守的
  // blockTouch（見 POSES 註解），讓玩家分得出「攔死」與「指尖擦到」兩種畫面。
  // 三態的第三態 clean 沒有觸球事件、本來就不觸發任何演出，維持不變
  blockJumpGraze: { dur: 0.7, jump: 0.34, land: true, keys: [{ at: 0, p: 'blockLoad' }, { at: 0.22, p: 'blockUp' }, { at: 0.45, p: 'blockTouch' }, { at: 1, p: 'blockUp' }] },
  // Phase 5 W1 §2-2/2-4：助跑三步節奏（雙臂後擺→前一步壓低，**jump 0＝腳不離地**）。
  // 取代 4.7 的兩關鍵幀版（0.28s／走過去然後拔起）——步相由 update() 的 stepPhase()
  // 另外驅動腿部（見 STEP_AMP_3/4），這裡的 keys 只管手臂/軀幹的蓄勢→交棒 windup。
  // dur 對齊「助跑起手→sim 起跳點」的新提前量（matchLoop APPROACH_LEAD_*_TICKS）。
  approach3: {
    dur: 0.75, jump: 0, land: false, steps: 3,
    keys: [{ at: 0, p: 'approachBack' }, { at: 0.7, p: 'approachBack' }, { at: 1, p: 'approachDrive' }],
  },
  // 距離長（後排／pipe）：多一步，dur 拉長，尾三步形狀與 approach3 相同（見 STEP_AMP_4）
  approach4: {
    dur: 1.0, jump: 0, land: false, steps: 4,
    keys: [{ at: 0, p: 'approachBack' }, { at: 0.78, p: 'approachBack' }, { at: 1, p: 'approachDrive' }],
  },
  // 4.5B §8 助跑遲疑：低 trust 快攻的起跳——抬手一半、跳得較矮（與果斷 windup 對照）。
  // **刻意不接三段式的引臂 hold**：遲疑的人本來就沒把手臂拉滿，接 spikeHold 會把
  // 「抬手一半」抹掉＝低 trust 的身體語言讀不出來（4.5B §8 的整個用意）
  windupHesitant: { dur: 0.75, jump: 0.36, land: false, keys: [{ at: 0, p: 'windupHesitant' }, { at: 1, p: 'windupHesitant' }] },
  // 4.7 動作協調性（07-28 Sawmah：「所有動作的流暢度檢查一下」）：接球與舉球
  // 原本都是**球碰到手才播動作**——站著/跑著→突然出手。補預備段：球到之前先
  // 擺好姿勢，觸球時由 bump/overhead 接管（與扣球 approach→windup 同一套修法）
  // sustain（07-28 §3 修）：預備段擺好後「撐住」不自己鬆手——見 update() 的 total。
  // 沒有它的話，觸球那一刻預備序列已走進自己的 RELEASE 尾段、權重掉到 0.25，
  // 手臂鬆回大半，正式動作再從 0 抬一次＝Sawmah 回報的「兩次抬手」
  receiveReady: {
    dur: 0.5, sustain: 0.6, jump: 0, land: false,
    keys: [{ at: 0, p: 'bumpReady' }, { at: 1, p: 'bumpReady' }],
  },
  setReady: {
    dur: 0.45, sustain: 0.6, jump: 0, land: false,
    keys: [{ at: 0, p: 'setReach' }, { at: 1, p: 'setReach' }],
  },
  // Phase 5 W1 §2-3：等待姿勢——攻擊手轉身拉開到位後、二傳觸球前的站定 hold。
  // sustain 給寬裕（1.5s）：多數情況會被 approach3/4 的 trigger 提前接手蓋掉；
  // 真的等滿 sustain（例如攻擊手最終沒被選中）就自然鬆開回跑動/待命，不會卡住
  transitionWait: {
    dur: 0.3, sustain: 1.5, jump: 0, land: false,
    keys: [{ at: 0, p: 'transitionWait' }, { at: 1, p: 'transitionWait' }],
  },
  // §P5：帶 land 的序列播完自動接這段（見 update 尾端）——屈膝吸收 0.25s 再起身
  landSoft: {
    dur: 0.26, jump: 0, land: false,
    keys: [{ at: 0, p: 'land' }, { at: 0.4, p: 'landDeep' }, { at: 1, p: 'landRise' }],
  },
  cheer: { dur: 0.9, jump: 0.26, land: false, keys: [{ at: 0, p: 'blockUp' }, { at: 1, p: 'blockUp' }] },
  // W7 B4④：氣勢極端有利（+3）得分互擊掌加碼——同 cheer 姿勢但時長拉長＋多一次高峰
  // （提高「播率或時長」拍板走時長路線：更久的舉臂慶祝，不新增機率判定/rng）
  highfive: {
    dur: 1.3, jump: 0.3, land: false,
    keys: [{ at: 0, p: 'blockUp' }, { at: 0.35, p: 'blockPunch' }, { at: 0.65, p: 'blockUp' }, { at: 1, p: 'blockPunch' }],
  },
  // 魚躍：備戰→撲出手臂前伸→趴地；dur≈倒地恢復（42tick/60≈0.7s），撲空也演完整套
  // 爬起自然化（Sawmah 07-23 試玩回報「爬起太快」，拍板純視覺調不動 sim 節奏）：
  // 撲出/落地壓前（真實飛撲本就爆發）→ 趴住一拍（0.34-0.52 重量感）→ 撐地→起身；
  // 搭配 matchView 的「先低姿爬回、後起身」曲線（該處緩動同輪調整）
  dive: { dur: 0.72, jump: 0, land: false, keys: [{ at: 0, p: 'bumpReady' }, { at: 0.14, p: 'diveReach' }, { at: 0.34, p: 'diveSprawl' }, { at: 0.52, p: 'diveSprawl' }, { at: 0.74, p: 'divePush' }, { at: 1, p: 'bumpReady' }] },
  // 4.5B §4：揮手喊球（舉臂左右擺兩拍）＋攔網手點頭確認（快而小）
  wave: { dur: 0.9, jump: 0, land: false, keys: [{ at: 0, p: 'waveUp' }, { at: 0.25, p: 'waveSide' }, { at: 0.5, p: 'waveUp' }, { at: 0.75, p: 'waveSide' }, { at: 1, p: 'waveUp' }] },
  nod: { dur: 0.45, jump: 0, land: false, keys: [{ at: 0, p: 'nodNeutral' }, { at: 0.4, p: 'nodDown' }, { at: 1, p: 'nodNeutral' }] },
};

// 擊球關鍵幀查表（唯讀導出；matchLoop 的提前量與探針/測試的目標值都吃這一份，
// 避免「序列調了、提前量沒跟著調」的漂移）
export const SEQ_HIT = Object.freeze(
  Object.fromEntries(Object.entries(SEQUENCES).filter(([, s]) => s.hit != null).map(([k, s]) => [k, s.hit])),
);
// 從序列起點到擊球關鍵幀的 tick 數（60Hz）＝該動作該提前幾 tick 觸發
export function hitLeadTicks(type) {
  const seq = SEQUENCES[type];
  return seq?.hit != null ? Math.round(seq.hit * seq.dur * 60) : 0;
}
// 序列全長（tick）：把「起手那一幀」對齊到指定的結束 tick 用（matchLoop 讓助跑
// approach3/4 的最後一步正好踩在 sim 算好的起跳 tick 上）。與 hitLeadTicks 同一個
// 用意——時長是這裡的單一真相，序列調時長時提前量自動跟著調，不會漂移
export function seqDurTicks(type) {
  const seq = SEQUENCES[type];
  return seq ? Math.round(seq.dur * 60) : 0;
}

export const OVERHAND_Y = 1.6; // 擊球高度高於此＝高手動作，低於＝低手墊球（表現層判定）
// sim 的 TOUCH 事件 → 該播哪一支擊球動畫；null＝本層不播。
// armed＝**提前觸發已經在播的那一支**（見 matchLoop 的擊球提前量／matchView.triggerContact）：
//   同一支＝回 null（不得重播——同一次接觸播兩次就是「手抬兩下」）
//   不同支＝回正確的那一支（事前判低手、實際球高過門檻走高手 ⇒ 當場改播，同修前行為）
// kind==='dive'＝魚躍觸球：動畫由 matchView 的 divedUntil 偵測負責（撲到/撲空都演）
// jumpSet＝sim TOUCH 事件已帶的事實（game.js:613 `intent.jump` 直接抄過來，非本層
// 重算）——kind==='set' 且該球是跳舉觸成就改播 overheadJump，其餘 kind 不受影響。
//
// ★ 07-30 已知死碼（C-3，Phase 5 W2 掃尾-10；刻意保留，不刪）★
// 最後一支三元：kind 為 receive 時若 ballY ≥ OVERHAND_Y 才會走到 'overhead'（高手接球）。
// 手點收斂 t=1 後，接球可及球體上緣＝(RECEIVE_HANDPOINT_H_RATIO + RECEIVE_REACH_H_RATIO)
// × H + BALL.RADIUS＝0.81H + 0.105——H=1.75 時只有 1.52m，構造上摸不到 OVERHAND_Y=1.6m，
// 這支分支對主錨身高的球員幾何上打不到（contact-frame-probe 實測高手接球僅 2.0%，
// 非 0——身高 ≥1.85 的球員 0.81×1.85+0.105=1.605m 才勉強夠得到 1.6m 門檻，仍會觸發）。
// 不刪的原因：①仍有極少數高個子球員會走到這裡（真死碼會是「永遠 0%」，這裡不是）
// ②刪掉要連帶清 tests/geoAnimator 對這支分支的既有測試，動測試不是本項範圍。
export function contactSeqFor(kind, ballY, armed = null, jumpSet = false) {
  const type = kind === 'spike' ? 'spike'
    : kind === 'set' ? (jumpSet ? 'overheadJump' : 'overhead')
      : kind === 'dive' ? null
        : (ballY >= OVERHAND_Y ? 'overhead' : 'bump');
  return type === armed ? null : type;
}

const ATTACK_MS = 0.08;
const RELEASE_MS = 0.2;
const LAND_FROM = 0.72;

function lerp(a, b, f) { return a + (b - a) * f; }
function poseVal(p, key, def = 0) { return p[key] ?? def; }
function poseArm(p, key) { return p[key] ?? REST_ARM; }
const REST_ARM = [0, 0];

export function createGeoAnimator(rig) {
  const j = rig.joints;
  let current = null; // { seq, type, t, w0, sustain, rate }
  let hold = null;
  // 跳躍弧（Phase 5 W2 核心-1 三段式）：**與動作序列解耦**的一條 sin 弧
  // { jump 峰高, dur 全長, t 已飛行秒數 }。解耦的理由＝可變長度的滯空 hold（段②）
  // 待在空中時，序列自己的 t 早就走完了，綁在序列上的舊算法會讓人瞬間落地。
  // 非 airborne 的序列照舊由自己的 jump/dur 開一條新弧（airDur 可覆寫全長），
  // 逐值與改制前相同——block/serveJump/overheadJump/cheer 行為零改變
  let air = null;
  let runW = 0;
  let latW = 0;  // 平滑後的橫移分量（見 update 內註解：生的 lateral 會單幀翻號）
  let lastW = 0; // 上一幀的動作層權重——預備段交棒給正式動作時用（見 trigger 的 w0）
  let phase = 0;
  const blended = {};
  // Phase 5 W1 §1b：慣用手只影響助跑步序方向（見檔頭 STEP_ORDER_*）；
  // 未帶 handed 欄位（例如舊測試手造的 rig）視同右手，外觀零改變
  const handed = rig.handed === 'l' ? 'l' : 'r';
  const order3 = handed === 'l' ? STEP_ORDER_L3 : STEP_ORDER_R3;
  const order4 = handed === 'l' ? STEP_ORDER_L4 : STEP_ORDER_R4;

  // W2 補課⑤（07-30）：慣用手鏡像——**單一實作點**（優於逐 pose 手寫左手版）。
  // 證明：對**已經左右對稱**的姿勢（bumpReady/setReach/blockUp…，即
  // rSh.x===lSh.x 且 rSh.z===-lSh.z 的既有慣例，見各姿勢定義），下面這個鏡像變換是
  // **恆等**——swap 兩側後再各自取反 z 完全還原原值。只有真正「單手臂主導」的攻擊/
  // 發球姿勢（windup/spikeWind/spikeUnlock/spikeHit/spikeFollow/floatWind/floatPush/
  // windupHesitant）rSh.x≠lSh.x，鏡像才會改變外觀——這些正是「一律右臂擊球」要修的
  // 對象，且不必列白名單：對稱姿勢自動免疫，只寫一份鏡像規則就涵蓋全部姿勢。
  // pelvisY/chestY（髖肩分離的左右扭轉）只有這幾支攻擊姿勢在用，同樣需要鏡像
  // （左手鏡像的揮擊，軀幹扭轉方向也要反過來），單獨取反即可、不需要 side 對調。
  function armKeyFor(outSide, h) {
    if (h !== 'l') return outSide === 'r' ? 'rSh' : 'lSh';
    return outSide === 'r' ? 'lSh' : 'rSh';
  }
  function elKeyFor(outSide, h) {
    if (h !== 'l') return outSide === 'r' ? 'rEl' : 'lEl';
    return outSide === 'r' ? 'lEl' : 'rEl';
  }
  function blendKeys(seq, t, out, handed = 'r') {
    const keys = seq.keys;
    let i = 0;
    while (i < keys.length - 1 && t > keys[i + 1].at) i += 1;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    const span = Math.max(b.at - a.at, 1e-4);
    const f = Math.min(Math.max((t - a.at) / span, 0), 1);
    const pa = POSES[a.p];
    const pb = POSES[b.p];
    for (const outSide of ['rSh', 'lSh']) {
      const srcKey = armKeyFor(outSide === 'rSh' ? 'r' : 'l', handed);
      let ra = poseArm(pa, srcKey);
      let rb = poseArm(pb, srcKey);
      // 鏡像＝對調左右來源＋反轉 z（見檔頭證明：對稱姿勢兩側 z 互為相反數，
      // swap 後再反號＝原值不變；只有非對稱姿勢會真的變）
      if (handed === 'l') { ra = [ra[0], -ra[1]]; rb = [rb[0], -rb[1]]; }
      out[outSide] = [lerp(ra[0], rb[0], f), lerp(ra[1], rb[1], f)];
    }
    for (const outKey of ['rEl', 'lEl']) {
      const srcKey = elKeyFor(outKey === 'rEl' ? 'r' : 'l', handed);
      out[outKey] = lerp(poseVal(pa, srcKey), poseVal(pb, srcKey), f);
    }
    // 4.7 動作重製新增欄位：spineUp＝胸椎（弓身/收腹）、wrist＝壓腕（側別由呼叫端
    // 決定，見 update() 的壓腕路由）。pelvisY/chestY 只有攻擊姿勢在用、鏡像時反號
    for (const k of ['spine', 'neck', 'crouch', 'spineUp', 'wrist']) {
      out[k] = lerp(poseVal(pa, k), poseVal(pb, k), f);
    }
    for (const k of ['pelvisY', 'chestY']) {
      const v = lerp(poseVal(pa, k), poseVal(pb, k), f);
      out[k] = handed === 'l' ? -v : v;
    }
  }

  // 起一段新序列（trigger 與段落自動接續 chain／landSoft 共用同一條路）
  function startSeq(seq, type, { t = 0, w0 = 0, hitInTicks = null } = {}) {
    // sustain:'air'＝剩餘滯空時間（見 SEQUENCES.spikeHold）；數字＝固定秒數（既有語意）
    const sustain = seq.sustain === 'air'
      ? Math.max(0, (air ? air.dur - air.t : 0) - seq.dur)
      : (seq.sustain ?? 0);
    const cur = { seq, type, t, w0, sustain, rate: 1 };
    // 短滯空退化路徑（三段式；工單「快攻滯空不夠播全三幀時怎麼辦」）：擊球弧觸發時
    // 若剩餘時間不足以照原速播到擊球幀，就把「到擊球幀」那一段**等比壓縮**進剩餘
    // 時間——解鎖幀被壓扁但仍然播得到，不回到舊版「跳過解鎖幀」的老路。
    // 上限 3 倍：再快就是瞬切，那一段交給 catchUpToHit 收尾（並在探針裡看得見）
    if (hitInTicks != null && seq.hit != null) {
      const need = seq.hit * seq.dur - t;
      const have = hitInTicks / 60;
      if (need > 0 && have > 0) cur.rate = Math.min(Math.max(need / have, 1), 3);
    }
    current = cur;
  }

  return {
    // opts.hitInTicks＝呼叫端預估的「還有幾 tick 觸球」（只有擊球弧用得到，見 startSeq）
    trigger(type, opts = null) {
      const seq = SEQUENCES[type];
      if (!seq) return;
      // 跳躍弧的接手（空中接續）：上限＝擊球關鍵幀 seq.hit（07-29 既有規則，沿用），
      // 但進度改從 air 算——三段式把姿勢序列切碎後 current.t 不再等於弧的進度。
      // ★ airborne 的段落不重開弧、也不 carry 播放進度 ★：舊版那個 carry 正是三個
      // 解鎖幀被跳過的病灶，三段式改由 air 保證高度連續、序列一律從頭播
      const cap = seq.hit ?? 0.5;
      const airProg = air ? Math.min(air.t / air.dur, 1) : null;
      if (seq.airborne) {
        // 冷觸發退路：沒有前一段的弧可沿用（玩家沒起跳就出手／段①已落地）才自己開一條
        if (!air) air = { jump: seq.jump, dur: seq.airDur ?? seq.dur, t: 0 };
      } else if (seq.jump > 0) {
        // ★ 2026-08-10 快攻貼地扣球修正 ★ 跳躍弧原本固定 airDur=0.75s（45 tick），
        // 頂點恆在第 22.5 tick——二/三速「起跳→擊球」剛好 21/22 tick＝踩在頂點
        // （0.49m），但**一速快攻要 37-47 tick**＝擊球時人已掉到弧的 82-96%、只剩
        // 0.22m，疊上猶豫/體力係數剩 0.12-0.16m ⇒ 真人看到的「貼地把球打出去」。
        // 修法＝呼叫端可傳 `opts.hangTicks`（起跳→預計擊球的 tick 數），弧長改為
        // 「頂點落在擊球那一刻」：airDur = 2×hangTicks/60，下限取 seq.airDur（二/三速
        // 傳進來 2×21/60=0.7 < 0.75 ⇒ 取 0.75＝**逐值不變、天然零回歸**）、上限 1.4s
        // 防極端值把人吊在空中。未傳＝行為完全照舊。
        // ★ 同修：還在空中的重觸發不重錨 ★ fallback 路徑（matchLoop 的 hitPoint 倒數）
        // 會對同一人再觸發一次 windup：舊行為在 airProg>0.5 時把身體瞬間拉回頂點
        // （畫面上「空中彈一下」），拉長弧之後更會把弧改短。改為：人還在弧上
        // （airProg<1）＝姿勢照播、弧不動；弧已播完（airProg>=1，二速 fallback 重開
        // 新弧的既有「意外正確」路徑）＝照舊重錨。
        if (air && airProg != null && airProg < 1) {
          // 弧保持原樣
        } else {
          const hangSec = opts?.hangTicks != null ? (2 * opts.hangTicks) / 60 : null;
          const baseDur = seq.airDur ?? seq.dur;
          const airDur = hangSec != null
            ? Math.min(Math.max(hangSec, baseDur), 1.4)
            : baseDur;
          air = { jump: seq.jump, dur: airDur, t: airProg != null ? Math.min(airProg, cap) * airDur : 0 };
        }
      } else {
        air = null; // 落地/非跳躍動作接手＝弧結束（改制前「jump 0 的序列 jumpY=0」同義）
      }
      const carry = !seq.airborne && current && current.seq.jump > 0 && seq.jump > 0
        ? Math.min(current.t / current.seq.dur, cap) * seq.dur
        : 0;
      // 段落交棒（預備段與三段式共用）：預備序列撐住的權重直接交給正式動作，不從 0
      // 重跑 ATTACK 漸入。接縫的姿勢刻意設計成同一個（setReach／bumpReady；三段式則是
      // windup 末幀＝spikeWind＝spikeHold＝擊球弧首幀），所以滿權重接手不會跳幀
      const w0 = current && (current.seq.sustain
        || ((current.seq.chain || current.seq.airborne) && seq.airborne)) ? lastW : 0;
      startSeq(seq, type, { t: carry, w0, hitInTicks: opts?.hitInTicks ?? null });
    },
    // 追趕到擊球關鍵幀（**只前進、不回退**；回傳被追掉的秒數，0＝本來就到位）。
    // 擊球弧是照 hitPoint 預測提前觸發的，而 sim 的實際觸球比預測早 1–9 tick
    // （p50＝1；tools/contact-frame-probe.mjs 實測），落在後段那些拍若不追，擊球幀
    // 會落在球已經飛走之後——那正是 07-29 修掉的病，不得復發。
    // 只在「已經落後」時動作 ⇒ 最壞情況等於改制前的行為，不會比舊版差
    catchUpToHit() {
      if (!current || current.seq.hit == null) return 0;
      const target = current.seq.hit * current.seq.dur;
      if (current.t >= target) return 0;
      const skipped = target - current.t;
      current.t = target;
      return skipped;
    },
    setHold(type) { hold = type; },
    isIdle() { return current === null; },
    // 唯讀窺視（測試與 tools/contact-frame-probe.mjs 量「觸球那一幀播到哪」用）：
    // 不得回傳可變的內部參考——外部只會讀數字
    peek() {
      if (!current) return null;
      return {
        type: current.type,
        t: current.t,
        dur: current.seq.dur,
        tNorm: Math.min(current.t / current.seq.dur, 1),
      };
    },

    // 每幀驅動全部關節；回傳 bodyY（跳躍－下蹲的垂直位移，由呼叫端寫進 root.position.y）。
    // lateral（4.7 根運動）：移動方向相對「朝向」的橫向分量（-1..1）——沿網橫移的
    // 攔網手與防守補位是**側併步**（面向網、雙腿開合），不是前跑擺腿。
    // 由 matchView 逐幀算好傳入（它同時握有速度向量與朝向）
    // staminaMul（N1 疲勞可視化，2026-07-30）：matchView 傳入的 staminaPerfMul(state, player)——
    // 與 sim 彈跳折損同一個數字，這裡只拿來縮小跳躍弧與助跑步幅，未啟用體力系統時恆 1、
    // 行為零改變（沿用既有呼叫端零副作用範式，見檔內舊測試皆不帶第 4 參）
    update(dt, speed, lateral = 0, staminaMul = 1) {
      // 跑姿權重與步相位（幀率無關的指數收斂）
      const runTarget = Math.min(speed / RUN_FULL_SPEED, 1);
      runW += (runTarget - runW) * (1 - Math.exp(-10 * dt));
      phase += dt * (STRIDE_BASE + speed * STRIDE_PER_MS);
      const s = Math.sin(phase);

      // 動作層權重
      let w = 0;
      let jumpY = 0;
      let pose = null;
      let stepInfo = null; // 助跑三/四步節奏（見 STEP_AMP_3/4）：非 null＝本幀由步相驅動腿部
      // 跳躍弧獨立推進（見宣告處註解）：段落換手不重置，飛完自然歸零
      if (air) {
        air.t += dt;
        if (air.t >= air.dur) air = null;
        else jumpY = air.jump * Math.sin((air.t / air.dur) * Math.PI) * staminaMul;
      }
      if (current) {
        const { seq } = current;
        // rate＝擊球弧的壓縮倍率（見 startSeq）：只作用在「還沒到擊球幀」那一段，
        // 過了擊球幀就回到原速播收臂。沒設 rate 的序列恆 1＝行為完全不變
        const hitT = seq.hit != null ? seq.hit * seq.dur : Infinity;
        current.t += dt * (current.t < hitT ? current.rate : 1);
        // sustain＝末幀「撐住」的秒數（預備姿勢等球用）：撐住期間停在末幀滿權重，
        // 撐完才走 RELEASE 漸出。沒宣告 sustain 的序列 total===dur＝行為完全不變
        const total = seq.dur + current.sustain;
        if (current.t >= total) {
          // §P5：跳躍類動作落地後自動接緩衝（不得瞬間回站姿）
          // chain＝三段式的段落自動接續（段①→段②）：滿權重交棒、不重跑漸入
          if (seq.land) { air = null; startSeq(SEQUENCES.landSoft, 'landSoft', {}); }
          else if (seq.chain) startSeq(SEQUENCES[seq.chain], seq.chain, { w0: lastW });
          else current = null;
        } else {
          const t = Math.min(current.t / seq.dur, 1);
          const attack = current.w0 + (1 - current.w0) * Math.min(current.t / ATTACK_MS, 1);
          // 會自動接續下一段的序列不走 RELEASE 漸出（接棒的那一段會滿權重接手）
          w = Math.min(attack, seq.chain ? 1 : Math.min((total - current.t) / RELEASE_MS, 1));
          blendKeys(seq, t, blended, handed);
          pose = blended;
          if (seq.land && t > LAND_FROM) {
            const lf = (t - LAND_FROM) / (1 - LAND_FROM);
            blended.crouch += POSES.land.crouch * lf;
            blended.spine += POSES.land.spine * lf;
          }
          if (seq.steps === 4) stepInfo = stepPhase(t, order4, STEP_AMP_4, STEP_CROUCH_4);
          else if (seq.steps === 3) stepInfo = stepPhase(t, order3, STEP_AMP_3, STEP_CROUCH_3);
        }
      }
      if (!pose && hold && SEQUENCES[hold]) {
        blendKeys(SEQUENCES[hold], 0, blended, handed);
        pose = blended;
        w = 1;
      }
      lastW = w;

      // 底層：待命（微蹲備戰＋呼吸）↔ 跑動（擺腿擺臂＋前傾＋起伏）
      const breath = Math.sin(phase * 0.35) * 0.02;
      // 步幅匹配（見檔頭 LEG_LEN 註解）：低速時 asin 內小、振幅自然變小；
      // 高速夾在 SWING_MAX（超過就是跨不了那麼大步，寧可留一點滑動也不要劈腿）
      const strideRate = STRIDE_BASE + speed * STRIDE_PER_MS;
      const halfStep = (speed * Math.PI) / Math.max(strideRate, 1e-3);
      const matched = Math.asin(Math.min(halfStep / (2 * LEG_LEN), 1));
      // 橫移比例越高，前後擺腿越少、側併步越多（斜向自然混合）
      // 07-28：lateral 必須先平滑再用。瀏覽器逐幀實測到兩種單幀跳變——
      // ①玩家 A↔D 換向時 lateral 由 −1 直接翻到 +1（幅值恆為 1、只有正負號變），
      //   雙腿單幀鏡像 32°；②sim 的 stop-go 讓 speed 忽快忽零，matchView 的
      //   `speed > 0.25` 門檻使 lateral 單幀歸零。runW 本來就有 10/s 指數平滑，
      //   但 sideW 直接吃生的 lateral ⇒ 腿沒有任何過渡。這裡補上同族的平滑
      latW += (lateral - latW) * (1 - Math.exp(-12 * dt));
      const sideW = Math.min(Math.abs(latW), 1);
      const legSwing = Math.min(matched, SWING_MAX) * runW * (1 - sideW * 0.85);
      const shuffle = sideW * runW;
      const armSwing = 0.5 * runW;
      const idleW = 1 - runW;
      const baseSpine = 0.16 * runW + 0.07 * idleW + breath;
      // ★ 步相權重＝「人是否真的在位移」（runW 已是平滑後的速度權重）。
      // 沒有這一項的話：4.7 的「到位即停＝原地拔起」會讓人在助跑動畫播完前就
      // 站住，腿卻照序列時間繼續踩＝**原地左右左右跳舞**（07-28 Sawmah 試玩回報）。
      // 用 runW 而不是瞬時速度：它有 ~100ms 的指數平滑，減速中的制動步仍看得到，
      // 但真的站定超過幾幀後腿就收乾淨
      const stepW = stepInfo ? runW : 0;
      const poseCrouch = (pose ? blended.crouch * w : 0);
      const crouch = stepInfo
        ? lerp(poseCrouch, stepInfo.crouch, stepW) + 0.02 * idleW
        : poseCrouch + 0.02 * idleW;

      if (stepInfo) {
        // Phase 5 W1 §2-2：助跑三/四步節奏——踩前腳當幀擺幅最大，另一腳小幅拖後；
        // 不疊加連續跑步相位（stepPhase 的半波本身就是離散的三/四段步相）。
        // N1：staminaMul 縮小步幅＝「助跑演出變短」——只改物理跨距不改時長，
        // 不動 matchLoop 依 seqDurTicks 算好的起跳提前量對齊
        const sw = stepInfo.swing * stepW * staminaMul;
        const forward = -sw;
        const trail = sw * 0.3;
        j.rHip.rotation.x = (stepInfo.lead === 'r' ? forward : trail) - crouch * 1.1;
        j.lHip.rotation.x = (stepInfo.lead === 'l' ? -forward : -trail) - crouch * 1.1;
        j.rHip.rotation.z = 0;
        j.lHip.rotation.z = 0;
        // 站定時回到待命屈膝（0.14 * idleW），不是僵直站著
        j.rKnee.rotation.x = 0.12 + 0.14 * idleW + crouch * 2.2 + (stepInfo.lead === 'r' ? sw * 0.5 : 0);
        j.lKnee.rotation.x = 0.12 + 0.14 * idleW + crouch * 2.2 + (stepInfo.lead === 'l' ? sw * 0.5 : 0);
      } else {
        // 腿：跑動擺動＋下蹲屈膝（動作層的 crouch 轉成膝/髖角度——蹲得像蹲不像沉地）
        j.rHip.rotation.x = -legSwing * s - crouch * 1.1;
        j.lHip.rotation.x = legSwing * s - crouch * 1.1;
        // 側併步（07-28 重做；Sawmah 回報「橫移時雙腿很不自然」）：
        // 舊版兩髖 z **同號**＝兩條腿一起倒向同一邊，只是幅度輪流大小——那不是併步。
        // geoCharacter.js:161-162 兩髖同向建立（只差位置 sx*0.095，無鏡像旋轉），
        // 且繞 z +θ 會把腿往 +X 帶、角色右側在 −X ⇒ **右腿外展＝負、左腿外展＝正**。
        // 真實併步＝外側腿先跨開 → 內側腿跟上收攏，兩腿**相對開合**、站距一寬一窄。
        // 用相位差製造先後（trail 落後 1.2 rad），用連續的 f 取代 shuffleDir 的硬翻面
        // （lateral 過零時不會瞬間交換領跨腿）
        const openW = 0.5 + 0.5 * Math.sin(phase);
        const closeW = 0.5 + 0.5 * Math.sin(phase - 1.2);
        const spread = shuffle * 0.34 * openW;
        const trail = shuffle * 0.34 * closeW;
        const f = 0.5 + 0.5 * Math.max(-1, Math.min(1, latW * 3)); // 0＝右側領跨、1＝左側領跨
        j.lHip.rotation.z = spread * f + trail * (1 - f);
        j.rHip.rotation.z = -(spread * (1 - f) + trail * f);
        // 橫移時膝蓋不該再跑前進步態的交替抬腿（髖在併步、膝在走路＝兩套動作疊著）：
        // 交替量隨 sideW 收掉，改成併步該有的低姿屈膝
        const walkKnee = 1 - sideW * 0.85;
        const shuffleCrouch = sideW * runW * 0.28;
        j.rKnee.rotation.x = (0.12 + Math.max(0, -s) * 0.95 * walkKnee) * runW
          + 0.14 * idleW + crouch * 2.2 + shuffleCrouch;
        j.lKnee.rotation.x = (0.12 + Math.max(0, s) * 0.95 * walkKnee) * runW
          + 0.14 * idleW + crouch * 2.2 + shuffleCrouch;
      }

      // 軀幹/頭（4.7：脊椎兩節＋骨盆獨立轉——髖肩分離與弓身的來源）
      j.spine.rotation.x = pose ? lerp(baseSpine, blended.spine, w) : baseSpine;
      j.spine.rotation.y = 0;
      j.spineUpper.rotation.x = pose ? blended.spineUp * w : 0;
      j.spineUpper.rotation.y = pose ? blended.chestY * w : 0;
      j.pelvis.rotation.y = pose ? blended.pelvisY * w : 0;
      j.neck.rotation.x = pose ? lerp(-0.04, blended.neck, w) : -0.04;

      // 手臂：跑動反向擺（無動作時）→ 動作姿勢（有動作時）
      const restElbow = -0.35 * idleW - 0.6 * runW;
      const armX = { r: armSwing * s - 0.12 * idleW, l: -armSwing * s - 0.12 * idleW };
      for (const side of ['r', 'l']) {
        const sh = j[`${side}Shoulder`];
        const el = j[`${side}Elbow`];
        const arm = pose ? blended[`${side}Sh`] : null;
        sh.rotation.x = pose ? lerp(armX[side], arm[0], w) : armX[side];
        sh.rotation.z = pose ? lerp(0, arm[1], w) : 0;
        el.rotation.x = pose ? lerp(restElbow, blended[`${side}El`], w) : restElbow;
        // 壓腕只給慣用手：右手選手＝r、左手選手鏡像＝l（W2 補課⑤）——非慣用手恆中性，
        // 雙手一起壓看起來像機器人
        j[`${side}Wrist`].rotation.x = pose && side === handed ? blended.wrist * w : 0;
      }

      // 垂直位移：跳躍弧－下蹲；跑動小起伏
      const bob = -0.03 * runW * (0.5 + 0.5 * Math.cos(phase * 2));
      return jumpY - crouch * 0.55 + bob;
    },
  };
}
