// Phase 5 W1 §7 C2 — 攔網站位讀取（純函式、決定論；sim 核心，零 three/DOM）
//
// 07-28 Sawmah 拍板（A 案）：玩家在 OH／MB／OPP 前排攔網時是用**身體站位**在封線，
// 後排隊友沒有面板可看——真實排球裡隊友是「看你站哪」，不是「看你按了什麼」。
// 因此本檔把受控玩家的實際 x 座標翻譯成「他在封直線還是封斜線」，
// 由 ai.js 的後排 dig 分支消費（封直線→後排收斜線，語意沿用 liberoRead 的既有配對）。
//
// 零新面板（§10 明定球內不得新增決策面板）；零 rng。
//
// 07-29 追記：本檔同時是 §6 B1「攔網 read／commit 人格」＋ B2「close 時間預算」
// 的純函式家（見檔案下半的 B1／B2 段）——同屬「攔網手在讀什麼」，不另開新檔。
import { TEAM_SIDE } from './rotation.js';
// 攔網時序卷 段 3：偵測深度的界線要對得上**助跑起點的單一真相**（APPROACH 表），
// 不再自己寫一個數字（本專案累犯型錯誤：拿看起來合理的數字去卡沒量過的量）
import { APPROACH } from './approach.js';

// 攻擊瞄準點幾何。原本只存在於 input/attackZones.js，C2 之後 sim 也要讀同一份
// （sim 不得 import input）——故上移到此當單一真相，input 端改為 import。
// **數值一格未動**（line/cross/middle/tip 與遷移前逐字相同）。
// 同一份幾何，改吃**位置**而不是人（攔網時序卷段 3：commit 要對「他賭的那個人會在哪裡
// 擊球」算過網點，那個位置是名目擊球點、不是那個人此刻站哪）。數值一格未動。
export function spikeAimsAt(from, team) {
  const side = TEAM_SIDE[team];        // 對方場在 z 為 -side 方向
  const sign = from.x >= 0 ? 1 : -1;   // 攻擊手所在半邊
  return {
    line: { x: sign * 4.15, z: -side * 5.2 },   // 直線（seamZ＝前後排之間的縫）
    cross: { x: -sign * 3.9, z: -side * 6.3 },  // 斜線
    middle: { x: 0, z: -side * 5.0 },           // 中路
    tip: { x: -sign * 1.2, z: -side * 1.9 },    // 吊球短區
  };
}

export function spikeAimsFor(game, attackerId) {
  return spikeAimsAt(game.actors[attackerId], game.players[attackerId].teamId);
}

// 攻擊路線在網面（z=0）通過的 x（攻守兩端共用：讀攔網、攔網站位計算、C2 讀站位）
export function netCrossingX(from, aim) {
  const t = from.z / (from.z - aim.z);
  return from.x + (aim.x - from.x) * t;
}

// 遲滯門檻（無因次；1.0＝正好站在某條過網線的過網點上）。
// 為什麼取無因次：兩條過網線的間距會隨攻擊手位置變（前排兩翼半距約 0.70m、
// 後排 pipe 約 0.77m～1.5m）——用比例表達，「站得多堅決」的語意才在各種攻擊點一致。
// ENTER 0.45 / EXIT 0.20 ＝ 前排時約 0.32m 才算「明確封某條線」、
// 要掉回 0.14m 內才回中性；line↔cross 直接互翻需走 0.63m。
// 選這組數字的理由：AI 自己的封線偏移 BLOCK_SCHEME_SHIFT ＝ 0.9m，取其半略少作
// 「玩家有意識地站過去」的判準；網前 ±0.3m 的碎步微調落在死區內＝後排陣型不抖。
// MIN_M＝絕對地板（幾何退化、兩條線幾乎重疊時不讓比例放大雜訊）。
export const BLOCK_READ = { ENTER: 0.45, EXIT: 0.20, MIN_M: 0.15 };

// 從防守者的實際站位推論他在封哪條線：'line' | 'cross' | null（模稜兩可＝中性）。
// prev＝上一次的判定（遲滯用）；純函式，不寫回任何狀態。
export function blockLaneRead(game, defenderId, attackerId, prev = null, k = BLOCK_READ) {
  const atk = game.actors[attackerId];
  const def = game.actors[defenderId];
  if (!atk || !def) return null;
  const aims = spikeAimsFor(game, attackerId);
  const lineX = netCrossingX(atk, aims.line);
  const crossX = netCrossingX(atk, aims.cross);
  const half = (lineX - crossX) / 2;
  if (!Number.isFinite(half) || Math.abs(half) < 1e-6) return null;
  const mid = (lineX + crossX) / 2;
  // 正＝往「直線過網點」那側靠（封直線）；負＝往斜線過網點那側靠（封斜線）
  const lean = (def.x - mid) / half;
  const enter = Math.max(k.ENTER, k.MIN_M / Math.abs(half));
  const exit = Math.max(k.EXIT, (k.MIN_M * 0.5) / Math.abs(half));
  if (prev === 'line') {
    if (lean > exit) return 'line';
    return lean < -enter ? 'cross' : null;
  }
  if (prev === 'cross') {
    if (lean < -exit) return 'cross';
    return lean > enter ? 'line' : null;
  }
  if (lean > enter) return 'line';
  if (lean < -enter) return 'cross';
  return null;
}

// 封線 → 後排收縮方向。**唯一真相＝liberoRead 的 DIG_SCHEMES 配對**
// （封直線・收斜線／封斜線・收直線），此處只是 sim 側的同一張表（sim 不得 import input）
export function digForBlock(block) {
  if (block === 'line') return 'cross';
  if (block === 'cross') return 'line';
  return null;
}

// ==================== §6 B1 攔網人格 ／ B2 close 時間預算 ====================
// ==== B1-SCAN-BEGIN（工單 §6 反作弊掃描區：本區內不得出現 attackerId）====
//
// 玩家版的 read／commit 早就存在——`src/input/matchControls.js:578-584` 的 MB 面板
// 就是一場**時機賭局**：early＝搶快攻＝立即起跳；不按＝等高球＝就位後自動跳攔，
// 賭錯高球＝48-tick 攔網窗過期、落地球才來。B1 就是把**同一個賭局**鏡像給 AI
// 當隊伍人格，語意一格不改、不發明第二套定義：
//
//   read   ＝「不按」：守住既有的追球軸、等球離手才反應。
//            ——這正是本檔改動前 ai.js 攔網分支的行為（逐 tick 追 game.ball.x），
//              所以 read 人格在 sim 裡**一行程式碼都沒動**。代價：追不到邊線。
//   commit ＝「按」：不等二傳出手就跟死快攻（見 blockCommitRead）。
//            代價＝球離手後還要等自己的反應時間才解鎖，判錯就是真的來不及。
//
// ★★★ 反作弊保證（工單 §6 硬性要求：攔網 AI 不得直接讀取 attackerId）★★★
//   保證的那一行＝下方 `export function blockCommitRead(game, atkTeam, opts = {})`
//   ——參數只有 game、攻方**隊伍代號**與可觀察線索，**沒有任何管道拿到
//   「二傳最後選了誰」**。本檔全檔零 `attackerId` 字樣，ai.js 的判讀路徑也以
//   `B1-SCAN-BEGIN/END` 圍起來，由 tests/block-persona.test.mjs 靜態掃描把關
//   （有人偷讀就轉紅）。
//
// 三組線索與玩家面板（src/input/blockRead.js `mbReadFor`）讀的是**同一組**：
//   ① 一傳品質 passTier —— 決定快攻在不在池裡（attackPointsOf 的同一條分支）。
//      ★誠實記錄：實測目前恆為 'perfect'（101 次進攻組織／8 seeds，見
//        docs/kickoffs/phase5-w2-discussion-brief.md D-3）＝這條線索**目前無變化**。
//        照接不照改——一傳品質是平衡命脈，工單 §11 禁動。
//   ② 二傳朝向 —— sim 沒有身體朝向這個量、跳舉是 §5 A3 本輪未做，
//      能拿到的只有二傳的**實際站位**，故以「相對名目舉球點的橫向偏移」為代理。
//      ★誠實記錄：二傳絕大多數時候就站在名目點上＝這條線索的變異量也極小。
//   ③ 各攻擊手的起步時機與路線 —— 只看 actor 這一 tick 的**實際位移**
//      （與 mbReadFor 的 APPROACH_EPS 同一把尺）。
//      **刻意不讀 §4 的 route 表**：route 帶著 startTick／takeoffTick／setTick 等
//      未來值，玩家在面板上看不到；AI 讀了就是資訊不對等——「AI 與玩家必須讀同一組」
//      的要求比「不讀 attackerId」更嚴，本檔取嚴的那一邊。

export const BLOCK_PERSONA = { READ: 'read', COMMIT: 'commit' };

// ---- 攔網人格的玩家語彙（2026-08-07 情報層）----
//
// ★ 放在人格常數**正旁邊**＝標籤不可能與定義漂開 ★（KIND_LABELS 的同一個範式；
//   本專案已經為「同一件事兩個地方各寫一份」踩過坑。）
// 純字串資料，零 DOM／零 rng ⇒ 不違反 `src/sim` 的架構鐵律。
//
// ★ 為什麼要有這張表 ★ `blockPersona` 從上線到 2026-08-07 為止**畫面上零顯示**
//   （`src/ui/`、`src/app/` 全域零命中）。唯一的線索是敵情文案那句「中路是他們的
//   天下」——那是設計端自己記的 commit 暗號，從沒告訴過玩家怎麼讀。
//   ⇒ 玩家在「要不要內切」這個決定上只能亂按，而實測它**不是白給的強化**
//   （`tools/inside-cut-probe.mjs`，150 局 ×2 種對手）：
//     內切對 read 隊淨得分 −8.3pp、對 commit 隊 +10.8pp。讀對才賺、亂切會虧。
//   一個「必須讀對手才會賺」的決定，卻不給讀的管道＝那個決定不成立。
//
// ⚠ 不得直接印英文 read／commit ⚠ 用中文排球語彙，而且**要把「該不該內切」講出來**
//   ——只標人格而不連到決定，等於換一個玩家看不懂的代號。
export const BLOCK_PERSONA_INTEL = {
  [BLOCK_PERSONA.COMMIT]: {
    label: '賭攔型',
    tag: '中間死跟快攻',
    hint: '他一跳就回不來——內切從他讓出來的縫穿進去',
  },
  [BLOCK_PERSONA.READ]: {
    label: '跟球型',
    tag: '看球出手才動',
    hint: '他等你出手才補位——內切等於往他手上送，這種牆走直線比較賺',
  },
};

export const BLOCK_COMMIT = {
  // 朝網位移門檻（m／tick）：與 src/input/blockRead.js 的 APPROACH_EPS 同值同語意
  //（玩家面板判「這個人正在助跑」用的就是這把尺）
  APPROACH_EPS: 0.005,
  // 助跑判定深度（隊伍視角 lz）。
  //
  // ★ 攔網時序卷 段 3（Sawmah 2026-08-01 裁定 4：甲）★ 2.9 → 兩翼助跑起點再出去一點點。
  // 舊值 2.9 的語意是「前排職責線（3.0）再進去一點點」——站著微抖的人跨不過、
  // 快攻手起步後 1-2 tick 就跨過。問題是**只有快攻手跨得過**：
  //   APPROACH 助跑起點 lz ＝ 快攻 3.0／兩翼 3.6／夾塞 4.2／後排 5.6
  // ⇒ 兩翼從頭到尾在偵測範圍外，commit 看得到的人恆是中路誘餌，
  //   牆首手 x 的 p50 恆為 0.000、右翼被攔死率 0.00%（n=3362）。
  //
  // 新值＝**兩翼助跑起點 + 0.1**（沿用舊值對職責線的同一個 0.1 餘裕，零手挑數字）。
  // 刻意仍把夾塞 4.2 與後排 5.6 擋在外面：本段只授權「讓兩翼進候選池」。
  DEPTH_LZ: APPROACH.left.lz + 0.1,
  // 「外圍候選」的界線＝**快攻助跑起點再出去一點點**（APPROACH.quick.lz 3.0 ＋ 0.1）。
  // 語意＝「這麼深的地方還在往網跑的人，跑的不是快攻那條線」。
  // ⚠ 這條**不能設在快攻起點以內**（試過 2.9）：快攻手起步那一刻 lz 就是 3.0，
  //   會連他一起降級 ⇒ commit 對快攻的早跳被砍掉，款 3 離地率 gap 實測翻成 −7.3pp。
  //
  // commit 對外圍候選**看得見位置、讀不穿時序**（裁定 4 原文）：
  //   位置＝段 2 的 blockSetterTendency 直接給（零延遲）；
  //   時序＝這個人要多花 OUTER_LAG_MUL × 該攔網手自己的反應延遲才進得了候選池，
  //         於是「中路誘餌停下來」那一刻兩翼是否已被看見，就成了可調的賭局
  //         ——延遲越長越騙得動（交叉活著），越短牆越準（兩翼補得到）。
  OUTER_LZ: APPROACH.quick.lz + 0.1,
  // 外圍的第二條判準＝**橫向**：前排兩翼職責站位 |lx| ＝ 3（ai.js DUTY_SLOTS）。
  // 「外圍」在排球裡本來就同時是深度與邊路兩件事：快攻手恆在 lx 0，兩翼助跑起點
  // |lx| 3.6–4.1 ⇒ 這條判準結構上分得開快攻與兩翼，不必靠深度去猜。
  // 兩條判準取聯集（任一成立即為外圍）；設 Infinity ＝關掉該條（掃描臂用）。
  OUTER_LX: 3.0,
  // 外圍時序延遲的幅度倍率。★ 1 ＝**零新常數**：延遲量直接取該員既有的
  // `reactionTicks`（每人不同 6–21 tick）——「遠處的人我反應慢一拍」。
  // ⚠ 這是策略數值（硬規則 3）：本卷只量基準與掃描曲線，正式值待 Sawmah 定案。
  OUTER_LAG_MUL: 0,
  // ★ 裁定 2「賭對就死」強度端的**形狀提案**（攔網時序卷段 3 量到的缺口）★
  // 0 ＝現行：commit 站在他賭的那個**人**身上。
  // 1 ＝站到那個人的**過網點**上（直線／斜線兩條過網線的中點——他不知道對方會打哪條，
  //     就站在兩條中間，這是真實攔網手的做法）。
  // 為什麼需要它：實測 commit 對右翼的手身攔回 **0/311**，而 read 是 21/309（6.80%）。
  // 根因不是賭錯人——是**瞄錯位置**：右翼攻擊手站 lx 3.0–3.6，球卻從 lx≈1.9 過網，
  // 差 1.1–1.7m ＞ BLOCK_REACH_X ⇒ 就算賭中也結構上搆不到。read 瞄的是球的預測擊球點，
  // 所以他碰得到。這正是裁定 2 說的「更佳的對位」，且**零數值 buff**：位置對了就攔得到，
  // 位置錯了就空門，賭中與賭錯的差距由幾何自己長出來。
  // ★ 2026-08-01 Sawmah 定案＝1（站到過網點）★ 掃描依據見 tools/block-outer-sweep.mjs：
  //   mix 0／0.5／1 → 攻方每球得分 0.683／0.626／0.640、交叉 jt 2.38／4.23／10.91%。
  AIM_CROSSING_MIX: 1,
  // ★ 2026-08-04 誘餌量測旋鈕（Sawmah 試玩提問：「騙攔網這個機制真的有嗎」）★
  // 0 ＝**現行行為，零改動**（read 瞄球的預測擊球點、commit 讀二傳配分傾向）。
  // 1 ＝把瞄準點整個換成「最接近網、正在朝網推進的攻方前排球員身體 x」
  //     ——那正是**當年被拿掉的規則**（見 ai.js blockAimX 註解：改用身體 x 時
  //     「會被中路假動作誘餌帶偏，實測 read 面對兩翼的 MB 落差 p50 達 3.39m，
  //     因為誘餌恆是最接近網、正在推進的那個，選人規則永遠選他」）。
  // 讀的全是可觀察量（actors 的 x／z／pz），不碰 attackerId／approach ⇒ 反作弊鐵律不破。
  //
  // ★★ 2026-08-04 定案＝**維持 0（此路不通）**。兩輪量測的結論，留檔免得再問一次 ★★
  //
  // 【第一輪】對兩種人格一視同仁（掃描 `tools/decoy-aim-probe.mjs`，8 局／臂）：
  //   mix 0／0.35／0.7／1 → 攔網觸球率 22.15／20.99／16.33／**12.98%**
  //   誘餌**確實很有效**（全開接近腰斬），但**款3 離地率警報器當場轉紅**：
  //   「commit 離地率 28.4% − read 20.1% ＝ 8.3pp < 10pp 門檻」（基準 gap 14.4pp）。
  //   ⇒ 誘餌逼 read 跟著「衝向網的人」跑，**直接消滅 read 與 commit 的區別**——
  //     而 read 的定義就是「看清楚球再動、不對快攻賭」。警報器是對的。
  //
  // 【第二輪】改成只騙 commit（read 免疫，見 `ai.js blockAimX`）⇒ 測試全綠，但**沒有效果**：
  //   commit 方攔網觸球率 mix 0／0.35／1 → **2.75／2.71／1.72%**（read 是 22.15%），
  //   水平差平均 0.89m 早就 > 攔網半寬 0.5m。
  //   ⇒ **commit 本來就幾乎攔不到球**，誘餌沒有可以再拿走的東西。
  //
  // 【結論】方向誘餌要嘛破壞人格設計（對 read 開），要嘛無事可做（只對 commit 開）。
  //   當年拿掉它的理由不只是「效果太強」，而是它與 read 人格**結構上不相容**。
  //   ⇒ 玩家要的「把牆帶走」畫面走**時間差**那條路：`blockCommitRead` 仍是 commit 的
  //     起跳訊號，MB 先跳把他拔起來、OH 晚一拍打，回饋字卡見 `blockBetFeedback.js`
  //     「他賭了、賭錯了——空門是你的！」。那條是活的，不需要本旋鈕。
  DECOY_AIM_MIX: 0,
  // 同深度視為「兩個人一起在跑」的帶寬（m）——線索②只在這種模稜情境才有事做
  TIE_M: 0.5,
  // 二傳站位偏移到這麼多（m）才算「朝向讀得出來」；以下一律當成沒有資訊
  LEAN_M: 0.35,
  // close 預算的寬容（tick）：估算誤差內寧可去追（寧可追空，不可該追不追）
  CLOSE_SLACK: 2,
  // §十-2-e 改判＝「換了一個人跟」的辨識門檻（m）。跑動中的人單 tick 位移
  // < 0.09m（moveSpeed × SIM_DT 的上限），換人跟則是好幾公尺——1.0 落在兩者之間，
  // 對兩邊都有數量級的餘裕。blockCommitRead 不回傳 playerId（反作弊），只能認幾何。
  REPLANT_JUMP_M: 1.0,
  // 改判後重新踩定的代價（tick）。**不是加速度模型**——速度不是瓶頸（窗長 p50 80 tick
  // 可跑 3.7–6.9m，實測最大淨位移僅 4.864m），真正的代價是重心壓錯方向後要停、轉、
  // 重新踩地。12 tick＝0.2s，一個成年人橫向急停轉向的量級。
  // 這條同時是 §十二「假扣真傳（真版）」的依賴：攔網手要真的被騙、來不及回頭。
  REPLANT_TICKS: 12,
};

// 誰正要碰下一球（場上看得見）：他往網跑是去舉球、不是去扣球，不算助跑。
// 純幾何、決定論（平手取 id 序）
function nearestToBall(game, rot) {
  const b = game.ball;
  let id = null;
  let best = Infinity;
  for (const pid of rot) {
    const a = game.actors[pid];
    if (!a) continue;
    const d = (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
    if (id === null || d < best || (d === best && pid < id)) {
      best = d;
      id = pid;
    }
  }
  return id;
}

// 線索②的代理量：二傳實際站位相對名目舉球點的橫向偏移（隊伍視角，正＝往右手側）。
// 讀不到二傳（換人／資料缺）回 0＝沒有資訊
export function setterLeanOf(game, team, setterSpotLx = 0) {
  const rot = game.match.rotations?.[team] ?? [];
  for (const pid of rot) {
    if (game.players[pid]?.currentRole !== 'setter') continue;
    const a = game.actors[pid];
    return a ? TEAM_SIDE[team] * a.x - setterSpotLx : 0;
  }
  return 0;
}

// ★ 反作弊保證線 ★ —— 參數只有 game／攻方隊伍代號／可觀察線索，取不到 attackerId。
// 回傳「此刻該跟死的那個人在世界 x 的哪裡」（{ x, depth }）或 null（沒人在跑快攻）。
// 刻意**不回傳任何 playerId**：呼叫端就算想偷渡也拿不到人。
// 段 3：外圍候選的「延遲視角」——用 lag tick 之前的位置判他過線了沒／還在不在推進。
// 資料源＝ `actor.zHistory`（game.js 每 tick 推入、長度＝TAKEOFF_LOOKBACK_TICKS 24），
// 既有欄位，不新增狀態。歷史還不夠長＝這個人才剛出現在視野裡，一律當作「還沒讀到」。
function laggedZView(actor, lag) {
  if (lag <= 0) return { z: actor.z, pz: actor.pz };
  const h = actor.zHistory;
  const i = h.length - 1 - lag;
  if (i <= 0) return null;
  return { z: h[i], pz: h[i - 1] };
}

export function blockCommitRead(game, atkTeam, opts = {}) {
  const {
    passTier = null, setterSpotLx = 0, k = BLOCK_COMMIT,
    // 這名攔網手對外圍候選的時序延遲（tick）。呼叫端給 0＝不降級（read 的退路、探針對照臂）
    outerLag = 0,
  } = opts;
  // 線索①：一傳沒到位＝快攻不在池裡，commit 沒有標的（目前恆 perfect，見檔頭）
  if (passTier != null && passTier !== 'perfect') return null;
  const rot = game.match.rotations?.[atkTeam];
  if (!rot?.length) return null;
  const side = TEAM_SIDE[atkTeam];
  const chaserId = nearestToBall(game, rot);
  // 線索③：誰已經越過職責線、而且這一 tick 還在往網走
  const cands = [];
  for (const pid of rot) {
    if (pid === chaserId) continue;
    const p = game.players[pid];
    const a = game.actors[pid];
    if (!p || !a) continue;
    // 角色是公開資訊（玩家面板 mbReadFor 也照 currentRole 分翼別）：
    // 二傳往網跑是去舉球、自由人不進攻擊池
    if (p.currentRole === 'setter' || p.currentRole === 'libero') continue;
    // 段 3：先用**當下**的位置判他是不是外圍（這是「看得見位置」那一半，不延遲）；
    // 是外圍就改用延遲視角判「過線了沒／還在不在推進」（「讀不穿時序」那一半）
    const nowLz = side * a.z;
    const outer = nowLz > k.OUTER_LZ || Math.abs(side * a.x) > k.OUTER_LX;
    const view = outer ? laggedZView(a, outerLag) : { z: a.z, pz: a.pz };
    if (!view) continue; // 外圍且歷史還不夠長＝這一刻還讀不到他
    const lz = side * view.z;
    if (lz > k.DEPTH_LZ) continue;
    if ((side * view.pz) - lz <= k.APPROACH_EPS) continue;
    // 排序與回傳一律用**真實當下的位置**：位置是看得見的，延遲的只有時序判定
    cands.push({ lz: nowLz, x: a.x, lx: side * a.x });
  }
  if (!cands.length) return null;
  let best = cands[0];
  for (const c of cands) if (c.lz < best.lz) best = c;
  // 線索②：同深度還有第二個人在跑時，偏向二傳身體轉過去的那一側
  const tie = cands.filter((c) => c.lz - best.lz <= k.TIE_M);
  if (tie.length > 1) {
    const lean = setterLeanOf(game, atkTeam, setterSpotLx);
    if (Math.abs(lean) >= k.LEAN_M) {
      for (const c of tie) {
        if (lean > 0 ? c.lx > best.lx : c.lx < best.lx) best = c;
      }
    }
  }
  return { x: best.x, depth: best.lz };
}

// §6 B2 close 時間預算（純算術）：從現在的位置追到「球會被扣的那條線」要幾 tick，
// 對上「球飛到擊球窗上緣還剩幾 tick」。判錯或起步晚 → ticksNeeded > ticksLeft → 追不到。
// ★ 本函式只回答「來不來得及」，**不搬動任何人**——位移一律走 ai.js 的 moveIntent
//   （單 tick 位移受 moveSpeed×SIM_DT 上限約束），所以結構上不可能瞬移補位。
// ticksLeft 給 null（預測失效）＝沒有預算資訊，一律當作追得到（寧可去追）。
export function blockCloseBudget({ fromX, toX, stepM, ticksLeft = null, slack = 0 }) {
  const dist = Math.abs(toX - fromX);
  const ticksNeeded = stepM > 0 ? dist / stepM : Infinity;
  return {
    dist,
    ticksNeeded,
    ticksLeft,
    canClose: ticksLeft == null ? true : ticksNeeded <= ticksLeft + slack,
  };
}
// ==== B1-SCAN-END ====
