// Phase 4 W3 — S 分配決策選項池（甲2 拍板 C 門檻派；沿 attackZones 純函式範式）
// 玩家＝舉球員時：一傳品質分支下的合法選項池——與 AI 舉球同一來源（ai.attackPointsOf），
// 消費方向反轉＝由玩家點選，不再 trust 權重抽。讀 game/aiState 不寫回。
//
// trust 反轉（C 案，甲2 逐字）：「極低信任→該隊友快攻選項變暗標『猶豫』」——
// 猶豫只標快攻選項（快攻＝盲跳吃信任的時機球；兩翼高球看得見球再跳，不標）。
// 可選但有標註（顯示哲學：狀態誠實呈現）；正常以上＝零機制、純表現層。
// 門檻 SET_HESITANT_BELOW＝實作初擬值（工單 §3：治具驗邊界、試玩批次清單優先級 1 裁定）：
// 12＝新生 baseline 10 開場帶「猶豫」、被你舉成功一次（+5）即亮——親手經營的體感；
// 班底 20 要連續失誤（−6×2）才會跌進來。
import { attackPointsOf, setAimFor } from '../sim/ai.js';
import { effectiveTrust } from '../sim/trust.js';
import { localToWorld, otherTeam, isBackRow } from '../sim/rotation.js';

export const SET_HESITANT_BELOW = 12;
// 主動呼叫要球（表現層）：有效 trust 達此值的最高者在面板開啟時喊聲（甲2「高 trust
// 隊友主動呼叫要球」；初擬值同進試玩清單）
export const CALL_BALL_AT = 30;

// 路線標籤的單一真相（07-29：`input/myRoute.js` 亦讀這份——同一條線在分配面板與
// 受控者自己的線索上不得有兩種叫法）
export const KIND_LABELS = {
  quick: '快攻', left: '左翼', right: '右翼', pipe: '後排P', dball: 'D球',
  // §5 A2（07-29 補）：缺這條的話標籤會 fallback 成英文字串 kind。
  //
  // ★ 2026-07-31 Sawmah 命名裁定 ★
  // kind 標籤先前由 'cross' 改名為 'left_inside'，但**顯示文案**當時仍留著「交叉」。
  // 真交叉（`cross`）落地後兩者撞名，Sawmah 裁定：「交叉」這個名字還給真交叉。
  //
  // `left_inside` 到底是什麼（查證後正名，**不是背飛**）：
  //   擊球點 lx −1.3、助跑起點 lx −4.1 ⇒ OH 從外側切進來，落球在正常兩翼點（−3）
  //   與中路（0）之間，**人與球全程都在左半場、沒有越過二傳**。
  //   背飛是 MB 從二傳**背後**往右側跑的快攻（擊球點 lx > 0），與本線無關——
  //   遊戲目前沒有背飛，它與 slide（單腳背飛）同族，已登記在單人型擴充卷。
  left_inside: '內切',
  // 組合攻擊卷 段 A（2026-07-31）：兩條新線的標籤先補齊——缺了會 fallback 成英文
  // kind 字串（§5 A2 那次的原坑）。段 A 沒有人跑得到這兩條線，這裡純粹是資料補齊。
  cross: '交叉攻擊',   // 真交叉：助跑穿過快攻手起跳點後方、在他另一側起跳
  tandem: '夾塞',
};

// 選項：{ key, pid, name, kind, label, aim(世界座標), t(舉球弧線＝sim timing),
//         trust, hesitant, tier }
export function setOptionsFor(game, aiState, setterId) {
  const me = game.players[setterId];
  if (!me) return [];
  const team = me.teamId;
  const tier = aiState?.passTier ?? 'perfect';
  // §5 A2（07-29 修）：路線種類的**唯一真相是協調層已定案的 route**，不是 attackPointsOf
  // 的預設值。`ai.js:250` 先跑 applyRouteKinds 才選人（OH 的 left 可能變 left_inside），
  // 而本函式原本只呼叫 attackPointsOf ⇒ ①玩家永遠看不到交叉 ②面板顯示「左翼」瞄 lx −3、
  // 該 OH 實際跑 left_inside 的 lx −1.3＝**球與人差 1.7m**（實測 B2：面板 left／實際 cross）。
  // ai.js:249 的註解本來就警告過「選完人再改線＝二傳瞄的落點與助跑終點是兩個地方」，
  // 只是當時只修了 AI 那條路徑。
  const routeKindOf = (pid) => (
    aiState?.approach?.team === team
      ? (aiState.approach.routes ?? []).find((r) => r.pid === pid)?.kind
      : undefined
  );
  // Phase 5 W1 §7 D2：接一傳的那個人這一球只剩降級路線（甚至掉出池）——面板必須與
  // AI 舉球讀到**同一顆池**（同源鐵則），否則玩家會看到一個 sim 不承認的選項
  const receiverId = aiState?.passReceiverId ?? null;
  const options = attackPointsOf(game, team, setterId, tier, receiverId).map((pt) => {
    const p = game.players[pt.pid];
    const kind = routeKindOf(pt.pid) ?? pt.kind;
    const a = setAimFor(game, team, pt.pid, kind);
    const trust = effectiveTrust(game, p);
    return {
      key: `${pt.pid}-${kind}`,
      pid: pt.pid,
      name: p.name,
      kind,
      label: `${p.name}·${KIND_LABELS[kind] ?? kind}`,
      aim: localToWorld(team, a.lx, a.lz),
      t: a.t,
      trust,
      hesitant: kind === 'quick' && trust < SET_HESITANT_BELOW,
      tier,
    };
  });
  // W4(P4) 題3 拍板：玩家 S 前排＋一傳 Perfect 檔→多一顆「🎯二次球」偷襲——
  // 沿 AI setterDump 同 sim 路徑（輕推對方淺區、t=0.3＝chooseTouch dump 分支同值）、
  // 零數值特例；懲罰＝機會成本本身（被守淺區就地處理）、不吃 trust（代價留在比分層）
  if (tier === 'perfect' && !isBackRow(game.match.rotations[team], setterId)) {
    options.push({
      key: 'dump',
      pid: setterId,
      name: me.name,
      kind: 'dump',
      label: '🎯二次球',
      aim: localToWorld(otherTeam(team), 1.5, 2.6),
      t: 0.3,
      trust: 100,
      hesitant: false,
      tier,
    });
  }
  return options;
}

// 面板標題（一傳品質誠實播報——資訊落在要用的前一刻）
export function setPanelTitle(tier) {
  if (tier === 'perfect') return '一傳到位——分配！';
  if (tier === 'ok') return '一傳可用——無快攻';
  return '一傳勉強——兩翼高球';
}

// 07-28 Sawmah 試玩提問「S 要不要確定走得到才開面板」→ 探針實測
// （`tools/setter-reach-probe.mjs`，5764 次指派）：走不到根本不是問題（claim 者
// 99.9% 自己舉到），**問題是開窗當下平均還要跑 2.72m、p90 要跑 5.97m**
// ——玩家被迫一邊全速跑位一邊挑四個選項。
// 拍板＝兩段式「資訊早給、操作晚要」：遠段只給真值（一傳品質＋建議打誰，看就好、
// 不用點），跑進可及範圍才亮可點的熱點。讀的時間不縮短，只把「點」挪到你站定。
//
// 門檻定值＝探針 p50（2.72m）稍放寬：約六成的球一開窗就已在近段（行為與改動前
// 完全一樣），另四成才有明確的「先跑再選」兩段。嫌早嫌晚重跑 probe 改此值。
//
// 【已停用・2026-08-02 卷五裁定 3】空間判準退場，改吃時間（見下）。常數留著是因為
// `tools/set-window-eta-probe.mjs` 拿它做新舊對照，不是還有人在判斷上用它。
export const SET_READY_M = 3.2;

// ---- 卷五裁定 3（Sawmah 2026-08-02）：遠段／近段的界線改成**時間** ----
//
// 病灶＝判準用錯了維度。遠段的存在條件本來寫成空間的（我還要跑多遠），但決策窗的
// 本質是時間的（球還有多久到我手上）。S 通常本來就站在二傳位附近，一傳到位時他不用
// 跑 ⇒ 空間判準判定「你已經站好了，不需要準備時間」——可是他需要的是**想的時間，
// 不是跑的時間**。實測（`tools/set-window-eta-probe.mjs`，60 局 4843 波）：
// 開窗當下就已在近段的佔 **48.6% ± 0.7pp**，其餘也幾乎在一兩 tick 內進入
// ⇒ 那排 `⚡改判` 有將近一半的球連閃都沒閃。
//
// 改成時間之後，兩段的界線是一句話：
//   **球還在飛＝講戰術（要提前講好的事）　球到手上＝選人（看得見再決定的事）**
// 球在飛的時間是物理決定的，不管站哪都存在 ⇒ 每一球都有戰術窗（裁定 1d 的
// 「sim 層每球有窗」就是這條保證）。
//
// ⚠ **這個值是暫定的，等 Sawmah 拍** ⚠ 依據與待決點：
//   · 實測窗長（開窗時距我接觸的剩餘 tick）＝ p50 **95 tick ≈ 1.58s**，
//     且**三個一傳品質分層逐值相同**（perfect/ok/poor 的 p50 全是 95）
//   · 現制的近段起點在時間座標上落在 p50 95 ⇒ 幾乎等於「開窗即近段」
//     ⇒ **沒有「行為等價」的換算可用**，任何 T < 93 都是在無中生有一段遠段
//   · 取 55：遠段 ≈40 tick（0.67s）／近段 55 tick（0.92s），兩段都有實際按得下去的
//     時間。往上調＝遠段變短（戰術窗更趕）、往下調＝近段變短（選人更趕）。
export const SET_READY_TICKS = 55;

// 距我接觸的剩餘 tick → 分配窗階段：'preview'＝球還在飛（講戰術）／'ready'＝球到手上（選人）
export function setStageOf(ticksLeft) {
  // 算不出接觸點＝不擋操作（寧可早開也不吞掉決策權）——與空間判準時期同語意
  if (!Number.isFinite(ticksLeft)) return 'ready';
  return ticksLeft <= SET_READY_TICKS ? 'ready' : 'preview';
}

// 遠段標題：一傳品質＋協調層建議的攻擊點（真值，與近段選項池同源）
export function setPreviewTitle(tier, suggestLabel) {
  const base = tier === 'perfect' ? '一傳到位' : tier === 'ok' ? '一傳可用' : '一傳勉強';
  return suggestLabel ? `${base}　建議：${suggestLabel}——先跑到位` : `${base}——先跑到位`;
}
