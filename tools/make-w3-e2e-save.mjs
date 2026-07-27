// W3 驗收輔助（一次性工具）：產「第 1 屆打完（止步收束）＋四位置 ready」的存檔 JSON
// ——Playwright 注入 localStorage['vd-save'] 直達屆間鏈驗 §11.3（教練談話→轉位）。
// 用法：node tools/make-w3-e2e-save.mjs [aspiration] > out.json
import { createCareer, createCareerPlayer, careerStage } from '../src/career/careerState.js';
import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { ensureStarterRoster } from '../src/career/roster.js';
import { ENGINEERED_OPEN } from '../src/career/positionFlags.js';
import { settleCareerMatch } from '../src/app/matchCareer.js';

const aspiration = process.argv[2] ?? 'setter';
const m = new Map();
const storage = {
  getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => { m.set(k, String(v)); },
  removeItem: (k) => { m.delete(k); },
};
const store = createCareerStore(storage);
store.saveCareer(createCareer({ seed: 20260727, playerName: '驗收' }));
store.savePlayer(createCareerPlayer('驗收', { heightCm: 175, aspiration, seed: 20260727 }));
ensureStarterRoster(store);
const winGame = { players: { A2: { teamId: 'A' } }, match: { score: { A: 25, B: 18 }, winner: 'A' }, events: [], scoutTally: {} };
const loseGame = { players: { A2: { teamId: 'A' } }, match: { score: { A: 19, B: 25 }, winner: 'B' }, events: [], scoutTally: {} };
for (;;) {
  const career = store.loadCareer();
  const next = career.schedule.find((x) => !career.results.some((r) => r.matchId === x.id));
  if (!next || careerStage(career) === 'eliminated') break;
  settleCareerMatch({
    careerCtx: { store, career, player: store.loadPlayer(), matchEntry: next },
    game: next.stage === 'national' ? loseGame : winGame,
    playerId: 'A2',
  });
  if (careerStage(store.loadCareer()) === 'eliminated') break;
}
for (const p of ENGINEERED_OPEN) { store.markPositionReady(p); store.approveOpenPosition(p); }
// 第 3 參數＝直接套用轉位（跳過談話——驗賽中面板用）：node ... setter libero
const applyRole = process.argv[3];
if (applyRole) {
  store.advanceSeason({ invitedId: null }); // 屆間換血後才轉（鏡像正式時序）
  store.applyPositionChange(applyRole);
}
process.stdout.write(m.get(SAVE_KEY));
