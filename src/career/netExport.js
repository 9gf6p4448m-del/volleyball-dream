// 多人連線卷 批5 —— 生涯隊伍上線（拍板 5 後半：先快速、再生涯）
//
// 純函式層：零 DOM／零存檔 IO——store 的讀取在 main.js（呼叫端），這裡只吃
// 已載入的 {player, members, lineup}。node 直接可測（tests/net-career-team.test.mjs）。
//
// 線上格式（TEAM_PAYLOAD_V）：
//   { v: 1, role, starters: [6 × 精簡球員], libero: { isPlayer, data } | null }
//   精簡球員＝createPlayer 消費的欄位子集（id/name/naturalRole/currentRole/height/
//   trust/attributes/techniques）——**重建走 createPlayer**，缺省欄位由它補，
//   sim 改版加欄位不連坐線上格式。
// 版本不符或形狀不對＝明確拒絕（A5-2：不得靜默降級）。
import { careerTeams } from './careerState.js';
import { createPlayer } from '../sim/player.js';

export const TEAM_PAYLOAD_V = 1;

const ROLE_SET = ['outside', 'setter', 'middle', 'opposite', 'libero'];
const ATTR_KEYS = ['jump', 'power', 'reaction', 'stamina', 'speed', 'control', 'serve', 'block'];

// sim Player 的 height 是 {current,timeline,…}、trust 是 {fromSetter,floorShare}
// （player.js:37/62）——線上格式壓平成數字，重建時 createPlayer 自己蓋回結構。
// timeline/plan 是生涯敘事資料，對一場對戰的 sim 行為無作用，不上線。
function slimPlayer(p) {
  return {
    id: p.id,
    name: String(p.name ?? p.id),
    naturalRole: p.naturalRole,
    currentRole: p.currentRole,
    height: typeof p.height === 'number' ? p.height : p.height?.current,
    trust: typeof p.trust === 'number' ? p.trust : (p.trust?.fromSetter ?? 50),
    trustFloor: typeof p.trust === 'object' ? (p.trust?.floorShare ?? 0) : 0,
    attributes: Object.fromEntries(ATTR_KEYS.map((k) => [k, p.attributes?.[k] ?? 50])),
    techniques: { ...(p.techniques ?? {}) },
  };
}

// 匯出自己的生涯隊伍（player＋名冊＋先發序 → 線上 payload）。
// 建隊走 careerTeams **同一條路**（trust 跟人、魚躍鏡像、先發序）——不自己重寫一份。
export function exportNetTeam({ player, members, lineup }) {
  const isL = player.currentRole === 'libero';
  const teams = careerTeams(player, null, members, lineup);
  // 自由人：玩家=L 時 payload.libero 就是玩家本人；否則帶名冊指定的 L 成員資料
  //（careerMatchSetup 869-871 同款規則，這裡只搬資料不搬 buildLibero——對端重建時做）
  let libero = null;
  if (isL) {
    libero = { isPlayer: true, data: slimPlayer(player) };
  } else {
    const al = members?.find((m) => m.id === (lineup?.libero ?? 'A7'));
    if (al) {
      libero = {
        isPlayer: false,
        data: {
          id: al.id, name: al.name, attributes: { ...(al.attributes ?? {}) },
        },
      };
    }
  }
  return {
    v: TEAM_PAYLOAD_V,
    role: player.currentRole,
    starters: teams.A.map(slimPlayer),
    libero,
  };
}

// 驗證對方送來的隊伍 payload：回 null＝合法；回字串＝人話拒絕理由（A5-2）
export function netTeamProblem(payload) {
  if (payload == null) return null; // 沒帶隊伍＝標準隊，合法
  if (payload.v !== TEAM_PAYLOAD_V) {
    return `隊伍格式版本不符：對方 v${payload?.v}、本機 v${TEAM_PAYLOAD_V}——兩邊都更新再試`;
  }
  if (!ROLE_SET.includes(payload.role)) return `隊伍 payload 的 role 不合法：${payload.role}`;
  if (!Array.isArray(payload.starters) || payload.starters.length !== 6) {
    return `隊伍先發必須是 6 人（收到 ${payload?.starters?.length}）`;
  }
  for (const p of payload.starters) {
    if (typeof p?.id !== 'string' || typeof p?.name !== 'string') return '球員缺 id/name';
    if (!ROLE_SET.includes(p.currentRole)) return `球員 ${p.id} 位置不合法：${p.currentRole}`;
    if (!(p.height >= 1.4 && p.height <= 2.3)) return `球員 ${p.id} 身高不合法：${p.height}`;
    for (const k of ATTR_KEYS) {
      const v = p.attributes?.[k];
      if (!(typeof v === 'number' && v >= 0 && v <= 120)) return `球員 ${p.id} 屬性 ${k} 不合法：${v}`;
    }
  }
  if (payload.libero != null) {
    const d = payload.libero.data;
    if (typeof d?.id !== 'string' || typeof d?.name !== 'string') return '自由人資料缺 id/name';
  }
  return null;
}

// 把一側的 payload 重建成該隊的 Player 陣列（id 換前綴：客機的存檔主角是 A2，
// 落到 B 隊要變 B2——pids 恆 A2/B2 的約定靠這裡守住）。
export function rebuildSide(payload, team) {
  const reId = (id) => team + id.slice(1);
  const starters = payload.starters.map((p) => createPlayer({
    ...structuredClone(p),
    id: reId(p.id),
    teamId: team,
  }));
  let libero = null;
  if (payload.libero?.isPlayer) {
    libero = createPlayer({
      ...structuredClone(payload.libero.data),
      id: reId(payload.libero.data.id),
      teamId: team,
    });
  }
  // isPlayer=false 的名冊 L：資料回傳給呼叫端疊在 buildLibero 上（careerMatchSetup 同款）
  return { starters, libero, liberoMember: payload.libero?.isPlayer ? null : (payload.libero?.data ?? null) };
}
