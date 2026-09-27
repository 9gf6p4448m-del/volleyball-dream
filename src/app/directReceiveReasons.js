// direct-v8 (R7): why a ball was passed badly, sprayed or missed. Pure text
// from the simulation's judgement data; no DOM, no three.js.
import { RECEIVE_ASSIST } from '../sim/directConstants.js';

export const GRADE_LABELS = { PERFECT: '完美', GOOD: '普通', POOR: '差' };
const TECH_LABELS = { overhand: '高手', underhand: '低手', dive: '魚躍' };
const seconds = (ticks) => `${(Math.abs(ticks) / 60).toFixed(2)} 秒`;

// A judged touch: pass (tier) or spray. A spray's `timing` is 'none' (no
// press), 'early' / 'late', or 'dive' (U2: the press was a dive at a ball
// inside a receive circle — a press, the wrong one).
export function contactReason(event) {
  if (event.spray) {
    const how = event.timing === 'none' ? '沒按' : event.timing === 'dive' ? '這球要按接球，按成魚躍了' : event.timing === 'early' ? `按太早 ${seconds(event.offset)}` : `按太晚 ${seconds(event.offset)}`;
    return `噴球：${how} · ${TECH_LABELS[event.technique] ?? '低手'}`;
  }
  const parts = [];
  if (event.tier === 'PERFECT' || Math.abs(event.offset ?? 0) <= RECEIVE_ASSIST.perfectTicks) parts.push('時機剛好');
  // A contact early in the window means the ball came right after the press: pressed late.
  else if (event.offset < 0) parts.push(`按太晚 ${seconds(event.offset)}`);
  else parts.push(`按太早 ${seconds(event.offset)}`);
  if (event.ratio > RECEIVE_ASSIST.edgeRatio) parts.push('擦邊（站位偏了一點）');
  if (event.technique !== 'dive' && (event.bodySpeed ?? 0) >= RECEIVE_ASSIST.unsetSpeed) parts.push('沒站穩');
  parts.push(TECH_LABELS[event.technique] ?? '低手');
  if (event.airborne) parts.push('空中');
  return `${GRADE_LABELS[event.tier]}：${parts.join(' · ')}`;
}
const direction = (miss) => (Math.abs(miss.right) >= Math.abs(miss.forward) ? (miss.right > 0 ? '右' : '左') : (miss.forward > 0 ? '前' : '後'));
// The ball ended without a judged touch. `miss` is the terminal event's
// judgement data (null when the ball never came near a judgement).
export function missReason(end) {
  if (end.type === 'net' && !end.miss) return '沒接到：球碰網了。';
  const miss = end.miss;
  if (!miss) return '沒接到：球沒有經過你身邊，先移到落點圈上。';
  const cm = Math.round(miss.d * 100), dir = direction(miss);
  if (miss.stage === 'dive') {
    if (miss.d > miss.radius) return `沒接到：魚躍沒撲到，站位偏了 ${cm} 公分，球在你${dir}邊。`;
    return `沒接到：魚躍時機${miss.timing === 'early' ? '太早' : '太晚'}，球落在手臂${miss.timing === 'early' ? '放下後' : '伸出前'}。`;
  }
  // Position first: a ball outside every circle is a stance error whatever the timing.
  if (miss.d > miss.radius) return `沒接到：站位偏了 ${cm} 公分，球在你${dir}邊，往${dir}移。`;
  if (!miss.pressed) return '沒接到：沒按出手。';
  if (miss.timing === 'dive') return '沒接到：這球要按接球，按成魚躍了。';
  return `沒接到：時機${miss.timing === 'early' ? '太早' : '太晚'}。`;
}
