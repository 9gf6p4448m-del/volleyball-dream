// Phase 4 W3 — MB 攔網讀心（工單 §4；沿 attackZones 純函式範式，讀 game 不寫回）
// 決策點＝對手舉球出手瞬間（對方 touches===2 起）。線索全部誠實可觀察、非全知：
//   ①對手一傳品質（場上看得見的事實）→「到位＝快攻與高球雙可能」的賭局前提
//   ②對手前排三人的助跑動向（actor 位置朝網移動＝正在助跑）——不讀 aiState.attackerId 真值
// 選擇＝攔網位移（封左翼/封中/封右翼——對手的翼別語彙）×起跳時機（搶快＝提前跳賭快攻）。
// 讀對＝站對線＋時機對＝觸球率大增（blockReach/時機乘子既有誠實機制）；
// 讀錯提前跳＝攔網窗（48 tick）過期落地球才來——真實懲罰，sim 零新增特例。
import { localToWorld, isFrontRow, otherTeam } from '../sim/rotation.js';

// 對手前排角色 → 翼別（他們的職責位語彙：OH=左翼、MB=中、OPP/S=右翼）
const LANE_OF_ROLE = { outside: 'left', middle: 'middle', opposite: 'right', setter: 'right' };
const LANE_LX = { left: -3, middle: 0, right: 3 };
const LANE_LABELS = { left: '封左翼', middle: '封中', right: '封右翼' };

// 助跑判定門檻：兩 tick 間朝網位移量（誠實觀察窗；treadmill 誤差以下不算）
const APPROACH_EPS = 0.005;

// 讀取面板資料：{ tier, lanes:[{ key, label, x(我方攔網站位世界 x), attacker:{pid,name}|null,
//                approaching }] }
// tier＝對手一傳品質（aiState.passTier——對手規劃一傳時寫入的同一份分檔；
// 場上可觀察事實，非內心讀取）；讀不到＝null（線索缺席誠實呈現）
// ★ 攔網時序卷 段 4（Sawmah 2026-08-01 裁定 3）：MB 的專屬性**上移到資訊層** ★
// 「立即攔網」的時機賭局擴到前排全員（見 matchControls.mbMomentFor），但**讀心**
// ——一傳品質＋哪一翼正在助跑——仍然只有 MB 有。這是 MB 身分的分界線：
// 誰都能決定「現在跳」，只有攔中看得懂「該跳誰」。
// 抽成純函式而不是寫在呼叫端的 if 裡：這是一條**規則**，規則要能被單獨問到、被測到。
export function blockReadAllowedFor(game, playerId) {
  return game.players[playerId]?.currentRole === 'middle';
}

export function mbReadFor(game, aiState, playerId) {
  const me = game.players[playerId];
  if (!me) return null;
  const oppTeam = otherTeam(me.teamId);
  const rot = game.match.rotations[oppTeam];
  const lanes = ['left', 'middle', 'right'].map((key) => ({
    key,
    label: LANE_LABELS[key],
    // 我方攔網站位＝正對該翼過網點（x 取對手該翼職責位的世界 x）
    x: localToWorld(oppTeam, LANE_LX[key], 1).x,
    attacker: null,
    approaching: false,
  }));
  for (const pid of rot) {
    if (!isFrontRow(rot, pid)) continue;
    const p = game.players[pid];
    const lane = lanes.find((l) => l.key === (LANE_OF_ROLE[p.currentRole] ?? 'right'));
    if (!lane || lane.attacker) continue;
    const a = game.actors[pid];
    lane.attacker = { pid, name: p.name };
    lane.approaching = (Math.abs(a.pz) - Math.abs(a.z)) > APPROACH_EPS;
  }
  return { tier: aiState?.passTier ?? null, lanes };
}

// 面板標題：一傳品質線索誠實播報（到位＝賭局成立的訊號）
export function mbPanelTitle(tier) {
  if (tier === 'perfect') return '一傳到位——快攻可能！讀舉球！';
  if (tier === 'ok') return '一傳可用——盯高球！';
  if (tier === 'poor') return '對手勉強——兩翼高球！';
  return '讀舉球！';
}
