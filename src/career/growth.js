// Phase 2 stage 3 — 成長引擎（純函式；零 DOM/存檔 IO）
// 雙層成長（決策第 2 題）：表現給點數、玩家分配——
// 屬性層（次要）＝+1 微調維持真實感；技術層（主要）＝解鎖新決策選項

export const GROWTH = {
  BASE_POINTS: 2,       // 出賽保底（場次保障成長點數的累積循環——輸球也有）
  WIN_BONUS: 2,
  KILL_POINT: 1,        // 殺球/吊球直接得分
  ACE_POINT: 1,
  BLOCK_POINT: 1,       // 攔網得分
  PERFECT_PER_POINT: 2, // 每 2 次 Perfect 一傳折 1 點
  MATCH_CAP: 12,        // 單場上限（防灌分）
  ATTR_STEP: 1,
  ATTR_CAP: 90,         // 屬性成長天花板（100 留給傳奇；維持真實感）
  TIP_POWER: 0.45,      // 吊球判定界線（與 pointBanner/commentary 同）
};

// 屬性層可加點清單（control/stamina 不開放：前者是手感基準、後者 stage 未接線）
// desc（07-24 Sawmah：玩家不知道加點強化什麼）＝sim 實際接線的誠實描述——
// power→spikeSpeed、jump→spikeReach/blockReach、reaction→起動/出界判斷/讀攔網檔位/
// 接球技術(與 control 平均)、speed→moveSpeed/defenseRange、serve→發球散佈、block→攔網成功率
export const GROWABLE_ATTRS = [
  { key: 'power', name: '力量', desc: '扣球球速——重扣更快更難救' },
  { key: 'jump', name: '彈跳', desc: '起跳高度——扣球點與攔網都更高' },
  { key: 'reaction', name: '反應', desc: '起動更快、出界判斷更準、讀攔網更清、一傳更穩' }, // blockReadTier 來源
  { key: 'speed', name: '速度', desc: '跑速與防守範圍——追得到更多球' },
  { key: 'serve', name: '發球', desc: '發球落點更準——跳發/飄浮也穩' },
  { key: 'block', name: '攔網', desc: '攔網成功率——攔死與擦手機率' },
];

// 技術層（生涯新人全鎖起步；快速比賽預設全開）——經故事線傳授習得，不花點數
// （改版裁定 2026-07-22：每場賽後對手/隊長教一招；成長點數專注屬性層）
export const TECH_DEFS = [
  { key: 'tip', name: '吊球', desc: '攻擊面板新增「吊球」——騙重心的輕放' },
  { key: 'dive', name: '魚躍救球', desc: '救球鈕：撲向搆不到的球——撲空會倒地' },
  { key: 'pipe', name: '後排 pipe', desc: '輪到後排也能主導進攻（後排攻擊面板）' },
  { key: 'floatServe', name: '飄浮發球', desc: '不轉的球最難接——破壞對方一傳品質' },
  { key: 'feint', name: '假動作', desc: '按A滑B視線騙攔網；越用越純熟' },
  { key: 'jumpServe', name: '跳躍發球', desc: '最強的發球——力量換準度' },
];

// 從 sim 事件日誌統計玩家表現（歸因法與 pointBanner 同：得分前最後觸球者）
export function matchStatsFor(events, playerId, myTeam) {
  const stats = { kills: 0, tipKills: 0, aces: 0, blockPoints: 0, perfects: 0, spikes: 0 };
  let lastTouch = null;
  for (const e of events) {
    if (e.type === 'TOUCH' || e.type === 'SERVE') {
      lastTouch = { playerId: e.playerId, team: e.team, kind: e.kind ?? 'serve', power: e.power };
      if (e.type === 'TOUCH' && e.playerId === playerId) {
        if (e.kind === 'spike') stats.spikes += 1;
        if (e.kind === 'receive' && (e.power ?? 0) >= 0.95) stats.perfects += 1;
      }
    } else if (e.type === 'BLOCK_TOUCH') {
      lastTouch = { playerId: e.playerId, team: e.team, kind: 'block' };
    } else if (e.type === 'SCORE') {
      if (
        e.team === myTeam && lastTouch &&
        lastTouch.team === myTeam && lastTouch.playerId === playerId
      ) {
        if (lastTouch.kind === 'spike') {
          if ((lastTouch.power ?? 1) <= GROWTH.TIP_POWER) stats.tipKills += 1;
          else stats.kills += 1;
        } else if (lastTouch.kind === 'serve') stats.aces += 1;
        else if (lastTouch.kind === 'block') stats.blockPoints += 1;
      }
      lastTouch = null; // 死球歸零，下一分重新歸因
    }
  }
  return stats;
}

export function growthPointsFor(stats, won) {
  const raw =
    GROWTH.BASE_POINTS +
    (won ? GROWTH.WIN_BONUS : 0) +
    (stats.kills + stats.tipKills) * GROWTH.KILL_POINT +
    stats.aces * GROWTH.ACE_POINT +
    stats.blockPoints * GROWTH.BLOCK_POINT +
    Math.floor(stats.perfects / GROWTH.PERFECT_PER_POINT);
  return Math.min(raw, GROWTH.MATCH_CAP);
}

// 讀攔網提示檔位（決策第 4 題：綁能力值）：reaction 低＝無、中＝慢（0.6s 才上色）、高＝即時
export function blockReadTier(player) {
  const r = player.attributes.reaction;
  return r < 55 ? 'none' : r < 70 ? 'slow' : 'instant';
}

// 屬性層加點（不可變；1 點＝+1，天花板 GROWTH.ATTR_CAP）
export function spendAttribute(player, key) {
  if (!GROWABLE_ATTRS.some((a) => a.key === key)) {
    throw new Error(`spendAttribute：不可加點的屬性 ${key}`);
  }
  const cur = player.attributes[key];
  if (cur >= GROWTH.ATTR_CAP) throw new Error(`spendAttribute：${key} 已達上限 ${GROWTH.ATTR_CAP}`);
  return {
    ...player,
    attributes: { ...player.attributes, [key]: Math.min(GROWTH.ATTR_CAP, cur + GROWTH.ATTR_STEP) },
  };
}

// 技術層解鎖（不可變）；點數扣減由呼叫端管（career.growthPoints）
export function unlockTechnique(player, key) {
  const def = TECH_DEFS.find((t) => t.key === key);
  if (!def) throw new Error(`unlockTechnique：未知技術 ${key}`);
  if ((player.techniques?.[key] ?? 0) >= 1) throw new Error(`unlockTechnique：${def.name} 已解鎖`);
  const techniques = { ...player.techniques, [key]: 1 };
  if (key === 'feint') techniques.feintUses = techniques.feintUses || 0; // 熟練度從 0 累積
  return { ...player, techniques };
}
