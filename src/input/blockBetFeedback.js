// 攔網時序卷 段 5 — 回饋層：「他賭了、賭錯了、留下空門」
//
// ★ 為什麼要有這一則字卡 ★
// 段 2 之後對方的 commit 攔網手是**真的在賭**（讀二傳配分傾向、押一條線起跳），
// 段 1 之後他賭錯就是真的下不來（滯空 AIR_TICKS 到就落地、失去牆上資格）。
// 但這場賭局玩家從頭到尾看不見——球飛過去了他也不知道剛才有人押錯邊。
// 沒有回饋＝學不到因果，賭局白開。本檔就是把那一瞬間講出來。
//
// ★ 只能用可觀察量（反作弊鐵律）★
// **嚴禁讀 `aiState.blockPlan`**——那是攔網 AI 的私有狀態（他心裡押哪條線）。
// 玩家在場上看得到的只有「人跳起來了沒」「他人在哪、球在哪」，本檔就只讀這些：
//   - 賭了＝`blockUntil >= tick` 且 `tick − blockStartTick <= AIR_TICKS`（人還在空中）
//   - 空門＝那些空中的人，沒有一個的 |x − ball.x| <= BLOCK_HALF_WIDTH（球路上沒有手）
// 兩個常數都從 sim 匯入，**不自己發明距離／窗長**（同一真相，sim 一動這裡跟著動）。
//
// ★ 兩張字卡的措辭差異是量出來的，不是寫爽的（Sawmah 裁定 6）★
//   甲「他賭了、賭錯了——空門是你的！」：扣球者就是受控玩家 ⇒ 因果直連，
//      實測發生率 5.7–6.9%、誤歸因 0.0%，過門檻 ⇒ 可以帶「你」。
//   乙「他賭了，賭錯了，空門！」：扣球者是隊友、玩家本波有跑助跑線 ⇒ **刻意無歸因**。
//      「玩家助跑把攔中帶走」實測發生率 OH 6.1%／MB 3.5–4.1%、誤歸因 20–29%，
//      **沒過門檻（發生率 ≥5% 且誤歸因 ≤20%）**，所以只能陳述「他賭錯了」這個事實，
//      **不得**寫成「你帶走了攔網手」——那句話有兩成以上的時候是假的。
//   兩者皆非（玩家這一波沒參與）⇒ 不出字卡，不對著別人的球喊。
import { AIR_TICKS } from '../sim/approach.js';
import { BLOCK_HALF_WIDTH } from '../sim/blockBand.js';
import { otherTeam, isFrontRow } from '../sim/rotation.js';
import { blockPersonaOf } from '../sim/ai.js';
import { BLOCK_PERSONA } from '../sim/blockRead.js';

/**
 * 本方扣球觸球那一刻，對方是不是「賭了、賭錯了、留下空門」？
 *
 * 純函式：只讀 game／aiState、零 rng、零 DOM、不寫回任何狀態
 * （回傳形狀比照 `callPlay.js` 的 `callFeedbackOf`）。
 *
 * @param {object} game     sim 狀態（讀 tick／ball／actors／players／match.rotations）
 * @param {object} aiState  AI 協調層狀態（只讀 `approach.team`／`approach.routes`）
 * @param {string} playerId 受控玩家 id
 * @param {string} spikerId 這一擊的扣球者 id
 * @param {{setterId?: string|null, ranRoute?: boolean|null}|null} opts 武裝時的參與快照：
 *   `setterId`＝本波我方二傳觸球者（S 配球也算參與——反配正是 S 的玩法）；
 *   `ranRoute`＝**扣球當下**玩家是否在助跑線上。遞延結算後不得在本函式內讀
 *   aiState.approach 補判——球到網時助跑資料已被清掉，讀到的恆是 false
 *   （08-05 探針實測：結算時自讀 ⇒ 跑線卡 42→0）。未提供時退回自讀（相容舊呼叫）。
 * @returns {{text:string,color:string,ms:number}|null} null＝不出字卡
 */
export function blockBetFeedbackOf(game, aiState, playerId, spikerId, opts = null) {
  const setterId = opts?.setterId ?? null;
  const me = game?.players?.[playerId];
  if (!me) return null;
  const opp = otherTeam(me.teamId);
  const rot = game.match?.rotations?.[opp];
  if (!rot) return null;

  // ① 他賭了嗎：對方前排此刻**物理滯空中**的攔網手（落地的不算——段 1 的直接延伸）
  const airborne = [];
  for (const id of rot) {
    if (!isFrontRow(rot, id)) continue;
    const a = game.actors?.[id];
    if (!a) continue;
    if (a.blockUntil < game.tick) continue;                 // 攔網窗已過
    if (game.tick - a.blockStartTick > AIR_TICKS) continue; // 已落地＝沒在牆上
    airborne.push(a);
  }
  if (!airborne.length) return null; // 沒人賭＝沒有賭錯這回事

  // ② 空門嗎：只要有一隻手涵蓋得到**擊球那一刻的球**，就不是空門。
  //    量的是擊球點不是過網點——與量門檻的 `tools/segf-decoy-probe.mjs` 同一個座標系
  //    （誤歸因率 0.0% 那組數字就是在這個位置上量出來的）。
  const ballX = game.ball?.x ?? 0;
  const covered = airborne.some((a) => Math.abs(a.x - ballX) <= BLOCK_HALF_WIDTH);

  // ★ 難度重校卷 題 E3（2026-08-05 Sawmah 裁定）：賭局敘事的另一半 ★
  // 「賭錯→空門」有字卡、「賭中→牆在線上」卻靜默 ⇒ 玩家只看得見賭局的下行，
  // 學不到「他是在賭、而且會賭中」。E1 之後賭中的牆是真的罩得下來（滯空涵蓋
  // 9.4%→55.1%），這一瞬間值得講出來。
  // 只對 commit 隊講「賭」：read 隊的牆罩到線是看球的正常反應，喊「賭中」是錯的敘事
  // ——persona 是隊伍 DNA（情蒐可知），不是這一球的私有狀態，反作弊界線不動。
  // 扣球者＝玩家 → 帶「你」（因果直連，比照甲卡的裁定 6 邏輯）；
  // 玩家是本波二傳 → 無歸因版（配球的人看得到牆罩住那條線，但「線」是扣球者選的，
  //   混合因果 ⇒ 不帶「你」——與乙卡同一條誤歸因紀律）。
  // 之後真被攔到自有 BLOCK_TOUCH 字卡收尾，這張講的是「他讀中這條線」這件事本身。
  if (covered) {
    if (blockPersonaOf(game, opp) !== BLOCK_PERSONA.COMMIT) return null;
    if (spikerId === playerId) {
      return { kind: 'hit', text: '他賭中了——牆罩在你的線上！', color: '#ffd166', ms: 1600 };
    }
    if (setterId != null && setterId === playerId) {
      return { kind: 'hit', text: '他賭中了——牆罩住那條線！', color: '#ffd166', ms: 1400 };
    }
    return null;
  }

  // ③ 玩家有沒有參與這一波——決定講不講「你」，或根本不講。
  //    參與＝親扣／跑了助跑線（武裝時快照，見 @param）／**當這一波的二傳**
  //    （題 E 收尾：S 反配空門正是玩法本體，08-05 試玩抓到這個缺口）。
  // ★ 題 E 收尾 2：賭錯卡也鎖 commit 隊 ★ 檔頭寫明這張卡講的是「commit 攔網手
  //   真的在賭」；改到過網結算後 read 隊的牆「在空中但沒罩到」變成常態
  //   （他們只是照球起跳，不是賭錯），不鎖的話字卡會洪水化＋敘事錯誤。
  if (blockPersonaOf(game, opp) !== BLOCK_PERSONA.COMMIT) return null;
  if (spikerId === playerId) {
    return { kind: 'miss', text: '他賭了、賭錯了——空門是你的！', color: '#ffd166', ms: 1600 };
  }
  const ranRoute = opts?.ranRoute != null
    ? opts.ranRoute === true
    : (aiState?.approach?.team === me.teamId
      && !!aiState.approach.routes?.some((r) => r.pid === playerId));
  if (ranRoute || (setterId != null && setterId === playerId)) {
    // 無歸因版：只說他賭錯，不說是誰造成的（誤歸因率沒過門檻，見檔頭）
    return { kind: 'miss', text: '他賭了，賭錯了，空門！', color: '#ffd166', ms: 1400 };
  }
  return null;
}

// ★ 題 E 收尾 3（2026-08-05 Sawmah「加節流，看看會不會太少」）：出卡節流閘 ★
//
// 參數是**量出來的不是猜的**（`tools/bet-card-throttle-probe.mjs`，10 局真實 career
// 對曜石、評估點與 matchLoop 同路徑）：不節流每局 **14.0 張**（賭錯 10.6／賭中 3.4）。
//
// 形狀＝「只節流賭錯、賭中一律放行」（探針的變體 B）：吵的是賭錯（每局 10.6），
// 而賭中每局僅 3.4 且訊息量更高（他讀中你了＝該換線的訊號）。冷卻 6 rally 時
// 每局 **6.9 張**（賭中 3.4 全保留／賭錯 3.5／最少的一局 5、最多 10）——
// 總量砍一半，但沒有一局會低到「整局看不到賭局在發生」。
//
//   冷卻掃描（變體 B，每局張數）：0→14.0｜2→10.4｜3→8.7｜4→7.8｜**6→6.9**｜8→6.5｜12→6.1
//   ⇒ 8 之後邊際效益趨平（賭中不受冷卻＝地板在 6.1），再拉長只是讓賭錯消失，不划算。
//
// 關鍵分（`keyPointOf`＝局點，沿用既有判定不另造）一律放行：那一球的賭局最該被看見。
// 換局偵測＝`rally` 變小（比分歸零）⇒ 自動重置，不需外部呼叫 reset（漏呼叫就會整局靜默）。
export const BET_CARD_COOLDOWN_RALLIES = 6;

/**
 * 出卡節流閘（純狀態機，與 UI 無關）。
 * `rally` 用「本局已完成的 rally 數」＝`score.A + score.B`（每球得分制下逐值精確，
 * 零新計數器；換局比分歸零 ⇒ 下方 `rally < last` 自動重置）。
 */
export function createBetCardGate(cooldown = BET_CARD_COOLDOWN_RALLIES) {
  let last = null;
  return {
    allow({ rally, keyPoint = false, hit = false } = {}) {
      const free = keyPoint || hit; // 關鍵分與「他賭中了」不受冷卻
      if (last === null || rally < last || free || rally - last >= cooldown) {
        last = rally; // 免冷卻的卡也重置冷卻＝不會連著兩球都跳字
        return true;
      }
      return false;
    },
  };
}

// ★ 題 E 收尾 2（2026-08-05 真人實測「攻擊手也沒卡」）：評估點遞延到「球到網」 ★
//
// ★ 為什麼觸球那一 tick 量不到 ★
// E1 之後 commit 攔網手是「球到達時才在空中」（起跳時鐘＝predictContactPoint）。
// AI 攻擊手的擊球 tick 與同一個預測一致，所以 headless 探針在觸球位置量得到
// （51.2% 有人在空中）；**真人揮拍時機是自己的**——打早半拍，觸球瞬間牆根本還沒
// 起跳，「他賭了」的偵測恆空，兩張卡對真人結構性全滅（08-05 攻擊手實測整場零卡）。
// `tools/block-card-probe.mjs`：觸球位置無人在空中 48.8%、**過網位置只剩 17.2%**
// （空門 59.3%／罩住 23.2%）。過網那一刻＝`tryBlock` 結算牆的同一位置與同一座標，
// 是唯一與玩家看到的結果同座標系的量測點（02 §6.1 條 5 的活教材——探針在觸球位置
// 全綠，真人在同一位置全滅，因為兩者的「觸球」不是同一個 tick）。
//
// ★ 為什麼抽成純狀態機（比照 mbCallFeedbackOf 的教訓）★
// 「等球過網再評」是跨 tick 的時序邏輯，內聯在 matchLoop 的 UI 迴圈裡就沒有測試
// 守得住它（前一版的「觸球即評」正是內聯判定，上線整場恆空才被真人抓到）。
// 事件形狀直接吃 sim 的字面事件（TOUCH／BLOCK_TOUCH／DEAD_BALL），測試餵生產端
// 同形的事件流就能釘死時序。
//
// 用法（matchLoop）：事件迴圈逐事件餵 `onEvent`、每幀餵一次 `onFrame(ball.z)`；
// 兩者回傳非 null（{ spikerId, setterId, flightId }）＝「此刻就評」——這時再呼叫
// `blockBetFeedbackOf`，game 當下的 tick／actors／ball 正是球到牆上的那一刻。
export function createBlockBetArm() {
  let setPid = null;   // 本波我方二傳觸球者
  let pending = null;  // 我方扣球後、球還沒到網：{ spikerId, setterId, flightId }
  let prevZ = null;    // 上一幀球的 z（變號＝過網，同 game.js 的 crossed 條件）
  return {
    // ctx＝武裝時的參與快照（spike 事件才需要）：{ ranRoute }——遞延結算後
    // aiState.approach 已被清掉，這個布林只能在扣球當下取（見 blockBetFeedbackOf @param）
    onEvent(e, myTeam, flightId, ctx = null) {
      if (e.type === 'DEAD_BALL') { setPid = null; pending = null; prevZ = null; return null; }
      if (e.type === 'TOUCH' && e.kind === 'set' && e.team === myTeam) {
        setPid = e.playerId ?? null;
        return null;
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === myTeam) {
        pending = {
          spikerId: e.playerId, setterId: setPid, flightId,
          ranRoute: ctx?.ranRoute ?? null,
        };
        return null;
      }
      // 對方牆碰到球＝球已經到牆上（被罩住的正典情境）：立即結算，不等 z 變號
      //（被攔回的球可能永遠不過網，等變號會把「賭中」整類漏掉）
      if (e.type === 'BLOCK_TOUCH' && e.team !== myTeam && pending) {
        const p = pending;
        pending = null;
        return p;
      }
      return null;
    },
    onFrame(ballZ) {
      const prev = prevZ;
      prevZ = ballZ;
      if (!pending || prev == null) return null;
      if ((prev > 0) !== (ballZ > 0) && prev !== ballZ) {
        const p = pending;
        pending = null;
        return p;
      }
      return null;
    },
  };
}

// ★ 2026-08-03 裁定乙第二步：玩家自己封線的結果字卡 ★
//
// ★ 為什麼要抽成純函式（而不是內聯在 matchLoop）★
// 這則字卡的前一版**恆假了一整天沒人發現**：`6b7051b` 把面板從「何時跳」改成問
// 「封哪邊」之後，生產端寫的是 `{ jumped: false, line }`，而消費端的條件仍是
// `s.mbCommit?.jumped` ⇒ 三句字卡一句都印不出來（08-03 稽核 auditA 抓到）。
// 根因是判定邏輯內聯在 UI 迴圈裡、沒有任何測試守著。抽出來之後
// `tests/block-bet-feedback.test.mjs` 就能把「什麼形狀進、什麼字卡出」釘住。
//
// ★ 判準與 L 指揮的「讀對」共用同一個真相 ★
// `zone` 來自 `game.rally.lastSpikeZone`（`game.js:classifySpikeZone` 在扣球當下分類），
// 與 `liberoRead.js:digReadCorrect` 同源 —— 兩個位置的回饋才不會各說各話。
//
// ★ 為什麼收整個 `mbCommit` 物件而不是收 `line` 字串 ★
// 恆假的根因是**欄位名對不上**（生產端寫 `line`、消費端讀 `jumped`）。
// 若本函式只收字串，取欄位的責任還留在呼叫端 ⇒ 測試守不到那一步、同樣的錯還會再犯。
// 收物件之後，「要讀哪個欄位」變成本函式的責任，測試餵生產端的字面形狀就能釘死它。
//
// @param {string|null} zone 本波扣球的線路分類（line／cross／middle／tip）
//   ＝ `game.rally.lastSpikeZone`
// @param {{line?: string}|null} mbCommit 玩家的封線指令（matchLoop 的 `s.mbCommit`）
export function mbCallFeedbackOf(zone, mbCommit) {
  const calledLine = mbCommit?.line;
  if (!calledLine) return null; // 玩家沒下指令＝沒有賭注，不評
  // 只評方向題。middle／tip 不是「封哪邊」能回答的問題 ⇒ 不評，
  // 免得玩家把「他打中間」誤讀成自己選錯邊。
  if (zone !== 'line' && zone !== 'cross') return null;
  return zone === calledLine
    ? { text: '方向讀對了——他從你頭上過', color: '#ffd166', ms: 1600 }
    : { text: '他打你沒守的那邊', color: '#c8d6eb', ms: 1600 };
}
