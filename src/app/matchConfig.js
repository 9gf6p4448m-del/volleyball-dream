// 賽前準備①——比賽設定解析（純函式層：零 three.js/DOM/存檔 IO，node 可測）
// runMatch 三段拆分（Phase 3 W1）：本檔＝設定與資料準備；matchStage.js＝舞台建置；
// matchLoop.js＝回合迴圈；matchCareer.js＝生涯開賽標記與賽末收束。
// 三段以明確資料介面銜接：config →（createGame）→ gates → stage → loop。
import { careerMatchSetup, buildLibero } from '../career/careerState.js';
import { matchSeed } from '../career/careerState.js';
import { buildScoutTape, TAPE_FEATURE_KEYS } from '../career/scoutTape.js';
import { upcomingTeach } from '../career/events.js';
import { blockReadTier } from '../career/growth.js';

// 介面契約（tests/app-config.test.js 把關）：
// resolveMatchConfig({ params, careerCtx, randomSeed }) → {
//   seed, setTarget, simpleMode, autopilot, teamControl, assistOn,
//   careerSetup, tapeClips, gameOptions,
// }
// - params：URLSearchParams（或任何有 .get(name) 的物件）
// - careerCtx：{ career, player, matchEntry, store } 或 null（快速比賽）
// - randomSeed：快速比賽無 ?seed= 時用的種子——隨機化住在呼叫端（main），sim 內仍決定論
export function resolveMatchConfig({ params, careerCtx = null, randomSeed }) {
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

  // 簡化操作模式（預設）：接發/舉球/防守/走位/發球全自動，玩家只做進攻決策（讀攔網選攻擊區）
  // ?classic=1 回到全手動操作
  const simpleMode = params.get('classic') !== '1';
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
  const careerSetup = careerCtx
    ? careerMatchSetup(
      careerCtx.career, careerCtx.player, careerCtx.matchEntry,
      careerCtx.roster ?? null, careerCtx.lineup ?? null,
    )
    : null;
  // stage 6：自由人雙方都有（生涯吃參數檔；快速比賽用預設防守專才）
  const liberos = careerSetup?.liberos ?? {
    A: buildLibero('A', 'A隊自由人'),
    B: buildLibero('B', 'B隊自由人'),
  };
  // W7 A1-A5 體力（雙方啟用）：生涯對手吃 A4 拍板（costMul 0.6 慢耗＋豁免重度門檻
  // ——「他們有輪換調度、鏡頭外處理」的敘事）；快速比賽雙方對稱（同無板凳＝公平）
  const stamina = careerSetup
    ? { A: {}, B: { costMul: 0.6, heavyExempt: true } }
    : { A: {}, B: {} };
  const gameOptions = {
    seed, setTarget, liberos, stamina,
    ...(careerSetup ? {
      teams: careerSetup.teams,
      aiProfiles: careerSetup.aiProfiles,
      benches: careerSetup.benches, // W6 賽中換人：生涯板凳（快速比賽無）
      ...(careerSetup.scoutRead ? { scoutRead: careerSetup.scoutRead } : {}),
    } : {}),
  };
  // stage 5 情蒐錄影帶：賽前播對手預演的 2-3 球關鍵回放（決定論預生成；點擊跳過）
  // W5+ 學招預告連動：這場會教的招→帶子剪輯偏好（吊球場收吊球片段；不可偵測者略過）
  const teachFeature = careerCtx
    ? (upcomingTeach(careerCtx.career, careerCtx.matchEntry.id)
      .find((k) => TAPE_FEATURE_KEYS.has(k)) ?? null)
    : null;
  const tapeClips = careerSetup
    ? buildScoutTape(
      seed, careerSetup.teams, careerSetup.aiProfiles, careerSetup.liberos,
      teachFeature, careerSetup.benches, // W6：帶子與正賽同陣容鏡像（含板凳）
      stamina, // W7：帶子鏡像鐵律——體力設定同正賽
    )
    : [];

  return {
    seed, setTarget, simpleMode, autopilot, teamControl, assistOn,
    careerSetup, tapeClips, gameOptions,
  };
}

// 技術閘門與讀攔網檔位（賽前準備②；game 建立後呼叫）：
// 生涯未解鎖的決策選項不出現（快速比賽預設全開）；
// 熟練度/能力只在開場讀一次——場中不變，決定論與 VCR 乾淨
export function resolveTechGates(game, playerId, careerActive) {
  const tech = careerActive ? (game.players[playerId].techniques ?? {}) : null;
  return {
    canTip: !tech || (tech.tip ?? 0) >= 1,
    canPipe: !tech || (tech.pipe ?? 0) >= 1,
    canJumpServe: !tech || (tech.jumpServe ?? 0) >= 1,
    canFloatServe: !tech || (tech.floatServe ?? 0) >= 1,
    canFeint: !tech || (tech.feint ?? 0) >= 1,
    canDive: !tech || (tech.dive ?? 0) >= 1,
    // 讀攔網提示檔位（reaction 綁定，決策第 4 題）：none＝無、slow＝0.6s 後上色、instant＝即時
    readTier: careerActive ? blockReadTier(game.players[playerId]) : 'instant',
  };
}
