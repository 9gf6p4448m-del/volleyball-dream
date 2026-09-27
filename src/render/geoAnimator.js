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
// 2B 文獻校準（D0 發現 2；Ridgway & Hamilton 1987 低手接球 HS 組：大腿前擺 46°／膝角 135°
// ＝小腿近乎鉛直、屁股往後坐）：下蹲原本是「髖 −crouch×1.1、膝 +crouch×2.2」——大腿幾乎
// 不前擺、小腿往後倒，而且腿長縮短量遠小於 root 下降量（crouch×0.55）⇒ 蹲下時鞋子
// 沒入地板（2B 探針：待命站姿鞋底已 −0.059 m、最深 −0.24 m）。改成**小腿保持鉛直、
// 大腿前擺角 a 由骨盆下降量反解**：THIGH_LEN·(1−cos a)＝下降量，膝彎＝a（鞋盒因此保持
// 水平、鞋底不入地）。root 下降公式（crouch×0.55）不變，只改腿怎麼吸收它。
const THIGH_LEN = 0.46;      // geoCharacter.js：膝在髖下 0.46（BASE_H 空間）
const LEG_SWITCH_S = 0.15;   // 腿部分支切換的緩入秒數
const BACK_KNEE = 2.0;       // 一般跑動後擺腿的連續膝彎係數
const SQUAT_MAX = 1.45;      // 大腿前擺上限（rad，約 83°）；下降量超過時截在此
function squatAngle(drop) {
  const c = Math.min(Math.max(drop, 0) / THIGH_LEN, 1 - Math.cos(SQUAT_MAX));
  return Math.acos(1 - c);
}
// 腳底保護（2B E4＋自然度）：幾何人有腳關節（geoCharacter.js rFoot／lFoot）後，著地的鞋底由
// 腳關節保持水平，鞋底高度只由「踝高」決定，而踝高對小腿傾角是單調的⇒可以**解析、連續**地求
// 最小膝彎：THIGH_LEN·cos(hip)＋SHIN_LEN·cos(hip＋knee) ≤ 站姿腿長 − 骨盆下降量。
// （之前鞋盒跟著小腿轉，鞋尖入地／抬腳的可行解不連續，助跑膝角單幀跳 30–48°。）
const SHIN_LEN = 0.44;
const STAND_LEG = THIGH_LEN + SHIN_LEN;
function groundKnee(hipX, kneeX, drop) {
  const reach = STAND_LEG - drop - THIGH_LEN * Math.cos(hipX); // 小腿可用的最大垂直長度
  const c = reach / SHIN_LEN;
  if (c >= 1) return kneeX; // 小腿鉛直也碰不到地面以下
  const need = Math.acos(Math.max(-1, c)); // 小腿至少要傾這麼多
  const tilt = hipX + kneeX;
  if (Math.abs(tilt) >= need) return kneeX;
  return (tilt < 0 ? -need : need) - hipX;
}
// 腳關節角：鞋子的淨傾角（相對地面）限制在「踝離地高度撐得住」的範圍——鞋尖／鞋跟離踝
// 約 0.18 m，淨傾角 τ 讓最低角點下降約 0.18·sin|τ|，所以 |τ| ≤ asin(離地高度／0.2)；踝貼地時鞋底
// 放平、抬高後逐漸跟著小腿自然垂下。連續、無分段
function footAngle(hipX, kneeX, drop) {
  const shin = hipX + kneeX;
  const ankleUp = STAND_LEG - drop - THIGH_LEN * Math.cos(hipX) - SHIN_LEN * Math.cos(shin);
  const tauMax = Math.asin(Math.min(Math.max(ankleUp, 0) / 0.2, 1));
  const tau = Math.max(-tauMax, Math.min(tauMax, shin));
  return tau - shin;
}

// Phase 5 W1 §2-2/§2-4 助跑三步節奏：取代舊版「兩關鍵幀＝走過去然後拔起」。
// 每步一個時間窗（等寬），窗內用 sin 半波（0→峰值→0）驅動該步的擺腿與下沉深度；
// 峰值表＝[小步, 制動步, 併腳]——制動步（idx 1）擺幅與下沉都是全段最深，把水平動能
// 轉垂直的重量感做出來；併腳（idx 2）擺幅收，下沉次深，為雙腳起跳收尾。
// 4 步（後排/長距離）在前面補一個更小的準備步，尾三步沿用 3 步的形狀。
const STEP_SWING_SCALE = 0.85; // 擺腿角度縮放（配合既有 SWING_MAX 量級）
const STEP_AMP_3 = [0.45, 1.0, 0.62];
const STEP_AMP_4 = [0.3, 0.45, 1.0, 0.62];
// 2B 文獻校準（Zahálka 2017，PMC5548173：助跑中重心自起始下降約 0.25 m、身高 1.97 m）：
// 下沉原本是「每步一個 sin 半波」、峰值只有 0.24（2.55 m/s 時重心只降 0.067 m）。改成
// **跨制動步的一條平滑包絡**：第一步幾乎不沉 → 制動步一路壓到最低（t=low）→ 併腳步
// 開始回升 → 序列末（＝sim 起跳 tick）回到 0，交給 windup 起跳，接縫不跳高度。
// 步相擺腿（STEP_AMP）照舊逐步半波。
const APPROACH_CROUCH_PEAK = 0.6;
const CROUCH_ENV_3 = { from: 0.15, low: 0.6 };
const CROUCH_ENV_4 = { from: 0.35, low: 0.68 };
function crouchEnvelope(t, env) {
  if (t <= env.from) return 0;
  if (t <= env.low) return 0.5 - 0.5 * Math.cos(Math.PI * ((t - env.from) / (env.low - env.from)));
  return 0.5 + 0.5 * Math.cos(Math.PI * Math.min((t - env.low) / (1 - env.low), 1));
}
// 步序（哪隻腳在該窗踩前）：右手＝左-右-左（4 步在前補右）；左手鏡像＝右-左-右（前補左）
const STEP_ORDER_R3 = ['l', 'r', 'l'];
const STEP_ORDER_R4 = ['r', 'l', 'r', 'l'];
const STEP_ORDER_L3 = ['r', 'l', 'r'];
const STEP_ORDER_L4 = ['l', 'r', 'l', 'r'];

// t：0..1（相對整段 dur）；回傳該瞬間的步相（idx／半波值／擺腿與下沉量／踩前腳）
function stepPhase(t, order, ampTable, env) {
  const n = order.length;
  const w = 1 / n;
  let idx = Math.min(Math.floor(t / w), n - 1);
  const local = Math.min(Math.max((t - idx * w) / w, 0), 1);
  const hump = Math.sin(local * Math.PI);
  return {
    idx,
    lead: order[idx],
    swing: STEP_SWING_SCALE * ampTable[idx] * hump,
    crouch: APPROACH_CROUCH_PEAK * crouchEnvelope(t, env),
  };
}

// 姿勢：rSh/lSh=[肩x, 肩z]、rEl/lEl=肘x、spine/neck=x、crouch=下蹲深度(m)
// 肩 z 的語意（右側關節在 −X，geoCharacter.js 檔頭）：**右臂 z 正＝往身體中線收（內收）、
// z 負＝往外張（外展）；左臂相反**。pelvisY/chestY 負＝擊球側（右）往後轉。
//
// ★ 2B 鏡像還原（使用者裁定 ①，2026-09-27）★ 07-28 b1ae67d 把右側關節從 +X 搬到 −X，
// 卻沒把這裡的肩 z 與 pelvisY/chestY 跟著反號 ⇒ 下列 25 個姿勢的「內收↔外展」與
// 「轉體方向」全部反了（低手雙臂外張成 0.76 m、扣球轉體方向和真人相反）。本輪逐姿勢
// 依「b1ae67d^（1fd5da6）當時量得的方向鏡像」還原（tools/motion-2b-e1-mirror.mjs 驗證）：
// bumpReady bumpHit setReach setPush spikeWind spikeUnlock spikeHit spikeFollow windup
// approachBack approachDrive landDeep landRise diveReach diveSprawl divePush serveReady
// floatWind floatPush gasp dejected waveUp waveSide blockLoad windupHesitant。
// 例外（還原會違反文獻範圍或有來源的教學描述，逐條見 docs/experiments/motion-2b-report.md）：
// 舉球兩姿勢保留雙手靠攏、扣球收臂保留跨體；校準過的姿勢另依文獻（各行註解）。
//
// ★ 2B 文獻校準（docs/experiments/motion-d0-table.md 的列號）★ 數值由 D0 腳本量世界座標驗證。
const POSES = {
  // 低手（Ridgway & Hamilton 1987 HS 組）：起始肘角 159°（bump.start.elbow）、頭前傾 7°
  bumpReady: { rSh: [-0.95, 0.24], lSh: [-0.95, -0.24], rEl: -0.36, lEl: -0.36, spine: 0.5, neck: -0.55, crouch: 0.2, spineUp: 0.16, stagger: 0.25 },
  // 肩 x 含部分胸椎前後傾補償（spineUp 於鏡像修正後的 ec8efc7 才加上）：−1.16 使手臂世界方向與
  // 1fd5da6 意圖差 3.4°（≤5°），且仍滿足既有測試「觸球幀手臂已伸到墊球位 < −1.15」
  bumpHit: { rSh: [-1.39, 0.24], lSh: [-1.39, -0.24], rEl: 0, lEl: 0, spine: 0.55, neck: -0.3, crouch: 0.08, spineUp: -0.1, stagger: 0.25 },
  // 低手收勢隨揮（2B 新增）：觸球後平台往前上方送（上臂約水平）、軀幹維持前傾、抬頭目送球
  bumpFollow: { rSh: [-1.9, 0.22], lSh: [-1.9, -0.22], rEl: -0.12, lEl: -0.12, spine: 0.3, neck: -0.45, crouch: 0.03, spineUp: 0.05 },
  // 高手舉球（Lanzani 2026）：裝填肘屈約 100°（set.load.elflex）、出手肘屈約 40°（fast／seven 型）。
  // 肩 z 例外：保留雙手靠攏（教學描述「雙手相距幾公分、拇指食指成三角、在額頭上方」），
  // 照鏡像還原會讓雙腕分開 0.60 m
  setReach: { rSh: [-2.3, 0.3], lSh: [-2.3, -0.3], rEl: -1.75, lEl: -1.75, spine: -0.04, neck: -0.45, crouch: 0.06, spineUp: -0.18, wrist: -0.42 },
  setPush: { rSh: [-2.72, 0.26], lSh: [-2.72, -0.26], rEl: -0.7, lEl: -0.7, spine: 0, neck: -0.3, spineUp: 0.1, wrist: 0.4 },
  // 4.7 §P2 上升弓身：胸椎後仰（spineUp 負＝反弓）、骨盆先轉、非慣用手上舉指球。
  // 2B（Zahálka 2017）：最大後擺髖線 157°、肩線 105°（擊球側往後轉 23°／75°，髖肩分離 52°）
  spikeWind: {
    rSh: [-2.5, 0.38], lSh: [-1.9, -0.1], rEl: -1.9, lEl: -0.25, spine: -0.24, neck: -0.2,
    spineUp: -0.5, pelvisY: -0.4, chestY: -0.95, wrist: -0.5, airTuck: 1.3,
  },
  // §P3 鞭打中段：肩已解鎖、肘開始伸、腕仍後倒（三者不得同幀一起轉）。
  // 2B：轉體介於引臂與擊球之間（Zahálka 2017 肩線角由 105° 單調轉到擊球 137°）
  spikeUnlock: {
    rSh: [-2.75, 0.2], lSh: [-1.7, -0.16], rEl: -0.9, lEl: -0.3, spine: -0.05, neck: -0.12,
    spineUp: -0.1, pelvisY: -0.4, chestY: -0.72, wrist: -0.62, airTuck: 1.1,
  },
  // §P3 擊球：收腹前屈、轉體完成、**壓腕 snap**（wrist 由負轉正＝手掌蓋下去）。
  // 2B（Reeser 2010 斜線扣：肩外展 130、肘屈 34、水平內收 29；Zahálka 2017 擊球肩線 137／
  // 髖線 157）：擊球臂由「正上方伸直」改為「側上方、肘仍彎」，軀幹往非擊球側側傾（lean）
  // 保住擊球高度（腕高 2.08 m，修前 1.97 m）
  spikeHit: {
    rSh: [-2.55, -1.15], lSh: [-0.85, -0.2], rEl: -0.6, lEl: -0.4, spine: 0.18, neck: -0.9,
    spineUp: 0.26, pelvisY: -0.4, chestY: -0.55, lean: -0.4, wrist: 0.55, airTuck: 0.8,
  },
  // §P4 下降收臂：擊球臂沿對角跨體收回（rSh z 正＝往左髖方向），身體回中性。
  // 擊球臂 z 例外：保留跨體（教學描述 spiking arm coming down across your body）
  spikeFollow: {
    rSh: [-0.6, 0.34], lSh: [-0.45, -0.15], rEl: -0.5, lEl: -0.3, spine: 0.46, neck: 0.1,
    spineUp: 0.12, pelvisY: 0.06, wrist: 0.2, airTuck: 0.5,
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
  windup: { rSh: [-2.35, 0.35], lSh: [-2.0, -0.15], rEl: -1.8, lEl: -0.3, spine: -0.2, neck: -0.18 },
  // 4.7 §P0 助跑（Sawmah 07-28）：雙臂後擺蓄勢、軀幹前傾——**零跳躍**。
  // 原本助跑與起跳混在同一個 windup（自帶 jump 0.5m），提前觸發就等於提前浮空
  approachBack: { rSh: [0.75, 0.2], lSh: [0.75, -0.2], rEl: -0.45, lEl: -0.45, spine: 0.2, neck: -0.24, crouch: 0.06 },
  approachDrive: { rSh: [-0.5, 0.22], lSh: [-0.5, -0.22], rEl: -0.9, lEl: -0.9, spine: 0.26, neck: -0.26, crouch: 0.16 },
  // Phase 5 W1 §2-3 等待姿勢：一擊完成、攻擊手已轉身拉開到職責位（sim 走位負責），
  // 站定等二傳觸球——重心壓前腳（前傾一點）、視線盯二傳（neck 抬），雙臂放鬆不外張
  transitionWait: { rSh: [0.05, -0.05], lSh: [0.05, 0.05], rEl: -0.15, lEl: -0.15, spine: 0.14, neck: -0.2, crouch: 0.08 },
  land: { spine: 0.2, crouch: 0.26 },
  // 4.7 §P5 落地緩衝：觸地→吸收到最深→推起回中性。
  // 「落地瞬間回站姿」是工單點名的最廉價破綻
  landDeep: { rSh: [-0.35, 0.2], lSh: [-0.35, -0.2], rEl: -0.7, lEl: -0.7, spine: 0.34, neck: 0.05, crouch: 0.38 },
  landRise: { rSh: [-0.2, 0.14], lSh: [-0.2, -0.14], rEl: -0.45, lEl: -0.45, spine: 0.12, neck: -0.02, crouch: 0.08 },
  // 魚躍撲救（身體前傾由 matchView 的 root.rotation.x 主導＝接近水平飛撲）：這裡只管
  // 手臂大幅前伸夠球＋抬頭看球。diveReach＝撲出觸球（雙臂前伸平墊）、diveSprawl＝落地撐地
  diveReach: { rSh: [-1.78, 0.3], lSh: [-1.78, -0.3], rEl: 0, lEl: 0, spine: 0.1, neck: 0.42, crouch: 0.1 },
  diveSprawl: { rSh: [-1.35, 0.26], lSh: [-1.35, -0.26], rEl: -0.12, lEl: -0.12, spine: 0.22, neck: 0.26, crouch: 0.32 },
  // 爬起：雙手撐地（肘大彎）、身體半推起、收腿——恢復期的過渡，避免「垂直彈起」殭屍感
  divePush: { rSh: [-0.5, 0.34], lSh: [-0.5, -0.34], rEl: -0.98, lEl: -0.98, spine: 0.32, neck: 0.05, crouch: 0.55 },
  // 發球分式（07-24 Sawmah）：serveReady＝發球前雙手捧球預備（hold，銜接揮擊的連貫前段）；
  // 飄浮＝站立掌根短促推擊（floatWind 後拉小幅→floatPush 直臂前推、瞬間停腕無隨揮）
  serveReady: { rSh: [-1.15, 0.1], lSh: [-1.15, -0.1], rEl: -0.5, lEl: -0.5, spine: 0.12, neck: -0.1, crouch: 0.06 },
  // 肩 x 含胸椎後仰補償（spineUp −0.14 為 ec8efc7 後加，手臂世界方向維持 1fd5da6 意圖）
  floatWind: { rSh: [-2.21, 0.15], lSh: [-1.36, -0.15], rEl: -0.55, lEl: -0.25, spine: -0.08, neck: -0.15, spineUp: -0.14, wrist: -0.25 },
  // 2B（Reeser 2010 飄球：肩外展 133、肘屈 50、水平內收 30）：直臂正上推擊 → 側上方、肘彎
  floatPush: { rSh: [-2.65, -0.75], lSh: [-0.9, -0.15], rEl: -0.87, lEl: -0.3, spine: 0.12, neck: -0.1, spineUp: 0.06, wrist: 0 },
  // W7 A4③：體力喘氣 idle（死球間隙、跌破 50% 的場上球員取代待命姿勢）——
  // 撐膝彎腰：肩前傾下垂＋肘大彎（雙手扶膝）＋軀幹深前傾＋低頭喘氣
  gasp: { rSh: [-0.35, 0.12], lSh: [-0.35, -0.12], rEl: -0.7, lEl: -0.7, spine: 0.85, neck: 0.3, crouch: 0.32 },
  // N1（2026-07-30 疲勞可視化，重度檔 <25% 專用）：同款撐膝彎腰再加深——
  // 蹲更深、軀幹前傾更多、頭垂更低，與 gasp（<50%）拉出可讀的兩段落差
  gaspHeavy: {
    rSh: [-0.42, -0.14], lSh: [-0.42, 0.14], rEl: -0.85, lEl: -0.85,
    spine: 1.05, neck: 0.42, crouch: 0.42,
  },
  // W7 B4④：氣勢極端不利（−3）idle——垂肩低頭，手臂鬆垮下垂、無下蹲（走位回位、非喘氣）
  dejected: { rSh: [0.08, 0.04], lSh: [0.08, -0.04], rEl: -0.15, lEl: -0.15, spine: 0.32, neck: 0.32, crouch: 0.03 },
  // 4.5B §4：S diegetic——高 trust 隊友揮手喊球（右臂高舉左右擺；左臂自然）
  waveUp: { rSh: [-2.9, 0.35], lSh: [0, -0.06], rEl: -0.2, lEl: -0.1, spine: -0.05, neck: -0.2 },
  waveSide: { rSh: [-2.9, -0.3], lSh: [0, -0.06], rEl: -0.2, lEl: -0.1, spine: -0.05, neck: -0.2 },
  // 4.5B §4：L 暗號——攔網手偷瞄點頭確認（頸部小幅點放）
  nodNeutral: { neck: -0.12 },
  nodDown: { neck: 0.3 },
  // 4.5B §8 攔網重量感：起跳前的蹲載入（蹲→蹬→滯空→落地的第一拍）。
  // W2-6：對應底稿 §3C 揮臂式攔網的 LOAD 節點（雙臂下擺至腰際蓄力＋蹲）——FK 量測
  // （直接評估此姿勢、非經 blendKeys 淡入汙染）身高 1.75 時手腕落在 y=1.15m
  // （骨盆 y=0.91m 之上、肩 y=1.40m 之下）＝軀幹下半段＝腰際區間，不需要再調參數。
  // 肩 x 含胸椎前傾補償（spineUp 0.12 為 ec8efc7 後加，手臂世界方向維持 1fd5da6 意圖）
  blockLoad: { rSh: [-0.72, 0.15], lSh: [-0.72, -0.15], rEl: -0.9, lEl: -0.9, spine: 0.35, neck: -0.2, crouch: 0.3, spineUp: 0.12 },
  // 4.5B §8 助跑遲疑（低 trust 快攻的身體語言）：手臂只抬一半、低頭半拍
  windupHesitant: { rSh: [-1.55, 0.3], lSh: [-1.3, -0.12], rEl: -1.3, lEl: -0.4, spine: -0.06, neck: 0.12 },
  // 真實排球空中單手輕吊球（Airborne Single-Hand Tip / Roll Shot）：
  // 單臂高舉過網延伸、手腕指尖輕挑撥球、非慣用手自然下收平衡身形、上身微前傾非劇烈扣腹
  // 2B（使用者裁定 ②，Reeser 2010 roll shot：肩外展 122、肘屈 43、水平內收 43）：擊球臂
  // 由「正上方伸直」改為「側上方、肘彎約 43°」，軀幹往非擊球側側傾（lean −0.4）保住擊球
  // 高度（hold 腕高 1.98 m，修前 2.00 m）；tipReach 為往擊球位置的中途。非擊球臂與 z 以外
  // 欄位不動（本組姿勢 09-10 後加入，不在鏡像還原的 25 個之內）
  tipReach: { rSh: [-2.4, -0.5], lSh: [-0.6, 0.2], rEl: -0.4, lEl: -0.3, spine: 0.06, neck: -0.1, spineUp: 0.1, pelvisY: 0.04, lean: -0.2, wrist: -0.25, airTuck: 1.0 },
  tipHit: { rSh: [-2.05, -0.85], lSh: [-0.4, 0.15], rEl: -0.75, lEl: -0.2, spine: 0.16, neck: -0.05, spineUp: 0.15, pelvisY: 0.0, lean: -0.4, wrist: 0.35, airTuck: 0.8 },
  tipFollow: { rSh: [-1.2, 0.14], lSh: [-0.3, 0.1], rEl: -0.3, lEl: -0.15, spine: 0.26, neck: 0.05, spineUp: 0.08, wrist: 0.1 },
  // 魚躍方案 A「sprawl 貼地滑撲」（使用者裁定，docs/kickoffs/real-player-stage2-match.md
  // 修訂紀錄 DA1，取代 diveReach/diveSprawl/divePush 播放路徑；來源分支
  // feat/dive-proposals commit ecda0a5 的 diveStyles.js，數值逐字照搬）：
  // 弓箭步壓低（慣用側腳在前）→ 雙臂併攏平台斜下伸 → 前腳一推、後腿順勢往後甩直，
  // 胸腹貼地往前滑、平台貼地前伸 → 雙手撐地、雙膝收到髖下 → 站起。
  // rHipX/lHipX/rKneeX/lKneeX/rHipZ/lHipZ＝腿部偏移新欄位（見 blendKeys 的鏡像規則）：
  // 髖 x 負＝大腿前抬、膝 x 正＝小腿往後彎（屈膝）；髖 z＝外展（蛙腿式側收膝）
  diveA_step: {
    rSh: [-1.3, 0.3], lSh: [-1.3, -0.3], rEl: 0, lEl: 0, spine: 0.35, neck: -0.55, crouch: 0, spineUp: 0.05,
    rHipX: -0.95, lHipX: 0.1, rKneeX: 1.0, lKneeX: 0.25,
  },
  diveA_reach: {
    rSh: [-1.95, 0.3], lSh: [-1.95, -0.3], rEl: 0, lEl: 0, spine: 0.2, neck: -0.75, crouch: 0, spineUp: 0,
    rHipX: -1.3, lHipX: 0.2, rKneeX: 1.35, lKneeX: 0.35,
  },
  diveA_slide: {
    rSh: [-2.95, 0.16], lSh: [-2.95, -0.16], rEl: 0, lEl: 0, spine: -0.06, neck: -0.85, crouch: 0, spineUp: -0.12,
    rHipX: 0, lHipX: 0.08, rKneeX: 1.1, lKneeX: 0.35, rHipZ: -0.8,
  },
  diveA_push: {
    rSh: [-1.2, -0.1], lSh: [-1.2, 0.1], rEl: -0.35, lEl: -0.35, spine: 0.4, neck: -0.6, crouch: 0, spineUp: 0.1,
    rHipX: -1.45, lHipX: -1.45, rKneeX: 1.95, lKneeX: 1.95,
  },
  diveA_rise: {
    rSh: [-0.55, -0.18], lSh: [-0.55, 0.18], rEl: -0.5, lEl: -0.5, spine: 0.55, neck: -0.35, crouch: 0.3, spineUp: 0.1,
  },
};

// 動作序列（at: 0..1；jump=跳高 m；時長為既有實測調參值，勿隨意動）
// hit＝**擊球關鍵幀**在本序列的位置（0..1）。07-29 Sawmah 試玩回報「還沒碰到手就
// 接／舉起來了」的根因就在這裡：原本是 TOUCH 事件當下才 trigger，擊球幀要 0.2–0.3s
// 後才到＝球轉向的那一幀身體還停在預備姿勢。宣告 hit 之後：
//   ① matchLoop 用 hitLeadTicks() 提前觸發（讓擊球幀落在 sim 的觸球 tick 上）
//   ② 空中接續（windup→spike）的 carry 上限改吃 hit（見 trigger）
const SEQUENCES = {
  // 2B：觸球後補隨揮（平台往前上方送，Ridgway & Hamilton 1987 收勢上臂約 86°）——dur／hit 不動，
  // 只把原本 at=1 回 bumpReady 改成觸球→隨揮→撐住。sustain 0.2（2026-09-27 使用者裁定甲）：
  // 隨揮姿勢在 dur 末滿權重撐 0.2 s 再走 RELEASE 淡回待命——否則 bump 最後一幀權重只剩 0.083，
  // 隨揮根本看不到（D0 bump-end 幀）。可見尾段因此多 0.2 s，擊球時刻與提前量不變
  bump: { dur: 0.5, sustain: 0.2, jump: 0, land: false, hit: 0.45, keys: [{ at: 0, p: 'bumpReady' }, { at: 0.45, p: 'bumpHit' }, { at: 0.75, p: 'bumpFollow' }, { at: 1, p: 'bumpFollow' }] },
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
  // 段①：dur 只涵蓋「蹬伸離地→擺成引臂」這一拍；跳躍弧另由 airDur 宣告。
  // 播完自動接段②（chain，同 land→landSoft 的自動接續機制）。
  // ★ 2026-08-11 起跳滯空「看不到」修正 ★ 真人回報「跳太早卻拿到軟墊球，不知道為
  // 什麼」。玩家點攻擊區＝chooseAttack 當下起跳（matchControls.js:604 jumpAt=now），
  // 放開起跳後 JUMP_WINDOW_MS=900ms（同檔 :70）內沒等到球才降級成 receive
  // （:398-404，降級邏輯與 900 這個數值本身不動）——但畫面這裡原本 airDur=0.75s，
  // 比降級判定早 150ms 落地：玩家在 sim 真正判他「跳太早」之前，肉眼已經看完整套
  // 起跳→滯空→落地，落地後動作回待命，真正的降級判定與軟墊球回饋要再等 150ms 才
  // 出現——「起跳」與「拿到墊球」兩件事之間夾了一段站著不動的空白，因果斷線。
  // 修（純表現層，同 1c23497 手法：jump 峰高／段①節奏不動，只把獨立的滯空弧
  // airDur 對齊真相時鐘）＝0.75→0.9（＝JUMP_WINDOW_MS 900ms）：玩家肉眼看見自己
  // 滯空多久，落地那一刻正好卡在 sim 判定降級的同一時間點。
  windup: {
    dur: 0.1, jump: 0.5, airDur: 0.9, land: false, chain: 'spikeHold',
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
  // 真實排球空中單手吊球序列（Airborne Single-Hand Tip）：引臂偽裝 ➔ 單手高挑 ➔ 壓腕推球 ➔ 輕柔收臂
  tip: {
    dur: 0.42, jump: 0.55, airborne: true, land: true, hit: 0.38,
    keys: [
      { at: 0, p: 'spikeWind' },
      { at: 0.18, p: 'tipReach' },
      { at: 0.38, p: 'tipHit' },
      { at: 1, p: 'tipFollow' },
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
  // ★ 2026-08-10 攔網「畫面在蹲、sim 已結算」修正 ★ 真人回報攔網手「偶爾完全沒起跳」，
  // 量測（30 局 n=3296 次 sim 起跳）：動畫觸發對齊率 100%（沒有漏觸發），但**弧形對不上**
  // ——本序列原 dur 0.7s＝42 tick、弧頂 21 tick，而 sim 的滯空模型（player.js blockTopEdge）
  // 是 sin(π·airT/24)：24 tick 落地、弧頂 12。渲染弧比 sim 慢 1.75 倍，再加 blockLoad
  // 蹲姿佔掉開頭 13 tick（sim 零預備當場起跳）⇒ 結算那一刻動畫離地 p50 僅 0.119m、
  // 30% 樣本 <0.05m＝「看起來根本沒跳」。
  // 修＝**弧與姿勢都對齊 sim**：airDur 0.4s（＝AIR_TICKS 24 tick，弧頂 12＝同一個 sin，
  // read airT p50=7 → 0.79、commit p50=14 → 0.97，由同構保證、不靠常數湊——反事實臂
  // 實測過「只縮不對齊」會讓 commit 反而變差）；姿勢 dur 縮到 0.5、蹲（blockLoad）壓到
  // 前 10%（≈2.5 tick）與 sim 的零預備相稱。jump 高度與四關鍵幀語意（底稿 §80-89）不動。
  blockJump: { dur: 0.5, airDur: 0.4, jump: 0.34, land: true, keys: [{ at: 0, p: 'blockLoad' }, { at: 0.1, p: 'blockUp' }, { at: 0.35, p: 'blockPunch' }, { at: 1, p: 'blockUp' }] },
  // W2 補課④：graze（擦手）版——同一套蹲→蹬→滯空→落地節奏，中段換成較保守的
  // blockTouch（見 POSES 註解），讓玩家分得出「攔死」與「指尖擦到」兩種畫面。
  // 三態的第三態 clean 沒有觸球事件、本來就不觸發任何演出，維持不變
  blockJumpGraze: { dur: 0.5, airDur: 0.4, jump: 0.34, land: true, keys: [{ at: 0, p: 'blockLoad' }, { at: 0.1, p: 'blockUp' }, { at: 0.35, p: 'blockTouch' }, { at: 1, p: 'blockUp' }] },
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
  // 魚躍方案 A（DA1 併入，dur/jump/land 與 677516f 相同——只換 keys/poses，時序不變）：
  // 舊 keys（diveReach/diveSprawl/divePush，POSES 仍保留供 tools/motion-2b-e1-mirror.mjs
  // 的 E1 鏡像還原清單核對）不再被本序列播放
  dive: {
    dur: 0.72, jump: 0, land: false,
    keys: [{ at: 0, p: 'bumpReady' }, { at: 0.07, p: 'diveA_step' }, { at: 0.14, p: 'diveA_reach' }, { at: 0.32, p: 'diveA_slide' },
      { at: 0.5, p: 'diveA_slide' }, { at: 0.7, p: 'diveA_push' }, { at: 0.86, p: 'diveA_rise' }, { at: 1, p: 'bumpReady' }],
  },
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
  let lastJumpY = 0; // 上一幀的跳躍弧高度（唯讀窺視用，見 probe()）
  let phase = 0;
  const blended = {};
  // 慣性過渡（2B 自然度）：冷觸發（w0＝0）的新動作，由「上一幀實際輸出的全身關節角」平滑過渡
  // INERTIA_S 秒到新動作的結果，不再先掉回待命底層。舊版從持球觸發跳發時腕單幀位移 0.65 m、
  // 助跑接起跳 0.48 m（自然度探針 M6）
  const INERTIA_S = 0.08;
  const FADE_AXES = ['x', 'y', 'z'];
  let fadeFrom = null;
  let fadeT = 0;
  let lastOut = null;
  function snapshot() {
    const o = {};
    // 只過渡上半身：腿角由 squatAngle／groundKnee 依當幀骨盆下降量求解，內插會讓鞋子沉進地板
    for (const [n, jt] of Object.entries(j)) {
      if (jt?.rotation && !/Hip$|Knee$|Foot$/.test(n)) o[n] = [jt.rotation.x, jt.rotation.y, jt.rotation.z];
    }
    return o;
  }
  // 腿部分支切換過渡（2B 自然度）：助跑步相分支 ↔ 一般跑動分支切換時，腿角由切換前一幀
  // 緩入到新分支（LEG_SWITCH_S 秒）；否則切換那一幀膝角單幀跳 24°、腳尖插地
  const LEG_SW_KEYS = ['rHx', 'lHx', 'rHz', 'lHz', 'rK', 'lK'];
  const legSw = { rHx: 0, lHx: 0, rHz: 0, lHz: 0, rK: 0, lK: 0 };
  const legSwPrev = {};
  let legFrom = null;
  let legT = 0;
  let lastStep = false;
  // Phase 5 W1 §1b：慣用手只影響助跑步序方向（見檔頭 STEP_ORDER_*）；
  // 未帶 handed 欄位（例如舊測試手造的 rig）視同右手，外觀零改變
  const handed = rig.handed === 'l' ? 'l' : 'r';
  // 髖的歐拉順序 YXZ：先屈（x）再做反向扭轉（y，見 update 的髖反扭）＝屈曲平面維持在角色前向。
  // 骨盆不轉時 y＝0，與預設 XYZ 完全相同
  for (const n of ['rHip', 'lHip']) if (j[n]?.rotation) j[n].rotation.order = 'YXZ';
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
  // ★ 2B 自然度（使用者 E7 判定「看起來不自然」後的改善）★
  // 舊版＝相鄰兩關鍵影格**線性**內插：每到一個影格角速度瞬間換檔（自然度探針 M1），而且全身
  // 各關節同一幀起動、同一幀到位（M2：起動幀差 0）。改成：
  //  ① 通過關鍵影格的 C1 連續曲線（Catmull-Rom／Hermite，切線取前後影格）：影格上的值**完全不變**
  //    （D0 在影格時刻量的角度不受影響），影格之間速度連續、有緩入緩出
  //  ② 近端領先、遠端跟隨（重疊動作）：每段的進度 f 依關節做一個「兩端固定」的時間彎曲——
  //    骨盆 f^0.7 先轉、胸椎與肩 f^0.9、肘 f^1.15、腕與頭 f^1.35 最後到；f=0、f=1 時所有關節仍在
  //    影格值上，所以擊球幀等所有關鍵時刻的姿勢不變
  function blendKeys(seq, t, out, handed = 'r') {
    const keys = seq.keys;
    let i = 0;
    while (i < keys.length - 1 && t > keys[i + 1].at) i += 1;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    const k0 = keys[Math.max(i - 1, 0)];
    const k3 = keys[Math.min(i + 2, keys.length - 1)];
    const span = Math.max(b.at - a.at, 1e-4);
    const f = Math.min(Math.max((t - a.at) / span, 0), 1);
    const P = [POSES[k0.p], POSES[a.p], POSES[b.p], POSES[k3.p]];
    const T = [k0.at, a.at, b.at, k3.at];
    const hitAt = seq.hit ?? null;
    // 取第 idx 個影格的某個值（get 回傳數值）；曲線＝Hermite，端點切線依非等距影格縮放
    const curve = (get, warp) => {
      const v0 = get(P[0]); const v1 = get(P[1]); const v2 = get(P[2]); const v3 = get(P[3]);
      const u = warp === 1 ? f : f ** warp;
      const d12 = Math.max(T[2] - T[1], 1e-4);
      let m1 = T[2] - T[0] > 1e-4 ? ((v2 - v0) * d12) / (T[2] - T[0]) : 0;
      let m2 = T[3] - T[1] > 1e-4 ? ((v3 - v1) * d12) / (T[3] - T[1]) : 0;
      // 擊球影格的切線只看「來向」（單側差分）：觸球瞬間延續揮臂的速度，不預支收臂的方向
      // （否則擊球後第一幀肩就高速轉向收臂，蓋過解鎖段——鞭打順序測試守的正是這個）
      if (hitAt != null && Math.abs(b.at - hitAt) < 1e-6) m2 = v2 - v1;
      if (hitAt != null && Math.abs(a.at - hitAt) < 1e-6) m1 = T[1] - T[0] > 1e-4 ? ((v1 - v0) * d12) / (T[1] - T[0]) : 0;
      const u2 = u * u; const u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * v1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * v2 + (u3 - u2) * m2;
    };
    for (const outSide of ['rSh', 'lSh']) {
      const srcKey = armKeyFor(outSide === 'rSh' ? 'r' : 'l', handed);
      // 鏡像＝對調左右來源＋反轉 z（見檔頭證明：對稱姿勢兩側 z 互為相反數，
      // swap 後再反號＝原值不變；只有非對稱姿勢會真的變）
      const zs = handed === 'l' ? -1 : 1;
      out[outSide] = [
        curve((p) => poseArm(p, srcKey)[0], 0.9),
        curve((p) => zs * poseArm(p, srcKey)[1], 0.9),
      ];
    }
    for (const outKey of ['rEl', 'lEl']) {
      const srcKey = elKeyFor(outKey === 'rEl' ? 'r' : 'l', handed);
      // 肘不能過伸（x 正＝往後折）：曲線在「彎→直」影格附近的過衝夾在 0（解剖上限）
      out[outKey] = Math.min(curve((p) => poseVal(p, srcKey), 1.15), 0);
    }
    // 4.7 動作重製新增欄位：spineUp＝胸椎（弓身/收腹）、wrist＝壓腕（側別由呼叫端
    // 決定，見 update() 的壓腕路由）。pelvisY/chestY 只有攻擊姿勢在用、鏡像時反號
    // airTuck（2B 石川差距 a）＝滯空屈膝收腿的膝彎弧度；stagger（f）＝前後腳：後腳髖後擺的弧度
    const WARP = { spine: 0.8, neck: 1.35, crouch: 1, spineUp: 0.9, wrist: 1.35, airTuck: 1, stagger: 0.8 };
    for (const k of ['spine', 'neck', 'crouch', 'spineUp', 'wrist', 'airTuck', 'stagger']) {
      // crouch 維持線性：它直接決定 root 高度，曲線的切線會讓落地緩衝的單幀下沉超過寫實人 A12 的 0.05 m
      const val = k === 'crouch' ? lerp(poseVal(P[1], k), poseVal(P[2], k), f) : curve((p) => poseVal(p, k), WARP[k]);
      // 曲線可能在影格之間微幅過衝：只能為正的量（下蹲、收腿、後擺）夾在 0 以上
      out[k] = (k === 'crouch' || k === 'airTuck' || k === 'stagger') ? Math.max(val, 0) : val;
    }
    // lean（2B）＝胸椎側傾 spineUpper.z：負＝上身往非擊球側（右手選手的左側 +X）倒
    const WARP_Y = { pelvisY: 0.7, chestY: 0.9, lean: 0.9 };
    for (const k of ['pelvisY', 'chestY', 'lean']) {
      const v = curve((p) => poseVal(p, k), WARP_Y[k]);
      out[k] = handed === 'l' ? -v : v;
    }
    // 魚躍方案 A（DA1）新增：左右腿髖／膝 x 偏移＋髖 z 外展。只有 diveA_* 姿勢宣告這些
    // 欄位，其餘姿勢缺欄位＝0（curve 對全零控制點恆回 0）——既有動作逐幀值不變。
    // 鏡像：HipX/KneeX 對調左右來源、不反號（屈曲量不分邊）；HipZ 對調來源後另外反號
    // （外展方向相反），與 rSh/lSh 的鏡像規則同一套（見上方 armKeyFor 用法）
    const WARP_LEG = { HipX: 1.3, KneeX: 1.3, HipZ: 1.1 };
    for (const side of ['r', 'l']) {
      const src = handed === 'l' ? (side === 'r' ? 'l' : 'r') : side;
      out[`${side}HipX`] = curve((p) => poseVal(p, `${src}HipX`), WARP_LEG.HipX);
      out[`${side}KneeX`] = curve((p) => poseVal(p, `${src}KneeX`), WARP_LEG.KneeX);
      const zs = handed === 'l' ? -1 : 1;
      out[`${side}HipZ`] = zs * curve((p) => poseVal(p, `${src}HipZ`), WARP_LEG.HipZ);
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
      // windup 例外：時長 0.1 s 被 E3 鎖住，雙臂得從助跑後擺甩到頭上；從上一幀輸出過渡反而更遠
      // （腕單幀 0.73 m，從待命底層漸入 0.46 m），維持舊路徑
      if (w0 === 0 && lastOut && type !== 'windup') { fadeFrom = lastOut; fadeT = 0; }
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
    // hold 切換（例：攔網牆姿隨 blockDuty 開關、持球預備）也走慣性過渡，不瞬間套滿權重
    setHold(type) {
      if (type !== hold && current === null && lastOut) { fadeFrom = lastOut; fadeT = 0; }
      hold = type;
    },
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

    // 唯讀窺視（2B 驗收治具 tools/motion-2b-check.mjs 用）：上一幀的動作層權重 w 與
    // 跳躍弧高度（0＝非滯空幀）。只回數字，不影響任何行為
    probe() {
      return { w: lastW, jumpY: lastJumpY };
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
        if (current.t >= seq.dur + current.sustain) {
          // §P5：跳躍類動作落地後自動接緩衝（不得瞬間回站姿）
          // chain＝三段式的段落自動接續（段①→段②）：滿權重交棒、不重跑漸入
          if (seq.land) { air = null; startSeq(SEQUENCES.landSoft, 'landSoft', {}); }
          else if (seq.chain) startSeq(SEQUENCES[seq.chain], seq.chain, { w0: lastW });
          else current = null;
        }
        // 2B E6：接續那一幀**當場**由新段落產生姿勢（原本這一幀 w=0、pose=null，windup→
        // spikeHold 每次起跳都有一幀手臂掉回待命：腕高 1.93→1.09→1.98 m）。新段落 t=0 的
        // 權重＝w0（chain 交棒＝上一幀的滿權重；landSoft w0=0＝與修前同為 0，外觀不變）
        if (current) {
          const { seq } = current;
          const total = seq.dur + current.sustain;
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
          if (seq.steps === 4) stepInfo = stepPhase(t, order4, STEP_AMP_4, CROUCH_ENV_4);
          else if (seq.steps === 3) stepInfo = stepPhase(t, order3, STEP_AMP_3, CROUCH_ENV_3);
        }
      }
      if (!pose && hold && SEQUENCES[hold]) {
        blendKeys(SEQUENCES[hold], 0, blended, handed);
        pose = blended;
        w = 1;
      }
      lastW = w;
      lastJumpY = jumpY;

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
      // 下沉包絡的權重另外吃「有在位移」：runW 在 2.55 m/s 只有 0.57，直接乘會讓制動步
      // 的深度隨速度打折；×2 封頂 1＝一般助跑速度就是全深，站定時（runW→0）照樣歸零
      const crouchW = stepInfo ? Math.min(runW * 2, 1) : 0;
      const poseCrouch = (pose ? blended.crouch * w : 0);
      const crouch = stepInfo
        ? lerp(poseCrouch, stepInfo.crouch, crouchW) + 0.02 * idleW
        : poseCrouch + 0.02 * idleW;
      const bob = -0.03 * runW * (0.5 + 0.5 * Math.cos(phase * 2));
      // 腿吸收的骨盆下降量＝本幀 root 的非跳躍下降（下蹲＋跑動起伏），見 squatAngle
      const sinkY = crouch * 0.55 - bob;
      const squat = squatAngle(sinkY);

      if (stepInfo) {
        // Phase 5 W1 §2-2：助跑三/四步節奏——踩前腳當幀擺幅最大，另一腳小幅拖後；
        // 不疊加連續跑步相位（stepPhase 的半波本身就是離散的三/四段步相）。
        // N1：staminaMul 縮小步幅＝「助跑演出變短」——只改物理跨距不改時長，
        // 不動 matchLoop 依 seqDurTicks 算好的起跳提前量對齊
        const sw = stepInfo.swing * stepW * staminaMul;
        const forward = -sw;
        const trail = sw * 0.3;
        // 2B：左腿原本寫成 `lead==='l' ? -forward : -trail`——兩髖關節同向建立（不鏡像），
        // 那等於左腳領跨時往**後**擺、拖曳時往前擺（舊版只比 |角度| 所以沒被抓到）。改成兩腿同一規則
        legSw.rHx = stepInfo.lead === 'r' ? forward : trail;
        legSw.lHx = stepInfo.lead === 'l' ? forward : trail;
        legSw.rHz = 0;
        legSw.lHz = 0;
        // 下蹲屈膝＝squat（小腿鉛直）；踩前腳另加抬膝；後擺腿入地時加膝彎抬腳
        legSw.rK = stepInfo.lead === 'r' ? sw * 0.5 : 0;
        legSw.lK = stepInfo.lead === 'l' ? sw * 0.5 : 0;
      } else {
        // 腿：跑動擺動＋下蹲屈膝（動作層的 crouch 轉成膝/髖角度——蹲得像蹲不像沉地）
        legSw.rHx = -legSwing * s;
        legSw.lHx = legSwing * s;
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
        legSw.lHz = spread * f + trail * (1 - f);
        legSw.rHz = -(spread * (1 - f) + trail * f);
        // 橫移時膝蓋不該再跑前進步態的交替抬腿（髖在併步、膝在走路＝兩套動作疊著）：
        // 交替量隨 sideW 收掉，改成併步該有的低姿屈膝
        const walkKnee = 1 - sideW * 0.85;
        const shuffleCrouch = sideW * runW * 0.28;
        legSw.rK = (0.12 + Math.max(0, -s) * 0.95 * walkKnee) * runW + shuffleCrouch;
        legSw.lK = (0.12 + Math.max(0, s) * 0.95 * walkKnee) * runW + shuffleCrouch;
      }

      // 腿部分支切換過渡：只內插「擺腿量」（legSw），下蹲量每幀用當下值——內插整個腿角會打破
      // 「大腿角 ↔ 骨盆下降量」的對應，切換後幾幀鞋子沉進地板
      const isStep = stepInfo != null;
      if (isStep !== lastStep) {
        legFrom = LEG_SW_KEYS.map((k) => legSwPrev[k] ?? legSw[k]);
        legT = 0;
        lastStep = isStep;
      }
      if (legFrom) {
        legT += dt;
        const k = Math.min(legT / LEG_SWITCH_S, 1);
        const e = k * k * (3 - 2 * k);
        LEG_SW_KEYS.forEach((key, i) => { legSw[key] = lerp(legFrom[i], legSw[key], e); });
        if (k >= 1) legFrom = null;
      }
      for (const key of LEG_SW_KEYS) legSwPrev[key] = legSw[key];
      j.rHip.rotation.x = legSw.rHx - squat;
      j.lHip.rotation.x = legSw.lHx - squat;
      j.rHip.rotation.z = legSw.rHz;
      j.lHip.rotation.z = legSw.lHz;
      // 後擺腿（大腿在下蹲基準之後）連續加膝彎 BACK_KNEE×後擺量：沒有踝關節，後擺時鞋尖入地；
      // 與（過渡後的）後擺量成正比＝連續，不用「找可行解」那種會單幀跳的做法
      j.rKnee.rotation.x = legSw.rK + squat + BACK_KNEE * Math.max(0, legSw.rHx);
      j.lKnee.rotation.x = legSw.lK + squat + BACK_KNEE * Math.max(0, legSw.lHx);
      // 前後腳站位（2B 石川差距 f，接發）：後腳＝非慣用側（右手選手的左腳）髖往後擺；
      // 膝彎由下面的 groundKnee 連續補到踝不入地、腳關節把鞋底放平
      const stagger = pose ? blended.stagger * w : 0;
      if (stagger) j[handed === 'l' ? 'rHip' : 'lHip'].rotation.x += stagger;
      // 魚躍方案 A（DA1）：疊加提案腿部偏移（既有姿勢缺欄位＝0，見 blendKeys）——
      // 加在 groundKnee／footAngle 之前，讓腳底保護與放平鞋底照舊套用這組偏移後的角度
      if (pose) {
        j.rHip.rotation.x += blended.rHipX * w;
        j.lHip.rotation.x += blended.lHipX * w;
        j.rHip.rotation.z += blended.rHipZ * w;
        j.lHip.rotation.z += blended.lHipZ * w;
        j.rKnee.rotation.x += blended.rKneeX * w;
        j.lKnee.rotation.x += blended.lKneeX * w;
      }
      // 腳底保護（連續，見 groundKnee）＋著地鞋底放平（footAngle）。兩個分支都套
      for (const side of ['r', 'l']) {
        const hx = j[`${side}Hip`].rotation.x;
        j[`${side}Knee`].rotation.x = groundKnee(hx, j[`${side}Knee`].rotation.x, sinkY);
      }

      // 滯空屈膝收腿（2B 石川差距 a）：只作用在跳躍弧 > 0 的幀，隨離地高度在 12 cm 內漸入，
      // 接地幀（E4 量鞋底的幀）完全不受影響。大腿微前擺、小腿往後收
      if (pose && blended.airTuck && jumpY > 0) {
        const tuck = blended.airTuck * w * Math.min(jumpY / 0.12, 1);
        for (const side of ['r', 'l']) {
          j[`${side}Hip`].rotation.x -= tuck * 0.35;
          j[`${side}Knee`].rotation.x += tuck;
        }
      }

      if (j.rFoot && j.lFoot) {
        for (const side of ['r', 'l']) {
          j[`${side}Foot`].rotation.x = footAngle(j[`${side}Hip`].rotation.x, j[`${side}Knee`].rotation.x, sinkY - jumpY);
        }
      }

      // 軀幹/頭（4.7：脊椎兩節＋骨盆獨立轉——髖肩分離與弓身的來源）
      j.spine.rotation.x = pose ? lerp(baseSpine, blended.spine, w) : baseSpine;
      j.spine.rotation.y = 0;
      j.spineUpper.rotation.x = pose ? blended.spineUp * w : 0;
      j.spineUpper.rotation.y = pose ? blended.chestY * w : 0;
      j.spineUpper.rotation.z = pose ? blended.lean * w : 0;
      // 2B 自然度：動作層滿權重撐住（預備、持球、滯空 hold）時仍有呼吸——舊版底層的呼吸只在
      // 沒有動作時才有，撐住的那幾百毫秒全身完全靜止（自然度探針 M3）。幅度 ±1.4° 胸椎、±1.1° 肩
      const holdBreath = pose ? Math.sin(phase * 0.9) * 0.025 * w : 0;
      j.spineUpper.rotation.x += holdBreath;
      j.pelvis.rotation.y = pose ? blended.pelvisY * w : 0;
      // 髖反向扭轉（髖內外旋）：骨盆轉體時腿與膝仍朝角色前方——滯空屈膝收腿後，膝蓋若跟著骨盆
      // 轉出前向平面，寫實人 A2(d)「膝不內外翻」會超標（幾何人量得 0.12 m）
      j.rHip.rotation.y = -j.pelvis.rotation.y;
      j.lHip.rotation.y = -j.pelvis.rotation.y;
      j.neck.rotation.x = pose ? lerp(-0.04, blended.neck, w) : -0.04;

      // 手臂：跑動反向擺（無動作時）→ 動作姿勢（有動作時）
      const restElbow = -0.35 * idleW - 0.6 * runW;
      const armX = { r: armSwing * s - 0.12 * idleW, l: -armSwing * s - 0.12 * idleW };
      for (const side of ['r', 'l']) {
        const sh = j[`${side}Shoulder`];
        const el = j[`${side}Elbow`];
        const arm = pose ? blended[`${side}Sh`] : null;
        sh.rotation.x = (pose ? lerp(armX[side], arm[0], w) : armX[side]) - holdBreath * 0.8;
        sh.rotation.z = pose ? lerp(0, arm[1], w) : 0;
        el.rotation.x = pose ? lerp(restElbow, blended[`${side}El`], w) : restElbow;
        // 壓腕只給慣用手：右手選手＝r、左手選手鏡像＝l（W2 補課⑤）——非慣用手恆中性，
        // 雙手一起壓看起來像機器人
        j[`${side}Wrist`].rotation.x = pose && side === handed ? blended.wrist * w : 0;
      }

      if (fadeFrom) {
        fadeT += dt;
        const k = Math.min(fadeT / INERTIA_S, 1);
        const e = k * k * (3 - 2 * k);
        for (const [n, v] of Object.entries(fadeFrom)) {
          const jt = j[n];
          if (!jt?.rotation) continue;
          FADE_AXES.forEach((ax, i) => { jt.rotation[ax] = lerp(v[i], jt.rotation[ax], e); });
        }
        if (k >= 1) fadeFrom = null;
      }
      lastOut = snapshot();

      // 垂直位移：跳躍弧－下蹲；跑動小起伏（bob 已在上方算好，腿同步吸收）
      return jumpY - crouch * 0.55 + bob;
    },
  };
}
