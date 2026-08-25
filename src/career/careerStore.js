// 存取層 — localStorage 介面卡（表現層側；src/sim 絕不 import 本檔）
// Phase 3 W1 起：單一 key 的 schema v2 存檔（結構定義在 schema.js）。
// 對外 API 維持 Phase 2 形狀（loadCareer/savePlayer…吃回 careerState v3 物件視圖）——
// W2–W5 把 runtime 邏輯搬上 v2 鍵後再收斂。
// storage 可注入替身（tests 用 Map 假體）；私密模式/配額爆掉一律安全降級不炸畫面
import { serializePlayer } from '../sim/player.js';
import {
  advanceSeason, PLAYER_TRUST_FLOOR, normalizeCareerPlayer, seasonConcluded, deriveSeasonSeed,
} from './careerState.js';
import { uniSeasonTurnover } from './uniTurnover.js';
import { TRANSFER_ASKED_EV, TRANSFER_USED_EV } from './positionEvents.js';
// ★ 取別名 ★ store 上有個同名方法；物件方法不會遮蔽模組作用域的匯入（JS 這樣寫能動），
// 但同名會讓讀的人以為是遞迴。別名讓「純函式」與「會落檔的方法」一眼分得開。
import {
  normalizeChapter, enterUniversity as enterUniversityBlock, chapterCompleted, isUniversity,
} from './chapter.js';
import { seasonFinishOf } from './admission.js';
import { universityById } from './universities.js';
import { buildUniSchedule } from './uniSchedule.js';
import { buildUniMembers, uniStartTrustFor } from './uniTeam.js';
import { applySeasonTurnover, buildDeficitFillIns } from './graduation.js';
import { defaultLineup, FRESHMAN_TRUST } from './lineup.js';
import { revealHeightForSeason } from './heightGrowth.js';
import {
  canExpel, EXPEL_TRUST_PENALTY, RECRUIT_TRUST, buildRecruitMember, nextRecruitId,
  pendingWaiting, recruitTargetGone, waitingOf,
} from './recruitment.js';
import { positionFlagsOf, markPositionReady, approvePositionOpen } from './positionFlags.js';
import { markCampPending } from './trainingCamp.js';
import { normalizePractice } from './practiceMatch.js';
import {
  createSaveV2, seasonFromCareer, careerViewOf, deserializeSave, serializeSave,
  SCHEMA_VERSION,
} from './schema.js';
import { slotKey, slotHeadKey, slotMidKey, headOf } from './saveSlots.js';

export const SAVE_KEY = 'vd-save'; // ＝slotKey(1)：槽 1 沿用既有單檔 key（零遷移）
// Phase 2 雙 key 舊制（v1）：拍板不相容——偵測到即清空並提示重置，不做資料遷移
export const LEGACY_CAREER_KEY = 'vd-career-v1';
export const LEGACY_PLAYER_KEY = 'vd-career-player-v1';
export const SAVE_FORMAT = 'volleyball-dream-save';

// 4.6 §3-1 典藏牆槽結構正規化：{ champion, rival:{屆數: 卷} }。
// 舊存檔的單筆 finalRally（W4 格式：{matchId,seasonIndex,snapshot,steps}）沒有
// champion/rival 欄位＝一律讀成空牆（憲法縫隙 4：不寫回退相容層，但不得報錯）
export function vaultOf(career) {
  const v = career?.finalRally;
  const isSlots = v && typeof v === 'object' && ('champion' in v || 'rival' in v);
  return {
    champion: isSlots ? (v.champion ?? null) : null,
    rival: isSlots ? structuredClone(v.rival ?? {}) : {},
  };
}

// W4(P4) 題2：slot（1–3）決定 storage key——槽間零互通（各槽各自整包＋head＋mid 三 key）
export function createCareerStore(storage, slot = 1) {
  const store = storage ?? safeLocalStorage();
  const saveKey = slotKey(slot);
  const headKey = slotHeadKey(slot);
  const midKey = slotMidKey(slot);

  const read = (key) => {
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      store.setItem(key, value);
      return true;
    } catch {
      return false; // 配額滿/私密模式：呼叫端可提示，遊戲不中斷
    }
  };

  // v1 偵測（建 store 當下裁決一次；v1 是單檔時代產物＝只關槽 1 的事）：
  // 無 v2 存檔而有舊 key＝Phase 2 存檔——清空＋記旗標
  // 供 UI 提示「Phase 2 存檔不相容，已重置」；有 v2 存檔時舊 key 屬殘留，靜默清除
  let legacyReset = false;
  if (slot === 1) {
    try {
      const hadLegacy = read(LEGACY_CAREER_KEY) !== null || read(LEGACY_PLAYER_KEY) !== null;
      if (hadLegacy) {
        if (read(saveKey) === null) legacyReset = true;
        store.removeItem(LEGACY_CAREER_KEY);
        store.removeItem(LEGACY_PLAYER_KEY);
      }
    } catch { /* storage 不可用：當作無舊檔 */ }
  }

  // 讀整包 v2 存檔；任何損毀（壞 JSON/缺鍵/版本無路徑）→ null（壞檔視同無存檔，不炸開機）
  const loadSave = () => {
    const json = read(saveKey);
    if (json === null) return null;
    try {
      return deserializeSave(json);
    } catch {
      return null;
    }
  };
  // 存檔頭同步（題2「寫入時同步維護」）：選檔頁卡片讀 head 不解整包。
  // head 寫失敗不影響主存檔成敗（卡片資料走 readSlotHeads 自癒路徑補）
  const syncHead = (save) => {
    const head = headOf(save);
    try {
      if (head) store.setItem(headKey, JSON.stringify(head));
      else store.removeItem(headKey);
    } catch { /* 下次寫入或自癒再補 */ }
  };
  // 讀寫合一（RMW）：saveCareer/savePlayer 各自只動自己的欄位，其餘鍵原樣保留
  const writeSave = (mutate) => {
    const prev = loadSave();
    const next = mutate(prev);
    const ok = write(saveKey, serializeSave(next));
    if (ok) syncHead(next);
    return ok;
  };

  return {
    // 本 store 綁定的槽號（返回網址帶槽、UI 顯示用）
    slotIndex() {
      return slot;
    },
    // v1 清空是否發生（UI 顯示重置提示用；session 內恆定）
    wasLegacyReset() {
      return legacyReset;
    },
    hasSave() {
      const save = loadSave();
      return !!(save && save.player && careerViewOf(save));
    },
    loadCareer() {
      const save = loadSave();
      return save ? careerViewOf(save) : null;
    },
    saveCareer(career) {
      return writeSave((prev) => {
        const next = prev ?? createSaveV2({ player: null });
        return { ...next, season: seasonFromCareer(career, prev) };
      });
    },
    loadPlayer() {
      const save = loadSave();
      return save?.player ? structuredClone(save.player) : null;
    },
    // W2 名冊：整包 roster 讀寫（{capacity, members}）；members 補齊/成長都走 RMW
    loadRoster() {
      const save = loadSave();
      return save ? structuredClone(save.roster) : null;
    },
    saveRoster(roster) {
      return writeSave((prev) => ({ ...(prev ?? createSaveV2({})), roster }));
    },
    // W3 先發編排：整包 lineup 讀寫（{starters, libero, rotationStart, trust}）；
    // 補齊/遷移/玩家排陣都走 RMW（其餘鍵原樣保留）
    loadLineup() {
      const save = loadSave();
      return save ? structuredClone(save.lineup) : null;
    },
    saveLineup(lineup) {
      return writeSave((prev) => ({ ...(prev ?? createSaveV2({})), lineup }));
    },
    // W5 賽季輪迴：季末（奪冠/止步）→ 下一屆。season 重置賽程戰績＋index+1。
    // 賽季未結束＝no-op 回 false（防 UI 誤觸）。
    // W6 A2：opts.invitedId＝指定邀請隊（輪抽必入小組；null＝不指定）。
    // W1(P4) 時間系統：①高中章固定三屆——第 3 屆季末不再推進（回 false；生涯結算
    // ＝W4）②單次 RMW 一併換血：畢業（三年級離隊→alumni）→年級推進→新生入學
    // （graduation.applySeasonTurnover）→lineup 重排預設陣（畢業者出陣、trust
    // 倖存者沿用/新生顯式 10——W2 拍板）→身高揭曉（heightGrowth，W2）。成功回
    // { ok:true, graduates, freshmen, heightReveal }（UI 儀式消費；truthy 相容
    // 既有 if (!advanceSeason()) 判式；heightReveal 舊檔無曲線＝null）。
    advanceSeason(opts = {}) {
      const save = loadSave();
      const view = save ? careerViewOf(save) : null;
      if (!view) return false;
      // 封頂改由章節決定（大學卷批 4，2026-08-14）——★不再寫死 3★
      // 高中仍是三屆（`CHAPTER_SEASONS`），行為逐值不變；大學的年限同表另計。
      // 債 C（2026-08-25）：chapterCompleted 是**年限封頂**（這一章沒有下一年了），
      // 「這一季打完了沒」是另一個問題＝careerState.seasonConcluded（單一定義）。
      // 推進條件＝seasonConcluded && !chapterCompleted（大二卷批 1 接線兌現）。
      if (chapterCompleted(save.career?.chapter, save.season.index ?? 1)) return false;
      // ★★ 大二卷批 1：大學屆間推進 ★★（acceptance-uni-y2-batch1.md）
      // 高中路徑一行不動（往下走原分支）；大學＝uniSchedule 重建＋uniTurnover 換血，
      // careerState.advanceSeason 的高中純函式不進來（它的 league 守衛照舊擋著）。
      if (isUniversity(normalizeChapter(save.career ?? null))) {
        if (!seasonConcluded(view)) return false; // 季未收束＝不推進（單一定義，債 C）
        const schoolId = save.career?.school ?? null;
        // 學校解不開的壞存檔：不猜、不推進（比照 enterUniversity「查得到才算數」）
        if (!universityById(schoolId)) return false;
        let uniTurn = null;
        const ok = writeSave((prev) => {
          const endingSeason = prev.season.index ?? 1;
          // 決定論鏈：下一屆種子由本屆種子衍生（與高中同一顆 deriveSeasonSeed）；
          // 賽程與換血吃同一顆 seed——同存檔重演逐值一致
          const nextSeed = deriveSeasonSeed(prev.season.seed ?? 1);
          uniTurn = uniSeasonTurnover({
            roster: prev.roster, schoolId, seasonIndex: endingSeason, seed: nextSeed,
          });
          const playerRole = prev.player?.currentRole ?? 'outside';
          const lineup = defaultLineup(uniTurn.roster.members, prev.player?.id ?? 'A2', playerRole);
          // trust 跟人（高中屆間同語意）：倖存者沿用、畢業者鍵自然消失、新生顯式 10。
          // ★ 玩家的 player.trust.fromSetter 這裡完全不碰＝題 3「跨年原值帶走」的
          // 翻盤本體——強豪 27 起、每年打球自然累積，屆間不歸零 ★
          const prevTrust = prev.lineup?.trust ?? {};
          for (const id of Object.keys(lineup.trust)) {
            if (prevTrust[id] !== undefined) lineup.trust[id] = prevTrust[id];
          }
          for (const f of uniTurn.freshmen) {
            if (lineup.trust[f.id] !== undefined) lineup.trust[f.id] = FRESHMAN_TRUST;
          }
          // 屆末封存本屆摘要（與高中同一份 archiveSeasonSummary——歷屆數據頁吃它；
          // 名次紀錄的結構化欄位是批 3，本批先讓戰績不因 results 清空而消失）
          const seasons = [...(prev.career.seasons ?? []), archiveSeasonSummary(prev.season)];
          return {
            ...prev,
            roster: uniTurn.roster,
            lineup,
            career: { ...prev.career, seasons },
            season: {
              ...prev.season,
              index: endingSeason + 1,
              seed: nextSeed,
              schedule: buildUniSchedule({ schoolId, seed: nextSeed }),
              results: [],
              // 當屆旗標逐屆重置（與高中 careerState.advanceSeason 同兩顆）；
              // 其餘 events（已播劇情/傳授旗標）跨屆有效照舊帶入
              events: (prev.season.events ?? []).filter(
                (e) => e !== TRANSFER_ASKED_EV && e !== TRANSFER_USED_EV,
              ),
              pendingMatch: undefined,
            },
          };
        });
        if (!ok) return false;
        // 畢業送別/新生亮相的儀式演出＝批 4；本批回資料讓 UI 直接重繪
        return { ok: true, graduates: uniTurn.graduates, freshmen: uniTurn.freshmen };
      }
      // 4.5A 宿敵保底：下一屆屆數傳入賽程生成（第 2 屆天鷹掛準決賽）
      const next = advanceSeason(view, { ...opts, seasonIndex: (save.season.index ?? 1) + 1 });
      if (next === view) return false; // 賽季未結束
      let turnover = null;
      let heightReveal = null;
      const ok = writeSave((prev) => {
        // W3(P4) 建隊鏈參數化：換血缺額與預設陣一律吃玩家現任位置（轉位後 OH 洞由
        // 補位員補、預設陣把玩家排進新槽——見 tests/position-change）
        const playerRole = prev.player?.currentRole ?? 'outside';
        const endingSeason = prev.season.index ?? 1;
        const nextIdx = endingSeason + 1;
        const rec = prev.recruitment ?? { progress: {}, recruited: [] };
        // P2②：等候名單的當屆有效順位（已入隊/目標已畢業者出列——D1 ace 降年級後
        // 作廢時點跟著變，判準只有 recruitTargetGone 一份）
        const waiting = pendingWaiting(rec, nextIdx);
        // P2①：本屆有無招募入隊——成員的 joinedSeason 是唯一判準（含當屆被逐出者，
        // 否則「招到就逐出」可以無限換來投）
        const joinedThisSeason = prev.roster.members.some((m) => m.joinedSeason === endingSeason)
          || (rec.expelled ?? []).some((e) => e.member?.joinedSeason === endingSeason);
        turnover = applySeasonTurnover({
          roster: prev.roster,
          seasonIndex: endingSeason,
          seed: next.seed,
          playerRole,
          waiting,
          // 等候者生成器：id 掃現役∪校友∪逐出（R id 不回收）、屆數＝入隊當屆、
          // 名冊當下水位補正（W6 入隊補正——晚一屆入隊的人跟上隊伍成長）
          buildWaitingMember: (key, members, alumni) => (
            recruitTargetGone(key, nextIdx)
              ? null
              : buildRecruitMember(
                key,
                prev.season.seed ?? 1,
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
        // 預設陣重排：畢業者不可留在 starters；trust 跟人——倖存者沿用舊值、
        // 畢業者鍵自然消失、新生顯式寫入（勿依賴缺鍵回退——W3 §6b）。
        // W2(P4) 拍板：新生 trust 初值 10（對齊招募生；創隊班底維持預設 20）
        const lineup = defaultLineup(turnover.roster.members, prev.player?.id ?? 'A2', playerRole);
        const prevTrust = prev.lineup?.trust ?? {};
        for (const id of Object.keys(lineup.trust)) {
          if (prevTrust[id] !== undefined) lineup.trust[id] = prevTrust[id];
        }
        for (const f of turnover.freshmen) {
          if (lineup.trust[f.id] !== undefined) lineup.trust[f.id] = FRESHMAN_TRUST;
        }
        // P2①②：來投者＝新血同級（10）；等候名單遞補者＝招募生初值（RECRUIT_TRUST）
        for (const m of [...(turnover.admitted ?? []), ...(turnover.walkOn ? [turnover.walkOn] : [])]) {
          if (lineup.trust[m.id] !== undefined) {
            lineup.trust[m.id] = m.origin === 'walkon' ? FRESHMAN_TRUST : RECRUIT_TRUST;
          }
        }
        const nextIndex = nextIdx;
        // W2(P4) 身高揭曉：曲線創角時已預生成（player.height.plan），此處只揭曉
        // 下一屆值並 push timeline（同一次 RMW——儀式演出由 UI 吃回傳 heightReveal）
        const revealed = revealHeightForSeason(prev.player, nextIndex);
        heightReveal = revealed.reveal;
        // W4(P4) Q9/Q5：屆末封存本屆摘要（season.results 換屆即重置——生涯累積頁
        // 與 Q5 結算吃這裡；同一次 RMW 原子寫入）
        const seasons = [
          ...(prev.career.seasons ?? []),
          archiveSeasonSummary(prev.season),
        ];
        // P2②：遞補入隊者記進 recruited（＝挖角成功，只是慢了一屆）、出等候名單；
        // 目標已畢業而作廢者一併出列（同一次 RMW——不留「在名冊又在等候」的中間態）
        const admittedKeys = turnover.admittedKeys ?? [];
        const restWaiting = waitingOf(rec).filter(
          (k) => !admittedKeys.includes(k) && !recruitTargetGone(k, nextIdx),
        );
        const recruitment = {
          ...rec,
          recruited: [...(rec.recruited ?? []), ...admittedKeys],
          ...(restWaiting.length || rec.waiting ? { waiting: restWaiting } : {}),
        };
        // 屆間養成卷（覆審 HIGH-1）：集訓待辦與屆數推進**同一次 RMW**落檔。
        // 分兩筆寫會留下「seasonIndex 已推進、待辦還沒寫」的縫，在那一格被殺＝
        // 該屆集訓（屬性特訓＋一生一次的默契選擇）永久消失。集訓完成時由
        // careerScreen 清旗標（clearCampPending），與集訓成果同一次 savePlayer。
        // ★ 順手補正跨版本欄位（第三輪覆審／原 LOW-2 的行為面）★ 舊檔（Phase 3 前，
        // 無 `chemistry`）在集訓什麼都沒選時，careerScreen 會把讀出來的 player 原樣寫回，
        // 把 `chemistry: undefined` 固化進存檔。補在**屆間這一次落檔**＝任何消費端
        // （含中途被殺後重開的那條復原路徑）讀到的都已經是完整形狀，不倚賴 UI 那一行。
        const advancedPlayer = markCampPending(revealed.player, nextIndex);
        if (advancedPlayer) normalizeCareerPlayer(advancedPlayer);
        return {
          ...prev,
          player: advancedPlayer,
          roster: turnover.roster,
          lineup,
          recruitment,
          career: { ...prev.career, seasons },
          season: {
            ...seasonFromCareer(next, prev),
            index: nextIndex,
          },
        };
      });
      if (!ok) return false;
      return {
        ok: true,
        graduates: turnover.graduates,
        freshmen: turnover.freshmen,
        // P2②遞補入隊者（招募儀式演出）／P2①來投者（來投見面台詞）
        admitted: turnover.admitted ?? [],
        walkOn: turnover.walkOn ?? null,
        heightReveal,
      };
    },
    // 現在第幾屆（UI 顯示用）
    seasonIndex() {
      const save = loadSave();
      return save?.season?.index ?? 1;
    },
    // ★★ 治具專用（大學卷批 3，2026-08-14）★★ 整份覆蓋當前槽。
    // **正式流程不得呼叫**——它會蓋掉整份存檔，存在的唯一理由是 `devSeed` 的
    // 合成存檔要寫得進去（免得為了測升學要真的打三年）。
    // 安全靠呼叫端：`devSeedRequest` 缺參數／無合法槽就不啟動（見 devSeed.js 檔頭）。
    seedWholeSave(save) {
      if (!save) return false;
      return writeSave(() => save);
    },
    // 生涯章節（大學卷批 1，2026-08-14）——★讀出來一律過 normalizeChapter★
    // 舊存檔的 `career` 是 `{}`（Phase 3 預留鍵），逐項回退＝零遷移，不動 schema 版本。
    loadChapter() {
      return normalizeChapter(loadSave()?.career ?? null);
    },
    // 推進到大學章＋記下選了哪一所（大學卷批 5，2026-08-14）。
    // 冪等（enterUniversity 內部保證）——按兩次不會變成兩次升學，**學校也不會被覆寫**
    // （UI 重入、玩家連點兩下都不該改掉已經決定的志願）。
    // ★ enteredAtSeason ＝ 現在的屆數 +1 ★ 全域屆數是線性的（高中 1→2→3，大學接 4）：
    // 升學發生在第 3 屆季末，而大學的第一年是**第 4 屆**。批 1 這裡原本傳 `season.index`
    // （＝3），會讓高中第 3 屆與大學大一共用同一個屆數 ⇒ `chapterSeasonOf` 的語意分裂。
    // 純函式層的測試（`tests/chapter-state.test.mjs`）本來就是拿 4 在驗，這裡對齊它。
    // ⚠ `season.index` 本身**不動**——大學賽程是批 6，先把屆數推過去就會掉進空狀態。
    enterUniversity(schoolId = null) {
      return writeSave((prev) => {
        const base = prev ?? createSaveV2({});
        const nextSeason = (base?.season?.index ?? 0) + 1;
        const nextBlock = enterUniversityBlock(base.career, nextSeason);
        const already = base.career?.school;
        const school = already ?? (typeof schoolId === 'string' && schoolId ? schoolId : null);
        if (!school) return { ...base, career: nextBlock };
        const uni = universityById(school);
        if (!uni || already) return { ...base, career: { ...nextBlock, school } };
        // ★★ 批 6：真的搬進那所大學 ★★ 這一整段是**同一次 RMW**——名冊、先發、球權、
        // 賽程、屆數要嘛一起換好，要嘛一個都不換。分兩次寫的話中間斷電（或寫入失敗）
        // 會留下「已經是大學章、名冊還是高中隊友」的半吊子存檔。
        const members = buildUniMembers(school);
        const playerRole = base.player?.currentRole ?? 'outside';
        const lineup = defaultLineup(members, base.player?.id ?? 'A2', playerRole);
        return {
          ...base,
          career: {
            ...nextBlock,
            school,
            // 高中名冊封存（拍板：不隨行，但生涯數據頁還看得到）
            highSchoolRoster: base.roster ?? null,
          },
          roster: { capacity: members.length + 1, members, alumni: [] },
          lineup,
          // 球權四軸的「球權」：強豪從地板起、弱校你就是王牌（`uniTeam.js`）。
          // ★ 只動 `fromSetter` ★ `player.trust` 是物件 `{fromSetter, floorShare}`
          //（`careerState.js:259-264`）——整個換成數字會把 `floorShare`（0.27 的球權
          // 保底「玩家不得淪為觀眾」）一起洗掉。地板與學校無關，任何學校都要留著。
          player: base.player
            ? {
              ...base.player,
              trust: { ...(base.player.trust ?? {}), fromSetter: uniStartTrustFor(uni) },
            }
            : base.player,
          season: {
            ...base.season,
            index: nextSeason,
            schedule: buildUniSchedule({ schoolId: school, seed: base.season?.seed ?? 1 }),
            results: [],
            events: [],
            pendingMatch: undefined,
          },
        };
      });
    },
    // 升學時封存的高中名冊（拍板：不隨行，但生涯數據頁還看得到）。沒升學＝null。
    loadHighSchoolRoster() {
      const r = loadSave()?.career?.highSchoolRoster ?? null;
      return r?.members?.length ? structuredClone(r) : null;
    },
    // 選了哪一所大學（沒選過＝null；`universityById` 查得到才算數，防手改存檔）。
    loadSchool() {
      const id = loadSave()?.career?.school;
      return typeof id === 'string' && universityById(id) ? id : null;
    },
    // 練習賽卷（2026-08-12）：屆間紅白對抗賽的成績（`practiceRecordOf` 的形狀）。
    // ★ 讀出來一律過 normalizePractice ★ 舊存檔沒有這個鍵、手改的存檔可能只有半組欄位；
    // 逐鍵回退讓呼叫端拿到的恆是完整形狀（不用各自 `?? 0`，那會漂移成好幾份預設值）。
    loadPractice() {
      return normalizePractice(loadSave()?.practice ?? null);
    },
    savePractice(record) {
      return writeSave((prev) => ({
        ...(prev ?? createSaveV2({})),
        practice: normalizePractice(record),
      }));
    },
    // W4 招募：整包 recruitment 讀寫（{progress, recruited}）；賽末累加走 RMW
    loadRecruitment() {
      const save = loadSave();
      return save ? structuredClone(save.recruitment) : null;
    },
    saveRecruitment(recruitment) {
      return writeSave((prev) => ({ ...(prev ?? createSaveV2({})), recruitment }));
    },
    // W4 入隊：單次 RMW 原子寫入三處（名冊＋trust 顯式初值＋recruited 標記）——
    // 分三筆寫在中途失敗會留下「入了名冊沒記 recruited」的重複入隊隱患
    applyRecruit({ member, opponentId, trust }) {
      return writeSave((prev) => {
        const next = prev ?? createSaveV2({});
        return {
          ...next,
          roster: { ...next.roster, members: [...next.roster.members, member] },
          lineup: {
            ...next.lineup,
            trust: { ...(next.lineup.trust ?? {}), [member.id]: trust },
          },
          recruitment: {
            ...next.recruitment,
            recruited: [...next.recruitment.recruited, opponentId],
            // P2②：等候中的人入隊即出隊列（同一次 RMW，不留「在名冊又在等候」的中間態）
            ...(next.recruitment.waiting
              ? { waiting: next.recruitment.waiting.filter((k) => k !== opponentId) }
              : {}),
          },
        };
      });
    },
    // W5 逐出資格（UI 閘門用）：回傳 { ok, reason }——讀當前整包存檔判定
    canExpel(memberId) {
      return canExpel(loadSave(), memberId);
    },
    // W5 逐出：applyRecruit 的鏡像——單次 RMW 原子完成三處（名冊移除＋全隊 trust −5
    // 夾限≥0＋expelled 記錄），不留「移出名冊卻沒記 expelled」的中間態。
    // 邊界最後防線（UI 已先擋）：不符資格＝原樣返回不動。被逐者自身 trust key 一併移除。
    // expelled 條目存完整成員快照＋當屆序號＋當時冠軍數（Phase 4 轉學回歸素材鏈用）。
    applyExpel({ memberId }) {
      return writeSave((prev) => {
        if (!prev || !canExpel(prev, memberId).ok) return prev;
        const member = prev.roster.members.find((m) => m.id === memberId);
        const trust = Object.fromEntries(
          Object.entries(prev.lineup.trust ?? {})
            .filter(([id]) => id !== memberId)
            .map(([id, v]) => [id, Math.max(0, v - EXPEL_TRUST_PENALTY)]),
        );
        return {
          ...prev,
          roster: {
            ...prev.roster,
            members: prev.roster.members.filter((m) => m.id !== memberId),
          },
          lineup: { ...prev.lineup, trust },
          recruitment: {
            ...prev.recruitment,
            expelled: [
              ...(prev.recruitment.expelled ?? []),
              {
                member,
                seasonIndex: prev.season?.index ?? 1,
                titlesAtExpel: prev.season?.titles ?? 0,
              },
            ],
          },
        };
      });
    },
    // W3(P4) 轉位（教練談話接受後的存檔面）：單次 RMW 原子完成三處——
    // ①player.currentRole 改寫（naturalRole/身高/志願不動）②新角色造成的名冊缺額
    // 補位員入隊（縫隙 1「被取代者=補位員或招募生」；season.seed 決定論，同存檔同輸出）
    // ③lineup 依新角色重排預設陣（trust 跟人沿用、補位員顯式 FRESHMAN_TRUST）。
    // 讓位者（如阿哲讓出主舉）自然落板凳（defaultStarters 玩家佇列優先）；劇情層在 events。
    // libero（工單 §8）：玩家不入先發、lineup.libero＝玩家（defaultLineup L 特例）、
    // 比賽面走 careerMatchSetup 的 liberos 通道＋applyLiberoSwaps。
    applyPositionChange(role) {
      if (!['setter', 'middle', 'opposite', 'outside', 'libero'].includes(role)) return false;
      return writeSave((prev) => {
        if (!prev?.player) return prev;
        // 甲2 拍板：轉 S＝trustFloor 停用（分配者沒有保底對象）；轉回攻擊位＝恢復
        const player = {
          ...prev.player,
          currentRole: role,
          trust: {
            ...prev.player.trust,
            floorShare: role === 'setter' ? 0 : PLAYER_TRUST_FLOOR,
          },
        };
        const alumni = prev.roster.alumni ?? [];
        const usedNames = [
          ...prev.roster.members.map((m) => m.fullName),
          ...alumni.map((a) => a.member?.fullName),
        ].filter(Boolean);
        const fillIns = buildDeficitFillIns({
          seed: prev.season.seed ?? 1,
          members: prev.roster.members,
          usedNames,
          alumni,
          playerRole: role,
        });
        const members = [...prev.roster.members, ...fillIns];
        const lineup = defaultLineup(members, player.id, role);
        const prevTrust = prev.lineup?.trust ?? {};
        for (const id of Object.keys(lineup.trust)) {
          if (prevTrust[id] !== undefined) lineup.trust[id] = prevTrust[id];
        }
        for (const f of fillIns) {
          if (lineup.trust[f.id] !== undefined) lineup.trust[f.id] = FRESHMAN_TRUST;
        }
        return { ...prev, player, roster: { ...prev.roster, members }, lineup };
      });
    },
    // W3(P4) 位置開放旗標：讀取（缺鍵容錯全 locked）＋兩條寫入路徑。
    // 寫入只暴露 markPositionReady（工程結案 locked→ready）與 approveOpenPosition
    // （?openPosition= 手批 ready→open）——自動化路徑寫不出 open（甲4 鐵律，測試背書）
    loadPositionFlags() {
      return positionFlagsOf(loadSave());
    },
    markPositionReady(pos) {
      return writeSave((prev) => {
        const next = prev ?? createSaveV2({});
        const flags = markPositionReady(positionFlagsOf(next), pos);
        return { ...next, career: { ...next.career, positionFlags: flags } };
      });
    },
    // 手批入口（main.js ?openPosition= 專用）：未 ready＝回 false 不動存檔（誤觸不炸開機）；
    // ready→open 寫入後回 true。合法性判定交給純函式（throw 由此處轉安全值）
    approveOpenPosition(pos) {
      try {
        return writeSave((prev) => {
          const next = prev ?? createSaveV2({});
          const flags = approvePositionOpen(positionFlagsOf(next), pos);
          return { ...next, career: { ...next.career, positionFlags: flags } };
        });
      } catch {
        return false;
      }
    },
    savePlayer(player) {
      // 走 serializePlayer 正規化（沿用既有格式；three/函式參照擋在存檔外）
      const plain = JSON.parse(serializePlayer(player));
      return writeSave((prev) => ({ ...(prev ?? createSaveV2({})), player: plain }));
    },
    // W4(P4) Q9：對手 ace 對戰數據（跨屆累積——餵情蒐「上次交手他扣了 18 分」）。
    // 落 save.career.aceBook（career 鍵＝Phase 4 預留自由區；schema 不動）
    recordAceBook(opponentId, ace) {
      return writeSave((prev) => {
        const next = prev ?? createSaveV2({});
        const book = { ...(next.career.aceBook ?? {}) };
        const old = book[opponentId] ?? { matches: 0, total: { kills: 0, aces: 0, blocks: 0 } };
        book[opponentId] = {
          name: ace.name,
          matches: old.matches + 1,
          last: { kills: ace.kills, aces: ace.aces, blocks: ace.blocks },
          total: {
            kills: old.total.kills + ace.kills,
            aces: old.total.aces + ace.aces,
            blocks: old.total.blocks + ace.blocks,
          },
        };
        return { ...next, career: { ...next.career, aceBook: book } };
      });
    },
    loadAceBook() {
      const save = loadSave();
      return structuredClone(save?.career?.aceBook ?? {});
    },
    // W4(P4) Q9 生涯累積頁：歷屆封存摘要（advanceSeason 屆末寫入）＋讀取
    loadSeasonArchive() {
      const save = loadSave();
      return structuredClone(save?.career?.seasons ?? []);
    },
    // W4(P4) W3 債務 5：一次性事件已播旗標（跨屆持久——不隨 season.events 逐屆重置）
    loadPlayedOnce() {
      const save = loadSave();
      return [...(save?.career?.playedOnce ?? [])];
    },
    markPlayedOnce(ids) {
      if (!ids?.length) return true;
      return writeSave((prev) => {
        const next = prev ?? createSaveV2({});
        const played = new Set(next.career.playedOnce ?? []);
        for (const id of ids) played.add(id);
        return { ...next, career: { ...next.career, playedOnce: [...played] } };
      });
    },
    // 4.5B §2-3 頻率框架：招牌演出「敘事第一次」計數（跨屆持久、逐槽）。
    // 落 save.career.presentation.seenSignature（career 自由區慣例，同 aceBook）；
    // 舊存檔無此欄＝空物件＝全部視為未看過（工單原文）
    loadSeenSignatures() {
      const save = loadSave();
      return structuredClone(save?.career?.presentation?.seenSignature ?? {});
    },
    markSignatureSeen(key) {
      if (!key) return true;
      return writeSave((prev) => {
        const next = prev ?? createSaveV2({});
        const pres = next.career.presentation ?? {};
        const seen = { ...(pres.seenSignature ?? {}), [key]: true };
        return {
          ...next,
          career: { ...next.career, presentation: { ...pres, seenSignature: seen } },
        };
      });
    },
    // 4.6 §3-1 典藏牆固定四槽：champion＝冠軍點（W4 起既有語意）、rival[屆數]＝
    // 該屆天鷹掛點場的最後一球（勝敗皆錄）。**上限恆為 4 筆、屆數即 key、永不覆寫**
    // ——已有內容就不動（同屆重打不覆蓋既有記憶）。
    // 存檔結構由單筆改槽結構＝不寫回退相容層（憲法縫隙 4：刪檔重開）；
    // 舊存檔的單筆 finalRally 無 champion/rival 欄位＝讀成空牆、不報錯。
    recordVaultRally(slot, payload) {
      return writeSave((prev) => {
        const next = prev ?? createSaveV2({});
        const vault = vaultOf(next.career);
        if (slot === 'champion') {
          return { ...next, career: { ...next.career, finalRally: { ...vault, champion: payload } } };
        }
        const key = String(slot);
        if (vault.rival[key]) return next; // 永不覆寫
        return {
          ...next,
          career: {
            ...next.career,
            finalRally: { ...vault, rival: { ...vault.rival, [key]: payload } },
          },
        };
      });
    },
    loadRallyVault() {
      return vaultOf(loadSave()?.career);
    },
    clear() {
      try {
        store.removeItem(saveKey);
        store.removeItem(headKey);
        store.removeItem(midKey);
        if (slot === 1) {
          store.removeItem(LEGACY_CAREER_KEY);
          store.removeItem(LEGACY_PLAYER_KEY);
        }
      } catch { /* ignore */ }
    },
    // W4(P4) Q8 局間存檔：比賽中間態（多局賽制的換邊休息點快照）獨立 key 讀寫。
    // 形狀由多局狀態機定義（matchSets）——store 只管序列化與槽綁定；
    // 壞檔＝null（沿「壞檔視同無存檔」慣例，不炸開機）
    saveMidMatch(data) {
      return write(midKey, JSON.stringify(data));
    },
    loadMidMatch() {
      const json = read(midKey);
      if (json === null) return null;
      try {
        return JSON.parse(json);
      } catch {
        return null;
      }
    },
    clearMidMatch() {
      try {
        store.removeItem(midKey);
      } catch { /* ignore */ }
    },
    hasMidMatch() {
      return read(midKey) !== null;
    },
    // 匯出/匯入：整包 v2 存檔（換裝置用）；匯入走 schema 完整驗證，壞檔直接 throw
    exportSave() {
      const save = loadSave();
      if (!save || !save.player || !careerViewOf(save)) {
        throw new Error('沒有可匯出的生涯存檔');
      }
      return JSON.stringify({ format: SAVE_FORMAT, schemaVersion: SCHEMA_VERSION, save }, null, 2);
    },
    importSave(text) {
      const raw = JSON.parse(text);
      if (raw.format !== SAVE_FORMAT) throw new Error('不是排球夢的存檔檔案');
      // Phase 2 匯出檔（{format, career, player} 雙物件形）：同拍板走不相容
      if (raw.save === undefined) {
        throw new Error('Phase 2 存檔不相容（schema v2 起無遷移路徑），無法匯入');
      }
      const save = deserializeSave(JSON.stringify(raw.save));
      if (!save.player || !careerViewOf(save)) {
        throw new Error('存檔內容不完整（缺主角或賽季資料）');
      }
      if (!write(saveKey, serializeSave(save))) {
        throw new Error('存檔寫入失敗（儲存空間不可用）');
      }
      syncHead(save);
      return { career: careerViewOf(save), player: structuredClone(save.player) };
    },
  };
}

// W4(P4) 題2：可切槽 store 代理——careerScreen 與比賽鏈拿它當單一 store 用（API 同形），
// 選檔頁切槽時 useSlot 重綁內部實體。設計動機：careerScreen 內部數十處 store.* 呼叫
// 零改動（代理轉呼叫恆指向現任槽）；比賽期間不切槽（選定即鎖）。
export function createSlotStoreProxy(storage, initialSlot = 1) {
  const backing = storage ?? safeLocalStorage(); // 三槽共用同一個 storage 替身（槽間隔離靠 key）
  let slot = initialSlot;
  let inner = createCareerStore(backing, slot);
  const proxy = {
    useSlot(n) {
      slot = n;
      inner = createCareerStore(backing, n);
    },
    activeSlot() {
      return slot;
    },
    storage() {
      return backing; // 選檔頁 readSlotHeads 用（跨槽讀 head 不經單槽 store）
    },
  };
  for (const k of Object.keys(inner)) {
    if (typeof inner[k] === 'function' && !(k in proxy)) {
      proxy[k] = (...args) => inner[k](...args);
    }
  }
  return proxy;
}

// W4(P4) Q9：屆末摘要（生涯累積頁/Q5 結算的資料底）——戰績＋主角逐場數據總和。
// 純函式；liberoBox 若該屆有 L 場次一併加總（四欄中的三欄；改判在 overrides）
export function archiveSeasonSummary(season) {
  const results = season.results ?? [];
  const totals = {
    kills: 0, tipKills: 0, aces: 0, blockPoints: 0, perfects: 0,
    digs: 0, assistDigs: 0, rallySaves: 0,
  };
  for (const r of results) {
    const st = r.stats;
    if (!st) continue;
    totals.kills += st.kills ?? 0;
    totals.tipKills += st.tipKills ?? 0;
    totals.aces += st.aces ?? 0;
    totals.blockPoints += st.blockPoints ?? 0;
    totals.perfects += st.perfects ?? 0;
    if (st.liberoBox) {
      totals.digs += st.liberoBox.digs ?? 0;
      totals.assistDigs += st.liberoBox.assistDigs ?? 0;
      totals.rallySaves += st.liberoBox.rallySaves ?? 0;
    }
  }
  return {
    index: season.index ?? 1,
    wins: results.filter((r) => r.won).length,
    losses: results.filter((r) => !r.won).length,
    champion: results.some((r) => r.matchId === 'national-final' && r.won),
    // 大學卷批 2（2026-08-14）：升學評定要「三屆最佳成績」，而 champion 只分得出
    // 冠軍／非冠軍——亞軍與八強在這裡長得一模一樣。多存一個五級名次。
    // ★ 加在既有封存裡，不另開一份歷史 ★ 兩份同義的歷史遲早互相矛盾。
    // 舊條目沒有這個欄位＝`admission.normalizeSeasonLog` 回退用 champion 判（見該檔）。
    finish: seasonFinishOf({ results }),
    totals,
  };
}

// 私密模式連 localStorage 物件都可能 throw——退化為記憶體存檔（本次分頁有效）
function safeLocalStorage() {
  try {
    const s = globalThis.localStorage;
    s.getItem(SAVE_KEY);
    return s;
  } catch {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: (k) => { m.delete(k); },
    };
  }
}
