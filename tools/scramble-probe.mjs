// 接噴系統實測探針（07-23）：跑 N 場 AI vs AI 快速比賽，統計接噴鏈實際發生率——
// 備援指派（主追趕不上）、救噴魚躍（touches≥2 的 dive 觸球）、一般魚躍（touches=1）。
// 用法：node tools/scramble-probe.mjs [場數=30]（快速比賽預設 diveRate 0.16 雙方對稱）
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

const N = Number.parseInt(process.argv[2] ?? '30', 10);
let flights = 0;
let backups = 0;
let backupTouches = 0; // 備援真的觸到球（接力成功）
let divesIncoming = 0; // 接對方來球的魚躍（原有路徑，touches=1）
let divesRescue = 0;   // 救噴魚躍（touches≥2＝救自家亂球，新路徑）
let rallies = 0;

for (let s = 1; s <= N; s += 1) {
  const g = createGame({ seed: s * 7919 + 3, setTarget: 25 });
  const ai = createAiState();
  let lastFlight = -1;
  let flightHadBackup = false;
  while (g.phase !== 'set_over' && g.tick < 120000) {
    const intents = aiCollectIntents(g, ai);
    if (ai.flightId !== lastFlight) {
      lastFlight = ai.flightId;
      flights += 1;
      flightHadBackup = ai.backupId !== null;
      if (flightHadBackup) backups += 1;
    }
    const backupId = ai.backupId;
    const ev = stepGame(g, intents);
    for (const e of ev) {
      if (e.type === 'SERVE') rallies += 1;
      if (e.type === 'TOUCH') {
        if (e.kind === 'dive') {
          if (e.touches >= 2) divesRescue += 1;
          else divesIncoming += 1;
        }
        if (flightHadBackup && e.playerId === backupId) backupTouches += 1;
      }
    }
  }
}

console.log(`=== 接噴探針（${N} 場 25 分快速比賽、diveRate 0.16 對稱）===`);
console.log(`rally 總數        ${rallies}`);
console.log(`flight 總數       ${flights}`);
console.log(`備援指派          ${backups}（${(backups / flights * 100).toFixed(2)}% flight；主追趕不上的絕望球）`);
console.log(`備援實際觸球      ${backupTouches}（接力成功）`);
console.log(`魚躍·接對方來球   ${divesIncoming}（原有路徑）`);
console.log(`魚躍·救自家噴球   ${divesRescue}（新路徑：touches≥2 的 dive）`);
console.log(`每場平均：備援 ${(backups / N).toFixed(1)} 次、救噴魚躍 ${(divesRescue / N).toFixed(1)} 次`);
