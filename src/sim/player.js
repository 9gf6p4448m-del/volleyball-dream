// D1 資料層 v1 — Player 結構與序列化（純函式、零 three.js/DOM 依賴）
// 身高影響（攔網高度/扣球點/防守範圍）一律由 height.current 即時推導，不存衍生欄位

export const ROLES = ['outside', 'setter', 'libero', 'middle', 'opposite'];

export const ATTRIBUTE_KEYS = [
  'jump', 'power', 'reaction', 'stamina', 'speed', 'control', 'serve', 'block',
];

export function createPlayer({
  id,
  name,
  teamId,
  naturalRole = 'outside', // 依身高建議的位置
  currentRole = 'outside', // 玩家實選的位置
  height = 1.85,
  attributes = {},
  trust = 50, // 舉球員對此人的信任初值（攻擊分配權重來源）
  trustFloor = 0, // 保底球權地板（stage 4：生涯主角 0.27；一般球員無地板）
  techniques = {}, // 覆寫技術解鎖/熟練度（生涯新人鎖起步、預設全開）
} = {}) {
  const attrs = {};
  for (const k of ATTRIBUTE_KEYS) {
    attrs[k] = clampAttr(attributes[k] ?? 50);
  }
  return {
    id,
    name,
    teamId,
    naturalRole,
    currentRole,
    height: {
      current: height,
      timeline: [], // 成長曲線，Phase 3 用；Phase 1 留空
    },
    attributes: attrs,
    techniques: {
      // 熟練度（Phase 1 既有鉤子，未消費）
      spike: 1,
      jumpServe: 1,
      block: 1,
      receive: 1,
      emergencySet: 1,
      // Phase 2 stage 3 決策選項解鎖（0＝未解鎖）：預設全開＝快速比賽/AI 行為不變；
      // 生涯新人由 createCareerPlayer 覆寫為 0 起步（成長體感＝我能做新的事）
      tip: 1,        // 攻擊面板「吊球」
      powerServe: 1, // 發球面板「強力」球路
      pipe: 1,       // 後排攻擊面板（手動 pipe）
      feint: 1,      // 按A滑B 假動作
      feintUses: 8,  // 假動作使用次數（熟練度）；8＝1.0 基準乘子
      ...techniques,
    },
    // fromSetter＝持久 baseline（劇情事件經 updateTrust 調整）；floorShare＝保底球權
    trust: { fromSetter: clampAttr(trust), floorShare: trustFloor },
  };
}

// 假動作熟練度：使用次數→騙敵成功率乘子。8 次＝1.0（既有平衡基準）、
// 新手 0.6 起步、上限 1.2；舊存檔缺欄位視同基準（不動舊行為）
export function feintMasteryMul(p) {
  const uses = p.techniques?.feintUses ?? 8;
  return Math.min(1.2, 0.6 + uses * 0.05);
}

function clampAttr(v) {
  return Math.max(0, Math.min(100, v));
}

// ---- 身高/屬性即時推導（不存回 Player）----

// 站立摸高 ≈ 身高 × 1.31（排球常用估式）
export function standingReach(p) {
  return p.height.current * 1.31;
}

// 垂直起跳高度（公尺）：jump 0–100 → 0.30–0.95m
export function jumpHeight(p) {
  return 0.3 + (p.attributes.jump / 100) * 0.65;
}

// 扣球點高度
export function spikeReach(p) {
  return standingReach(p) + jumpHeight(p);
}

// 攔網高度（攔網跳略保守於扣球跳）
export function blockReach(p) {
  return standingReach(p) + jumpHeight(p) * 0.85;
}

// 防守可及半徑（公尺）：身高越高踏步範圍越大、speed 補正
export function defenseRange(p) {
  return p.height.current * 0.55 + (p.attributes.speed / 100) * 0.8;
}

// 移動速度（m/s）
export function moveSpeed(p) {
  return 2.8 + (p.attributes.speed / 100) * 2.4;
}

// ---- 序列化（純函式；Phase 1 不做存檔 UI，但格式現在就定型）----

export function serializePlayer(p) {
  return JSON.stringify(p);
}

export function deserializePlayer(json) {
  const raw = JSON.parse(json);
  for (const field of ['id', 'teamId', 'naturalRole', 'currentRole', 'height', 'attributes']) {
    if (raw[field] === undefined) throw new Error(`Player 序列化資料缺欄位：${field}`);
  }
  for (const k of ATTRIBUTE_KEYS) {
    if (typeof raw.attributes[k] !== 'number') {
      throw new Error(`Player.attributes 缺數值欄位：${k}`);
    }
  }
  if (typeof raw.height.current !== 'number' || !Array.isArray(raw.height.timeline)) {
    throw new Error('Player.height 結構不合法（需 current:number 與 timeline:array）');
  }
  return raw;
}
