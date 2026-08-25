// 屆間養成卷（2026-08-09 Sawmah 六題裁定）— 集訓的**純資料層**（零 DOM／零存檔 IO）
//
// 高中章固定三屆 ⇒ 屆間鏈恰好跑兩次（advanceSeason 後 seasonIndex=2 與 =3），
// 集訓因此恰好兩次。外殼同一套、只換內容格（題一裁定丙）：
//   第一次（→第 2 屆）：技術補修（叫戰術）＋屬性特訓
//   第二次（→第 3 屆）：屬性特訓＋默契
//
// ★ 本卷第一個交付＝顯示層＋外殼，默契零效果 ★（題五裁定：量測先於參數）
// 選了誰只寫進 `player.chemistry.focusId`，沒有任何消費端讀它。
import { ATTRIBUTE_KEYS } from '../sim/player.js';
import { GROWABLE_ATTRS, OFFSEASON } from './growth.js';
import { roleLabel } from './heightAdvice.js';

// 兩次集訓分別發生在 advanceSeason **之後**的哪一屆
export const CAMP_SEASONS = { FIRST: 2, SECOND: 3 };

// ════════════════════════════════════════════════════════════════
// 集訓待辦狀態（2026-08-09 覆審 HIGH-1）— **落檔的**「這屆集訓還沒做完」
// ════════════════════════════════════════════════════════════════
// 為什麼需要它：集訓是互動覆蓋層，成果要等玩家選完才寫得出來；而 `advanceSeason`
// 早在集訓開場前就已經落檔（屆數已推進）。中途被殺（手機殺 PWA／重整）⇒ 重開後
// 屆間鏈掛在「進入下一屆」鈕上、不會再跑一次 ⇒ 該屆集訓**永久消失**。
// 搬家前的舊碼是在 advanceSeason 之後**同步**跑 applyOffseasonTraining＋savePlayer，
// 被殺仍保得住耐力 +2；新制多了玩家的選擇，所以保證改寫成：
//   **集訓還沒完成的話，重開後它還在**（不得比舊碼更差）。
//
// ★ 寫入時機必須與 advanceSeason 同一次 RMW ★（careerStore.advanceSeason）——
// 分兩筆寫會留下「屆數已推進、待辦還沒落檔」的縫，那正是本 finding 要消滅的東西。
// ★ 為什麼不把集訓移到 advanceSeason 之前 ★ E7 的候選名單必須吃畢業換血後的名冊
// （裁定書題六：P8 恆不觸發的前提就是「默契選擇時三年級已畢業」）。
// ★ falsy player 原樣返回（2026-08-09 第三輪覆審 LOW）★ `{...null, campPending:2}`
// ＝`{campPending:2}`＝一個 truthy 的**殘廢球員物件**（沒有 attributes／trust），
// 下游 `normalizeCareerPlayer` 讀 `player.trust.floorShare` 當場 throw。目前有
// careerScreen 的 `if (!career || !player)` 擋在前面所以不可達，但那是別人家的防線：
// 這裡不製造殘廢物件，缺人就照樣缺人（null 進 null 出），失敗態才停在原地不放大。
export function markCampPending(player, seasonIndex) {
  if (!player) return player;
  return { ...player, campPending: seasonIndex };
}

// 這屆的集訓還沒做完嗎？（屆數要對得上——舊屆殘留的待辦不得在新屆再開一次）
export function isCampPending(player, seasonIndex) {
  const pending = player?.campPending;
  if (typeof pending !== 'number') return false;
  return pending === seasonIndex && seasonIndex >= CAMP_SEASONS.FIRST;
}

// 集訓完成（就地清旗標——呼叫端接著把整個 player 落檔，清旗標與成果同一次寫入）
export function clearCampPending(player) {
  player.campPending = null;
  return player;
}

// ---- 屬性特訓的屬性池（題一裁定：集訓限定＝逐場加點面板「不開放」的集合）----
// ★ 用推導、不寫死清單 ★ 兩個入口的集合恆不相交＝單一真相源：
// 有人日後把 control 開進逐場面板，這裡就自動少一格，不會兩邊都有。
export const CAMP_ATTR_KEYS = ATTRIBUTE_KEYS.filter(
  (k) => !GROWABLE_ATTRS.some((a) => a.key === k),
);

// ★★ N2／N3 留白（裁定書 §四；2026-08-09 使用者追認「丁：這次留白」）★★
// `gain`／`cap` 為 null ＝**尚未拍板**，UI 呈現為「尚未開放」且不可選。
// 嚴禁自填常數——耐力那格的 2／80 是既有拍板值（growth.js OFFSEASON），
// 直接引用而不重寫；控球那格沒有拍板值，就讓它空著。
//
// ★ 2026-08-12 練習賽卷：控球格的留白由「紅白賽全科目完成」兌現 ★
// kickoff 題 3 甲：「全完成 ⇒ 控球格開放」——把這個現況債變成設計的一部分。
// 幅度 +2／上限 75 與耐力格同幅（`OFFSEASON.STAMINA_GAIN` 2／`STAMINA_CAP` 80），
// 上限低 5 是因為主角出廠 control 就是 68（`createCareerPlayer`）＝全隊最高。
// ★ 留白仍在 ★ `gain`/`cap` 依然寫 null——**沒有解鎖時行為逐值不變**（既有測試
// 驗的就是那個 throw 與「尚未開放」），解鎖值走下面的 CAMP_CONTROL_UNLOCKED 疊上去。
export const CAMP_ATTR_TRAINING = {
  stamina: {
    name: '耐力',
    gain: OFFSEASON.STAMINA_GAIN,
    cap: OFFSEASON.STAMINA_CAP,
    desc: '整場跑不完的底氣——體力掉得慢，第三局的你還是第一局的你',
  },
  control: {
    name: '控球',
    gain: null,
    cap: null,
    desc: '手上的準度（一傳／舉球／處理球）——紅白賽科目全完成才開放',
  },
};

// 控球格解鎖後的幅度／上限（練習賽全科目完成才生效）
export const CAMP_CONTROL_UNLOCKED = { gain: 2, cap: 75 };

// 這次集訓的屬性特訓名額：練習賽完成 ≥2 科 ⇒ 兩項（kickoff 題 3 甲）；否則一項。
// ★ 判準吃的是「完成數」不是「有沒有打」★ 打了但一科都沒過＝照常一項。
export const CAMP_ATTR_PICKS_BONUS_AT = 2;
export function campAttrPicks(practice) {
  return (practice?.completed ?? 0) >= CAMP_ATTR_PICKS_BONUS_AT ? 2 : 1;
}

// 某一格在本次集訓的實際幅度／上限（單一入口：顯示端與套用端共用，防兩份定義漂移）
function attrDefOf(key, unlockControl) {
  const base = CAMP_ATTR_TRAINING[key] ?? { name: key, gain: null, cap: null, desc: '' };
  if (key === 'control' && unlockControl) return { ...base, ...CAMP_CONTROL_UNLOCKED };
  return base;
}

// 屬性特訓的可選項（含「為什麼不能選」的理由，UI 直接顯示，不靜默）。
// @param o.unlockControl 練習賽全科目完成＝控球格開放（缺省 false＝既有行為逐值不變）
export function campAttrOptions(player, { unlockControl = false } = {}) {
  return CAMP_ATTR_KEYS.map((key) => {
    const def = attrDefOf(key, unlockControl);
    const value = player?.attributes?.[key] ?? 0;
    if (def.gain == null || def.cap == null) {
      return {
        key,
        ...def,
        value,
        ready: false,
        // 「為什麼不能選」要說對事：控球格現在有一條明路，不再是無限期待定
        reason: key === 'control' ? '尚未開放——紅白賽科目全完成才開' : '尚未開放——幅度待定',
      };
    }
    if (value >= def.cap) {
      return { key, ...def, value, ready: false, reason: `已達上限 ${def.cap}` };
    }
    return { key, ...def, value, ready: true, reason: '' };
  });
}

// 套用屬性特訓（不可變；與 growth.applyOffseasonTraining 逐值等價——耐力那格
// 的數值來源就是同一個 OFFSEASON 常數，不另立第二份）
export function applyCampAttrTraining(player, key, { unlockControl = false } = {}) {
  const def = attrDefOf(key, unlockControl);
  if (!CAMP_ATTR_KEYS.includes(key)) {
    throw new Error(`applyCampAttrTraining：${key} 不在集訓屬性池`);
  }
  if (!def || def.gain == null || def.cap == null) {
    throw new Error(`applyCampAttrTraining：${key} 的幅度／上限尚未拍板`);
  }
  const cur = player.attributes?.[key] ?? 0;
  if (cur >= def.cap) throw new Error(`applyCampAttrTraining：${key} 已達上限 ${def.cap}`);
  return {
    ...player,
    attributes: { ...player.attributes, [key]: Math.min(def.cap, cur + def.gain) },
  };
}

// ---- 默契候選（題三條件 6：位置對得上的人，不是全名冊）----
// 軸心敘事：OH／OPP／S 的默契通到欄中，MB 的默契通到邊攻——排球結構本身。
// 自由人**本卷沒有載體**（題三-L 閘住，探針先行）⇒ 空清單，UI 必須明寫此事，不得靜默。
export const CHEMISTRY_TARGET_ROLES = {
  outside: ['middle'],
  opposite: ['middle'],
  setter: ['middle'],
  middle: ['outside', 'opposite'],
  libero: [], // 本卷零載體（明寫，不是漏列）
};

export function chemistryCandidates({ role, members }) {
  const want = CHEMISTRY_TARGET_ROLES[role] ?? [];
  if (!want.length) return [];
  return (members ?? []).filter((m) => want.includes(m.role));
}

// 自由人為什麼沒有默契格（UI 逐字顯示；交付文件與遊戲內文案都不得靜默此事）
export const LIBERO_NO_CHEMISTRY_NOTE = [
  '自由人這一屆沒有默契格——默契的載體是「你和他一起跑成一次組合攻擊」，'
  + '而自由人不進攻擊池，這條線目前量不到。要不要為自由人另立載體，等探針結果再說。',
  '同理，技術傳授那七項（吊球／後排 pipe／跳躍發球…）多半在規則上對自由人不適用。'
  + '你這次集訓的保底是屬性特訓。',
];

// ---- 空清單的兩種成因（2026-08-09 覆審 MEDIUM-1）----
// 裁定書只裁了**單人**退化（題二：照常走，不得自行發明補位邏輯），沒裁**零**候選。
// 而「零」有兩個完全不同的成因，混播同一段文案會對 OH 玩家說出「自由人不進攻擊池」：
//   'no-carrier'   ＝這個位置本卷根本沒有載體（只有自由人，題三-L 閘住）
//   'no-candidate' ＝載體在、位置對得上的人這屆名冊上一個都不剩（畢業／逐出湊出來的）
export function chemistryEmptyReason(role, members) {
  const want = CHEMISTRY_TARGET_ROLES[role] ?? [];
  if (!want.length) return 'no-carrier';
  return chemistryCandidates({ role, members }).length ? null : 'no-candidate';
}

// 零候選（非自由人）的文案：說對事——是名冊湊不出對象，不是這個位置沒有默契。
// ★ 不得發明補位邏輯 ★（裁定書題二明令）：這裡只解釋、只落空，不放寬候選條件、
// 也不折算成別的獎勵。
export function noCandidateNote(role) {
  const want = (CHEMISTRY_TARGET_ROLES[role] ?? []).map((r) => roleLabel(r)).join('、');
  return [
    `這個冬天沒有人可以挑——你打 ${roleLabel(role)}，能跟你跑成一條線的是${want}，`
    + '而這屆名冊上一個都不剩了。',
    '默契格這次就空著：不放寬對象、也不折算成別的東西——湊不出來就是湊不出來。'
    + '（你這次集訓的其他格照常。）',
  ];
}

// 空清單要播哪一段（UI 的唯一選擇點——選法留在資料層，測試才驗得到同一支）
export function chemistryEmptyNote(role, members) {
  return chemistryEmptyReason(role, members) === 'no-carrier'
    ? LIBERO_NO_CHEMISTRY_NOTE
    : noCandidateNote(role);
}

// ---- 集訓內容表 ----
// hasTech＝這次集訓有沒有技術補修的內容（實際有沒有，由呼叫端把待播的教學事件數餵進來——
// 事件表才是真相源，這裡不重刻一份「第幾次教什麼」的清單）
export function campPlanFor(seasonIndex, { uniYear = null } = {}) {
  // 大二卷批 5（拍板題 8：沿用機制換文案）：大學屆間集訓——title 換大學版；
  // ★hasChemistry=false★ 默契是「一生一次」（高中第二次集訓限定消費），大學
  // 重開會撞語意（裁量記錄在 acceptance-uni-y2-batch5.md）。
  // uniYear 省略＝高中路徑逐值不變（既有呼叫端零遷移）。
  if (Number.isInteger(uniYear) && uniYear >= 1) {
    return {
      // ordinal 只剩內容格判準沿用（批 5 覆審 HIGH 修）：開場台詞與副標題不再走
      // ordinal（那會播高中第二次集訓的「挑一個人」——大學沒有默契格，而且
      // 「最後一個冬天」對大二大三是假話），改由 openingKey/subtitle 顯式指定
      ordinal: 2,
      seasonIndex,
      hasChemistry: false,
      hasPractice: true,
      title: `大${['一', '二', '三', '四'][uniYear - 1] ?? uniYear}屆間集訓`,
      openingKey: uniYear >= 4 ? 'uniFinal' : 'uni',
      subtitle: uniYear >= 4
        ? '最後一個冬天。把該練的練完——春天沒有下一次。'
        : '大學的冬天沒人盯你練。補齊自己，名次會記得你做了什麼。',
    };
  }
  const ordinal = seasonIndex >= CAMP_SEASONS.SECOND ? 2 : 1;
  return {
    ordinal,
    seasonIndex,
    hasChemistry: seasonIndex >= CAMP_SEASONS.SECOND,
    // 紅白對抗賽（練習賽卷 2026-08-12 題五）：兩次集訓都有一場（第一屆開場的教學局
    // 是另一個掛點、不走集訓面板）
    hasPractice: seasonIndex >= CAMP_SEASONS.FIRST,
    title: ordinal === 1 ? '第一次集訓' : '第二次集訓',
  };
}

// 這屆的紅白賽打過了沒（判準＝存檔裡那筆紀錄是不是**這一屆**的）。
// ★ 屆數要對得上 ★ 上一屆的成績不得讓這一屆的格子看起來已經打完（同 isCampPending）。
export function practicePlayedIn(practice, seasonIndex) {
  return (practice?.seasonIndex ?? 0) === seasonIndex && seasonIndex >= CAMP_SEASONS.FIRST;
}

// ---- 離場前的未完成清單（2026-08-09 試玩前補強）----
//
// ★ 為什麼需要 ★ 舊碼的耐力 +2 是**無條件發**的；本卷改成玩家自己按，於是多出一條
// 舊碼沒有的失敗路徑：整個冬天沒按任何一格就按「▶ 結束集訓」，畫面不會攔、不會提醒，
// 那一屆的加值就這樣過去了。默契更嚴重——它一生只有這一次（第二次集訓限定）。
//
// ★ 為什麼「有可選項才提醒」★ 耐力練到上限 80 之後那格本來就不能按，
// 這時再喊「你還沒練」就是一個恆真的假警報——訓練玩家忽略這個提醒，
// 真的漏掉那天他就看不見了（`feedback-zero-power-checks` 的第①條）。
// 同理默契：名冊湊不出對象（畢業／逐出）時那格本來就是空的，不算未完成。
//
// ★ 不擋路，只提醒 ★ 回傳清單，要不要放行由 UI 決定（現制＝二次確認）。
// 玩家有權決定「就這樣結束這個冬天」，但不得在**不知情**的狀況下結束。
//
// @param {boolean} o.attrTrained 這次集訓有沒有按過屬性特訓（UI 的當次狀態——
//   集訓成果要等 onDone 才落檔，中途被殺會整個重來，所以這裡沒有可讀的持久欄位）
export function pendingCampSlots({
  player, plan, members = [], attrTrained = false,
  practice = null, practicePlayed = false, practiceOffered = false,
}) {
  const out = [];
  // 紅白賽（練習賽卷 2026-08-12）：一屆一場、打完就過——沒打就是把這一屆的
  // 屬性特訓名額與控球格一起放掉。
  // ★ 兩道閘都是「有可選項才提醒」的同一條理由 ★
  //   `practicePlayed`＝打過了就沒得做；`practiceOffered`＝呼叫端沒接開打入口時
  //   （舊呼叫端／測試治具）畫面上根本沒有那顆鈕，喊「你還沒打」是叫玩家去按不存在的東西。
  if (plan?.hasPractice && practiceOffered && !practicePlayed) {
    out.push({
      key: 'practice',
      label: '紅白對抗賽',
      note: '這一屆只有這一場——打完的科目決定屬性特訓的名額與控球格。',
    });
  }
  if (!attrTrained
    && campAttrOptions(player, { unlockControl: !!practice?.unlockControl }).some((o) => o.ready)) {
    out.push({
      key: 'attr',
      label: '屬性特訓',
      note: '這個冬天的加值還沒領——結束就是跳過這一屆。',
    });
  }
  if (plan?.hasChemistry && !player?.chemistry?.focusId) {
    const role = player?.currentRole ?? 'outside';
    if (chemistryCandidates({ role, members }).length) {
      out.push({
        key: 'chemistry',
        label: '默契',
        note: '最後一個冬天——挑人這件事只有這一次，結束後不會再問。',
      });
    }
  }
  return out;
}

// 集訓開場演出台詞（沿 graduationRitual 的形狀：{speaker,text} 逐句點擊推進）
export const CAMP_OPENING_LINES = {
  1: [
    { speaker: '教練', text: '球季結束了，但球場不會空著。這個冬天，我們留下來練。' },
    { speaker: '教練', text: '第一年你們學的是「自己怎麼打」。從這個冬天開始，學的是「怎麼一起打」。' },
  ],
  2: [
    { speaker: '教練', text: '最後一個冬天了。該補的補、該練的練——然後挑一個人。' },
    { speaker: '教練', text: '最後一年，你不會一個人打完。挑一個要一起跑到最後的人，冬天陪他練。' },
  ],
  // 大二卷批 5（覆審 HIGH 修）：大學版開場——不提「挑一個人」（大學無默契格），
  // 「最後一個冬天」只給 uniFinal（大四前那個冬天）
  uni: [
    { speaker: '教練', text: '賽季收了。名次貼在公佈欄上——不滿意的，冬天有的是時間改。' },
    { speaker: '教練', text: '大學的冬天沒人盯你練。留下來的，都是自己想變強的。開始吧。' },
  ],
  uniFinal: [
    { speaker: '教練', text: '最後一個冬天了。把你這幾年欠自己的，這個冬天補完。' },
    { speaker: '教練', text: '春天開賽，就是你們的最後一個賽季。別留遺憾。' },
  ],
};

// 選定默契對象（不可變；★零效果★——本卷只記錄，沒有任何消費端讀 focusId）
export function recordChemistryFocus(player, teammateId) {
  const prev = player.chemistry ?? {};
  return {
    ...player,
    chemistry: { pairs: { ...(prev.pairs ?? {}) }, focusId: teammateId ?? null },
  };
}

// 名字查不到時的顯示（2026-08-09 覆審 HIGH-2）——★不得退回內部 id★
// 理由：`A6` 對玩家是亂碼，會渲染成「你和 A6　配合了 7 次」。而且這不是罕見路徑：
// 默契有屆數閘（第 1 屆 comboScale=0），計數從**第 2 屆**才開始長，OH／OPP／S 的
// 頭號對象是資深欄中阿岩（A6）——他在**第 2 屆末畢業** ⇒ 第 3 屆的生涯畫面必然踩到。
// 正解是連校友＋被逐出者一起查（見 departedMatesOf／chemistryPairsOf）；這個常數只留給
// 三份名冊都查不到的殘餘情形（例：手改／匯入的存檔，配對鍵指向已不存在的人）。
// 選「顯示一個誠實的泛稱」而不是「濾掉這一列」：畢業／離隊的隊友**應該**繼續出現在
// 默契列表裡（「你和阿岩配合了 7 次」是有敘事價值的），把顯示層的破圖改成資料的
// 靜默消失是把問題藏起來，不是修好。
export const UNKNOWN_MATE_NAME = '已離隊的隊友';

// 已離隊的隊友名冊（2026-08-09 第三輪覆審 MEDIUM）——餵給 chemistryPairsOf 的第三參數。
// 為什麼要合成兩份：`applySeasonTurnover` 的畢業生進 `roster.alumni`，但 `applyExpel`
// 把被逐出者移出 `roster.members` 後只記進 `recruitment.expelled`（careerStore.applyExpel），
// **不進 alumni** ⇒ 中途被逐出的招募生會渲染成泛稱「已離隊的隊友」。而招募生可以是
// 欄中／邊攻（RECRUIT_CONDS obsidian／iron-mist-2…），正是默契載體對得上的位置，
// 逐出前累積的計數會一路留在 `chemistry.pairs` 裡。
// 兩份條目形狀相同（`{ member, seasonIndex, … }`）⇒ 併成一份即可，不必改任何函式簽名。
// 顯示的是**逐出當下的姓名快照**（applyExpel 存的是完整成員快照），這是對的：
// 「你和某某配合了 7 次」講的就是他還在隊上時的事。
export function departedMatesOf(roster, recruitment) {
  return [...(roster?.alumni ?? []), ...(recruitment?.expelled ?? [])];
}

// 默契計數的讀取端（顯示層唯一入口；非零才有東西可顯示）
// ★ 角色中立（題三條件 2）★ 回傳的只有「配對對象＋次數」，不含「誰是主攻誰是誘餌」——
// 玩家主動叫夾塞時 73.0% 的波球不是他打的，角色化文案在對角身上七成時間是錯的。
// 第三參數 alumni＝畢業校友名冊（`roster.alumni`，元素形狀 `{ member, seasonIndex }`）。
export function chemistryPairsOf(player, members, alumni = []) {
  const pairs = player?.chemistry?.pairs ?? {};
  const nameOf = (pid) => (members ?? []).find((m) => m.id === pid)?.name
    ?? (alumni ?? []).find((a) => a?.member?.id === pid)?.member?.name
    ?? UNKNOWN_MATE_NAME;
  return Object.entries(pairs)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([pid, n]) => ({ id: pid, name: nameOf(pid), count: n }))
    .sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1));
}
