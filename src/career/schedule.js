// Phase 3 W6 A2 — 賽程輪抽（屆間輪換＋指定邀請；純函式、決定論）
// 拍板（w6-kickoff 拍板結果）：小組 3 場自對手池決定論輪抽；玩家每屆可指定 1 隊必入
// （指定計入出現）；保底＝每隊至少每兩屆出現一次；國賽維持固定強度階梯。
// 設計偏差（記 phase3-w6-status 偏差表）：第 1 屆固定用故事模板（北原→白浪→曜石）——
// 技術傳授鏈（events.js teach-*）綁定這三隊的場次與對手，隨機化會讓吊球/魚躍/pipe
// 永無傳授點；輪抽自第 2 屆（advanceSeason）起生效。
// 保底的結構保證：國賽階梯三隊每屆必現於賽程；「僅小組可見」隊伍靠兩條規則兜住——
// ①保底債：上屆小組缺席的僅小組隊，本屆必入 ②每屆小組至少 min(2, 池內僅小組隊數)
// 席留給僅小組隊（=下屆債 ≤ 可用席）。兩者合成「每隊 ≤2 屆必現」的決定論不變式。
import { OPPONENTS, opponentById } from './opponents.js';

// 國賽固定強度階梯（W2 定案敘事：八強鐵霧/準決宿敵曜石/決賽天鷹——輪抽不動這裡）
export const NATIONAL_LADDER = [
  { id: 'national-qf', stage: 'national', opponentId: 'iron-mist', label: '八強' },
  { id: 'national-sf', stage: 'national', opponentId: 'obsidian', label: '準決賽' },
  { id: 'national-final', stage: 'national', opponentId: 'sky-hawk', label: '決賽' },
];
// 4.5A 宿敵三幕硬保底（拍板 §1-1）：天鷹的國賽位置逐屆固定——第 1/3 屆決賽（現狀）、
// 第 2 屆準決賽（幕二＝bo3 關鍵戰，matchFormatOf 依 label 自動跟）；決賽由曜石補位。
// 保底＝生成約束（賽程項靜態依屆數組裝），同種子同賽程重現性不受影響。
// 注意副作用（Sawmah 已拍板不動招募條件）：第 2 屆決賽非天鷹＝王勝翔「決賽擊敗天鷹
// 即可招」該屆無達成窗（僅第 1/3 屆決賽可達）。
export function nationalLadderFor(seasonIndex = null) {
  if (seasonIndex === 2) {
    return [
      { id: 'national-qf', stage: 'national', opponentId: 'iron-mist', label: '八強' },
      { id: 'national-sf', stage: 'national', opponentId: 'sky-hawk', label: '準決賽' },
      { id: 'national-final', stage: 'national', opponentId: 'obsidian', label: '決賽' },
    ];
  }
  return NATIONAL_LADDER;
}
const NATIONAL_IDS = new Set(NATIONAL_LADDER.map((m) => m.opponentId));

// 小組輪抽池＝全對手（強隊也可被邀/被抽進小組——復仇之戰、壯舉刷點都靠這）
export function groupPool() {
  return OPPONENTS.map((o) => o.id);
}

// ═══ 2026-08-09 循環賽卷：國賽八強＝4 隊單循環 ═══
// 為什麼改：真人連兩屆止步八強 ⇒ 一屆只打 4 場（滿貫 6 場），而招募條件半數綁在
// 「打得贏八強之後的場次」上 ⇒ 止步者第 1 屆招不到任何人 ⇒「打不好→招不到人→
// 隊不變強→還是打不好」的死鎖。改成循環賽後，止步者 4→6 場（+50%）：成長點、
// 招募機會、教學觸發全部跟著變多，而**不必把對手弄弱**。
//
// ★ 為什麼第一場的 id 仍叫 `national-qf` ★（刻意保留，非疏漏）
//   它是「進國賽的第一場」這個語意的載體：`events.js` 的全國賽字卡（`nationals`）與
//   飄浮發球傳授（`teach-float`）都掛在它上面，`matchSeed` 也吃 id。改名等於同時動
//   事件鏈、場次種子與一票測試，卻換不到任何行為差異——語意由新的 `round:'rr'` 欄位
//   承載，id 只是鍵。**判斷是不是淘汰賽一律看 `round`，不要看 id 字面**。
// ★ 舊存檔零遷移 ★ 舊賽程項沒有 `round` 欄位 ⇒ `round !== 'rr'` ⇒ 走原本的
//   「國賽一敗即止步」，行為逐值不變（`careerState.careerStage`）。
export const RR_MATCH_IDS = ['national-qf', 'national-rr2', 'national-rr3'];
export const RR_LABELS = ['八強循環①', '八強循環②', '八強循環③'];
// 循環組的固定席：鐵霧＝既有八強對手（敘事錨——「八強第一戰是鐵霧」不動）
export const RR_ANCHOR_ID = 'iron-mist';
export const RR_ADVANCE = 2; // 前二名晉級準決賽

// 循環組抽籤（決定論；回傳 2 隊——連同鐵霧與玩家湊成 4 隊）
// 池：全對手 −鐵霧（已入席）−**當屆準決賽與決賽對手**。
//   為什麼排除淘汰賽兩隊：賽制上不可能——準決賽對手來自**另一個八強組**，一支隊
//   不會既在你的循環組裡、又在你晉級後的另一半籤表等你。順帶保住宿敵三幕的份量
//   （決賽那一場的「最後才遇到」不被提前用掉）。
//   ★ 有兩處程式碼靠這條排除活著（放寬前必看，2026-08-09 覆審 L2）★
//     ① `rivalArc.js` 的 `playedRivalNationalThisSeason`：用 `startsWith('national-')`
//        判「本屆國賽實戰過天鷹沒有」，會連循環場一起命中
//     ② `roundRobinTable` 的淨得分 tiebreak：循環場恆 bo1 才讓 scoreFor 是「分」；
//        天鷹進得來的話那一場會升 bo3（`matchFormatOf`），單位就混了
// 保底：優先抽**本屆小組沒遇過**的隊（同一屆不想連打同一隊三次）；不足時才回頭抽
//   小組已有的隊——排序鍵是「是否已在小組」在前、seed hash 在後，全程決定論。
// ★ 第 1 屆的循環組是**刻意恆定**的（2026-08-09 覆審 M3；實測 3000 seeds 逐值相同）★
//   第 1 屆小組固定＝北原／白浪／曜石（教學鏈綁定），池扣掉鐵霧與淘汰賽兩隊之後
//   剛好只剩青嵐與黑松兩支「小組沒遇過」的隊 ⇒ 前置鍵直接把它們排到最前，hash 這一段
//   在第 1 屆是死碼。這與「第 1 屆＝故事模板」的既有設計一致，不是抽籤壞掉。
//   **難度校正請注意**：因此第 1 屆循環第三場恆為黑松（level 67，治具實跑勝率 5–8%），
//   等於每個玩家的第一屆都被排了一場幾乎必敗的硬仗——要調第 1 屆難度就是調這裡。
//   第 2 屆起小組改輪抽，池的組成才會變，hash 路徑才真的參與。
export function drawRoundRobinOpponents({ seed, seasonIndex = null, groupIds = [] }) {
  const koIds = new Set(nationalLadderFor(seasonIndex).slice(1).map((m) => m.opponentId));
  const inGroup = new Set(groupIds ?? []);
  const pool = OPPONENTS
    .map((o) => o.id)
    .filter((id) => id !== RR_ANCHOR_ID && !koIds.has(id));
  const picks = [...pool].sort((a, b) => {
    const ga = inGroup.has(a) ? 1 : 0;
    const gb = inGroup.has(b) ? 1 : 0;
    if (ga !== gb) return ga - gb;
    return hash32(seed, `rr-draw:${a}`) - hash32(seed, `rr-draw:${b}`);
  }).slice(0, 2);
  // 兩支抽籤隊依 level 升冪（鐵霧恆在第一場——見 RR_MATCH_IDS 註）
  picks.sort((a, b) => (opponentById(a)?.level ?? 0) - (opponentById(b)?.level ?? 0));
  return picks;
}

// 國賽段賽程項：循環 3 場（打滿、輸球不止步）＋淘汰賽 2 場（準決/決賽照舊）
// `rrOverride`＝跳過抽籤、直接指定循環組的兩支非固定席（第 1 屆故事模板用；
// 給了就不抽——與 `SEASON1_GROUP` 走同一條「第 1 屆是明文模板」的既有設計）
export function nationalLegFor({
  seed, seasonIndex = null, groupIds = [], rrOverride = null,
}) {
  const ladder = nationalLadderFor(seasonIndex);
  const rrOpponents = [
    RR_ANCHOR_ID,
    ...(rrOverride ?? drawRoundRobinOpponents({ seed, seasonIndex, groupIds })),
  ];
  return [
    ...rrOpponents.map((opponentId, i) => ({
      id: RR_MATCH_IDS[i],
      stage: 'national',
      round: 'rr', // ★ 唯一的「這是循環場」判準（id 字面不算）★
      opponentId,
      label: RR_LABELS[i],
    })),
    // 淘汰賽段：準決賽＋決賽（id/label/對手全部照舊——宿敵三幕結構不動）
    ...ladder.slice(1).map((m) => ({ ...m })),
  ];
}

// 循環組名次表（純函式、決定論）——玩家以 RR_PLAYER_ID 入表。
// ★ 對手互戰怎麼判 ★ 那 3 場玩家不在場，沒有任何真實資料可用 ⇒ 用**強度**判：
//   level 高者勝（同 level 用 seed hash）。刻意不擲骰：擲骰會讓「我到底晉不晉級」
//   取決於一個玩家看不見也影響不了的隨機數，那是最糟的一種難度。
// ★ tiebreak ★ 勝場 → 同勝場群內的互勝場數（mini-league）→ **淨得分** → seed hash。
//   四者都是純量鍵 ⇒ 全序、可重現、不會有比較器不遞移的坑。
//   ★ 為什麼一定要有「淨得分」這一層（2026-08-09 覆審 M1）★
//     三隊互相咬成一個環時（A>B>C>A），mini 會全部相等 ⇒ 直接掉進 hash，
//     於是「我到底晉不晉級」由一個玩家看不見也影響不了的數決定——那正是本檔上面
//     那段「刻意不擲骰」承諾要避免的事，只是換了個地方發生。實測（枚舉 300 條生涯
//     × 8 種勝負）有 16.3% 的組合，晉級邊界是被 hash 決定的。
//     淨得分用 `results` 裡現成的 `scoreFor/scoreAgainst`——那是玩家**真的打出來**的分。
//   ★ 對手互戰沒有比分，淨得分記 0 ★ 那 3 場是強度推導出來的、本來就沒有分數可用；
//     編一個出來會讓「看得見的資料」與「編的資料」混在同一個鍵裡。因此對手的淨得分
//     只來自他與玩家的那一場（取玩家該場淨得分的相反數）。
//   ★ 單位一致性 ★ 循環場恆為 bo1（`matchFormatOf` 只對天鷹升 bo3，而天鷹抽不進
//     循環組）⇒ scoreFor/scoreAgainst 恆為「分」。若哪天放寬抽籤池讓天鷹進得來，
//     這個鍵會變成「局數差與分數差混算」，要一起處理。
export const RR_PLAYER_ID = '__player__';

function rrBeats(a, b, seed) {
  const la = opponentById(a)?.level ?? 0;
  const lb = opponentById(b)?.level ?? 0;
  if (la !== lb) return la > lb;
  return hash32(seed, `rr-h2h:${a}`) > hash32(seed, `rr-h2h:${b}`);
}

// { table:[{id,wins,played}...]（名次序）, complete:boolean, playerRank:number }
export function roundRobinTable({ seed, schedule, results }) {
  const rr = (schedule ?? []).filter((m) => m.round === 'rr');
  if (!rr.length) return null;
  const teams = [RR_PLAYER_ID, ...rr.map((m) => m.opponentId)];
  const wins = new Map(teams.map((id) => [id, 0]));
  const played = new Map(teams.map((id) => [id, 0]));
  const beat = new Map(teams.map((id) => [id, new Set()]));
  const diff = new Map(teams.map((id) => [id, 0])); // 淨得分（只累計有真實比分的場次）
  const note = (winner, loser) => {
    wins.set(winner, wins.get(winner) + 1);
    beat.get(winner).add(loser);
    played.set(winner, played.get(winner) + 1);
    played.set(loser, played.get(loser) + 1);
  };
  // ★ 4 隊單循環的標準輪次表 ★ 第 i 輪＝玩家對 rr[i] 的對手，**另外兩隊同輪互打**
  //   （3 輪恰好把 3 組對手配對用完一次）。這樣名次板才會隨玩家的進度逐輪長出來——
  //   若把對手互戰一次全算完，玩家打完第一場時看到的是「別人都打完 3 場、我 1 場」。
  const opps = rr.map((m) => m.opponentId);
  for (let i = 0; i < rr.length; i += 1) {
    const r = (results ?? []).find((x) => x.matchId === rr[i].id);
    if (!r) continue; // 這一輪還沒打＝整輪（含對手互戰）都不入表
    if (r.won) note(RR_PLAYER_ID, opps[i]);
    else note(opps[i], RR_PLAYER_ID);
    const d = (r.scoreFor ?? 0) - (r.scoreAgainst ?? 0);
    diff.set(RR_PLAYER_ID, diff.get(RR_PLAYER_ID) + d);
    diff.set(opps[i], diff.get(opps[i]) - d);
    const rest = opps.filter((_, j) => j !== i);
    if (rest.length === 2) {
      const [a, b] = rest;
      if (rrBeats(a, b, seed)) note(a, b);
      else note(b, a);
    }
  }
  const rows = teams.map((id) => ({
    id,
    wins: wins.get(id),
    played: played.get(id),
    mini: [...beat.get(id)].filter((o) => wins.get(o) === wins.get(id)).length,
    diff: diff.get(id),
    tie: hash32(seed, `rr-rank:${id}`),
  }));
  // ★ 最後一層 hash 兜底的誠實標註（2026-08-09 二輪覆審 M1 餘量）★
  // 勝場→對戰小分→淨得分三層都平手時仍由 hash 決定——枚舉 29,160 組勝負×分差，
  // 玩家晉級邊界落到這一層的佔 **0.31%**（一輪修復前是 16.3%）。裁定＝可接受：
  // 真實排球積分規則在「積分、局數比、得失分比全同」時就是抽籤，這一層與抽籤等價；
  // 要再收斂只能引入更多玩家看不見的量，反而違背本段檔頭的承諾。
  rows.sort((a, b) => (b.wins - a.wins) || (b.mini - a.mini)
    || (b.diff - a.diff) || (a.tie - b.tie));
  return {
    table: rows,
    complete: rr.every((m) => (results ?? []).some((r) => r.matchId === m.id)),
    playerRank: rows.findIndex((r) => r.id === RR_PLAYER_ID) + 1,
  };
}

// FNV-1a（與 careerState.matchSeed 同慣例）：seed × 字串 → 決定論排序鍵
function hash32(seed, str) {
  let h = ((seed >>> 0) ^ 0x811c9dc5) >>> 0;
  for (const ch of String(str)) {
    h = (h ^ ch.codePointAt(0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// 小組對手輪抽（決定論）：seed＝該屆生涯種子（advanceSeason 已逐屆衍生）；
// invitedId＝玩家指定邀請（null＝不指定）；prevGroupIds＝上屆小組對手（null＝首屆抽，無債）
export function drawGroupOpponents({ seed, invitedId = null, prevGroupIds = null }) {
  const pool = groupPool();
  const groupOnly = pool.filter((id) => !NATIONAL_IDS.has(id));
  const minWeak = Math.min(2, groupOnly.length);
  const rank = (id) => hash32(seed, `draw:${id}`);
  const picks = [];
  if (invitedId && pool.includes(invitedId)) picks.push(invitedId);
  // 保底債：上屆小組缺席的僅小組隊本屆必入（不變式下 debt ≤ 剩餘席）
  if (prevGroupIds) {
    const debt = groupOnly
      .filter((id) => !prevGroupIds.includes(id) && !picks.includes(id))
      .sort((a, b) => rank(a) - rank(b));
    for (const id of debt) if (picks.length < 3) picks.push(id);
  }
  // 輪抽補位：決定論排序；剩餘席只夠補足僅小組隊下限時，跳過國賽階梯隊
  const rest = pool.filter((id) => !picks.includes(id)).sort((a, b) => rank(a) - rank(b));
  for (const id of rest) {
    if (picks.length >= 3) break;
    const weakCount = picks.filter((p) => groupOnly.includes(p)).length;
    const weakNeeded = minWeak - weakCount;
    if (weakNeeded >= 3 - picks.length && !groupOnly.includes(id)) continue;
    picks.push(id);
  }
  // 小組場序依 level 升冪（維持「由淺入深」強度體感）
  picks.sort((a, b) => (opponentById(a)?.level ?? 0) - (opponentById(b)?.level ?? 0));
  return picks;
}

// W4(P4) Q8 分級賽制：由賽程項推導該場賽制（bestOf）——純推導、零存檔遷移
// （舊存檔賽程無 format 欄位；label/opponentId 是本檔資料約定，決定論）。
// 拍板映射：冠軍戰（決賽）＝bo5、關鍵戰（準決賽＋宿敵場）＝bo3、其餘＝bo1；
// 宿敵＝天鷹（題6 拍板：sky-hawk ace 同屆宿敵）——小組抽到天鷹也算關鍵戰
// 2026-08-09 循環賽卷：循環場的 label 不在映射表裡 ⇒ 一律 bo1，**但天鷹守衛照舊生效**
// （天鷹被抽進循環組＝那一場升 bo3）。既有守衛語意一字未改，這裡只是記一筆它現在
// 多罩到一種場合。
export const RIVAL_TEAM_ID = 'sky-hawk';
export function matchFormatOf(entry) {
  if (!entry) return 1;
  if (entry.label === '決賽') return 5;
  if (entry.label === '準決賽') return 3;
  if (entry.opponentId === RIVAL_TEAM_ID) return 3;
  return 1;
}

// 整份賽程（輪抽小組＋國賽循環組＋淘汰賽）；invited 旗標落在賽程項上
// （UI 顯邀請徽章、存檔即公開）
// seasonIndex＝目標屆數（宿敵保底階梯用；省略＝預設階梯＝既有行為不變）
// 2026-08-09 循環賽卷：一屆 6 → **8** 項（小組 3＋循環 3＋準決＋決賽）；
// 止步循環組者實打 6 場、滿貫 8 場
export function buildSchedule({ seed, invitedId = null, prevGroupIds = null, seasonIndex = null }) {
  const group = drawGroupOpponents({ seed, invitedId, prevGroupIds });
  return [
    ...group.map((oppId, i) => ({
      id: `group-${i + 1}`,
      stage: 'group',
      opponentId: oppId,
      label: '',
      ...(invitedId && oppId === invitedId ? { invited: true } : {}),
    })),
    ...nationalLegFor({ seed, seasonIndex, groupIds: group }),
  ];
}
