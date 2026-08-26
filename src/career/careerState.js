// Phase 2 資料層 — 生涯狀態（純函式；零 three.js/DOM/存檔 IO）
// 存讀在 careerStore.js；本檔只管 career 物件的建立/推進/序列化。
// 生涯結構（phase2-decisions-RESOLVED.md 第 1 題）：
// 地區賽小組循環（保底 3 場，輸球不中斷）→ 全國賽八強 4 隊單循環（保底 3 場，
// 輸球不中斷；前二名晉級）→ 準決賽／決賽單淘汰（輸球＝止步、決賽勝＝冠軍）
// ——八強循環為 2026-08-09「循環賽卷」改制，理由見 schedule.js 該段註解
import { createPlayer, ATTRIBUTE_KEYS } from '../sim/player.js';
import { createDefaultTeams } from '../sim/game.js';
import { TRUST_DYN } from '../sim/trust.js';
import { OPPONENTS, opponentById } from './opponents.js';
// 大學卷批 6：大學對手池（與 opponents 同構的另一張表；高中那張一行不動）
import { universityById } from './universities.js';
import { corporationById } from './corporations.js';
// 職業章批 2（2026-08-26）：第四張對手表——同大學卷批 6／企業章批 2 的補全慣例
import { proTeamById } from './proTeams.js';
// 職業章批 3（2026-08-26）：季後賽場次的 round 標記——seasonConcluded 的 pro 分支要用
import { PLAYOFF_ROUND } from './proSchedule.js';
import { kitFor } from './teamKit.js';
import { defaultLineup, effectiveOrder, trustOf, DEFAULT_LIBERO_ID, SLOT_ROLES } from './lineup.js';
import {
  buildSchedule, nationalLegFor, roundRobinTable, RR_ADVANCE,
} from './schedule.js';
import { TRANSFER_ASKED_EV, TRANSFER_USED_EV } from './positionEvents.js';
import { initialHeightState } from './heightGrowth.js';
import { withAceGrowth } from './aceGrowth.js';

// v1（僅小組 3 場）→ v2（全國賽入賽程）→ v3（成長點數 growthPoints）；deserialize 自動遷移
export const CAREER_VERSION = 3;

// 第 1 屆小組賽固定模板（教學鏈綁定這三隊的場次——見 schedule.js 檔頭的設計偏差註）
const SEASON1_GROUP = ['north-tech', 'white-wave', 'obsidian'];

// ★★ 2026-08-11 難度重校卷：第 1 屆循環組改明文模板 ★★
// 舊狀態＝抽籤的結構性死碼：池扣掉鐵霧（固定席）與淘汰賽兩隊（曜石／天鷹）之後只剩
// 北原·白浪·青嵐·黑松，而排序鍵「小組沒遇過的優先」讓青嵐與黑松**必中**，再依 level
// 升冪把**黑松 67 推到第三場** ⇒ 每個玩家的第 1 屆都被排了一場幾乎必敗的硬仗
// （`schedule.js:71-77` 已自陳「實測 3000 seeds 逐值相同、要調第 1 屆難度就是調這裡」）。
// ★病灶的量測（`docs/snapshots/difficulty-recal-baseline-2026-08-11.txt`）★
//   第 1 屆國賽路徑：qf 鐵霧 14%／rr2 青嵐 91%／**rr3 黑松 12%**／sf 曜石 11%
//   ⇒ 循環三場只穩贏一場、拿不到前二 ⇒ **決賽帶僅 11%、奪冠 0%**（違反錨 1「個位數」）。
//   ⚠ 掃描證實**不是決賽打不贏**：把天鷹第 1 屆降到 66（比黑松還弱）決賽帶仍是 11%、
//     戰績 0/11→1/11（n=11 分不出）⇒ **瓶頸在進不進得去決賽，不在決賽本身**。
// 使用者裁定（08-11）：換成較弱的對手。白浪 57 取代黑松 67（小組已遇過一次＝再戰敘事）。
// ⚠ 副作用要一起看：黑松因此不出現在第 1 屆 ⇒ 該隊的招募窗少一屆，改動後要驗 joinStats。
const SEASON1_RR = ['gale-shore', 'white-wave'];

// 完整賽程：小組單循環 3 場（輸球照樣打下一場）＋全國賽（八強 4 隊單循環 3 場 →
// 前二名晉級準決賽 → 決賽）。準決賽刻意再遇小組對手曜石體中——宿敵種子
// （stage 5 scouting 記憶）掛這裡。
// 2026-08-09 循環賽卷：國賽段改由 `nationalLegFor` 生成（循環組要抽籤 ⇒ 吃 seed），
// 所以第 1 屆賽程不再是一份靜態常數表，而是「固定小組 ＋ 決定論國賽段」。
function season1Schedule(seed) {
  return [
    ...SEASON1_GROUP.map((opponentId, i) => ({
      id: `group-${i + 1}`, stage: 'group', opponentId, label: '',
    })),
    ...nationalLegFor({
      seed, seasonIndex: 1, groupIds: SEASON1_GROUP, rrOverride: SEASON1_RR,
    }),
  ];
}

export function opponentName(opponentId) {
  // 大學卷批 6：大學章的對手在另一張表（兩張表的 id 不重疊）
  // 企業章批 2：第三張表也算數（同大學卷批 6 對 universities 的補全）
  // 職業章批 2：第四張表也算數（同上補全慣例——B4 分母清單第 1 項）
  return opponentById(opponentId)?.name ?? universityById(opponentId)?.name
    ?? corporationById(opponentId)?.name ?? proTeamById(opponentId)?.name ?? opponentId;
}

// seed＝生涯種子：每場比賽種子由 matchSeed 決定論導出（同生涯同場次可重現）
export function createCareer({ seed, playerName = '小夢' } = {}) {
  if (!Number.isFinite(seed)) throw new Error('createCareer 需要數值 seed');
  return {
    version: CAREER_VERSION,
    seed: seed >>> 0,
    playerName,
    schedule: season1Schedule(seed >>> 0),
    results: [], // { matchId, opponentId, won, scoreFor, scoreAgainst, gp?, stats? }
    growthPoints: 0, // 未分配的成長點數（stage 3；花點結果落在 Player 上）
  };
}

// 本屆循環組戰況（未採用循環制的舊存檔＝null）。UI 名次板與 careerStage 共用同一份
export function nationalGroupTable(career) {
  return roundRobinTable({
    seed: career.seed, schedule: career.schedule, results: career.results,
  });
}

// 晉級判準的**單一定義**（前二名）——careerStage 與任何呼叫端都走這一顆，
// 不要在別處再寫一次 `rank <= 2`
function rrAdvanced(table) {
  return !!table && table.playerRank > 0 && table.playerRank <= RR_ADVANCE;
}

// 生涯階段（由結果衍生，不存欄位——避免狀態不同步）：
// group＝小組賽進行中；national＝小組完賽、全國賽進行中；
// eliminated＝止步；champion＝決賽勝
// ★ 2026-08-09 循環賽卷：止步語意分兩段 ★
//   ・循環組（`round === 'rr'`）＝**輸球不止步**，三場打滿後看名次（前二晉級）
//   ・淘汰賽（準決/決賽，以及沒有 `round` 欄位的舊存檔國賽場）＝一敗即止步
//   舊存檔的國賽項全部沒有 `round` ⇒ 整段走淘汰賽分支 ⇒ 行為逐值不變、零遷移。
// ★★ 檢查順序是這個函式的正確性核心，動之前先讀完這段（2026-08-09 覆審 H1）★★
// **所有止步條件一律排在 champion 之前**。原因：這些條件不是互斥的——一份存檔可以
// 同時「循環三敗」與「national-final 有一筆勝場」（手改存檔、匯入的壞檔、或任何繞過
// `nextMatch` 直接呼叫 `recordResult` 的路徑）。champion 若先判，那份存檔會被讀成奪冠，
// `advanceSeason` 還會照發 `titles`＋1 ⇒ 對手全屬性 +3 的衛冕難度也跟著發出去。
// 覆審探針實測：循環三敗後硬記準決＋決賽勝 → 舊順序回 champion／titles=1。
export function careerStage(career) {
  const entryOf = (matchId) => career.schedule.find((m) => m.id === matchId);
  // ① 淘汰賽敗（含舊存檔無 round 欄位的國賽場）＝止步
  const koLoss = career.results.some((r) => {
    const e = entryOf(r.matchId);
    return !r.won && e?.stage === 'national' && e.round !== 'rr';
  });
  if (koLoss) return 'eliminated';
  const groupDone = career.schedule
    .filter((m) => m.stage === 'group')
    .every((m) => career.results.some((r) => r.matchId === m.id));
  // ② 循環組打滿而未進前二＝這一屆到此為止（賽打完了才止步，不是輸一場就回家）
  const rr = nationalGroupTable(career);
  if (groupDone && rr && rr.complete && !rrAdvanced(rr)) return 'eliminated';
  // ③ 走到這裡才輪得到奪冠；另加 groupDone 守衛——小組沒打完卻有決賽勝場的存檔
  //    是壞資料，讓它回 'group' 從缺的那一場續打，比宣告冠軍安全
  // ★ 2026-08-09 二輪覆審補洞：champion 還要求**循環組完賽且晉級** ★
  //   一輪修復只把「循環三敗＋硬記決賽勝」擋掉了；二輪探針找到殘餘路徑——
  //   循環組**完全沒打**（0/3）＋直接記 national-final 勝 ⇒ 條件②的 `rr.complete`
  //   不成立、擋不住 ⇒ 舊寫法照樣回 champion。冠軍必須走完整條路：
  //   循環打滿、名次前二，才輪得到看決賽勝場。舊存檔（無 rr、rr===null）沿
  //   `!rr` 分支照舊判定，行為逐值不變。
  const rrOk = !rr || (rr.complete && rrAdvanced(rr));
  if (groupDone && rrOk && career.results.some((r) => r.matchId === 'national-final' && r.won)) {
    return 'champion';
  }
  if (!groupDone) return 'group';
  return 'national';
}

// 債 C（2026-08-25，acceptance-uni-finale-align.md）：「這一季打完了沒」的
// **單一事實來源**——章節偵測走賽程 schema（`round==='league'` 只在 uniSchedule
// 產生、高中是 'rr'，events.js:643 既有不變式），career view 自足、不用外帶 chapter。
// 大學＝league 全部有結果（league 空的壞存檔回 false＝視為進行中，安全回退，
// 與配色卷 E5 的裁定一致）；高中＝careerStage 收束事實。
// ★careerStage 仍是高中 schema 專用★（'group'/'national'/'national-final'）——
// 它對大學賽程恆回 'national'，季收束一律問這一顆，不要再各自手抄 league 判斷式。
export function seasonConcluded(career) {
  // 企業章批 3（A3-1）：`'corp'` 比照 `'league'`——長循環章的收束＝該章場次全有結果。
  // 兩個標記互斥（一份賽程只會有其中一種），合在同一個 filter 不會互相污染。
  const longSeason = (career.schedule ?? [])
    .filter((m) => m?.round === 'league' || m?.round === 'corp');
  if (longSeason.length > 0) {
    return longSeason.every((m) => (career.results ?? []).some((r) => r.matchId === m.id));
  }
  // 職業章批 3（C3）：pro 分支——單一定義，不得另立第二顆判斷式。
  // 未進季後賽＝循環（round==='pro'）全有結果；進季後賽＝循環＋玩家的季後賽場次
  // （round==='semi'/'final'，含準決敗）全有結果。★這條假設 schedule 已經是「長好的」★
  // ——季後賽場次的長出（`proSchedule.growProSchedule`）與 `career.results` 的寫入
  // 是同一次 `careerStore.saveCareer` RMW 原子完成（見該檔），所以這裡讀到的
  // schedule 恆是當下 results 對應的最終形狀，不會有「玩家贏了準決賽但決賽還沒長出來」
  // 這種會被本函式誤判成「已收束」的中間態持久化到存檔裡。
  const proLeague = (career.schedule ?? []).filter((m) => m?.round === 'pro');
  if (proLeague.length > 0) {
    const hasResult = (id) => (career.results ?? []).some((r) => r.matchId === id);
    if (!proLeague.every((m) => hasResult(m.id))) return false;
    const playoffRows = (career.schedule ?? []).filter(
      (m) => m?.round === PLAYOFF_ROUND.SEMI || m?.round === PLAYOFF_ROUND.FINAL,
    );
    return playoffRows.every((m) => hasResult(m.id));
  }
  return ['eliminated', 'champion'].includes(careerStage(career));
}

// 下一場：小組賽依序保底 3 場；循環組保底 3 場（輸球照打）；
// 淘汰賽逐輪推進、落敗/未晉級/奪冠＝null（生涯弧線收束）
export function nextMatch(career) {
  const stage = careerStage(career);
  if (stage === 'eliminated' || stage === 'champion') return null;
  return (
    career.schedule.find((m) => !career.results.some((r) => r.matchId === m.id)) ?? null
  );
}

export function careerRecord(career) {
  let wins = 0;
  for (const r of career.results) if (r.won) wins += 1;
  return { wins, losses: career.results.length - wins, played: career.results.length };
}

// 每場比賽的 sim 種子：FNV-1a 混生涯種子與場次 id——場場不同、同生涯可重現
export function matchSeed(career, matchId) {
  let h = (career.seed ^ 0x811c9dc5) >>> 0;
  for (const ch of String(matchId)) {
    h = (h ^ ch.codePointAt(0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 1000000007) || 1;
}

// W5 賽季輪迴（拍板 07-23：難度綁成就不綁屆數）：季末（奪冠/止步）→ 進入下一屆。
// 保留：名冊成長/招募進度/宿敵記憶/技巧/已播事件（全在 career 之外或 spread 保留）；
// 重置：賽程與戰績（新一屆八場：小組 3＋循環 3＋準決＋決賽）；seed 決定論衍生
// （同存檔重演一致、每屆場次種子不同）。
// 止步＝對手維持原強度（你帶著成長回來——失敗的回報是變強重來，不是更難）；
// 奪冠＝titles+1 → 衛冕屆對手升級（TITLE_LEVEL_BONUS×titles——全國都在研究衛冕軍）。
export const TITLE_LEVEL_BONUS = 3; // 每座冠軍讓對手全屬性 +3（平衡幅度 W6 複核）
// W6 A2：第 2 屆起小組賽程輪抽（屆間輪換＋指定邀請 invitedId；國賽階梯固定）。
// 第 1 屆恆為故事模板（createCareer）——教學鏈綁定北原/白浪/曜石場次（schedule.js 註）
// 4.5A：opts.seasonIndex＝下一屆屆數（宿敵保底階梯——第 2 屆天鷹改掛準決賽；
// 省略＝預設階梯＝既有行為不變，舊呼叫端/測試零遷移）
// 下一屆種子的衍生鏈（單一定義，大二卷批 1 抽出）：高中與大學屆間推進共用——
// 同存檔重演一致、每屆種子不同。抄第二份公式＝兩章的決定論鏈可能靜默分岔。
export function deriveSeasonSeed(seed) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ 0x85ebca6b, 16777619) >>> 0;
  return (h % 1000000007) || 1;
}

export function advanceSeason(career, { invitedId = null, seasonIndex = null } = {}) {
  // 債 C 顯式守衛（2026-08-25）：本函式是**高中版**屆間推進（buildSchedule＝高中
  // 賽程）。大學屆間推進走 careerStore.advanceSeason 的大學分支（大二卷批 1 接線，
  // uniSchedule 重建＋uniTurnover 換血），不進這裡——這道守衛擋的是「拿高中的
  // buildSchedule 幫大學生蓋高中賽程」（測試＝uni-season-concluded C4）。
  // 企業章批 1（2026-08-25）：`'corp'` 比照 `'league'`——同一種錯的第三章版本
  //（企業章階段一只有一年、chapterCompleted 即封頂，更沒有理由進到高中的推進）。
  // 職業章批 1（2026-08-26）：`'pro'` 比照 `'league'`／`'corp'`——同一種錯的第四章版本。
  if ((career.schedule ?? []).some((m) => m?.round === 'league' || m?.round === 'corp' || m?.round === 'pro')) return career;
  if (!seasonConcluded(career)) return career; // 賽季未結束＝不動（單一定義，債 C）
  const stage = careerStage(career); // 高中 schema：titles 記帳仍要分冠軍/止步
  const seed = deriveSeasonSeed(career.seed); // 決定論鏈：下一屆種子由本屆種子衍生
  const { pendingMatch, ...base } = career;
  return {
    ...base,
    // B1 修復（試玩回饋 0730 #2）：轉位旗標「逐屆重置」（positionEvents.js 註解的承諾）
    // 在這裡兌現——只濾兩個當屆旗標，其餘 events（劇情錨點等）跨屆有效照舊帶入
    events: (base.events ?? []).filter(
      (e) => e !== TRANSFER_ASKED_EV && e !== TRANSFER_USED_EV,
    ),
    seed,
    schedule: buildSchedule({
      seed,
      invitedId,
      seasonIndex,
      prevGroupIds: career.schedule
        .filter((m) => m.stage === 'group')
        .map((m) => m.opponentId),
    }),
    results: [],
    titles: (career.titles ?? 0) + (stage === 'champion' ? 1 : 0),
  };
}

// 開賽標記（拍板 07-22 堵中途退出）：pending 落檔＝這場開打了；
// 完賽由 recordResult 清除；沒完賽就回生涯畫面＝resolveForfeit 記棄賽敗
export function markPending(career, matchId) {
  return { ...career, pendingMatch: matchId };
}

// 棄賽裁決：pending 未完賽＝記敗（無成長點）；已完賽＝只清標記
// ★ 比分的**單位隨賽制而定** ★ bo1 記 0:25（分數）；多局賽記 0:N（**局數**）——
// `settleCareerMatch` 在多局賽寫進 results 的就是局數（`app/matchCareer.js:93`），
// 棄賽卻一律寫 25 的話，同一個欄位在同一份賽程裡有兩種單位。
// 大學卷批 6 的實例：大學聯賽是 bo3，一次中途離開會讓積分表把「局差」灌成 ±25
//（勝點那一層剛好沒事，所以更難發現），一場棄賽就足以決定整季名次。
// 這是 `02 §6.1` 第 2 條「同名不同義」的正宗案例——修在源頭，不是在讀的那一端補救。
export function resolveForfeit(career) {
  const pid = career.pendingMatch;
  if (!pid) return career;
  if (career.results.some((r) => r.matchId === pid)) {
    const { pendingMatch, ...rest } = career; // 真移除鍵（undefined 鍵會壞 roundtrip 比對）
    return rest;
  }
  const entry = career.schedule.find((m) => m.id === pid);
  const bestOf = [3, 5].includes(entry?.format) ? entry.format : 1;
  const against = bestOf > 1 ? Math.ceil(bestOf / 2) : 25; // bo3⇒2 局、bo5⇒3 局、bo1⇒25 分
  return recordResult(career, {
    matchId: pid, won: false, scoreFor: 0, scoreAgainst: against, forfeit: true,
  });
}

// 記錄一場結果（不可變更新）；同場重複記錄＝原樣返回（局終畫面重入保護）
// gp＝本場獲得的成長點數（累加進 growthPoints）；stats＝表現摘要（成長畫面顯示用）
// W4(P4) Q8：sets＝多局系列各局終分（[{A,B}]；bo1 不帶）——box score／生涯結算消費
// W4(P4) Q9：box＝單場全員記帳 {team, oppAce, mentor}（結算頁/導師賽後鏈消費）
// forfeit（2026-08-24 Sawmah 裁定）：這一場是不是棄賽。用可選欄位模式寫入，
// 非棄賽路徑的 result 逐值不變（舊存檔讀出來 undefined＝當作正常完賽）。
export function recordResult(career, { matchId, won, scoreFor, scoreAgainst, gp = 0, stats = null, sets = null, box = null, forfeit = false }) {
  const entry = career.schedule.find((m) => m.id === matchId);
  if (!entry) throw new Error(`recordResult：賽程裡沒有比賽 ${matchId}`);
  if (career.results.some((r) => r.matchId === matchId)) return career;
  const { pendingMatch, ...base } = career; // 完賽即清開賽標記（真移除鍵）
  return {
    ...base,
    growthPoints: (career.growthPoints ?? 0) + (gp | 0),
    results: [
      ...career.results,
      {
        matchId,
        opponentId: entry.opponentId,
        won: !!won,
        scoreFor: scoreFor | 0,
        scoreAgainst: scoreAgainst | 0,
        gp: gp | 0,
        ...(stats ? { stats } : {}),
        ...(sets ? { sets } : {}),
        ...(box ? { box } : {}),
        ...(forfeit ? { forfeit: true } : {}),
      },
    ],
  };
}

// 生涯主角：A 隊 A2（main.js PLAYER_ID）。出道佔主攻手槽（一律 OH 出道——憲法 Q7）；
// W3 轉位後由 currentRole 決定實佔槽位（建隊鏈全線吃 currentRole，見 applyPositionChange）。
// 初值與預設隊友同基準——成長差異由 stage 3 的雙層成長系統拉開。
// W2(P4) 身高創角（憲法 Q6/Q7）：heightCm＝創角輸入（140–220 已 clamp）；
// aspiration＝志願位置（志願登記，一律 OH 出道——currentRole 恆 outside）；
// seed＝career.seed（成長曲線子種子來源）。三年曲線於此刻預生成（heightGrowth）。
// 不帶 opts＝舊路徑（測試/治具）：188 基準、志願主攻，行為與 Phase 1 相容。
// 保底球權地板（決策第 3 題：玩家不得淪為觀眾）。W3 甲2 拍板：玩家轉 S＝停用
// （分配者沒有保底對象語意）；轉回攻擊位＝恢復——applyPositionChange 消費本常數
export const PLAYER_TRUST_FLOOR = 0.27;

export function createCareerPlayer(name, { heightCm = 188, aspiration = 'outside', seed = 1 } = {}) {
  const height = initialHeightState({ seed, heightCm });
  const player = createPlayer({
    id: 'A2',
    name,
    teamId: 'A',
    naturalRole: 'outside',
    currentRole: 'outside',
    height: height.current,
    trust: 40, // 拍板 07-22：60→40——「打好球→球權變多」的成長弧要看得見（地板 0.27 保底）
    attributes: {
      jump: 60, power: 62, reaction: 60, stamina: 60,
      speed: 62, control: 68, serve: 60, block: 58,
    },
    trustFloor: PLAYER_TRUST_FLOOR, // 保底 25–30% 球權（玩家不得淪為觀眾）
    // 生涯新人技術層全鎖起步，經故事線傳授習得（每場賽後對手/隊長教一招）
    // v:2＝技術欄位語意版本（normalizeCareerPlayer 的一次性遷移標記）
    techniques: {
      tip: 0, pipe: 0, feint: 0, feintUses: 0,
      jumpServe: 0, floatServe: 0, dive: 0, callPlay: 0, v: 2,
    },
  });
  // 單一事實源在 timeline（current＝末項快取）＋隱藏曲線 plan（逐屆揭曉）
  player.height = height;
  // 志願登記（W2 只落欄位；轉位事件＝W3——該位置驗證開放時優先觸發）
  player.aspiration = aspiration;
  // 屆間養成卷 E1（2026-08-09 題二裁定軸二甲）：默契＝**配對關係值**，「屬於你們之間」。
  // ★ 不掛在 `player.trust` 底下 ★ trust 是「舉球員對我」的單向值（sim/trust.js），
  // 語意不同，挪用即違反單一真相源（裁定書 §2-2 do-not-touch 1）。
  //   pairs   ＝ { 隊友id: 累計次數 }——你和他共同完成組合攻擊的次數（賽末由 matchCareer 入帳）
  //   focusId ＝ 第二次集訓選定的默契對象；★本卷零效果，沒有任何消費端讀它★
  player.chemistry = { pairs: {}, focusId: null };
  // 屆間養成卷（覆審 HIGH-1）：「這屆集訓還沒做完」的落檔待辦。null＝沒有待辦；
  // 由 careerStore.advanceSeason 與屆數推進同一次 RMW 寫入、集訓完成時清掉。
  player.campPending = null;
  return player;
}

// ---- 對手建隊（參數檔→6 個 Player）----

// 槽序與基準 trust 同 game.js DEFAULT_LINEUP（index 1＝隊上主攻核心）。
// 債清批 2026-08-26 收斂：單一事實來源＝lineup.SLOT_ROLES（本檔與 uniTeam.UNI_ROLE_ORDER、
// corpTeam 皆同一參照）；naming.test 的鏡射硬編碼是刻意凍結守衛，序變仍會被抓。
export const ROLE_ORDER = SLOT_ROLES;
const BASE_TRUST = [20, 60, 20, 20, 20, 20];
const FALLBACK_HEIGHTS = [1.83, 1.88, 1.96, 1.9, 1.86, 1.94];

export function buildOpponentTeam(def) {
  return ROLE_ORDER.map((role, i) => {
    // N2 宿敵成長：成長型 ace 的當屆增幅（applySeasonRoster 掛的 aceAttrBonus／
    // aceHeight；無欄位＝零加成＝第 1 屆與非成長型隊伍逐值不變）
    const isAce = def.ace?.slot === i;
    const aceBonus = isAce ? (def.aceAttrBonus ?? 0) : 0;
    const attrs = {};
    for (const k of ATTRIBUTE_KEYS) {
      attrs[k] = def.level + aceBonus
        + (def.attrBias?.[k] ?? 0) + (def.roleBias?.[role]?.[k] ?? 0);
    }
    return createPlayer({
      id: `B${i + 1}`,
      // 命名工程 07-25：具名先發（opponents.js squad 槽序同 ROLE_ORDER）；
      // 無 squad 的自訂/測試 def 回退「隊名＋N號」
      name: def.squad?.[i] ?? `${def.name}${i + 1}號`,
      teamId: 'B',
      naturalRole: role,
      currentRole: role,
      height: (isAce ? def.aceHeight : null) ?? def.heights?.[i] ?? FALLBACK_HEIGHTS[i],
      trust: BASE_TRUST[i] + (def.trustBias?.[role] ?? 0),
      attributes: attrs,
    });
  });
}

// 命名工程 07-25 挖角除名：名冊裡來自該隊的招募生（同一人，以 fullName 對應）不得
// 再出現在原隊名單——對應槽位由 def.reserves 依序遞補；王牌被挖＝ace 拔除（賽前敵情/
// 播報不再喊他）。fullName 對不上（玩家改過名/極舊存檔）＝維持原名單的可接受退化。
// 純函式：回傳新 def，原參數檔不動（快速比賽/未招募路徑零影響）。
// W1：reserves 改物件（{name, role, grade, drop, title?}）——遞補上場取 .name、
// 年級隨人同步進 grades；被消耗的遞補從輸出 def.reserves 移除（剩餘者＝該場板凳，
// careerMatchSetup 消費）。W1 起 poachedNames 亦含畢業校友（alumni）——畢業的
// 招募生不得在下屆「還魂」回原隊名單。
export function applyPoaching(def, poachedNames = []) {
  const hit = (n) => poachedNames.includes(n);
  if (!poachedNames.length || (!def.squad?.some(hit) && !hit(def.libero))) return def;
  const reserves = [...(def.reserves ?? [])];
  const grades = def.grades ? [...def.grades] : null;
  let liberoGrade = def.liberoGrade;
  const take = () => reserves.shift() ?? null;
  const squad = def.squad?.map((n, i) => {
    if (!hit(n)) return n;
    const r = take();
    if (grades) grades[i] = r?.grade ?? grades[i];
    return r?.name ?? `${def.name}替補`;
  });
  let libero = def.libero;
  if (libero && hit(libero)) {
    const r = take();
    liberoGrade = r?.grade ?? liberoGrade;
    libero = r?.name ?? `${def.name}替補`;
  }
  return {
    ...def,
    squad,
    libero,
    reserves,
    ...(grades ? { grades } : {}),
    ...(liberoGrade !== undefined ? { liberoGrade } : {}),
    ...(def.ace && hit(def.ace.name) ? { ace: null } : {}),
  };
}

// ---- Phase 4 W1 年級系統（憲法 Q1/Q3/Q4）----

// 基準年級 → 某屆的現行年級（opponents.js grades／member.growth.grade 皆為「第 1 屆
// 基準」語意時用；我方名冊的 grade 由賽季推進實際 +1，不走此換算）
export function currentGrade(baseGrade, seasonIndex = 1) {
  return baseGrade + (seasonIndex - 1);
}

// Q4 對手 ace 畢業遞補（純函式；applyPoaching 同款路徑）：三年級 ace 於該屆結束畢業
// →下屆起由 reserves 中最強者（drop 最小）升格新 ace、頂上原槽位、掛接班稱號。
// 只動 ace 層（49 人全名單輪替＝明定不做）；接班人自 reserves 移除（剩餘者＝板凳）。
// 自由人 ace（slot 'L'）同邏輯換 libero。資料不變式（tests 把關）：接班人基準年級 1
// ——三屆生涯內不二次畢業，單次遞補即完備。
/**
 * ★ 比賽路徑取得對手參數檔的**單一入口**（大學卷批 6 收斂）★
 *
 * 為什麼要收斂：批 6 把 `opponentById` 補成「高中∪大學」時補了三處
 *（`opponentName`／`careerMatchSetup`／`deserializeCareer`），**漏了賽前對陣畫面**
 * ⇒ 大學八場的排位儀式（先發互換、輪轉球位、板凳替換、對面具名亮相）全部靜默消失，
 * 而它是唯一的先發編排入口——板凳永遠換不上場。這正是「防線按已知的入口寫」的
 * 典型後果（`02 §6.1` 第 7 條）：分母 17 處 `opponentById(`，其中比賽路徑 4 處。
 * 收斂成這一支之後，「大學隊怎麼取 def」只有一份答案。
 *
 * 其餘 13 處**刻意不改**：`schedule.js`（高中排程）、`recruitment.js`／`events.js`／
 * 招募面板（招募是高中系統、大學階段一暫停）、`main.js` 的 RIVAL_TEAM_ID（高中宿敵）
 * ——那些路徑在大學章根本不該有對手可查，查不到回 null 才是對的。
 *
 * @param seasonIndex 高中的年級推進換算用（大學不吃）
 * @param titles      衛冕加成（大學不吃——那是高中錦標賽的難度旋鈕）
 */
export function matchOpponentDef(opponentId, seasonIndex = 1, { titles = 0 } = {}) {
  // 大學：直接回資料表。★不套 applySeasonRoster★ 那吃的是高中的年級推進
  //（`currentGrade` 批 4 已查證只服務高中對手 ace 的畢業）：拿第 4 屆去換算，
  // 大學王牌會被判成「早就畢業了」，而大學表沒有 reserves ⇒ 王牌直接消失。
  const uni = universityById(opponentId);
  if (uni) return uni;
  // 企業章批 2 覆審 HIGH 修：第三張表同大學處理——直接回資料表、不套
  // applySeasonRoster（corp 的 grades＝在隊年資，不是會畢業的年級；也沒有 reserves）。
  // 漏這條的話 careerMatchSetup 拿到 null → teams.B 落回 createDefaultTeams 通用隊，
  // 八家企業的陣容/王牌/AI 在戰鬥層整批被架空（覆審實查：賽前對陣畫面也被靜默跳過）。
  const corp = corporationById(opponentId);
  if (corp) return corp;
  // 職業章批 2 同款補全（B4 分母清單第 2 項）：職業隊的 grades＝在隊年資，
  // 沒有 reserves，同企業/大學處理——直接回資料表、不套 applySeasonRoster。
  // 漏這條的話 careerMatchSetup 拿到 null → teams.B 落回通用隊（企業章批 2 的
  // 覆審地雷重演），賽前對陣畫面也會被靜默跳過。
  const pro = proTeamById(opponentId);
  if (pro) return pro;
  const base = opponentById(opponentId);
  if (!base) return null;
  // W5 衛冕屆難度：對手升級只綁奪冠次數（titles），止步重來＝原強度
  const boosted = titles > 0
    ? { ...base, level: base.level + TITLE_LEVEL_BONUS * titles }
    : base;
  // W1(P4) Q4：三年級 ace 畢業＝下屆起遞補換臉（先於挖角除名）
  return applySeasonRoster(boosted, seasonIndex);
}

export function applySeasonRoster(def, seasonIndex = 1) {
  if (seasonIndex <= 1 || !def.ace || !def.grades) return def;
  // W4(P4) 題6 硬約束：宿敵 ace 豁免（ace.rival＝true）——三年間不被遞補純函式
  // 無差別滾掉；與玩家同屆（grade 1 特設）＝第 3 屆末同屆畢業、資料語意自然收束
  if (def.ace.rival) return def;
  const aceGrade = def.ace.slot === 'L' ? def.liberoGrade : def.grades[def.ace.slot];
  // 尚未畢業＝原班 ace 續戰；N2（07-30）成長型 ace 在此掛當屆身高／能力
  // （非成長型隊伍 withAceGrowth 回原物件＝第 2 屆恆等的既有測試不動）
  if (aceGrade == null || currentGrade(aceGrade, seasonIndex) <= 3) {
    return withAceGrowth(def, seasonIndex);
  }
  const reserves = [...(def.reserves ?? [])];
  let best = -1;
  for (let i = 0; i < reserves.length; i += 1) {
    if (best < 0 || reserves[i].drop < reserves[best].drop) best = i;
  }
  if (best < 0) return { ...def, ace: null }; // 無人可接（防呆）：王牌缺席
  const [heir] = reserves.splice(best, 1);
  const next = { ...def, reserves, ace: { slot: def.ace.slot, name: heir.name, title: heir.title ?? '新王牌' } };
  if (def.ace.slot === 'L') {
    next.libero = heir.name;
    next.liberoGrade = heir.grade;
  } else {
    next.squad = def.squad.map((n, i) => (i === def.ace.slot ? heir.name : n));
    next.grades = def.grades.map((g, i) => (i === def.ace.slot ? heir.grade : g));
  }
  return next;
}

// 該屆結束時畢業的對手 ace 清單（畢業播報／儀式消費；seasonIndex＝剛結束的屆）：
// 現行年級=3 的 ace 本屆打完離開。回傳含接班人資訊（播報「舊王牌去向」伏筆＋新王牌預告）
export function graduatingAces(seasonIndex = 1) {
  const out = [];
  for (const def of OPPONENTS) {
    if (!def.ace || !def.grades) continue;
    if (def.ace.rival) continue; // W4 題6：宿敵 ace 不入畢業播報（與玩家同屆走完三年）
    const aceGrade = def.ace.slot === 'L' ? def.liberoGrade : def.grades[def.ace.slot];
    if (aceGrade == null || currentGrade(aceGrade, seasonIndex) !== 3) continue;
    const heir = (def.reserves ?? []).reduce(
      (a, r) => (a == null || r.drop < a.drop ? r : a), null,
    );
    out.push({
      opponentId: def.id,
      teamName: def.name,
      name: def.ace.name,
      title: def.ace.title,
      heir: heir ? { name: heir.name, title: heir.title ?? '新王牌' } : null,
    });
  }
  return out;
}

// 跨版本存檔補正（就地修正；開賽與生涯畫面渲染都會跑，下次存檔即固定）：
// ①主角保底球權地板 ②powerServe→jumpServe 正名（發球體系改版）
// ③stage 3 前存檔的 jumpServe:1 是舊熟練度語意→歸零 ④新技術缺欄＝未解鎖
export function normalizeCareerPlayer(player) {
  if (player.trust.floorShare === undefined) player.trust.floorShare = 0.27;
  const t = player.techniques ?? (player.techniques = {});
  // 一次性遷移（t.v 標記）：改版前的 jumpServe 一律是舊熟練度語意——
  // 只有買過強力發球（powerServe:1）者換得跳發；標記後永不再動（傳授所得不受影響）
  if (!t.v) {
    t.jumpServe = t.powerServe ?? 0;
    delete t.powerServe;
    t.v = 2;
  }
  // ④新技術缺欄＝未解鎖（callPlay 於 07-31 加入：段 E 叫戰術改走技術傳授；
  // 舊存檔無此欄＝未受教＝鎖，與新生涯的顯式 0 同值，兩者行為一致）
  // 大學卷批 7（08-24）：pressBlock／chaseServe 同理——高中三屆的舊存檔升上大學時
  // 這兩欄不存在，補 0＝未受教。★不能留 undefined★：UI 閘門雖然是 `(tech.x ?? 0) >= 1`
  // 讀得動，但 B7-1 要求舊存檔讀出來逐值＝0——undefined 在技術列表顯示層是
  // 「這一招不存在」，與「還沒學會」是兩種意思。
  for (const k of ['tip', 'pipe', 'feint', 'floatServe', 'dive', 'callPlay',
    'pressBlock', 'chaseServe']) t[k] = t[k] ?? 0;
  t.feintUses = t.feintUses ?? 0;
  // ⑤屆間養成卷 E1（2026-08-09）：默契欄缺席＝空紀錄。舊存檔讀出來是 undefined
  // （serializePlayer 是整個物件 JSON.stringify、deserializePlayer 不驗未知欄位），
  // 呼叫端一律走這條補正，不得靠各自 `?? {}`（會漂移成好幾份預設值）
  const ch = player.chemistry ?? (player.chemistry = {});
  if (typeof ch.pairs !== 'object' || ch.pairs === null) ch.pairs = {};
  if (ch.focusId === undefined) ch.focusId = null;
  // ⑥集訓待辦（覆審 HIGH-1）：只認數字（＝待辦所屬的屆數），其餘一律視為「沒有待辦」。
  // 舊存檔無此欄＝undefined＝沒有待辦——那是對的：升版前已走過屆間鏈的存檔，
  // 靜默的耐力 +2 當時就已經入帳，補跑集訓會變成第二次領。
  if (typeof player.campPending !== 'number') player.campPending = null;
  return player;
}

// 生涯比賽建隊：我隊＝依先發輪轉序（lineup）展開名冊為 A 隊；對手隊＝參數檔建隊
// （未給 def＝預設 B 隊，維持 stage 1 相容）。
// W3 單一建隊路徑：給 rosterMembers 時一律依 lineup.starters 順序建 teams.A、
// trust 跟人（trustOf 以 member id 查映射，換位不繼承他人信任），玩家（A2）擺在其
// 於 starters 的位置、trust 恆取 save.player。未給 lineup＝取 defaultLineup（預設序
// ＝W2 固定槽位同序，逐位等價——見 tests/lineup 等價閘）。未給名冊＝快速比賽相容
// （主角塞主攻手槽、其餘預設隊員）。
export function careerTeams(player, opponentDef = null, rosterMembers = null, lineup = null) {
  // W3(P4) 轉位後守衛只鎖身分（A 隊 A2），不鎖位置——玩家佔哪個槽由 lineup／
  // currentRole 決定（出道＝OH 槽；轉位＝新槽，見 applyPositionChange）
  if (player?.id !== 'A2' || player?.teamId !== 'A') {
    throw new Error('careerTeams：生涯主角必須是 A 隊 A2');
  }
  normalizeCareerPlayer(player);
  const teams = createDefaultTeams();
  if (rosterMembers) {
    // starters 為 null（建檔中間態，schema 放行）亦回退預設——防未經 ensureStarterRoster
    // 的呼叫端把 null 序餵進 effectiveOrder 崩比賽
    const lu = (lineup?.starters == null)
      ? defaultLineup(rosterMembers, player.id, player.currentRole ?? 'outside')
      : lineup;
    const order = effectiveOrder(lu.starters, lu.rotationStart);
    // W6.1 隊友魚躍鏡像（拍板 07-24 Q2-A）：sim Player 預設 techniques 全開，
    // 隊友的 dive 改鏡像主角解鎖——「對手教主角→主角教全隊」敘事機制化：主角沒學會前
    // 隊友連救噴必撲路徑（ai.js rescue 繞過 diveRate）也不會撲。對手隊/快速比賽不經此路。
    const teamDive = player.techniques?.dive ?? 0;
    teams.A = order.map((id) => {
      if (id === player.id) return player;
      const m = rosterMembers.find((x) => x.id === id);
      if (!m) throw new Error(`careerTeams：先發 ${id} 不在名冊`);
      return createPlayer({
        id: m.id,
        name: m.name,
        teamId: 'A',
        naturalRole: m.role,
        currentRole: m.role,
        height: m.height ?? 1.85,
        trust: trustOf(lu, m.id),
        attributes: { ...m.attributes },
        techniques: { dive: teamDive },
      });
    });
    // 主控球員必在先發（排球鐵律：玩家恆在場上）——缺 A2 會建出無主控的隊，
    // sim 以 PLAYER_ID='A2' 找不到人（操控/trustFloor/鏡頭全失據）。
    // W3(P4) 玩家=L 例外：不入先發、由 careerMatchSetup 以 liberos 通道入場
    // （applyLiberoSwaps 後排替換；前排輪次在場外＝縮時偵察視角）
    if (player.currentRole !== 'libero' && !teams.A.some((p) => p.id === player.id)) {
      throw new Error('careerTeams：先發未含主控球員 A2');
    }
  } else {
    teams.A[1] = player;
  }
  if (opponentDef) teams.B = buildOpponentTeam(opponentDef);
  return teams;
}

// stage 5 情蒐：把單場 scoutTally 併入生涯（per 對手——「這隊看過我什麼」；
// 宿敵＝同隊 id 跨賽段自然沿用同一份記憶）
// ══ 單調治療探針卷（2026-08-26）：球探建檔的讀取端 ══
// ★ 門檻鏡射 sim ★ 0.35/0.15 與 `sim/game.js` scoutBlockMul 的熱/冷線同值——
// M5 禁改 sim（sim-hash 不動），所以這裡是**有意的複製**，由測試把兩邊行為釘在
// 同一個邊界上（tests/monotony-probe：share 恰過/不過門檻時 scoutBlockMul 的回傳）。
export const SCOUT_HOT_SHARE = 0.35;
export const SCOUT_COLD_SHARE = 0.15;
export const SCOUT_ZONE_LABEL = { line: '直線', cross: '斜線', middle: '中路', tip: '吊球' };

/**
 * 全生涯扣打分佈聚合（拍板題 1「球探開季建檔」的資料來源）。**純函式**。
 * career.scouting 是「各對手看過我的分佈」逐隊記帳（mergeScouting）——加總＝
 * 我整個生涯的出手習慣＝聯賽球探研究錄影帶會得到的東西。
 * @param excludeId 排除某對手的紀錄（賽後算「賽前狀態」用——企業對手本場的紀錄
 *                  要剔掉，否則甩開句拿被污染的分佈自證）
 * @returns {zones} 或 null（零紀錄——新檔/治具；呼叫端交給 sim 樣本<6 防線）
 */
export function leagueScoutZones(career, { excludeId = null } = {}) {
  const out = { line: 0, cross: 0, middle: 0, tip: 0 };
  let total = 0;
  for (const [id, rec] of Object.entries(career?.scouting ?? {})) {
    if (id === excludeId) continue;
    for (const k of Object.keys(out)) {
      const v = rec?.zones?.[k] ?? 0;
      out[k] += v;
      total += v;
    }
  }
  return total > 0 ? { zones: out } : null;
}

/**
 * 被盯的線：分佈中佔比 > SCOUT_HOT_SHARE 的最大線。樣本 <6 回 null（鏡射 sim
 * 的小樣本防線——樣本不足時 sim 不讀，UI 也不得嚇唬玩家）。
 * @returns { zone, share } 或 null
 */
export function scoutFocusZone(zones = null) {
  if (!zones) return null;
  const keys = ['line', 'cross', 'middle', 'tip'];
  const total = keys.reduce((n, k) => n + (zones[k] ?? 0), 0);
  if (total < 6) return null;
  let best = null;
  for (const k of keys) {
    const share = (zones[k] ?? 0) / total;
    if (share > SCOUT_HOT_SHARE && (!best || share > best.share)) best = { zone: k, share };
  }
  return best;
}

export function mergeScouting(career, opponentId, tally) {
  if (!tally) return career;
  const prev = career.scouting?.[opponentId] ?? {
    zones: { line: 0, cross: 0, middle: 0, tip: 0 },
    // 組合攻擊卷 Q4 資料層（2026-07-31，純記帳）：比照 zones 跨場累積。
    // 舊存檔沒有這個欄位＝prev.routes 為 undefined，下面用 ?? {} 保底不 crash
    // 段 A（2026-07-31）補 'cross'／'tandem'——鍵集與 game.js scoutTallyOf 同步
    routes: {
      quick: 0, bquick: 0, left: 0, left_inside: 0, cross: 0, tandem: 0, right: 0, pipe: 0, dball: 0,
    },
    feints: 0, spikes: 0,
  };
  const prevRoutes = prev.routes ?? {};
  const merged = {
    zones: {
      line: prev.zones.line + (tally.zones?.line ?? 0),
      cross: prev.zones.cross + (tally.zones?.cross ?? 0),
      middle: prev.zones.middle + (tally.zones?.middle ?? 0),
      tip: prev.zones.tip + (tally.zones?.tip ?? 0),
    },
    routes: {
      quick: (prevRoutes.quick ?? 0) + (tally.routes?.quick ?? 0),
      bquick: (prevRoutes.bquick ?? 0) + (tally.routes?.bquick ?? 0),
      left: (prevRoutes.left ?? 0) + (tally.routes?.left ?? 0),
      left_inside: (prevRoutes.left_inside ?? 0) + (tally.routes?.left_inside ?? 0),
      cross: (prevRoutes.cross ?? 0) + (tally.routes?.cross ?? 0),
      tandem: (prevRoutes.tandem ?? 0) + (tally.routes?.tandem ?? 0),
      right: (prevRoutes.right ?? 0) + (tally.routes?.right ?? 0),
      pipe: (prevRoutes.pipe ?? 0) + (tally.routes?.pipe ?? 0),
      dball: (prevRoutes.dball ?? 0) + (tally.routes?.dball ?? 0),
    },
    feints: prev.feints + (tally.feints ?? 0),
    spikes: prev.spikes + (tally.spikes ?? 0),
  };
  return { ...career, scouting: { ...(career.scouting ?? {}), [opponentId]: merged } };
}

// stage 6 自由人（第 7 人）：防守專精數值——高反應/速度/控制、低攻擊系
export function buildLibero(team, name, level = 60) {
  const d = Math.min(100, level + 14);
  return createPlayer({
    id: `${team}L`,
    name,
    teamId: team,
    naturalRole: 'libero',
    currentRole: 'libero',
    height: 1.72,
    trust: 5, // 自由人不進攻擊池；留極低值防呆
    attributes: {
      jump: 40, power: 40, reaction: d, stamina: 70,
      speed: d - 2, control: d - 2, serve: 30, block: 30,
    },
  });
}

// 我方 AI 風格（隊友技能綁玩家解鎖）——主角傳承節點：對手教主角→隊長請主角教全隊
// （scramble-plan 定案敘事，07-24 Sawmah 正名）：主角學會＝回去教隊友＝全隊跟著會；
// 溫和值低於對手招牌隊（鐵霧跳發 .45／北原飄浮 .25）——隊友是二手學的、不是專精。
// 時程天然集中後段（飄浮＝八強後、跳發＝決賽前）。傳承的劇情呈現在 events.js
// teach-* 的隊長收尾行。其他 profile 維持 aiProfileOf 預設；對手用 opponents 分級。
// ★ 抽成具名函式（2026-08-12 練習賽卷）★ 原本這三個數字內嵌在 careerMatchSetup 裡，
// 練習賽的紅白兩隊**也是我隊**、要吃同一份 profile ⇒ 抄第二份必然漂移。純抽取，零值變動。
export function alliedAiProfileOf(player) {
  return {
    diveRate: (player?.techniques?.dive ?? 0) >= 1 ? 0.16 : 0,
    jumpServeRate: (player?.techniques?.jumpServe ?? 0) >= 1 ? 0.12 : 0,
    floatServeRate: (player?.techniques?.floatServe ?? 0) >= 1 ? 0.15 : 0,
  };
}

// 生涯單場開賽包：種子＋兩隊 roster＋對手 AI 風格＋情蒐讀取——main.js 一次拿齊餵 createGame
// W2 起第 4 參數 roster（save.roster 或 null）：A 隊五槽與自由人吃名冊具名/個性化/成長後屬性。
// W3 起第 5 參數 lineup（save.lineup 或 null）：A 隊依先發輪轉序建隊、自由人由 lineup.libero 選。
// W1(P4) 第 6 參數 seasonIndex：屆數——對手 ace 畢業遞補（applySeasonRoster）換算用；
// 省略＝1＝第 1 屆行為不變。
// 配色卷階段二 E1（2026-08-24）第 7 參數 school：大學章已選定的學校 id（呼叫端由
// `store.loadSchool()` 供給）。高中章恆不傳（=null）——`school` 是 `save.career.school`
// 那條線唯一的寫入者是 `careerStore.enterUniversity`，高中章路徑上它永遠是 null，
// 靠這一點自然滿足「高中章不補 A 面」，不必在這裡額外判 chapter。
// 企業章批 3（A3-3）第 8 參數 corp：企業章已簽公司的 id（呼叫端由 `store.loadCorp()`
// 供給）——A 面球衣改穿公司 kit。與 school 並存不衝突：兩者最多一個非 null
//（同一份存檔不會同時「在大學」又「已簽企業」；同時給時 corp 優先＝現在的章）。
// 職業章批 2（B4 分母清單第 4 項）第 9 參數 pro：職業章已簽球隊的 id（呼叫端由
// `store.loadPro()` 供給）——A 面球衣改穿球隊 kit，優先序在 corp 之前（現在的章）。
export function careerMatchSetup(
  career, player, matchEntry, roster = null, lineup = null, seasonIndex = 1, school = null,
  corp = null, pro = null,
) {
  const def = matchOpponentDef(matchEntry.opponentId, seasonIndex, { titles: career.titles ?? 0 });
  if (!def) throw new Error(`careerMatchSetup：未知對手 ${matchEntry.opponentId}`);
  // 對手讀我：這隊過去看過的我的攻擊分佈 × 其讀取強度（弱隊 scoutRead 0＝不讀）。
  // 探針卷（2026-08-26 拍板題 1）：企業對手＝球探開季建檔——個別交手紀錄缺席時
  // 回退全生涯聚合（單循環下賽前必缺；寫成回退而非覆蓋＝語意誠實）。聚合為空
  // （零紀錄新檔）回 null ⇒ 參數不成立，sim 照舊不讀。高中/大學路徑逐字不變。
  // 職業章批 2（B4 分母清單第 3 項）：拍板題 5「沿用企業章 scoutRead 三檔形狀」
  // ——職業對手同樣走球探開季建檔回退，不是只有企業對手才有
  const seen = career.scouting?.[matchEntry.opponentId]
    ?? ((corporationById(matchEntry.opponentId) || proTeamById(matchEntry.opponentId))
      ? leagueScoutZones(career) : null);
  const scoutRead = seen && (def.scoutRead ?? 0) > 0
    ? { B: { targetId: 'A2', read: def.scoutRead, zones: seen.zones } }
    : undefined;
  const members = roster?.members ?? null;
  // 我方自由人：結構欄位（id/身高/trust/role）恆由 buildLibero 公式供給（D3 不動），
  // lineup.libero 指定的名冊成員存在時只覆寫 name＋attributes（承接自動成長後的數值）。
  // W3(P4) 玩家=L：lineup.libero===玩家 id＝玩家本人穿異色球衣——直接用玩家物件
  // （真實身高/屬性/技術；小守讓位，見轉位事件）
  let liberoA;
  if (lineup?.libero === player.id && player.currentRole === 'libero') {
    liberoA = player;
  } else {
    liberoA = buildLibero('A', '小守');
    const al = members?.find((m) => m.id === (lineup?.libero ?? DEFAULT_LIBERO_ID));
    if (al) {
      liberoA.name = al.name;
      liberoA.attributes = { ...liberoA.attributes, ...al.attributes };
    }
  }
  // W3(P4) 07-27 Sawmah 拍板 B：自由人豁免魚躍鏡像——防守專精者天生會撲
  // （「不會魚躍的自由人」敘事與體感皆不成立；前兩場小守放球落地的病根）。
  // 一般隊友照舊鏡像（careerTeams teamDive——「主角教全隊」敘事保留）；
  // 玩家轉 L＝liberoA 即玩家本人（上方分支），自己的魚躍仍走教學解鎖
  if (members && liberoA !== player) liberoA.techniques.dive = 1;
  // W6 賽中換人：板凳＝名冊中非先發、非現任自由人、非 libero 角色的成員
  // （libero 角色只走自由人體系進場；對手無板凳＝B3 拍板不做）
  const lu = members
    ? ((lineup?.starters == null)
      ? defaultLineup(members, player.id, player.currentRole ?? 'outside')
      : lineup)
    : null;
  const starterSet = new Set(lu ? effectiveOrder(lu.starters, lu.rotationStart) : []);
  const benchA = members
    ? members
      .filter((m) => !starterSet.has(m.id)
        && m.id !== (lineup?.libero ?? DEFAULT_LIBERO_ID)
        && m.role !== 'libero')
      .map((m) => createPlayer({
        id: m.id,
        name: m.name,
        teamId: 'A',
        naturalRole: m.role,
        currentRole: m.role,
        height: m.height ?? 1.85,
        trust: trustOf(lu, m.id),
        attributes: { ...m.attributes },
        // W6.1 隊友魚躍鏡像（同 careerTeams）：板凳換上場也吃同一條解鎖
        techniques: { dive: player.techniques?.dive ?? 0 },
      }))
    : [];
  // W7 D 舊隊情結：名冊中來自本場對手原隊的隊友（招募生 dna.teamId＝來源隊）——
  // D2 trustDyn 開場 +8（含板凳/自由人：換上場也帶勁；場末即散不污染持久信任）、
  // D3 播報名單（開賽環境句＋首次建功加一句，commentary 消費）
  const oldTeamMates = (members ?? []).filter((m) => m.dna?.teamId === matchEntry.opponentId);
  // 命名工程 07-25：挖角除名——已入我隊的招募生不得再出現在原隊名單（同一人分身兩隊）。
  // W1(P4)：畢業校友（roster.alumni）一併除名——畢業的招募生不得在下屆還魂回原隊
  const goneNames = [
    ...oldTeamMates.map((m) => m.fullName),
    ...(roster?.alumni ?? []).map((a) => a.member?.fullName),
  ].filter(Boolean);
  const oppDef = applyPoaching(def, goneNames);
  // W1(P4) A1 對手板凳：遞補/挖角消耗後剩餘的 reserves＝場邊待命。能力＝
  // (該場 def.level − drop)＋attrBias＋roleBias——弱隊 drop 大＝板凳落差可感；
  // 疲勞換人判準在 ai.js aiSubstitutionWanted（呼叫端 matchLoop/治具），sim 唯一
  // 寫入路徑仍是 applySubstitution
  const RESERVE_HEIGHT_SLOT = { setter: 0, outside: 1, middle: 2, opposite: 3 };
  const benchB = (oppDef.reserves ?? []).map((r, i) => {
    const attrs = {};
    for (const k of ATTRIBUTE_KEYS) {
      attrs[k] = (oppDef.level - (r.drop ?? 0))
        + (oppDef.attrBias?.[k] ?? 0) + (oppDef.roleBias?.[r.role]?.[k] ?? 0);
    }
    return createPlayer({
      id: `BR${i + 1}`,
      name: r.name,
      teamId: 'B',
      naturalRole: r.role ?? 'outside',
      currentRole: r.role ?? 'outside',
      height: oppDef.heights?.[RESERVE_HEIGHT_SLOT[r.role] ?? 1] ?? 1.86,
      trust: 20,
      attributes: attrs,
    });
  });
  // 配色卷階段二 E1：大學章＋已選校時我方（A）補上入學校 kit；kitFor 缺欄位回 null
  // ⇒ 消費端（geoCharacter.resolveKit）回落側別預設——school 查無效（universityById
  // 落空）時 uniSchoolKit 為 null，跟高中章一樣不補 A 面，行為安全一致。
  const proKit = pro ? kitFor(proTeamById(pro)) : null;
  const corpKit = corp ? kitFor(corporationById(corp)) : null;
  const uniSchoolKit = proKit ?? corpKit ?? (school ? kitFor(universityById(school)) : null);
  return {
    seed: matchSeed(career, matchEntry.id),
    teams: careerTeams(player, oppDef, members, lineup),
    // 配色卷批 1：對手隊 kit（渲染層球衣覆寫）；批 1 拍板題 1 C 案原本我方（A）恆定
    // 不帶——階段二 E1 大學章時補上（見上）。E2：自由人色隨 kits.A 一併帶（同一個
    // kit 物件的 .libero 欄位），resolveKit('A', true, kit) 已會吃，這裡不必另處理。
    kits: { ...(uniSchoolKit ? { A: uniSchoolKit } : {}), B: kitFor(oppDef) },
    benches: { A: benchA, B: benchB },
    ...(oldTeamMates.length ? {
      trustDynInit: Object.fromEntries(
        oldTeamMates.map((m) => [m.id, TRUST_DYN.OLD_TEAM_BOOST]),
      ),
      revenge: oldTeamMates.map((m) => ({ id: m.id, name: m.name })),
    } : {}),
    aiProfiles: {
      A: alliedAiProfileOf(player),
      B: { ...def.ai },
    },
    ...(scoutRead ? { scoutRead } : {}),
    // ---- 組合攻擊的屆數閘（2026-08-01 Sawmah 裁定）----
    // 第 1 屆＝學基本功（純個人能力的比賽）⇒ 交叉／夾塞／時間差三型全關；
    // 第 2 屆起整個比賽升級 ⇒ 恢復出廠值。**雙方都適用**——它是場級參數（createGame
    // 一個場一個值），不分敵我，玩家隊與對手同步開關，不存在「只關玩家」的形狀。
    // ★ 屆數的認知**到這一行為止** ★ 往下遞給 sim 的只有 0 或 1 這個數字
    // （`createGame({ comboScale })`），sim 不知道有「屆」這個東西——同 passTier／
    // aiProfiles／blockPersona 的注入範式。第 2 屆的解鎖載體（訓練營／集訓）之後接在
    // 這一行的條件上，不必再動 sim。
    comboScale: seasonIndex >= 2 ? 1 : 0,
    // stage 6 自由人：雙方都有（我方固定隊友、對方吃參數檔強度）
    liberos: {
      A: liberoA,
      B: buildLibero('B', oppDef.libero ?? `${oppDef.name}·自由人`, oppDef.level),
    },
    opponent: oppDef,
  };
}

// ---- 序列化（careerStore 用；與 Player 分開存 key，sim 改版不連坐生涯進度）----

export function serializeCareer(career) {
  return JSON.stringify(career);
}

export function deserializeCareer(json) {
  let raw = JSON.parse(json);
  // v1（stage 1：僅小組 3 場、帶固定 stage 欄位）→ v2 形狀：換完整賽程模板，戰績保留
  if (raw.version === 1) {
    raw = {
      version: 2,
      seed: raw.seed,
      playerName: raw.playerName,
      schedule: season1Schedule(raw.seed >>> 0),
      results: raw.results,
    };
  }
  // v2 → v3：補 growthPoints；既往場次追認每場 4 點（stage 3 前打的比賽不白打）
  if (raw.version === 2) {
    raw = {
      ...raw,
      version: CAREER_VERSION,
      growthPoints: (raw.results?.length ?? 0) * 4,
    };
  }
  if (raw.version !== CAREER_VERSION) {
    throw new Error(`生涯存檔版本不符：${raw.version}（需 ${CAREER_VERSION}）`);
  }
  for (const field of ['seed', 'playerName', 'schedule', 'results', 'growthPoints']) {
    if (raw[field] === undefined) throw new Error(`生涯存檔缺欄位：${field}`);
  }
  if (!Array.isArray(raw.schedule) || !Array.isArray(raw.results)) {
    throw new Error('生涯存檔 schedule/results 必須是陣列');
  }
  for (const m of raw.schedule) {
    if (!m.id || !m.opponentId) throw new Error('生涯存檔賽程項缺 id/opponentId');
    // 語意驗證：對手必須存在於參數檔——擋掉匯入壞資料在「出戰」當下才炸頁。
    // 大學卷批 6：大學章的賽程吃 `universities.js`，兩張表都算數（不放寬驗證，
    // 只是把「參數檔」的範圍補全——查不到仍然照丟）。
    // 企業章批 2：`corporations.js` 是第三張——漏掉它的話 enterCorporate 寫完存檔，
    // 下一次 loadSave 直接 throw＝整份存檔讀不回來（A2 系列測試實抓）。
    // 職業章批 2：`proTeams.js` 是第四張——同一顆地雷，漏掉的話 enterPro 寫完存檔，
    // 下一次 loadSave 直接 throw＝整份存檔讀不回來（B4 分母清單第 5 項）。
    if (!opponentById(m.opponentId) && !universityById(m.opponentId)
      && !corporationById(m.opponentId) && !proTeamById(m.opponentId)) {
      throw new Error(`生涯存檔含未知對手：${m.opponentId}`);
    }
  }
  return raw;
}

export { OPPONENTS, opponentById };
