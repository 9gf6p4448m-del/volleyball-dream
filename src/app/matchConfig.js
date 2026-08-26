// 賽前準備①——比賽設定解析（純函式層：零 three.js/DOM/存檔 IO，node 可測）
// runMatch 三段拆分（Phase 3 W1）：本檔＝設定與資料準備；matchStage.js＝舞台建置；
// matchLoop.js＝回合迴圈；matchCareer.js＝生涯開賽標記與賽末收束。
// 三段以明確資料介面銜接：config →（createGame）→ gates → stage → loop。
import { careerMatchSetup, buildLibero } from '../career/careerState.js';
import { practiceMatchSetup } from '../career/practiceMatch.js';
import { matchSeed } from '../career/careerState.js';
import { createDefaultTeams } from '../sim/game.js';
import { createPlayer } from '../sim/player.js';
import { buildScoutTape, TAPE_FEATURE_KEYS } from '../career/scoutTape.js';
import { upcomingTeach } from '../career/events.js';
import { blockReadTier } from '../career/growth.js';
import { matchFormatOf } from '../career/schedule.js';
import { currentTeamName } from '../career/chapter.js';

// W3(P4) 07-27 Sawmah 拍板：快速比賽＝位置遊樂場（五位置任選；生涯轉位 gate 不動——
// 快速比賽本來就是測試/試駕場）。建隊＝預設隊伍最小變換：玩家（A2）與目標槽位互換、
// 被換者改打 OH；L＝玩家穿異色球衣走 liberos 通道、先發槽由替補預設員（A8）頂上。
// 純函式：role 為 null/'outside'＝回 null（照舊預設建隊，零擾動）
export function buildQuickSetup(role) {
  if (!role || role === 'outside') return null;
  const teams = createDefaultTeams();
  if (role === 'libero') {
    teams.A[1] = createPlayer({
      id: 'A8', name: 'A隊8號', teamId: 'A',
      naturalRole: 'outside', currentRole: 'outside', height: 1.88, trust: 60,
      attributes: {
        jump: 60, power: 62, reaction: 60, stamina: 60,
        speed: 62, control: 68, serve: 60, block: 58,
      },
    });
    // 玩家＝自由人：防守身型與專才屬性（鏡像 buildLibero 公式 level 60）
    const liberoA = createPlayer({
      id: 'A2', name: 'A隊2號', teamId: 'A',
      naturalRole: 'libero', currentRole: 'libero', height: 1.72, trust: 5,
      attributes: {
        jump: 40, power: 40, reaction: 74, stamina: 70,
        speed: 72, control: 72, serve: 30, block: 30,
      },
    });
    return { teams, liberoA };
  }
  const idx = { setter: 0, middle: 2, opposite: 3 }[role];
  if (idx === undefined) return null; // 未知角色＝照舊（防呆）
  const me = teams.A[1];
  const displaced = teams.A[idx];
  me.naturalRole = role;
  me.currentRole = role;
  displaced.naturalRole = 'outside';
  displaced.currentRole = 'outside';
  teams.A[idx] = me;
  teams.A[1] = displaced;
  return { teams, liberoA: null };
}

// 介面契約（tests/app-config.test.js 把關）：
// resolveMatchConfig({ params, careerCtx, randomSeed }) → {
//   seed, setTarget, simpleMode, autopilot, teamControl, assistOn,
//   careerSetup, tapeClips, gameOptions,
// }
// - params：URLSearchParams（或任何有 .get(name) 的物件）
// - careerCtx：{ career, player, matchEntry, store } 或 null（快速比賽）
// - randomSeed：快速比賽無 ?seed= 時用的種子——隨機化住在呼叫端（main），sim 內仍決定論
// 簡化操作模式（預設）：接發/舉球/防守/走位/發球全自動，玩家只做進攻決策（讀攔網選攻擊區）。
// `?classic=1` 回到全手動操作（蓄力鈕那一套）。
//
// ★ 單一真相源 ★ 「現在是不是簡化模式」只准有這一個定義，任何要**對玩家描述操作**的
// 地方（`ui/howToPlay.js` 的怎麼玩頁、`ui/tutorial.js` 的開場卡）都必須問這個函式，
// 不得自己再判一次 `classic`。
//
// 2026-08-13 這條紀律是被事故逼出來的：怎麼玩頁與教學局六科目的台詞是照 classic 模式
// 寫的，但沒有人在玩 classic（`matchStage.js:68` 在 simpleMode 下**根本不建立**那顆
// 蓄力鈕）⇒ 教學文字整套在教一顆畫面上不存在的按鈕，真人試玩才抓到。
export function isSimpleMode(params) {
  return params?.get('classic') !== '1';
}

// 教學局的局分：高到「比分不可能先於六步結束」。★ 不是無限大 ★ 留一個真的上限，
// 萬一收局訊號壞掉時局還是收得掉（不會變成永遠打不完的殭屍局）。
export const TUTORIAL_SET_TARGET = 999;

export function resolveMatchConfig({ params, careerCtx = null, randomSeed, quickRole = null }) {
  const seedParam = Number.parseInt(params.get('seed'), 10);
  // 種子優先序：?seed=（重現/測試）→ 生涯場次種子（生涯種子×場次 id 決定論導出）→ 開局隨機
  const seed = Number.isFinite(seedParam) ? seedParam
    : careerCtx ? matchSeed(careerCtx.career, careerCtx.matchEntry.id)
      : randomSeed;
  // 正式局預設 25 分（deuce 規則不變；?points= 仍可覆寫測試用短局）
  const pointsParam = Number.parseInt(params.get('points'), 10);
  const setTarget = Number.isFinite(pointsParam)
    ? Math.min(Math.max(pointsParam, 5), 25)
    : 25;

  const simpleMode = isSimpleMode(params);
  // ?autopilot=1：決定論代打（重構等值驗證治具）——只代發球（唯一等輸入的環節），
  // 決策鎖 game.tick 不碰牆鐘；其餘全靠零輸入的自動保底路徑（皆 tick 決定論）
  const autopilot = params.get('autopilot') === '1';
  // 控制模式：預設固定主攻手（07-21 Sawmah 試玩後定案）；?teamcontrol=1 開全隊輪控實驗
  const teamControl = params.get('teamcontrol') === '1';
  // 操作輔助（?assist=off 關閉）：青色圈＝來球預測落點
  const assistOn = params.get('assist') !== 'off';

  // 生涯模式：玩家 Player 餵進 A 隊主攻手槽＋對手參數檔建隊與 AI 風格
  // （sim 不讀存檔——一律建隊參數注入）。W2：careerCtx.roster（呼叫端先經
  // ensureStarterRoster 補齊）餵進建隊——隊友具名/個性化/成長後屬性由此生效
  // W1(P4)：careerCtx.seasonIndex（呼叫端由 store.seasonIndex() 供給）——
  // 第 2 屆起對手 ace 畢業遞補（applySeasonRoster）換臉靠它；缺省＝1＝第 1 屆不變
  // 練習賽卷（2026-08-12）：careerCtx.practice＝屆間紅白對抗賽——換一支建隊函式，
  // 其餘（種子／技術閘／體力／氣勢／局間）全走同一條路。★ 差異只在建隊 ★
  const careerSetup = careerCtx
    ? (careerCtx.practice
      ? practiceMatchSetup({
        player: careerCtx.player,
        members: careerCtx.roster?.members ?? [],
        lineup: careerCtx.lineup ?? null,
        drills: careerCtx.practice.drills ?? [],
        seasonIndex: careerCtx.seasonIndex ?? 2,
        seed,
        tutorial: !!careerCtx.practice.tutorial, // 教學局＝同一條路，只是多一個旗標
      })
      : careerMatchSetup(
        careerCtx.career, careerCtx.player, careerCtx.matchEntry,
        careerCtx.roster ?? null, careerCtx.lineup ?? null,
        careerCtx.seasonIndex ?? 1,
        // 配色卷階段二 E1 第 7 參數：大學章已選校時的學校 id（高中章 loadSchool 恆 null）
        careerCtx.store?.loadSchool?.() ?? null,
        // 企業章批 3（A3-3）第 8 參數：已簽公司 id（其他章 loadCorp 恆 null）
        careerCtx.store?.loadCorp?.() ?? null,
        // 職業章批 2 第 9 參數：已簽球隊 id（其他章 loadPro 恆 null）
        careerCtx.store?.loadPro?.() ?? null,
        // 職業章批 4a 第 10 參數：賽前布置面板選擇（其他章 loadDeployment 缺席
        // ⇒ `?.()` 短路成 undefined ⇒ `?? null` ⇒ careerMatchSetup 內兩槽皆空）
        careerCtx.store?.loadDeployment?.(careerCtx.matchEntry.id) ?? null,
      ))
    : null;
  // W3(P4) 快速比賽選位置（UI 傳入優先、?role= 網址測試用；生涯場一律忽略）
  const quick = careerCtx ? null : buildQuickSetup(quickRole ?? params.get('role'));
  // stage 6：自由人雙方都有（生涯吃參數檔；快速比賽用預設防守專才；
  // 快速選 L＝玩家本人穿異色球衣）
  const liberos = careerSetup?.liberos ?? {
    A: quick?.liberoA ?? buildLibero('A', 'A隊自由人'),
    B: buildLibero('B', 'B隊自由人'),
  };
  // W7 A1-A5 體力（雙方啟用）：P1（2026-07-30）移除 heavyExempt 後實測發現
  // costMul 0.6 下對手全 240 場體力最低 0.74＝連喘氣帶都碰不到、豁免從未咬合
  // ⇒ 改 1.0 對稱（Sawmah 詢問「要真實建議哪個」後採實作端建議）：同一套生理
  // 規則不分敵我；「鏡頭外調度」敘事改口「調度得好但人終究是人」（批 4 persona 重寫）。
  // 掃描數據（tools/balance-sim VD_B_COSTMUL）：1.0 下決賽 5→10%、決賽帶 20→28%、
  // B 深局最低 0.27＝疲勞可視化（N1）在對手身上真的看得到。快速比賽本就對稱。
  // 練習賽：兩邊都是自家隊——對手那格的 costMul 是為「對手」設的參數，紅白賽套上去
  // 等於對自己人不對稱加料，一律走對稱值（同快速比賽）
  const stamina = (careerSetup && !careerCtx?.practice)
    ? { A: {}, B: { costMul: 1.0 } }
    : { A: {}, B: {} };
  // W4(P4) Q8 分級賽制：生涯場由賽程項推導（決賽 bo5／準決賽・宿敵場 bo3／其餘 bo1）；
  // ?bo= 測試覆寫（3/5；快速比賽驗多局用）；bestOf 1＝series 不進 gameOptions＝零擾動
  const boParam = Number.parseInt(params.get('bo'), 10);
  // 大學卷批 6：賽程項可以自帶賽制（`uniSchedule.js` 的 `format: 3`）——大學長循環
  // 每場 bo3，而勝點制**需要**局數（bo1 場次連局數欄位都沒有，
  // 見 `app/matchCareer.js:93-97`）。★ 用賽程項帶而不是改 `matchFormatOf` ★
  // 那支在 `schedule.js` 裡，本卷鐵律是高中那份一行不動。
  const entryFormat = careerCtx?.matchEntry?.format;
  const bestOf = [3, 5].includes(boParam) ? boParam
    : [3, 5].includes(entryFormat) ? entryFormat
      : careerCtx ? matchFormatOf(careerCtx.matchEntry) : 1;
  // 教學局不靠比分結束——六步走完才收局（`matchLoop.endTutorialSet`）。
  // ★ 為什麼要拉高局分 ★ 分步關卡卷（2026-08-13）改成「沒做到就再擺一次同樣的場景」、
  // 且重試次數不限（Sawmah 題 3 裁定）⇒ 一步可能燒掉很多球，25 分會**先**到，
  // 局在教學結束前就結束了。實測（`tools/tutorial-stage-probe.mjs 50`）：25 分時
  // 50 場有 7 場沒走完六步。拉高到 TUTORIAL_SET_TARGET 讓收局權完全回到六步身上。
  const effectiveTarget = careerSetup?.practice?.tutorial ? TUTORIAL_SET_TARGET : setTarget;
  const gameOptions = {
    seed, setTarget: effectiveTarget, liberos, stamina,
    ...(bestOf > 1 ? { series: { bestOf } } : {}),
    momentum: true, // W7 B1 團隊氣勢（生涯/快速比賽一律啟用）
    ...(careerSetup ? {
      teams: careerSetup.teams,
      aiProfiles: careerSetup.aiProfiles,
      // 組合攻擊屆數閘（2026-08-01）：值由 career 層算好（第 1 屆 0／第 2 屆起 1），
      // 這裡只負責遞。快速比賽走 else 分支＝不傳＝出廠全開（同 trust／暫停／換人）
      comboScale: careerSetup.comboScale ?? 1,
      benches: careerSetup.benches, // W6 賽中換人：生涯板凳（快速比賽無）
      ...(careerSetup.scoutRead ? { scoutRead: careerSetup.scoutRead } : {}),
      // W7 D2 舊隊情結：對戰原隊的隊友開場 trustDyn +8（場末即散）
      ...(careerSetup.trustDynInit ? { trustDynInit: careerSetup.trustDynInit } : {}),
    } : (quick ? { teams: quick.teams } : {})),
  };
  // stage 5 情蒐錄影帶：賽前播對手預演的 2-3 球關鍵回放（決定論預生成；點擊跳過）
  // W5+ 學招預告連動：這場會教的招→帶子剪輯偏好（吊球場收吊球片段；不可偵測者略過）
  const teachFeature = careerCtx
    ? (upcomingTeach(careerCtx.career, careerCtx.matchEntry.id)
      .find((k) => TAPE_FEATURE_KEYS.has(k)) ?? null)
    : null;
  // 練習賽無情蒐帶：那是「對手預演」，紅白賽的對手是自家隊友（你天天看他們練球）
  const tapeClips = (careerSetup && !careerCtx?.practice)
    ? buildScoutTape(
      seed, careerSetup.teams, careerSetup.aiProfiles, careerSetup.liberos,
      teachFeature, careerSetup.benches, // W6：帶子與正賽同陣容鏡像（含板凳）
      stamina, true, // W7：帶子鏡像鐵律——體力/氣勢設定同正賽
      careerSetup.comboScale ?? 1, // 2026-08-01：組合屆數閘同正賽（第 1 屆帶子也沒組合）
    )
    : [];

  return {
    seed, setTarget, simpleMode, autopilot, teamControl, assistOn,
    careerSetup, tapeClips, gameOptions,
    // 配色卷批 1：各側球衣 kit（careerMatchSetup 供給；快速比賽/練習賽＝null＝預設藍紅）
    kits: careerSetup?.kits ?? null,
    // 配色卷階段二 E4：現在的隊名（單一入口 currentTeamName）——render 層（arena/
    // huddleProps）不得自查章節，一律吃這裡算好的值；快速比賽（無 careerCtx）＝null
    // ＝render 層各自回落既有預設字面值，行為不變
    teamName: careerCtx
      ? currentTeamName(
        careerCtx.store?.loadChapter?.(), careerCtx.store?.loadSchool?.(),
        careerCtx.store?.loadCorp?.(), // 企業章批 3（A3-3）：公司名進場內 HUD
      )
      : null,
    // 練習賽隨附資料（matchStage 建科目 HUD、matchLoop 追蹤與結算都讀它）；
    // 非練習賽＝null＝所有掛點短路，零擾動
    practice: careerSetup?.practice ?? null,
  };
}

// 技術閘門與讀攔網檔位（賽前準備②；game 建立後呼叫）：
// 生涯未解鎖的決策選項不出現（快速比賽預設全開）；
// 熟練度/能力只在開場讀一次——場中不變，決定論與 VCR 乾淨
// hintsOff（W7.1 四輪 #4，拍板）：?hints=off 強制 readTier='none'——原本的 👁 提示手動
// 開關已移除（讀攔網檔位純由 gates.readTier／reaction 能力分檔決定），這是唯一留給
// 想裸讀的人的後門
export function resolveTechGates(game, playerId, careerActive, hintsOff = false) {
  const tech = careerActive ? (game.players[playerId].techniques ?? {}) : null;
  return {
    canTip: !tech || (tech.tip ?? 0) >= 1,
    canPipe: !tech || (tech.pipe ?? 0) >= 1,
    canJumpServe: !tech || (tech.jumpServe ?? 0) >= 1,
    canFloatServe: !tech || (tech.floatServe ?? 0) >= 1,
    canFeint: !tech || (tech.feint ?? 0) >= 1,
    canDive: !tech || (tech.dive ?? 0) >= 1,
    // 段 E 叫戰術（07-31 Sawmah 裁定：改由技術傳授解鎖）：與上列同一把尺——
    // 快速比賽 tech===null＝恆開（與 trust／暫停／換人同款不綁生涯）；
    // 生涯未受教＝false ⇒ matchStage 不建 🙋 鈕、matchLoop 遠段不列改判選項
    //
    // ★ 這一條吃**兩道語意不同的閘**（2026-08-01 Sawmah 裁定乙）★
    //   · 技術閘 `tech.callPlay`＝**這個球員學會了沒**（角色成長，只影響玩家）
    //   · 世界閘 `game.comboScale`＝**這場比賽有沒有組合攻擊**（場級規則，雙方適用）
    // 讀 comboScale 而不是屆數：這裡要問的是「這場有沒有組合攻擊」，不是「第幾屆」——
    // 屆數只是現階段決定該值的**理由**（careerState.careerMatchSetup），之後換成集訓
    // 解鎖時本行不必改。快速比賽未注入＝null ⇒ `?? 1` ⇒ 恆開，與上列同款不受波及。
    // 注意這只是 UI 閘：邏輯層另有一道（evaluateCombination 的 scale===0 連 force 一起關），
    // 繞過面板直接送 replanCall 也產不出 combo——兩層各自獨立，不互為前提。
    canCallPlay: (!tech || (tech.callPlay ?? 0) >= 1) && (game.comboScale ?? 1) > 0,
    // 職業章批 4b（改叫，B2）：非 S 位置的組合指令權——**與 canCallPlay 分開的閘**。
    // 這把技術給的是「非 S 也能下指令」的地位，不是「這場有沒有組合攻擊」——那件事
    // 仍由 comboScale 這道世界閘管，兩者都要過。canCallPlay 保留給既有三入口
    // （S 面板／OH 內切／OPP 夾塞），零改動；改叫是第四個入口，走自己的技術閘，
    // 解鎖時序（傳授事件）可以與叫戰術完全脫鉤。
    canAudible: (!tech || (tech.audible ?? 0) >= 1) && (game.comboScale ?? 1) > 0,
    // 職業章批 4c（二段時間差）：這把閘只管**提示字**（matchLoop 攻擊面板標題的
    // 「滯空再拖＝二段變向」，同 canFeint 的假動作提示先例）——F1 未解鎖零可見的
    // UI 半邊。操作本體（第二段拖曳→intent.retargetAim）的閘在輸入層
    // （matchControls.retargetEligible，讀 sim 玩家的 techniques＋疲勞檔，dive 先例）
    // 與 sim 端（game.js executeTouch 資格判定）各自把關，三層獨立、不互為前提。
    canDoubleSpike: !tech || (tech.doubleSpike ?? 0) >= 1,
    // 大學卷批 7（08-24）：兩招大學技術，與上列同一把尺（快速比賽 tech===null＝恆開）。
    // canPressBlock 只餵 MB 讀心面板的「壓手封X」兩個選項——B7-3 要求壓手不得有
    // 獨立於方向的入口，所以這個布林**只**決定那兩個選項出不出現，不另開鈕。
    canPressBlock: !tech || (tech.pressBlock ?? 0) >= 1,
    canChaseServe: !tech || (tech.chaseServe ?? 0) >= 1,
    // 讀攔網提示檔位（reaction 綁定，決策第 4 題）：none＝無、slow＝0.6s 後上色、instant＝即時
    readTier: hintsOff ? 'none' : (careerActive ? blockReadTier(game.players[playerId]) : 'instant'),
  };
}
