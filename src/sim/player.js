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
      // 解鎖與熟練度，Phase 2+ 長內容；Phase 1 先放主攻手用得到的
      spike: 1,
      jumpServe: 1,
      block: 1,
      receive: 1,
      emergencySet: 1,
    },
    trust: { fromSetter: 50 }, // Phase 3 信任戰術掛鉤；Phase 1 只進結構、不驅動邏輯
  };
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
