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

const KIND_LABELS = {
  quick: '快攻', left: '左翼', right: '右翼', pipe: '後排P', dball: 'D球',
};

// 選項：{ key, pid, name, kind, label, aim(世界座標), t(舉球弧線＝sim timing),
//         trust, hesitant, tier }
export function setOptionsFor(game, aiState, setterId) {
  const me = game.players[setterId];
  if (!me) return [];
  const team = me.teamId;
  const tier = aiState?.passTier ?? 'perfect';
  const options = attackPointsOf(game, team, setterId, tier).map((pt) => {
    const p = game.players[pt.pid];
    const a = setAimFor(game, team, pt.pid, pt.kind);
    const trust = effectiveTrust(game, p);
    return {
      key: `${pt.pid}-${pt.kind}`,
      pid: pt.pid,
      name: p.name,
      kind: pt.kind,
      label: `${p.name}·${KIND_LABELS[pt.kind] ?? pt.kind}`,
      aim: localToWorld(team, a.lx, a.lz),
      t: a.t,
      trust,
      hesitant: pt.kind === 'quick' && trust < SET_HESITANT_BELOW,
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
