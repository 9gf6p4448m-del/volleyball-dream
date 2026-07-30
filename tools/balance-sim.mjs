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
  accrueRecruitProgress, conditionMet, nextRecruitId,
} from '../src/career/recruitment.js';
import {
  createGame, stepGame, applySubstitution, applyTimeout, applyTimeoutBoost, startNextSet, TUNING,
} from '../src/sim/game.js';
import { STAMINA } from '../src/sim/stamina.js';
import { matchFormatOf } from '../src/career/schedule.js';
import { isBackRow } from '../src/sim/rotation.js';
import {
  createAiState, aiCollectIntents, aiTimeoutWanted, aiTimeoutBoost, aiSubstitutionWanted,
} from '../src/sim/ai.js';
import { matchStatsFor, growthPointsFor, GROWTH, GROWABLE_ATTRS } from '../src/career/growth.js';
import { buildDeficitFillIns } from '../src/career/graduation.js';
import { defaultLineup } from '../src/career/lineup.js';
import {
  digSuggestionFor, schemeByKey, schemeForDig, noteScheme, counterReadOf,
} from '../src/input/liberoRead.js';
import { opponentById } from '../src/career/opponents.js';
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
const MULTISET = process.env.VD_MULTISET === '1';
const USE_CALL = process.env.VD_CALL === '1';
const CALL_FREQ = 0.6; // 建議頻率近似（玩家不會每窗都按；初擬）
const CALL_GRANT = 0.7; // 與 matchLoop 同值
if (process.env.VD_NO_BREAK_RECOV === '1') STAMINA.RECOV_SET_BREAK = 0; // 治具端 patch
// W4 附錄 B-4 治具臂：VD_RIVAL=1＝把天鷹現任 ace 臨時打上宿敵旗（宿敵人設落檔前的
// 反讀量測用——對宿敵場另記 suggest/omni 差＝反讀對改判空間的制衡量化）
const USE_RIVAL = process.env.VD_RIVAL === '1';
if (USE_RIVAL) opponentById('sky-hawk').ace.rival = true;
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
function settleJoinsMirror(roster, recruitment, careerSeed, season, joinLog) {
  let r = roster;
  let rec = recruitment;
  for (const key of Object.keys(RECRUIT_CONDS)) {
    if (rec.recruited.includes(key) || !conditionMet(rec, key)) continue;
    if (openSlots(r) <= 0) continue;
    const id = nextRecruitId(r.members, rec.expelled);
    r = { ...r, members: [...r.members, buildRecruitMember(key, careerSeed, id, r.members)] };
    rec = { ...rec, recruited: [...rec.recruited, key] };
    joinLog.push({ key, season });
  }
  return { roster: r, recruitment: rec };
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
}));
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

for (let run = 0; run < RUNS; run += 1) {
  let career = createCareer({ seed: 100000 + run * 7919, playerName: '治具' });
  const player = createCareerPlayer('治具', HEIGHT_CM
    ? { heightCm: HEIGHT_CM, seed: career.seed }
    : {});
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
  for (let season = 1; season <= SEASONS; season += 1) {
    const titlesAtStart = career.titles ?? 0;
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
      if (mi === 5) for (const k of TEACH_BEFORE_FINAL) player.techniques[k] = 1;
      const entry = career.schedule[mi];
      // seasonIndex 補接（07-30 批4 送裁項 2）：漏傳＝VD_SEASONS 跨屆臂永遠打第 1 屆
      // 對手（量不到 ace 成長／畢業換臉）；單屆預設 season=1 行為逐值不變
      const setup = careerMatchSetup(
        career, player, entry, USE_ROSTER ? roster : null, lineup, season,
      );
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
      if (won) {
        perSeason[season - 1].wins[entry.id] += 1;
        tGroup.wins[entry.id] += 1;
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
      // 招募鏡像（正式路徑＝settleCareerMatch 累加→renderCareer 入隊，同節拍）；
      // FULL_ROSTER 臂固定名冊不跑（避免與手動注入的 R1-R3 重複入隊）
      if (USE_ROSTER && !USE_FULL_ROSTER) {
        recruitment = accrueRecruitProgress(recruitment, {
          opponentId: entry.opponentId, matchId: entry.id, won,
          events: g.events, playerId: 'A2', myTeam: 'A',
        });
        ({ roster, recruitment } = settleJoinsMirror(roster, recruitment, career.seed, season, joinLog));
      }
      // scouting 跨場累積（宿敵記憶）；戰績照實記（全國賽輸了也繼續模擬後段取數據）
      career = mergeScouting(career, entry.opponentId, g.scoutTally.A2);
      career = recordResult(career, {
        matchId: entry.id, won, scoreFor: s.A, scoreAgainst: s.B,
      });
    }
    // 冠軍線：六場全部真實串接下，國賽三連勝才算
    const natWins = career.results.slice(3).filter((r) => r.won).length;
    if (natWins === 3) {
      perSeason[season - 1].champions += 1;
      tGroup.champions += 1;
      if (season === 1) champions += 1;
    }
    if (season < SEASONS) career = advanceSeason(career);
  }
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
  console.log('\n=== 衛冕曲線（依屆初 titles 分組；TITLE_LEVEL_BONUS 收斂性）===');
  for (const t of [...byTitles.keys()].sort((a, b) => a - b)) {
    const gp = byTitles.get(t);
    const p = (n) => `${Math.round((n / gp.seasons) * 100)}%`.padStart(4);
    const row = matchIds.map((id) => p(gp.wins[id])).join(' ');
    console.log(`titles=${t}（${String(gp.seasons).padStart(4)} 屆） ${row}  奪冠 ${p(gp.champions)}`);
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
