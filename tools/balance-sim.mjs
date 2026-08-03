// stage 7 平衡治具 — 無頭生涯模擬：量測六場勝率曲線（盲調終結者）
// 用法：node tools/balance-sim.mjs [runs=100]
// 模型：玩家 A2 由 AI 代打（近似基準——真人有讀攔網/假動作/魚躍，應優於此線）；
// 成長照實際規則：每場 gp 由表現實算、平均灑點；技術照傳授時程；
// scouting 跨場真實累積（宿敵記憶生效）。全決定論（seed 掃描）。
// W6 跨屆模式（C1）：VD_SEASONS=N＝每條生涯連跑 N 屆（advanceSeason 純函式推進，
// 名冊成長/招募進度/宿敵記憶跨屆保留；titles 綁衛冕難度 TITLE_LEVEL_BONUS）。
// 量測：逐屆勝率曲線、衛冕曲線（依屆初 titles 分組）、招募跨屆流動（入隊率/入隊屆）。
// 注意：治具「打好打滿」（止步後國賽照打取數據）＝wins 軸入隊率是上緣；逐出未建模。
import {
  createCareer, createCareerPlayer, careerMatchSetup, recordResult, nextMatch,
  mergeScouting, careerStage, advanceSeason,
} from '../src/career/careerState.js';
import { buildStarterMembers, applyRosterGrowth, openSlots } from '../src/career/roster.js';
import {
  buildRecruitMember, RECRUIT_TRUST, RECRUIT_CONDS,
  accrueRecruitProgress, conditionMet, nextRecruitId, recruitTargetGone,
  pendingWaiting, mergeWaiting, waitingOf,
} from '../src/career/recruitment.js';
import {
  createGame, stepGame, applySubstitution, applyTimeout, applyTimeoutBoost, startNextSet, TUNING,
} from '../src/sim/game.js';
import { STAMINA } from '../src/sim/stamina.js';
import { matchFormatOf } from '../src/career/schedule.js';
import { revealHeightForSeason } from '../src/career/heightGrowth.js'; // G7 屆界身高揭曉
import { isBackRow } from '../src/sim/rotation.js';
import {
  createAiState, aiCollectIntents, aiTimeoutWanted, aiTimeoutBoost, aiSubstitutionWanted,
} from '../src/sim/ai.js';
import { matchStatsFor, growthPointsFor, GROWTH, GROWABLE_ATTRS } from '../src/career/growth.js';
import { buildDeficitFillIns, applySeasonTurnover } from '../src/career/graduation.js';
import { defaultLineup, FRESHMAN_TRUST } from '../src/career/lineup.js';
import {
  digSuggestionFor, schemeByKey, schemeForDig, noteScheme, counterReadOf,
} from '../src/input/liberoRead.js';
import { opponentById, OPPONENTS } from '../src/career/opponents.js';
import { boxScoreLFor } from '../src/career/boxScoreL.js';

const RUNS = Number.parseInt(process.argv[2] ?? '100', 10);
const MAX_TICKS = 400000;
// 治具隔離開關（W2 平衡歸因用）：
// VD_NO_ROSTER=1＝不帶名冊（＝W1 前基準隊伍）；VD_NO_GROWTH=1＝帶名冊但關隊友成長
// VD_FULL_ROSTER=1（W4 招募臂）＝滿名冊、三名最高強度轉學生（曜石 MB／鐵霧 OPP／
// 天鷹 OH）以真實入隊初值 trust 10 頂上三個攻擊位——量測招募對勝率曲線的上移幅度
// （只採數據、不設通過門檻；此臂固定名冊，不跑招募鏡像）
const USE_ROSTER = process.env.VD_NO_ROSTER !== '1';
const USE_GROWTH = process.env.VD_NO_GROWTH !== '1';
const USE_FULL_ROSTER = process.env.VD_FULL_ROSTER === '1';
const SEASONS = Math.max(1, Number.parseInt(process.env.VD_SEASONS ?? '1', 10));
const NO_COMBO = process.env.VD_NO_COMBO === '1'; // 歸因臂：組合攻擊全屆關閉
const DUMP = process.env.VD_DUMP === '1';         // 逐場診斷傾印（只印第一條生涯）
// W7 E1 雙臂：VD_STAMINA=1＝「無管理」臂（體力開、AI 不換人＝下緣基準）；
// VD_MANAGE=1＝「自動管理」臂（<25% 換人；被連 4 分喊暫停待 B3 sim 上線後補）。
// 體力設定鏡像生涯（A4 拍板：對手 costMul 0.6 慢耗；P1 2026-07-30 移除 heavyExempt
// 豁免後同步鏡像——不然本治具驗不到拿掉豁免對難度曲線的真實影響）
const USE_MANAGE = process.env.VD_MANAGE === '1';
const USE_STAMINA = process.env.VD_STAMINA === '1' || USE_MANAGE;
// VD_MOMENTUM=1＝團隊氣勢臂（B1；可與體力臂疊加）。任一 W7 系統開＝對手 B 的
// AI 暫停照生涯實況鏡像（被連 4 分喊）；基準臂不開＝與 pre-W7 逐位一致
const USE_MOMENTUM = process.env.VD_MOMENTUM === '1';
const W7_ON = USE_STAMINA || USE_MOMENTUM;
// W2(P4) 身高錨點臂：VD_HEIGHT=公分（150/175/195 三錨點；工單 B3）。
// 未給＝188 基準（Phase 1 遺留值；本週校準後 175 為主錨、188＝「明顯優勢」）
const HEIGHT_CM = process.env.VD_HEIGHT ? Number.parseInt(process.env.VD_HEIGHT, 10) : null;
// W2 拍板的平衡主錨（`docs/phase4-w2-status.md` §B3）＝ production 創角畫面的預設值
// （`src/ui/careerScreen.js:1502`）。不是 `createCareerPlayer` 的簽名預設 188——見 G3 修復註。
const BALANCE_ANCHOR_HEIGHT_CM = 175;
// W3(P4) 位置臂（工單 §9：分位置獨立跑）：VD_ROLE=setter|middle|opposite|libero
// （未給＝outside 基準）。建隊走正式轉位鏈同款：currentRole＋缺額補位員＋
// defaultLineup 新對位（S 臂 AI 代打＝trust 權重鏡像＝現行 AI 舉球；MB/OPP＝現行
// AI；L＝careerMatchSetup liberos 通道＋applyLiberoSwaps）。
// VD_L_MODE（僅 L 臂）：suggest＝「全程不改判」下限（每次對手舉球照 AI 建議下指令）；
// omni＝「全知改判」上限（作弊讀真實落點 lastSpikeZone）；未給＝無指令純 AI dig。
// 上下限勝率差＝改判價值空間（附錄 A5：初擬 8-15%，輸出實測供 Sawmah 裁定不強湊）
const PLAYER_ROLE = process.env.VD_ROLE ?? 'outside';
const L_MODE = process.env.VD_L_MODE ?? null;
// W4(P4) Q8 多局制（工單 §10）：
// VD_BO=3|5＝全部場次強制多局（體力曲線臂：bo5 五局打滿情境）；
// VD_MULTISET=1＝生涯場依 matchFormatOf 自動賽制（決賽 bo5／準決・宿敵 bo3——
//   多局制全臂重跑的新基準；單局錨 23%/7% 為對照系，允許新帶不強拉）；
// VD_NO_BREAK_RECOV=1＝關局間恢復（「裸延續」對照——題7 校準目標的下界）；
// VD_CALL=1＝OPP 要球近似（AI 代打：後排一傳起球按頻率要球＋grant 同 matchLoop
//   決定論公式——權重增益按建議頻率近似，工單 §10）
const FORCE_BO = [3, 5].includes(Number.parseInt(process.env.VD_BO ?? '', 10))
  ? Number.parseInt(process.env.VD_BO, 10) : 0;
// ★★ VD_FAITHFUL=1 ＝保真度總開關（2026-08-03 治具比對稽核後新增）★★
//
// 為什麼要有這個總開關：治具為了「取樣方便」與 production 有一批**刻意**或**遺漏**的
// 行為差異，難度校準時每一項都得記得手動打開。今天已經連續兩次因為漏帶而量錯：
//   F5 賽制（bo1 vs 決賽 bo5／準決 bo3）——三屆奪冠率 8/20/36 → 2/11/47，
//      而且偏誤方向逐屆相反（多局放大實力差）
//   G1 止步後照打（見下）
// 開關越多越容易漏 ⇒ 收成一個總開關。**難度校準的每一支臂一律帶 `VD_FAITHFUL=1`**，
// 需要「取樣方便」的舊行為時才個別關掉。完整差異清單＝`docs/kickoffs/fixture-fidelity-audit.md`。
const FAITHFUL = process.env.VD_FAITHFUL === '1';
const MULTISET = FAITHFUL || process.env.VD_MULTISET === '1';
// G1：production 八強落敗即該屆結束（`careerState.js:60-66` nextMatch 回 null），
// 治具**無條件跑滿六場**——那是檔頭寫明的刻意取捨（「打好打滿」＝止步後照打取數據，
// 讓每一場都有樣本）。**不是 bug，但用它校難度就是錯的**：實測第 1 屆 qf 勝率約六成
// ⇒ 約四成生涯在真實遊戲每屆少打兩場（少成長點／少兩場隊友成長／少兩場情蒐與招募），
// 且未進決賽者在 production 根本學不到跳發（`events.js` 要求實際打到決賽對天鷹）。
// 偏移逐屆複利，正好壓在「二三屆曲線太陡」這個病灶上。
const STOP_ON_ELIM = FAITHFUL || process.env.VD_STOP_ON_ELIM === '1';
// ★ F1／G6／G11：屆末名冊變動一包（2026-08-03 治具比對稽核；VD_TURNOVER=1 可單開）★
// 治具原本的屆界**只有** `advanceSeason`（賽程與戰績重置），production 的屆界是
// `careerStore.advanceSeason`（`careerStore.js:159-269`）——那裡還做了整包名冊換血：
//   F1  畢業（三年級離隊進 alumni）→ 全員年級 +1 → 新生入學（`graduation.applySeasonTurnover`）
//       ⇒ 治具讓 grade 3 的 A3 大山／A4 阿烈打滿三屆還持續成長（production 第 1 屆末就畢業）
//   G6  等候名單遞補（達標但滿編者排隊，畢業騰位時優先於新生）＋來投保底
//       （本屆零招募入隊＝屆末補一名 walk-on，屬性以隊伍平均為底線）
//   G11 lineup 由治具「每場現算」（lineup=null ⇒ careerMatchSetup 每場 defaultLineup、
//       trust 一律回退 20）改為**持有一份跨場 lineup**：招募生入隊顯式 trust 10
//       （`RECRUIT_TRUST`）、新生／來投者 10（`FRESHMAN_TRUST`）、等候遞補者 10、
//       倖存者沿用舊值，另加賽末換人信任演化（`matchCareer.js:114-138`）。
// 方向：F1 讓治具的玩家隊逐屆偏強（難度被低估）、G6 的來投讓 production 偏強、
// G11 的 trust 10 讓新血球權變少 ⇒ 三項不同號，淨效應要實測（見 audit 文件）。
// **不是取樣取捨、是漏了 production 的一整段**，但既有基準全部在「不換血」上量的
// ⇒ 依本檔通則掛在 VD_FAITHFUL 之下，不帶開關的臂逐值不變。
// 逐出（expel）維持未建模：production 的逐出是**玩家手動決定**（`canExpel` 由 UI 閘門
// 呼叫，無自動政策），與 G14「玩家手動操作全未建模」同類——治具沒有玩家意圖模型可鏡像。
const TURNOVER = FAITHFUL || process.env.VD_TURNOVER === '1';
const USE_CALL = process.env.VD_CALL === '1';
const CALL_FREQ = 0.6; // 建議頻率近似（玩家不會每窗都按；初擬）
const CALL_GRANT = 0.7; // 與 matchLoop 同值
if (process.env.VD_NO_BREAK_RECOV === '1') STAMINA.RECOV_SET_BREAK = 0; // 治具端 patch
// W4 附錄 B-4 治具臂：VD_RIVAL=1＝把天鷹現任 ace 臨時打上宿敵旗（宿敵人設落檔前的
// 反讀量測用——對宿敵場另記 suggest/omni 差＝反讀對改判空間的制衡量化）
const USE_RIVAL = process.env.VD_RIVAL === '1';
if (USE_RIVAL) opponentById('sky-hawk').ace.rival = true;
// ═══ 難度重校卷 · 跨屆歸因臂（2026-08-03）═══════════════════════════════════
// 問題：二三屆奪冠率 5%→17%→35%，各驅動力各貢獻多少？
// 手法：**屆間切斷某一條跨屆帶入**（不是關掉該系統）——每屆「屆內」照常運作，
//   只在 advanceSeason 之後把該項倒回第 1 屆初值。這樣設計的好處是
//   **第 1 屆逐 seed 必然全等於基準臂**（自驗閘：Δ第1屆 ≠ 0 就是臂寫壞了）。
// 全部預設關閉；一格 src/ 未動，開關只作用在本治具的屆界。
//
// VD_NO_PCARRY=1  切斷「玩家屬性」跨屆帶入：每屆開頭把 player.attributes 倒回創角初值
//                 （屆內仍照 growthPointsFor 實算成長；只是不累積到下一屆）
// VD_NO_TCARRY=1  切斷「玩家技術」跨屆帶入：每屆開頭清空 techniques（tip/dive/pipe/
//                 feint/floatServe/jumpServe 照 TEACH 時程在該屆重新解鎖）
// VD_NO_MCARRY=1  切斷「隊友屬性成長」跨屆帶入：每屆開頭把名冊成員整個物件倒回
//                 「入隊當下」的快照（含 growth.xp/log/grade），成員名單本身不動
// VD_NO_RCARRY=1  切斷「招募」跨屆帶入：每屆開頭把招募入隊的成員移出名冊、
//                 recruitment 進度歸零（＝每屆都從純 starter 名冊重新招募）
// VD_NO_SCARRY=1  切斷「情蒐／宿敵記憶」跨屆帶入：每屆開頭清空 career.scouting
//                 （對手讀我的 scoutRead 每屆從零累積）
// VD_FREEZE_OPP=1 凍結「對手的屆數效應」：careerMatchSetup 的 seasonIndex 恆傳 1
//                 ⇒ applySeasonRoster 不跑（ace 畢業遞補、成長型 ace 逐屆加成全不生效）
// VD_FIXED_SCHED=1 凍結賽程：每屆沿用第 1 屆的賽程項（消掉小組輪抽＋保底債造成的
//                 對手變化；prework §三 記載的 group-3 天鷹效應由此臂量化）
// VD_NO_CARRY=1   以上七項全開（合計臂；titles 不在此列——它讓後屆變難不是變簡單，
//                 覆蓋率另由 VD_JSON 的 titlesAtStart 欄位回答）
const ALL_OFF = process.env.VD_NO_CARRY === '1';
const NO_PCARRY = ALL_OFF || process.env.VD_NO_PCARRY === '1';
const NO_TCARRY = ALL_OFF || process.env.VD_NO_TCARRY === '1';
const NO_MCARRY = ALL_OFF || process.env.VD_NO_MCARRY === '1';
const NO_RCARRY = ALL_OFF || process.env.VD_NO_RCARRY === '1';
const NO_SCARRY = ALL_OFF || process.env.VD_NO_SCARRY === '1';
const FREEZE_OPP = ALL_OFF || process.env.VD_FREEZE_OPP === '1';
const FIXED_SCHED = ALL_OFF || process.env.VD_FIXED_SCHED === '1';
// VD_JSON=<路徑>＝把逐 run／逐屆的結果落檔（配對分析用；不影響模擬）。
// 各臂 seed 序列相同（100000+run*7919）⇒ 依 run 索引即為同種子配對。
const JSON_OUT = process.env.VD_JSON ?? null;
// 難度重校卷（工單前置）：VD_LEVEL_DELTA=N＝全部對手 level 統一 +N（可負）。
// 只在治具端就地改寫已載入的 OPPONENTS 陣列（同 VD_RIVAL 手法，非改 src 檔案）；
// 均勻位移不影響 schedule.js 依 level 排序的相對順序，量測「level 每 +1 值多少勝率」用。
const LEVEL_DELTA = Number.parseInt(process.env.VD_LEVEL_DELTA ?? '0', 10);
if (LEVEL_DELTA) {
  for (const o of OPPONENTS) o.level += LEVEL_DELTA;
}
// 難度重校卷 題 A（A2「對手隨屆成長」候選規則的實測臂）：
//   VD_LEVEL_RAMP="0,2,4" ＝逐屆 delta 列表（第 1 屆 +0、第 2 屆 +2、第 3 屆 +4）。
// ★ 為什麼需要這支臂、不能拿 VD_LEVEL_DELTA 的結果組合 ★
// `VD_LEVEL_DELTA` 是**全屆統一位移**，它的「第 2 屆」是在「第 1 屆也被加難」的前提下
// 打出來的——玩家的贏球場次／成長點／招募進度都不同 ⇒ 兩者的第 2 屆**不是同一件事**。
// 逐屆遞增必須自己實測（`02 §6.1` 條 4：重建的組合不得用於否證）。
// 允許小數（level 是全屬性基準值，非門檻——`opponents.js:38` 已明文攔網人格與 level 脫鉤；
// `schedule.js` 只用它排序，小數不影響相對順序）。
const LEVEL_RAMP = (process.env.VD_LEVEL_RAMP ?? '')
  .split(',').map((s) => Number.parseFloat(s.trim())).filter((v) => Number.isFinite(v));
const RAMP_BASE = LEVEL_RAMP.length ? new Map(OPPONENTS.map((o) => [o.id, o.level])) : null;
// 每屆開打前把 level 重設為「原始值 + 該屆 delta」（冪等，逐場呼叫也安全）。
// 超出列表長度的屆沿用最後一項＝加成封頂，不會無限外插。
function applyLevelRamp(season) {
  if (!RAMP_BASE) return;
  const d = LEVEL_RAMP[Math.min(season, LEVEL_RAMP.length) - 1];
  for (const o of OPPONENTS) o.level = RAMP_BASE.get(o.id) + d;
}
function hash01(n) {
  let x = Math.imul(n | 0, 2654435761);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// 傳授時程（events.js teach-* 的鏡像）：場次索引完成後解鎖（跨屆冪等——已學不重覆）
const TEACH_AFTER = {
  0: ['tip'],
  1: ['dive'],
  2: ['pipe', 'feint'],
  3: ['floatServe'],
};
const TEACH_BEFORE_FINAL = ['jumpServe'];

// W3 L 臂指令注入（playMatch 內逐 tick）；W4 附錄 B-1 配套版：suggest＝照配套建議
// （dig＋block 雙驅動）；omni＝對手扣球瞬間改判成真值（收縮吃真值、block 反查配套）。
// schemeLog（B-4/B-6 治具）：配套史統計——ace 反讀臂的資料底
function driveLiberoBias(g, ai, schemeLog = null) {
  if (!L_MODE) return;
  const r = g.rally;
  if (g.phase !== 'rally' || (r.possession === 'A' && r.touches >= 1)) {
    ai.digBias = null;
    return;
  }
  if (r.possession === 'B' && r.touches === 2 && !ai.digBias) {
    const key = digSuggestionFor(g, ai);
    const sch = schemeByKey(key);
    ai.digBias = { team: 'A', choice: sch?.dig ?? 'cross', block: sch?.block, override: false };
    if (schemeLog) Object.assign(schemeLog, noteScheme(schemeLog, key));
  } else if (L_MODE === 'omni' && r.profile === 'spike' && r.lastSpikeZone
    && ai.digBias && ai.digBias.choice !== r.lastSpikeZone) {
    const sch = schemeForDig(r.lastSpikeZone); // middle＝null（三配套皆不中——保原指令的 block）
    ai.digBias = {
      team: 'A', choice: r.lastSpikeZone,
      block: sch?.block ?? ai.digBias.block, override: true,
    };
  }
}

function playMatch(setup, entry = null) {
  // W4 Q8：賽制——VD_BO 強制 > VD_MULTISET 依賽程推導 > 單局（現行零擾動）
  const bestOf = FORCE_BO || (MULTISET && entry ? matchFormatOf(entry) : 1);
  const g = createGame({
    seed: setup.seed,
    teams: setup.teams,
    aiProfiles: setup.aiProfiles,
    liberos: setup.liberos,
    ...(bestOf > 1 ? { series: { bestOf } } : {}),
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    // 組合攻擊屆數閘（2026-08-01）：鏡像生涯現值——治具的職責是量「玩家實際會遇到的
    // 那個難度」，第 1 屆正賽沒有組合，治具也不能有（同 stamina／benches 的鏡像慣例）。
    // 值由 careerMatchSetup 依 `season` 算好，本檔只遞。
    // VD_NO_COMBO=1＝**歸因臂**（難度重校卷前置，2026-08-01）：把組合攻擊全屆關掉，
    // 用來把「第 2 屆 group-3 掉到 21%」這個懸崖歸因到屆數閘 vs 其他成因。
    // 只在治具端覆寫，src 一格未動。
    comboScale: NO_COMBO ? 0 : (setup.comboScale ?? 1),
    // VD_B_COSTMUL＝對手耗速掃描旋鈕（P1 驗證 07-30 用它掃出 0.6 下豁免從未咬合
    // ⇒ 改 1.0 對稱）；未給＝鏡像生涯現值 1.0（matchConfig.js 同步）
    ...(USE_STAMINA
      ? { stamina: { A: {}, B: { costMul: Number(process.env.VD_B_COSTMUL ?? 1.0) } } }
      : {}),
    ...(USE_MOMENTUM ? { momentum: true } : {}),
    // 板凳只在管理臂帶入（帶而不換＝零擾動已有測試背書；不帶＝基準臂逐位不變）。
    // W1(P4)：對手板凳鏡像生涯——體力臂即帶（對手疲勞換人只在體力開時有意義）
    ...(USE_MANAGE || (USE_STAMINA && setup.benches?.B?.length) ? {
      benches: {
        ...(USE_MANAGE && setup.benches?.A?.length ? { A: setup.benches.A } : {}),
        ...(USE_STAMINA && setup.benches?.B?.length ? { B: setup.benches.B } : {}),
      },
    } : {}),
  });
  let ai = createAiState();
  let maxDeficit = 0; // E1 雪球哨兵：本場最大落後分差（A 視角）
  // W4 題7 體力曲線：各局開局的 A 隊場上均值（bo>1 才有意義；[0]＝第 1 局）
  const setStartStamina = [];
  const noteSetStart = () => {
    if (!g.stamina) return;
    const onCourt = g.match.rotations.A.map((id) => g.stamina[id] ?? 1);
    setStartStamina.push(onCourt.reduce((s, v) => s + v, 0) / onCourt.length);
  };
  noteSetStart();
  let calledFlight = -1;
  // W4 B-4 ace 反讀（治具鏡像 matchLoop）：宿敵 ace pid＋配套史
  const schemeLog = { total: 0, counts: {} };
  const rivalAcePid = USE_RIVAL && entry?.opponentId === 'sky-hawk'
    ? Object.values(g.players).find((p) => p.teamId === 'B'
      && p.name === opponentById('sky-hawk').ace?.name)?.id ?? null
    : null;
  while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    // 局間：治具自動推進（UI 的「下一局」鈕等效；aiState 局界重建＝matchLoop 同構）
    if (g.phase === 'set_break') {
      startNextSet(g);
      ai = createAiState();
      noteSetStart();
      continue;
    }
    driveLiberoBias(g, ai, schemeLog);
    if (rivalAcePid && g.phase === 'rally' && g.rally.possession === 'B'
      && ai.attackerId === rivalAcePid) {
      const counter = counterReadOf(schemeLog);
      ai.counterRead = counter ? { pid: rivalAcePid, openLine: counter.openLine } : null;
    } else if (ai.counterRead) {
      ai.counterRead = null;
    }
    const intents = aiCollectIntents(g, ai);
    // W4 題5 OPP 要球近似（AI 代打）：後排一傳起球＝按頻率要球（決定論 hash）；
    // grant 公式與 matchLoop 同（權重增益按建議頻率近似）
    if (USE_CALL && g.phase === 'rally' && g.rally.possession === 'A' && g.rally.touches === 1
      && g.players.A2?.currentRole === 'opposite'
      && g.match.rotations.A.includes('A2') && isBackRow(g.match.rotations.A, 'A2')
      && calledFlight !== g.rally.flightId) {
      calledFlight = g.rally.flightId;
      if (hash01(g.rally.flightId * 977 + g.seed * 31 + 3) < CALL_FREQ) {
        intents.push({ tick: g.tick, playerId: 'A2', action: 'call' });
        if (hash01(g.rally.flightId * 613 + (g.seed ?? 0) * 17 + 9) < CALL_GRANT) {
          ai.attackerId = 'A2';
          ai.attackKind = 'dball';
        }
      }
    }
    stepGame(g, intents);
    if (g.phase === 'serve') {
      const d = g.match.score.B - g.match.score.A;
      if (d > maxDeficit) maxDeficit = d;
      // 對手 AI 暫停（生涯實況鏡像：matchLoop 為 B 隊喊）——W7 臂才開，基準臂零擾動；
      // W8：對手教練選項同步鏡像（matchLoop 同一顆 aiTimeoutBoost）
      if (W7_ON && aiTimeoutWanted(g, 'B') && applyTimeout(g, { team: 'B' }).ok) {
        applyTimeoutBoost(g, { team: 'B', boost: aiTimeoutBoost(g, 'B') });
      }
      // W1(P4)：對手疲勞換人鏡像（matchLoop 同一顆判準；無體力/無板凳＝恆 null 零擾動）
      if (W7_ON) {
        const oppSub = aiSubstitutionWanted(g, 'B');
        if (oppSub) applySubstitution(g, { team: 'B', ...oppSub });
      }
      if (USE_MANAGE) autoManage(g);
    }
  }
  return { g, maxDeficit, setStartStamina };
}

// E1 自動管理臂政策（簡單教練腦）：死球窗掃場上 <25% 者換下——同角色板凳
// （S↔OPP 互通、換上者需 ≥50% 否則沒意義）；額度/合法性由 applySubstitution 把關
const MANAGE_OUT_BELOW = 0.25;
const MANAGE_IN_ABOVE = 0.5;
const roleOk = (a, b) => a === b ||
  (['setter', 'opposite'].includes(a) && ['setter', 'opposite'].includes(b));
function autoManage(g) {
  // E1 政策②：被連 4 分喊暫停（判準與對手 AI 同一顆 aiTimeoutWanted）
  if (aiTimeoutWanted(g, 'A')) applyTimeout(g, { team: 'A' });
  for (const outId of [...g.match.rotations.A]) {
    if ((g.stamina?.[outId] ?? 1) >= MANAGE_OUT_BELOW) continue;
    const pOut = g.players[outId];
    if (pOut.currentRole === 'libero') continue;
    for (const inId of [...g.bench.A]) {
      if (!roleOk(pOut.currentRole, g.players[inId].currentRole)) continue;
      if ((g.stamina?.[inId] ?? 1) < MANAGE_IN_ABOVE) continue;
      if (applySubstitution(g, { team: 'A', outId, inId }).ok) break;
    }
  }
}

// 平均灑點：可成長屬性輪流 +1（上限 90）——玩家實際會集中灑，此為中性基準
function spendEvenly(player, points) {
  let left = points;
  let i = 0;
  let stuck = 0;
  while (left > 0 && stuck < GROWABLE_ATTRS.length) {
    const key = GROWABLE_ATTRS[i % GROWABLE_ATTRS.length].key;
    if (player.attributes[key] < GROWTH.ATTR_CAP) {
      player.attributes[key] += 1;
      left -= 1;
      stuck = 0;
    } else {
      stuck += 1;
    }
    i += 1;
  }
}

// 招募入隊鏡像（settleRecruitJoins 的無 store 版，同表序/同規則）：
// 條件達成＋有空位→生成入隊；額滿＝條件保持、progress 不清（與正式路徑一致）
function settleJoinsMirror(roster, recruitment, careerSeed, season, joinLog, lineup = null) {
  let r = roster;
  let rec = recruitment;
  let lu = lineup;
  // G6：達標但滿編者＝進**等候名單**（`recruitment.js:370-386`），下屆畢業騰位時優先
  // 遞補；治具原本只是 `continue`（＝production 2026-07-30 P2② 修掉的那個黑洞）。
  // 只在 TURNOVER 下記帳——沒有屆末換血就沒有騰位的時點，等候名單永遠不會被消費。
  const waitlisted = [];
  for (const key of Object.keys(RECRUIT_CONDS)) {
    if (rec.recruited.includes(key) || !conditionMet(rec, key)) continue;
    // ★ G5 保真度修復（無條件——這是漏了 production 的邏輯，不是取樣取捨）★
    // production（`careerStore.js` 的等候者生成器）會先問 `recruitTargetGone`：
    // 目標本人已經畢業離校（現行年級 >3）就招不到了。
    // 治具原本沒這道檢查 ⇒ 第 2／3 屆還招得到早就畢業的人。
    //
    // ★ 修法分兩類（本檔通則）★
    //   ・**純粹的 bug**（漏傳參數、用錯常數）＝ G3 身高／G4 seasonIndex／G5 本項 ⇒ **無條件修**
    //   ・**刻意的取樣取捨**（檔頭寫明的「打好打滿」）＝ G1 ⇒ **開關控制**（VD_FAITHFUL）
    if (recruitTargetGone(key, season)) continue;
    // 順序照 production（`recruitment.js:368-373`）：先問「人還在不在」，再問「有沒有位子」
    // ——反過來會把已畢業的目標也排進等候名單。滿編＝不入隊（兩序等值），
    // 差別只在等候名單的內容 ⇒ 不帶 TURNOVER 的臂逐值不變。
    if (openSlots(r) <= 0) {
      if (TURNOVER) waitlisted.push(key);
      continue;
    }
    const id = nextRecruitId(r.members, rec.expelled);
    // ★ G4 保真度修復（與 F4 完全同型：漏傳 seasonIndex）★
    // `buildRecruitMember` 的第 5 參數 seasonIndex 決定**入隊年級**
    // （`recruitment.js:283`：入隊年級＝來源隊該屆的年級）。漏傳＝恆為 1
    // ⇒ 招募生年級永遠停在最會成長的那一檔 ⇒ 玩家隊偏強、難度被低估。
    r = {
      ...r,
      members: [...r.members, buildRecruitMember(key, careerSeed, id, r.members, season)],
    };
    rec = { ...rec, recruited: [...rec.recruited, key] };
    // ★ G11 保真度修復（TURNOVER 包）★ production 入隊時**顯式寫入 lineup.trust＝10**
    // （`careerStore.js:285-294` applyRecruit，值＝`RECRUIT_TRUST`）。治具沒有持久
    // lineup ⇒ 每場 `careerMatchSetup` 現算 defaultLineup ⇒ 招募生 trust 回退 20
    // ＝球權比 production 多（`lineup.js:174-176` trustOf 缺鍵回退 DEFAULT_TEAMMATE_TRUST）。
    if (lu?.trust) lu = { ...lu, trust: { ...lu.trust, [id]: RECRUIT_TRUST } };
    joinLog.push({ key, season });
  }
  if (TURNOVER && waitlisted.length) rec = mergeWaiting(rec, waitlisted);
  return { roster: r, recruitment: rec, lineup: lu };
}

// ── F1／G6 屆末換血鏡像（`careerStore.advanceSeason` 的無 store 版）────────────
// production 權威路徑＝`careerStore.js:169-257`（單次 RMW）：
//   ① pendingWaiting → ② applySeasonTurnover（畢業→等候遞補→來投保底→年級+1→新生）
//   → ③ lineup 重排（trust 跟人：倖存者沿用、新生/來投 10、遞補者 RECRUIT_TRUST）
//   → ④ recruitment（遞補者記進 recruited、出等候名單）
// 兩顆種子刻意分開，與 production 逐值對齊：
//   newSeed＝advanceSeason 之後的 career.seed（`careerStore.js:186` 傳 next.seed）
//     ——新生／來投者的決定論素材
//   oldSeed＝advanceSeason 之前的 career.seed（`careerStore.js:195` 傳 prev.season.seed，
//     RMW 讀的是**舊**存檔）——等候遞補者 buildRecruitMember 的 careerSeed
function applyTurnoverMirror({
  roster, recruitment, lineup, endingSeason, oldSeed, newSeed, playerRole,
}) {
  const nextIdx = endingSeason + 1;
  const rec = recruitment ?? { progress: {}, recruited: [], expelled: [] };
  const waiting = pendingWaiting(rec, nextIdx);
  // P2①：本屆有無招募入隊——`joinedSeason` 是唯一判準（`careerStore.js:181-182`）
  const joinedThisSeason = roster.members.some((m) => m.joinedSeason === endingSeason)
    || (rec.expelled ?? []).some((e) => e.member?.joinedSeason === endingSeason);
  const turnover = applySeasonTurnover({
    roster,
    seasonIndex: endingSeason,
    seed: newSeed,
    playerRole,
    waiting,
    buildWaitingMember: (key, members, alumni) => (
      recruitTargetGone(key, nextIdx)
        ? null
        : buildRecruitMember(
          key,
          oldSeed,
          nextRecruitId(
            [...members, ...(alumni ?? []).map((a) => a.member)],
            rec.expelled ?? [],
          ),
          members,
          nextIdx,
        )
    ),
    walkOn: !joinedThisSeason,
  });
  // ③ 預設陣重排（`careerStore.js:210-223`）：畢業者不可留在 starters；trust 跟人
  const nextLineup = defaultLineup(turnover.roster.members, 'A2', playerRole);
  const prevTrust = lineup?.trust ?? {};
  for (const id of Object.keys(nextLineup.trust)) {
    if (prevTrust[id] !== undefined) nextLineup.trust[id] = prevTrust[id];
  }
  for (const f of turnover.freshmen) {
    if (nextLineup.trust[f.id] !== undefined) nextLineup.trust[f.id] = FRESHMAN_TRUST;
  }
  for (const m of [...(turnover.admitted ?? []), ...(turnover.walkOn ? [turnover.walkOn] : [])]) {
    if (nextLineup.trust[m.id] !== undefined) {
      nextLineup.trust[m.id] = m.origin === 'walkon' ? FRESHMAN_TRUST : RECRUIT_TRUST;
    }
  }
  // ④ 遞補入隊者記進 recruited、出等候名單（`careerStore.js:237-245`）
  const admittedKeys = turnover.admittedKeys ?? [];
  const restWaiting = waitingOf(rec).filter(
    (k) => !admittedKeys.includes(k) && !recruitTargetGone(k, nextIdx),
  );
  return {
    roster: turnover.roster,
    recruitment: {
      ...rec,
      recruited: [...(rec.recruited ?? []), ...admittedKeys],
      ...(restWaiting.length || rec.waiting ? { waiting: restWaiting } : {}),
    },
    lineup: nextLineup,
    turnover,
  };
}

// G11 後半：賽末換人信任演化（`matchCareer.js:114-138` 的鏡像；純由 events 導出）。
// 被換下 −1、被換上且本場有建功（殺球/吊球/攔網得分/ACE）+2；主控不計；夾限 0–100。
// 治具基準臂 A 隊零換人 ⇒ 恆 no-op；VD_MANAGE 臂與屆末換血包一起才會咬合。
function applySubTrustMirror(lineup, events, myTeam, playerId) {
  if (!lineup?.trust) return lineup;
  const subs = events.filter((e) => e.type === 'SUBSTITUTION' && e.team === myTeam);
  if (!subs.length) return lineup;
  const clamp = (v) => Math.max(0, Math.min(100, v));
  const trust = { ...lineup.trust };
  const outs = new Set();
  const ins = new Set();
  for (const e of subs) {
    if (e.outId !== playerId) outs.add(e.outId);
    if (e.inId !== playerId) ins.add(e.inId);
  }
  for (const id of outs) trust[id] = clamp((trust[id] ?? 20) - 1);
  for (const id of ins) {
    const st = matchStatsFor(events, id, myTeam);
    if (st.kills + st.tipKills + st.blockPoints + st.aces > 0) {
      trust[id] = clamp((trust[id] ?? 20) + 2);
    }
  }
  return { ...lineup, trust };
}

const matchIds = ['group-1', 'group-2', 'group-3', 'national-qf', 'national-sf', 'national-final'];
const wins = Object.fromEntries(matchIds.map((id) => [id, 0]));
const margins = Object.fromEntries(matchIds.map((id) => [id, []]));
let champions = 0;
let reachedFinal = 0;
// E1 收集器：逆轉哨兵（全場次）＋體力臂診斷
let deficit5 = 0;
let comeback5 = 0;
let stamSum = 0;
let stamMin = 1;
let stamSumB = 0;
let stamMinB = 1;
let heavyGamesB = 0; // 終場任一 B 場上球員 <25%（重度檔）的場數
let stamGames = 0;
let subsUsed = 0;
let oppSubsUsed = 0; // W2(P4)：B 隊實際換人人次（樣本量測）
let oppSubGames = 0; // 至少換過一人的場數
// W2(P4) 身高體感代理（第 1 屆六場的 A2 個人數據；跨身高臂對照＝
// 「190 攔網體感明顯較強」的無頭驗法）
const a2 = { kills: 0, tips: 0, aces: 0, blocks: 0, games: 0 };
// W3(P4) L 三欄場均（VD_ROLE=libero 才累積；契約＝career/boxScoreL）
const lBox = { digs: 0, assistDigs: 0, rallySaves: 0 };
// W4 題7 體力曲線：各局開局的 A 隊場上均值（跨場累積；bo>1 臂才有樣本）
const setCurve = [];
let fullDistanceGames = 0; // 打滿場數（bo5＝五局打滿）

// 跨屆收集器（SEASONS>1 才輸出；wins/margins/champions 維持「第 1 屆」語義不變）
const perSeason = Array.from({ length: SEASONS }, () => ({
  wins: Object.fromEntries(matchIds.map((id) => [id, 0])),
  champions: 0,
  // 難度重校卷 題 B（2026-08-03 Sawmah 拍板「改用逐屆決賽帶」）：
  // 原本只有第 1 屆有決賽帶（`reachedFinal` 被包在 `if (season === 1)` 裡）⇒
  // 四個逐屆候選方案量出來的決賽帶**全是 38%**，對「逐屆」方案零解析力。
  reachedFinal: 0,
  // natWinsSum＝國賽三場的累計勝場數（0–3）總和 ⇒ 除以 RUNS 得平均。
  // ★這是**連續量**，解析力遠優於「三連勝」的二元奪冠率★——奪冠率在現行難度下
  // 已逼近地板（RUNS=100 的配對 SE ±6pp > 錨 3a 的 3pp 目標間距，排不出方案優劣）。
  natWinsSum: 0,
}));
// F1／G6 換血量測（TURNOVER 臂才累積；純記帳）：屆界次數、畢業人次、新生人次、
// 等候名單遞補人次、來投保底觸發屆數
const turnoverStats = {
  boundaries: 0, graduates: 0, freshmen: 0, admitted: 0, walkOn: 0,
};
const byTitles = new Map(); // 屆初 titles → { seasons, wins:{matchId:勝}, champions }
const joinStats = {}; // recruitKey → { joined, seasonSum }
let rosterEndSizeSum = 0;
// ★ 配對同種子模式（階段五裁定書 v3 §4.3／§六）★
// 停手判準**必須是配對同種子的差值**，不得用未配對絕對值——理由：n=40 時奪冠率 15%
// 的 SE ≈ 5.6pp，「掉出 5–25%」＝±1.8 SE，雜訊自己就能越線。配對之後 career 之間的
// 變異被抽掉，同一條生涯前後相減，剩下的才是改動造成的。
//   VD_PAIRED=<檔案>  檔案不存在 ⇒ 寫入本次逐 seed 結果當基準
//                     檔案存在   ⇒ 載入並逐 seed 相減，報 Δ 與配對 SE
const PAIRED_FILE = process.env.VD_PAIRED ?? null;
const perRun = []; // { seed, wins:{matchId:0|1}, champion:0|1 }
const jsonRuns = []; // VD_JSON：{ seed, seasons:[{ titlesAtStart, wins, champion }] }

for (let run = 0; run < RUNS; run += 1) {
  const seed0 = 100000 + run * 7919;
  let career = createCareer({ seed: seed0, playerName: '治具' });
  // ★ G3 保真度修復（2026-08-03 治具比對稽核）★ 原本不傳 heightCm ⇒ 吃
  // `createCareerPlayer` 的**簽名預設 188**。但 production 創角畫面預設是 **175**
  // （`src/ui/careerScreen.js:1502`），且 W2 拍板明文「**平衡主錨改 175**」
  // （`docs/phase4-w2-status.md` §B3）⇒ 治具一直在 188 上量、驗收錨卻是在 175 上定的。
  // 影響方向：188 比 175 強（該檔 §4：175 決賽帶 23%／奪冠 7%；188 決賽帶 30%）
  // ⇒ 難度被低估。`VD_HEIGHT` 臂照舊可覆寫。
  // let（非 const）＝G7 身高揭曉要在屆界整份換掉（revealHeightForSeason 回傳新物件）
  let player = createCareerPlayer('治具', {
    heightCm: HEIGHT_CM ?? BALANCE_ANCHOR_HEIGHT_CM,
    seed: career.seed,
  });
  // W2 名冊管線（鏡像正式路徑）：具名個性化 starter＋逐場表現驅動成長
  // capacity 12＝schema v2 現值（W5 拍板 10→12）
  let roster = { capacity: 12, members: buildStarterMembers() };
  let recruitment = { progress: {}, recruited: [], expelled: [] };
  let lineup = null;
  const joinLog = [];
  // W3(P4) 位置臂：正式轉位鏈同款（currentRole＋trustFloor 語意＋缺額補位員＋新對位
  // 預設陣）；玩家=L 時 defaultLineup 產 libero='A2'、careerMatchSetup 走 liberos 通道
  if (PLAYER_ROLE !== 'outside') {
    player.currentRole = PLAYER_ROLE;
    if (PLAYER_ROLE === 'setter') player.trust.floorShare = 0; // 甲2：分配者無保底對象
    const usedNames = roster.members.map((m) => m.fullName).filter(Boolean);
    roster.members.push(...buildDeficitFillIns({
      seed: career.seed, members: roster.members, usedNames, alumni: [], playerRole: PLAYER_ROLE,
    }));
    lineup = defaultLineup(roster.members, 'A2', PLAYER_ROLE);
  }
  if (USE_FULL_ROSTER) {
    // 招募臂：R1 曜石 MB／R2 鐵霧 OPP／R3 天鷹 OH（決定論生成，同正式入隊路徑）；
    // 陣容＝[S, 玩家OH, R-MB, R-OPP, R-OH, MB]——對角 5-1 合法、轉學生頂上三攻擊位
    const rIds = [];
    for (const oppId of ['obsidian', 'iron-mist', 'sky-hawk']) {
      const id = `R${rIds.length + 1}`;
      roster.members.push(buildRecruitMember(oppId, career.seed, id));
      rIds.push(id);
    }
    lineup = {
      starters: ['A1', 'A2', rIds[0], rIds[1], rIds[2], 'A6'],
      libero: 'AL',
      rotationStart: 0,
      trust: {
        A1: 20, A3: 20, A4: 20, A5: 20, A6: 20,
        [rIds[0]]: RECRUIT_TRUST, [rIds[1]]: RECRUIT_TRUST, [rIds[2]]: RECRUIT_TRUST,
      },
    };
  }
  // ★ G11 保真度修復（TURNOVER 包）★ production 的 lineup 是**存檔狀態**
  // （`schema.js:32`＋`roster.ensureLineup` 落預設陣），一路帶著 trust 跨場跨屆；
  // 治具原本 lineup=null ⇒ `careerState.js:522-524` 每場現算 defaultLineup、trust 全 20。
  // 這裡改成建檔時落一份預設陣持有——第 1 屆先發序與現算逐位等價
  // （招募生一律排在名冊末尾、進不了 defaultStarters＝F2），差別在 trust 有主可跟。
  if (TURNOVER && !lineup) lineup = defaultLineup(roster.members, 'A2', PLAYER_ROLE);
  // ── 跨屆歸因臂的「第 1 屆初值」快照（只在有開臂時才複製，基準臂零成本）──
  // 玩家：屬性／技術兩份分開存（VD_NO_PCARRY／VD_NO_TCARRY 各自獨立可測）
  const player0 = (NO_PCARRY || NO_TCARRY)
    ? { attributes: { ...player.attributes }, techniques: { ...player.techniques } } : null;
  // 名冊：逐成員「入隊當下」的深拷貝（starter 在此、招募生在 settleJoinsMirror 之後補登）
  const memberInit = new Map();
  const noteMembers = (ms) => {
    if (!NO_MCARRY) return;
    for (const m of ms) if (!memberInit.has(m.id)) memberInit.set(m.id, structuredClone(m));
  };
  noteMembers(roster.members);
  // 賽程：第 1 屆賽程項（VD_FIXED_SCHED 逐屆沿用）
  const schedule0 = FIXED_SCHED ? structuredClone(career.schedule) : null;
  // 招募：第 1 屆的 starter 名單 id（VD_NO_RCARRY 只留這些人）
  const starterIds = new Set(roster.members.map((m) => m.id));
  const runSeasons = [];
  for (let season = 1; season <= SEASONS; season += 1) {
    const titlesAtStart = career.titles ?? 0;
    const rec = {
      titlesAtStart,
      wins: Object.fromEntries(matchIds.map((id) => [id, 0])),
      champion: 0,
    };
    runSeasons.push(rec);
    if (!byTitles.has(titlesAtStart)) {
      byTitles.set(titlesAtStart, {
        seasons: 0,
        wins: Object.fromEntries(matchIds.map((id) => [id, 0])),
        champions: 0,
      });
    }
    const tGroup = byTitles.get(titlesAtStart);
    tGroup.seasons += 1;
    for (let mi = 0; mi < matchIds.length; mi += 1) {
      // G1（見 STOP_ON_ELIM 定義處）：止步就收工，與 production 的 nextMatch 一致。
      // 放在迴圈頂端＝連帶讓下面的 TEACH_BEFORE_FINAL 也跟著不發（沒打到決賽就學不到）。
      if (STOP_ON_ELIM && careerStage(career) === 'eliminated') break;
      if (mi === 5) for (const k of TEACH_BEFORE_FINAL) player.techniques[k] = 1;
      const entry = career.schedule[mi];
      // seasonIndex 補接（07-30 批4 送裁項 2）：漏傳＝VD_SEASONS 跨屆臂永遠打第 1 屆
      // 對手（量不到 ace 成長／畢業換臉）；單屆預設 season=1 行為逐值不變
      // VD_FREEZE_OPP=1（歸因臂）＝恆傳 1 ⇒ 對手側的屆數效應（ace 畢業遞補／成長型
      // ace 逐屆加成）全部關掉，量「對手自己變了多少」
      applyLevelRamp(season); // 題 A 實測臂：逐屆 delta（未設 VD_LEVEL_RAMP 時為 no-op）
      const setup = careerMatchSetup(
        career, player, entry, USE_ROSTER ? roster : null, lineup, FREEZE_OPP ? 1 : season,
      );
      // VD_DUMP=1＝逐場診斷傾印（難度重校卷前置：查「第 2 屆 group-3 懸崖」）。
      // **在真實路徑上取值**——印的就是 careerMatchSetup 真的交給 sim 的那份 setup，
      // 不重建任何模型（02 §6.1 條 4）。只在第一條生涯（run===0）印，避免洗版。
      if (DUMP && run === 0) {
        const oppAttrs = setup.teams.B.map((p) => p.attributes);
        const myAttrs = setup.teams.A.map((p) => p.attributes);
        const avg = (arr) => {
          const ks = Object.keys(arr[0]);
          const m = {};
          for (const k of ks) m[k] = +(arr.reduce((t, a) => t + a[k], 0) / arr.length).toFixed(1);
          return m;
        };
        const mean = (arr) => +(Object.values(avg(arr)).reduce((t, v) => t + v, 0)
          / Object.keys(avg(arr)).length).toFixed(1);
        console.log(`[DUMP] 屆${season} ${entry.id.padEnd(14)} 對手=${entry.opponentId.padEnd(11)}`
          + ` 對手均屬性=${String(mean(oppAttrs)).padStart(5)}`
          + ` 我方均屬性=${String(mean(myAttrs)).padStart(5)}`
          + ` 對手情蒐讀我=${setup.scoutRead ? (setup.scoutRead.B?.read ?? '?') : '無'}`
          + ` titles=${career.titles ?? 0}`
          + ` 對手level=${setup.opponent.level}`
          // 難度重校卷 08-03：招募歸因臂量到 Δ 恆為 0，下面兩欄是**真實路徑**的證據
          // ——先發＝真的交給 sim 的那六個 id，名冊＝當下人數。招募生若從不出現在
          // 先發欄，就證明「挖角進來的人根本沒上場」（defaultStarters 依名冊序取首位）
          // G7 驗證用：玩家身高逐屆是否真的揭曉（治具原本三屆不動，見屆界的 G7 修復註）
          + ` 我身高=${Math.round((player.height?.current ?? 0) * 100)}`
          + ` 先發=${setup.teams.A.map((p) => p.id).join(',')}`
          + ` 名冊=${roster.members.length}`);
      }
      const { g, maxDeficit, setStartStamina } = playMatch(setup, entry);
      // W4 Q8：多局系列＝勝負吃 series、分差記局差；bo1 照舊
      const won = (g.series?.winner ?? g.match.winner) === 'A';
      const s = g.series
        ? { A: g.series.setsWon.A, B: g.series.setsWon.B }
        : g.match.score;
      // W4 題7 體力曲線：逐局開局帶累積（bo>1＋體力臂才有樣本）
      if (setStartStamina.length > 1) {
        for (let si = 0; si < setStartStamina.length; si += 1) {
          setCurve[si] = setCurve[si] ?? { sum: 0, n: 0 };
          setCurve[si].sum += setStartStamina[si];
          setCurve[si].n += 1;
        }
        if (setStartStamina.length >= (g.series?.bestOf ?? 9)) fullDistanceGames += 1;
      }
      // E1 雪球哨兵：落後 ≥5 分後翻盤佔比（氣勢上線前後 n=300 對照用）
      if (maxDeficit >= 5) {
        deficit5 += 1;
        if (won) comeback5 += 1;
      }
      if (USE_STAMINA) {
        const onCourt = g.match.rotations.A.map((id) => g.stamina[id] ?? 1);
        stamSum += onCourt.reduce((sum, v) => sum + v, 0) / onCourt.length;
        stamMin = Math.min(stamMin, ...onCourt);
        // P1 驗證需求（07-30）：B 隊同款診斷——「對手有沒有真的掉進重度檔」
        // 是移除 heavyExempt 有無行為效果的判準（costMul 0.6 下可能構造上到不了 25%）
        const onCourtB = g.match.rotations.B.map((id) => g.stamina[id] ?? 1);
        stamSumB += onCourtB.reduce((sum, v) => sum + v, 0) / onCourtB.length;
        stamMinB = Math.min(stamMinB, ...onCourtB);
        if (Math.min(...onCourtB) < 0.25) heavyGamesB += 1;
        stamGames += 1;
        subsUsed += TUNING.SUBS_PER_SET - g.subs.A.remaining;
        // W2(P4) 對手換人樣本量測（拍板：閾值不調只量測，數據留 W4 多局制再判）
        const bUsed = TUNING.SUBS_PER_SET - g.subs.B.remaining;
        oppSubsUsed += bUsed;
        if (bUsed > 0) oppSubGames += 1;
      }
      if (season === 1) {
        if (won) wins[entry.id] += 1;
        margins[entry.id].push(s.A - s.B);
        if (mi === 4 && careerStage(career) !== 'eliminated') reachedFinal += won ? 1 : 0;
      }
      // 題 B：逐屆決賽帶（與上面第 1 屆那行同判準，只是不限屆——第 1 屆兩者必然一致，
      // 可當自驗閘：輸出的「第 1 屆決賽帶」應逐值等於既有的總決賽帶）
      if (mi === 4 && careerStage(career) !== 'eliminated') {
        perSeason[season - 1].reachedFinal += won ? 1 : 0;
      }
      if (won) {
        perSeason[season - 1].wins[entry.id] += 1;
        tGroup.wins[entry.id] += 1;
        rec.wins[entry.id] = 1;
      }
      // 成長：實算 gp → 平均灑點；技術照傳授時程；隊友表現驅動成長（W2；W6 起帶屆數冪等鍵）
      const stats = matchStatsFor(g.events, 'A2', 'A');
      if (season === 1) {
        a2.kills += stats.kills;
        a2.tips += stats.tipKills;
        a2.aces += stats.aces;
        a2.blocks += stats.blockPoints;
        a2.games += 1;
        if (PLAYER_ROLE === 'libero') {
          const lb = boxScoreLFor(g.events, 'A2');
          lBox.digs += lb.digs;
          lBox.assistDigs += lb.assistDigs;
          lBox.rallySaves += lb.rallySaves;
        }
      }
      spendEvenly(player, growthPointsFor(stats, won));
      for (const k of TEACH_AFTER[mi] ?? []) player.techniques[k] = 1;
      if (USE_GROWTH) {
        roster = {
          ...roster,
          members: applyRosterGrowth(roster.members, g.events, 'A', entry.id, season),
        };
      }
      // G11 後半：賽末換人信任演化（production `matchCareer.js:117-138` 同一顆判準）
      if (TURNOVER) lineup = applySubTrustMirror(lineup, g.events, 'A', 'A2');
      // 招募鏡像（正式路徑＝settleCareerMatch 累加→renderCareer 入隊，同節拍）；
      // FULL_ROSTER 臂固定名冊不跑（避免與手動注入的 R1-R3 重複入隊）
      if (USE_ROSTER && !USE_FULL_ROSTER) {
        recruitment = accrueRecruitProgress(recruitment, {
          opponentId: entry.opponentId, matchId: entry.id, won,
          events: g.events, playerId: 'A2', myTeam: 'A',
        });
        ({ roster, recruitment, lineup } = settleJoinsMirror(
          roster, recruitment, career.seed, season, joinLog, lineup,
        ));
        noteMembers(roster.members); // 新入隊者的「入隊當下」快照（VD_NO_MCARRY 用）
      }
      // scouting 跨場累積（宿敵記憶）；戰績照實記（全國賽輸了也繼續模擬後段取數據）
      career = mergeScouting(career, entry.opponentId, g.scoutTally.A2);
      career = recordResult(career, {
        matchId: entry.id, won, scoreFor: s.A, scoreAgainst: s.B,
      });
    }
    // 冠軍線：六場全部真實串接下，國賽三連勝才算
    const natWins = career.results.slice(3).filter((r) => r.won).length;
    perSeason[season - 1].natWinsSum += natWins; // 題 B：連續量指標（見 perSeason 定義處）
    if (natWins === 3) {
      perSeason[season - 1].champions += 1;
      tGroup.champions += 1;
      rec.champion = 1;
      if (season === 1) champions += 1;
    }
    if (season < SEASONS) {
      // ★ F4 保真度修復（2026-08-03，難度重校卷）★ 原本是 `advanceSeason(career)`＝**漏傳
      // seasonIndex**，與 production 不一致：`careerStore.js:165` 傳的是 `index + 1`，
      // 於是 `nationalLadderFor(2)`（`schedule.js:23-32`）讓第 2 屆決賽對手是**曜石 60**、
      // 天鷹 72 改掛準決賽。漏傳 ⇒ 治具走預設階梯 ⇒ 第 2 屆決賽仍是天鷹 72
      // ⇒ **治具的第 2 屆比真實遊戲難**，量到的第 2 屆奪冠率是**低估**。
      // 這個缺口由跨屆難度因果分解 agent 發現（F4），本檔的三屆量測全部受影響、已重跑。
      const seedBeforeAdvance = career.seed; // ＝production RMW 讀到的 prev.season.seed
      career = advanceSeason(career, { seasonIndex: season + 1 });
      // ★ F1／G6／G11 保真度修復 ★ production 的屆界不只換賽程——同一次 RMW 還做了
      // 畢業換血＋等候遞補＋來投保底＋預設陣重排（`careerStore.js:169-257`）。
      // 治具整段沒有 ⇒ grade 3 的大山／阿烈打滿三屆、名冊只進不出、trust 永遠 20。
      if (TURNOVER) {
        let turnover;
        ({ roster, recruitment, lineup, turnover } = applyTurnoverMirror({
          roster,
          recruitment,
          lineup,
          endingSeason: season,
          oldSeed: seedBeforeAdvance,
          newSeed: career.seed,
          playerRole: PLAYER_ROLE,
        }));
        // 換血量測（純記帳，不進模擬）：證明這條路真的有咬合，並量 G6 兩條分支的觸發率
        turnoverStats.boundaries += 1;
        turnoverStats.graduates += turnover.graduates.length;
        turnoverStats.freshmen += turnover.freshmen.length;
        turnoverStats.admitted += (turnover.admitted ?? []).length;
        if (turnover.walkOn) turnoverStats.walkOn += 1;
        // 等候名單遞補者＝挖角成功只是慢了一屆 ⇒ 記進招募流動統計（入隊屆＝下一屆）
        for (const key of recruitment.recruited) {
          if (!joinLog.some((j) => j.key === key)) joinLog.push({ key, season: season + 1 });
        }
        noteMembers(roster.members); // 新生／來投者的「入隊當下」快照（VD_NO_MCARRY 用）
      }
      // ★ G7 保真度修復（掛 VD_FAITHFUL，與 F1 同一組屆界鏡像）★
      // production 在同一次 RMW 揭曉下一屆身高（`careerStore.js:227`
      // `revealHeightForSeason`）——曲線在創角時就預生成在 `player.height.plan`，
      // 屆界只是揭曉。治具整段沒有 ⇒ **玩家三屆身高不動**。
      // ★ 這是全清單裡**唯一逐屆放大且方向相反**的漏項★：G1/F1/G4/G5 都讓治具高估玩家隊
      // （修好＝難度上升），只有本項是低估玩家（修好＝難度下降）。
      // ⇒ 補 F1 而不補它會**過度校正**，兩者必須一起進基準。
      if (FAITHFUL) {
        const revealed = revealHeightForSeason(player, season + 1);
        if (revealed.reveal) player = revealed.player;
      }
      // ── 跨屆歸因臂：屆界切斷（全關＝下面整段是 no-op，基準臂逐值不變）──
      if (NO_PCARRY) player.attributes = { ...player0.attributes };
      if (NO_TCARRY) player.techniques = { ...player0.techniques };
      if (NO_RCARRY) {
        // 招募生移出名冊、進度歸零＝下一屆從純 starter 名冊重新招募
        roster = { ...roster, members: roster.members.filter((m) => starterIds.has(m.id)) };
        recruitment = { progress: {}, recruited: [], expelled: [] };
      }
      if (NO_MCARRY) {
        // 逐成員倒回「入隊當下」快照（含 growth.xp/log/grade）；名單本身不動
        roster = {
          ...roster,
          members: roster.members.map(
            (m) => (memberInit.has(m.id) ? structuredClone(memberInit.get(m.id)) : m),
          ),
        };
      }
      if (NO_SCARRY) career = { ...career, scouting: {} };
      if (FIXED_SCHED) career = { ...career, schedule: structuredClone(schedule0) };
    }
  }
  jsonRuns.push({ seed: seed0, seasons: runSeasons });
  for (const j of joinLog) {
    joinStats[j.key] = joinStats[j.key] ?? { joined: 0, seasonSum: 0 };
    joinStats[j.key].joined += 1;
    joinStats[j.key].seasonSum += j.season;
  }
  if (PAIRED_FILE) {
    // 第 1 屆語義（與 wins/champions 一致）：逐場勝負 ＋ 是否奪冠
    const first = career.results.slice(0, matchIds.length);
    perRun.push({
      seed: career.seed,
      wins: Object.fromEntries(matchIds.map((id) => {
        const r = first.find((x) => x.matchId === id);
        return [id, r ? (r.won ? 1 : 0) : null];
      })),
      champion: first.slice(3).filter((r) => r.won).length === 3 ? 1 : 0,
    });
  }
  rosterEndSizeSum += roster.members.length + 1; // ＋玩家 1 席（rosterCount 語義）
}

const pct = (n) => `${Math.round((n / RUNS) * 100)}%`;
const avg = (a) => (a.reduce((s, v) => s + v, 0) / a.length).toFixed(1);
const armName = [
  USE_MANAGE ? '體力＋自動管理' : USE_STAMINA ? '體力＋無管理' : null,
  USE_MOMENTUM ? '氣勢' : null,
  HEIGHT_CM ? `身高${HEIGHT_CM}` : null,
  PLAYER_ROLE !== 'outside' ? `位置${PLAYER_ROLE}${L_MODE ? `·${L_MODE}` : ''}` : null,
  FORCE_BO ? `bo${FORCE_BO} 強制` : MULTISET ? '多局制（賽程推導）' : null,
  USE_CALL ? '要球近似' : null,
  USE_RIVAL ? '宿敵反讀' : null,
  process.env.VD_NO_BREAK_RECOV === '1' ? '裸延續（無局間恢復）' : null,
  LEVEL_DELTA ? `對手level${LEVEL_DELTA > 0 ? '+' : ''}${LEVEL_DELTA}` : null,
  LEVEL_RAMP.length ? `對手level逐屆[${LEVEL_RAMP.join('/')}]` : null,
  ALL_OFF ? '跨屆全切' : null,
  !ALL_OFF && NO_PCARRY ? '切玩家屬性帶入' : null,
  !ALL_OFF && NO_TCARRY ? '切玩家技術帶入' : null,
  !ALL_OFF && NO_MCARRY ? '切隊友成長帶入' : null,
  !ALL_OFF && NO_RCARRY ? '切招募帶入' : null,
  !ALL_OFF && NO_SCARRY ? '切情蒐帶入' : null,
  !ALL_OFF && FREEZE_OPP ? '凍結對手屆數效應' : null,
  !ALL_OFF && FIXED_SCHED ? '凍結賽程' : null,
].filter(Boolean).join('＋') || '基準（W7 全關）';
console.log(`\n=== 勝率曲線（${RUNS} 次生涯模擬；臂＝${armName}；A2=AI 代打基準）===`);
for (const id of matchIds) {
  console.log(`${id.padEnd(16)} 勝率 ${pct(wins[id]).padStart(4)}  平均分差 ${avg(margins[id])}`);
}
console.log(`A2 場均（身高體感代理）：殺球 ${(a2.kills / a2.games).toFixed(2)}｜吊球 ${(a2.tips / a2.games).toFixed(2)}`
  + `｜ACE ${(a2.aces / a2.games).toFixed(2)}｜攔網得分 ${(a2.blocks / a2.games).toFixed(2)}`
  + `（A2 個人／每局——非全隊值；7.2 查證 07-30：全隊每局 ≈2.17 在真實帶 1.5–2.5 內，`
  + `勿再拿本欄與全隊對照值比，A-8）`);
if (PLAYER_ROLE === 'libero') {
  console.log(`A2 L 三欄場均（契約=boxScoreL）：起球 ${(lBox.digs / a2.games).toFixed(2)}`
    + `｜助攻一傳 ${(lBox.assistDigs / a2.games).toFixed(2)}`
    + `｜rally 續命 ${(lBox.rallySaves / a2.games).toFixed(2)}`);
}
console.log(`\n決賽帶（真實連勝踏進決賽）：${pct(reachedFinal)}`);
console.log(`奪冠率（國賽三連勝）：${pct(champions)}`);
const totalMatches = RUNS * SEASONS * matchIds.length;
console.log(`逆轉哨兵（落後≥5 後翻盤，全 ${totalMatches} 場）：樣本 ${deficit5} 場、翻盤 ${comeback5}`
  + `（${deficit5 > 0 ? Math.round((comeback5 / deficit5) * 100) : 0}%）`);
if (USE_STAMINA) {
  console.log(`體力診斷：A 隊終場場上均值 ${(stamSum / stamGames).toFixed(2)}、`
    + `單場最低 ${stamMin.toFixed(2)}、場均換人 ${(subsUsed / stamGames).toFixed(2)} 人次`);
  console.log(`對手換人樣本（W2 量測）：全 ${stamGames} 場共 ${oppSubsUsed} 人次、`
    + `有換人場數 ${oppSubGames}（${stamGames > 0 ? Math.round((oppSubGames / stamGames) * 100) : 0}%）`);
  console.log(`體力診斷（B 隊）：終場場上均值 ${(stamSumB / stamGames).toFixed(2)}、`
    + `單場最低 ${stamMinB.toFixed(2)}、終場有人 <25% 的場數 ${heavyGamesB}/${stamGames}`);
}
// W4 題7 體力曲線（bo>1＋體力臂）：各局開局的 A 隊場上均值——校準目標＝
// 決勝局開局帶明顯低於首局、但高於裸延續（VD_NO_BREAK_RECOV=1 對照）
if (setCurve.length > 1) {
  const row = setCurve
    .map((c, i) => `第${i + 1}局 ${(c.sum / c.n).toFixed(3)}(n=${c.n})`)
    .join('　');
  console.log(`\n=== 體力曲線（局開局帶；局間恢復 ${STAMINA.RECOV_SET_BREAK}）===\n${row}`);
  console.log(`打滿場數：${fullDistanceGames}`);
}

if (SEASONS > 1) {
  console.log(`\n=== 跨屆勝率（VD_SEASONS=${SEASONS}，每屆 ${RUNS} 條生涯）===`);
  for (let s = 0; s < SEASONS; s += 1) {
    const row = matchIds.map((id) => pct(perSeason[s].wins[id]).padStart(4)).join(' ');
    console.log(`第 ${s + 1} 屆  ${row}  奪冠 ${pct(perSeason[s].champions)}`);
  }
  // 題 B（Sawmah 2026-08-03 拍板）：奪冠率解析力不足 ⇒ 逐屆補兩個指標。
  // 決賽帶＝真實連勝踏進決賽；國賽勝場＝三場累計勝場數平均（0–3，連續量、解析力最好）。
  console.log(`\n=== 逐屆驗收指標（題 B：奪冠率的 SE 蓋過錨 3a 的 3pp 目標間距）===`);
  for (let s = 0; s < SEASONS; s += 1) {
    const band = pct(perSeason[s].reachedFinal).padStart(4);
    const nw = (perSeason[s].natWinsSum / RUNS).toFixed(2);
    console.log(`第 ${s + 1} 屆  決賽帶 ${band}　國賽勝場 ${nw}/3`);
  }
  console.log(`（自驗閘：第 1 屆決賽帶應逐值等於上方總計的 ${pct(reachedFinal)}）`);
  // Q2 覆蓋率（難度重校卷 2026-08-03）：TITLE_LEVEL_BONUS 只在 titles>0 時生效，
  // 所以「這個旋鈕實際碰得到多少生涯」＝有多少條生涯在某一屆開頭 titles>0。
  // 分母兩種都印：屆槽（RUNS×(SEASONS-1) 個可能被加成的屆）與生涯條數。
  const slotsHot = jsonRuns.reduce(
    (n, r) => n + r.seasons.filter((s) => s.titlesAtStart > 0).length, 0,
  );
  const slotsAll = RUNS * SEASONS;
  const runsHot = jsonRuns.filter((r) => r.seasons.some((s) => s.titlesAtStart > 0)).length;
  console.log(`\n=== TITLE_LEVEL_BONUS 覆蓋率（Q2）===`);
  console.log(`屆槽：${slotsHot}/${slotsAll}（${(slotsHot / slotsAll * 100).toFixed(1)}%）的屆開頭 titles>0`);
  console.log(`生涯：${runsHot}/${RUNS}（${(runsHot / RUNS * 100).toFixed(1)}%）的生涯三屆內至少觸發過一次`);
  console.log('\n=== 衛冕曲線（依屆初 titles 分組；TITLE_LEVEL_BONUS 收斂性）===');
  for (const t of [...byTitles.keys()].sort((a, b) => a - b)) {
    const gp = byTitles.get(t);
    const p = (n) => `${Math.round((n / gp.seasons) * 100)}%`.padStart(4);
    const row = matchIds.map((id) => p(gp.wins[id])).join(' ');
    console.log(`titles=${t}（${String(gp.seasons).padStart(4)} 屆） ${row}  奪冠 ${p(gp.champions)}`);
  }
  if (TURNOVER) {
    const per = (n) => (n / Math.max(1, turnoverStats.boundaries)).toFixed(2);
    console.log('\n=== 屆末換血（F1／G6；production careerStore.advanceSeason 鏡像）===');
    console.log(`屆界 ${turnoverStats.boundaries} 次｜畢業 ${turnoverStats.graduates} 人次（${per(turnoverStats.graduates)}/屆）`
      + `｜新生 ${turnoverStats.freshmen} 人次（${per(turnoverStats.freshmen)}/屆）`);
    console.log(`等候名單遞補 ${turnoverStats.admitted} 人次（${per(turnoverStats.admitted)}/屆）`
      + `｜來投保底觸發 ${turnoverStats.walkOn} 次`
      + `（${(turnoverStats.walkOn / Math.max(1, turnoverStats.boundaries) * 100).toFixed(1)}% 的屆界）`);
  }
  if (USE_ROSTER && !USE_FULL_ROSTER) {
    console.log('\n=== 招募跨屆流動（打好打滿＝上緣；逐出未建模）===');
    for (const key of Object.keys(RECRUIT_CONDS)) {
      const j = joinStats[key];
      const rate = j ? pct(j.joined) : '  0%';
      const meanSeason = j ? (j.seasonSum / j.joined).toFixed(1) : '—';
      console.log(`${key.padEnd(16)} 入隊率 ${rate.padStart(4)}  平均入隊屆 ${meanSeason}`);
    }
    console.log(`名冊終量平均 ${(rosterEndSizeSum / RUNS).toFixed(1)}/12（含玩家）`);
  }
}

// VD_JSON：逐 run／逐屆結果落檔（跨屆歸因的配對分析用；各臂 seed 序列相同 ⇒ 同索引即配對）
if (JSON_OUT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(JSON_OUT, `${JSON.stringify({
    label: armName, runs: RUNS, seasons: SEASONS, matchIds, perRun: jsonRuns,
  })}\n`);
  console.log(`\n=== 逐屆結果已落檔 ${JSON_OUT}（${jsonRuns.length} 條 × ${SEASONS} 屆）===`);
}

// ★ 配對同種子輸出（裁定書 §4.3 的形式要求）★
if (PAIRED_FILE) {
  const { existsSync, readFileSync, writeFileSync } = await import('node:fs');
  const label = `${armName}｜RUNS=${RUNS}｜VD_HEIGHT=${HEIGHT_CM ?? '基準'}｜VD_ROLE=${PLAYER_ROLE}`;
  if (!existsSync(PAIRED_FILE)) {
    writeFileSync(PAIRED_FILE, `${JSON.stringify({ label, matchIds, perRun }, null, 2)}
`);
    console.log(`
=== 配對基準已寫入 ${PAIRED_FILE} ===`);
    console.log(`   ${label}｜逐 seed 樣本 ${perRun.length} 條`);
    console.log('   再跑一次同一條指令即會輸出逐 seed 差值（未改 src ⇒ 全 0 可驗）');
  } else {
    const base = JSON.parse(readFileSync(PAIRED_FILE, 'utf8'));
    const byS = new Map(base.perRun.map((r) => [r.seed, r]));
    const paired = perRun.filter((r) => byS.has(r.seed));
    console.log(`
=== 配對同種子差值（基準 ${PAIRED_FILE}）===`);
    console.log(`   基準：${base.label}`);
    console.log(`   本次：${label}`);
    console.log(`   配對成功 ${paired.length}/${perRun.length} 條`
      + (paired.length === perRun.length ? '' : ' ⚠ 有 seed 對不上，基準與本次的 RUNS 不同？'));
    if (!paired.length) {
      console.log('   🔴 零配對 ⇒ 無法比較');
    } else {
      // 配對差值的 SE ＝ SD(逐條差值) / sqrt(n)。這才是裁定書要的量。
      const stat = (get) => {
        const d = paired.map((r) => get(r) - get(byS.get(r.seed)));
        const m = d.reduce((a, b) => a + b, 0) / d.length;
        const sd = d.length > 1
          ? Math.sqrt(d.reduce((a, v) => a + (v - m) ** 2, 0) / (d.length - 1)) : 0;
        return { m, se: d.length ? sd / Math.sqrt(d.length) : NaN, changed: d.filter((v) => v !== 0).length };
      };
      const fmt = (x) => `${(x.m * 100 >= 0 ? '+' : '')}${(x.m * 100).toFixed(1)}pp ± ${(x.se * 100).toFixed(1)}`;
      for (const id of matchIds) {
        const x = stat((r) => r.wins[id] ?? 0);
        console.log(`   Δ${String(id).padEnd(15)} ${fmt(x).padStart(18)}`
          + `　（逐條有變的 ${x.changed}/${paired.length}）`);
      }
      const ch = stat((r) => r.champion);
      console.log(`   **Δ奪冠率        ${fmt(ch).padStart(18)}**　（逐條有變的 ${ch.changed}/${paired.length}）`);
      const allZero = matchIds.every((id) => stat((r) => r.wins[id] ?? 0).changed === 0)
        && ch.changed === 0;
      console.log(allZero
        ? '   ✅ 逐 seed 全等（未改 src 時應為此結果＝配對模式自驗通過）'
        : '   ⚠ 有差異——若本次未改 src，配對模式本身有問題');
    }
  }
}
