// 4.5B §3 — 三道事件性招牌演出（OH 被騙的人／MB 早到的人／OPP 三米線起飛）
// 純函式核心（零 DOM/three——node 直測；heroCards 同範式）。
//
// 主角視角條款（工單追加條 B）：演出一律於「勝負已定的那一拍之後」起鏡——
// 武裝（arm）發生在成因事件（假動作騙過/搶快封到/要球兌現的出手），
// 起鏡（fire）只認 SCORE：對手把球救起（TOUCH）＝解除、對手得分＝解除、
// 新發球（SERVE＝操作開始）＝解除。matchLoop 只做狀態搬運，判定全在這裡。
import { signatureMode, SHORT_BEAT_MS } from './presentation.js';
import { COURT } from '../sim/constants.js';

// 全版時長（ms）：勝負已定後的死球窗內播畢；短版統一 SHORT_BEAT_MS（≤1.5s）
export const SIG_FULL_MS = { oh: 2600, mb: 2400, opp: 2600, line: 2400 };

// 「邊線是我的」咬線門檻（07-28 拍板 A 案；tools/line-kill-probe.mjs 實測定值：
// AI 亂打 0.25m＝8.4% 殺球觸發≈場均 0.4 次；玩家選邊線區應更高。試玩嫌多嫌少
// 重跑 probe 改此值）
export const SIG_LINE_M = 0.25;

// 落點離最近界線的距離（m）；出界＝null（咬線演出只認 BALL_IN）
export function lineKillDistance(at) {
  if (!at) return null;
  const d = Math.min(
    COURT.WIDTH / 2 - Math.abs(at.x),
    COURT.LENGTH / 2 - Math.abs(at.z),
  );
  return d >= 0 ? d : null;
}

// 「敘事第一次」計數鍵（save.career.presentation.seenSignature 的 key）
export function sigKey(kind) {
  return `sig-${kind}`;
}

// 武裝：成因事件成立時記下這道演出的候選（focusId＝鏡頭焦點對象；
// 其餘欄位透傳——'line' 帶 at 落點座標供鏡頭取景）
export function armSignature(kind, { focusId = null, mateId = null, flightId = null, ...extra } = {}) {
  return { kind, focusId, mateId, flightId, ...extra };
}

// 逐事件追蹤：回傳新的 pending（null＝解除）。
// 解除規則（07-27 試玩追修：MB 俯視鏡曾在「攔到→球回我方→重新組織打死」的
// 不相干得分上播出）：**任何後續觸球**＝成因那一拍沒有直接終結——解除；
// 發球（新球開始）＝解除。成因與得分必須同拍，演出才配得上「招牌」二字。
export function trackSignature(pending, e, myTeam) {
  if (!pending) return null;
  if (e.type === 'SERVE') return null;
  if (e.type === 'TOUCH') return null;
  return pending;
}

// 起鏡判定：只認 SCORE。我方得分＝發放（回傳 pending 本體）；對方得分＝空手。
// 呼叫端在任何 SCORE 之後都應清空 pending（一球一議）。
export function signatureFire(pending, e, myTeam) {
  if (!pending || e.type !== 'SCORE') return null;
  return e.team === myTeam ? pending : null;
}

// 節拍計畫：頻率框架（§2-3）落到這道演出——off＝null（真值字卡通道不經此處，
// 全關不吃真值資訊）；full＝敘事第一次或關鍵分；short＝其餘。
export function planSignatureBeat({ kind, pref, seen, keyPoint, now }) {
  const mode = signatureMode({ pref, seen, keyPoint });
  if (mode === 'off') return null;
  const dur = mode === 'full' ? (SIG_FULL_MS[kind] ?? SHORT_BEAT_MS) : SHORT_BEAT_MS;
  return { kind, mode, dur, until: now + dur };
}
