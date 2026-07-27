// 存取層 — localStorage 介面卡（表現層側；src/sim 絕不 import 本檔）
// Phase 3 W1 起：單一 key 的 schema v2 存檔（結構定義在 schema.js）。
// 對外 API 維持 Phase 2 形狀（loadCareer/savePlayer…吃回 careerState v3 物件視圖）——
// W2–W5 把 runtime 邏輯搬上 v2 鍵後再收斂。
// storage 可注入替身（tests 用 Map 假體）；私密模式/配額爆掉一律安全降級不炸畫面
import { serializePlayer } from '../sim/player.js';
import { advanceSeason, PLAYER_TRUST_FLOOR } from './careerState.js';
import { applySeasonTurnover, buildDeficitFillIns } from './graduation.js';
import { defaultLineup, FRESHMAN_TRUST } from './lineup.js';
import { revealHeightForSeason } from './heightGrowth.js';
import { canExpel, EXPEL_TRUST_PENALTY } from './recruitment.js';
import { positionFlagsOf, markPositionReady, approvePositionOpen } from './positionFlags.js';
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
      if ((save.season.index ?? 1) >= 3) return false; // 高中章三屆封頂（W4 接生涯結算）
      const next = advanceSeason(view, opts);
      if (next === view) return false; // 賽季未結束
      let turnover = null;
      let heightReveal = null;
      const ok = writeSave((prev) => {
        // W3(P4) 建隊鏈參數化：換血缺額與預設陣一律吃玩家現任位置（轉位後 OH 洞由
        // 補位員補、預設陣把玩家排進新槽——見 tests/position-change）
        const playerRole = prev.player?.currentRole ?? 'outside';
        turnover = applySeasonTurnover({
          roster: prev.roster,
          seasonIndex: prev.season.index ?? 1,
          seed: next.seed,
          playerRole,
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
        const nextIndex = (prev.season.index ?? 1) + 1;
        // W2(P4) 身高揭曉：曲線創角時已預生成（player.height.plan），此處只揭曉
        // 下一屆值並 push timeline（同一次 RMW——儀式演出由 UI 吃回傳 heightReveal）
        const revealed = revealHeightForSeason(prev.player, nextIndex);
        heightReveal = revealed.reveal;
        return {
          ...prev,
          player: revealed.player,
          roster: turnover.roster,
          lineup,
          season: {
            ...seasonFromCareer(next, prev),
            index: nextIndex,
          },
        };
      });
      if (!ok) return false;
      return { ok: true, graduates: turnover.graduates, freshmen: turnover.freshmen, heightReveal };
    },
    // 現在第幾屆（UI 顯示用）
    seasonIndex() {
      const save = loadSave();
      return save?.season?.index ?? 1;
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
