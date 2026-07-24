// W6 驗證治具：產出兩份 v2 存檔 JSON（Playwright 注入 localStorage 用）
// saveA＝賽季進行中＋兩名招募生坐板凳（驗 ⚙ 換人面板/讀狀態/敘事/字卡）
// saveB＝賽季已止步（驗「進入下一屆」→ 指定邀請選單 → 輪抽賽程 ⭐ 徽章）
// 用法：node tools/w6-fixture.mjs → 寫出 tools/w6-saveA.json / w6-saveB.json
import { writeFileSync } from 'node:fs';
import { createCareer, createCareerPlayer, recordResult } from '../src/career/careerState.js';
import { ensureStarterRoster } from '../src/career/roster.js';
import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { settleRecruitJoins } from '../src/career/recruitment.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    dump: () => m.get(SAVE_KEY),
  };
}

function buildSaveA() {
  const storage = memStorage();
  const store = createCareerStore(storage);
  store.saveCareer(createCareer({ seed: 20260724, playerName: '阿夢' }));
  store.savePlayer(createCareerPlayer('阿夢'));
  ensureStarterRoster(store);
  // 直接寫進度：曜石第二人（MB）＋青嵐招牌（S）達標 → 入隊坐板凳
  store.saveRecruitment({
    progress: {
      'obsidian-2': { wins: 0, feat: 1, stageCleared: false },
      'gale-shore': { wins: 2, feat: 0, stageCleared: false },
    },
    recruited: [],
    expelled: [],
  });
  const joined = settleRecruitJoins(store, 20260724);
  if (joined.length !== 2) throw new Error(`saveA 預期入隊 2 人，實得 ${joined.length}`);
  return storage.dump();
}

function buildSaveB() {
  const storage = memStorage();
  const store = createCareerStore(storage);
  let career = createCareer({ seed: 777001, playerName: '阿夢' });
  // 小組全勝、八強止步＝賽季結束（advanceSeason 可推進）
  for (const [id, won] of [['group-1', true], ['group-2', true], ['group-3', true], ['national-qf', false]]) {
    career = recordResult(career, {
      matchId: id, won, scoreFor: won ? 15 : 9, scoreAgainst: won ? 9 : 15,
    });
  }
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('阿夢'));
  ensureStarterRoster(store);
  return storage.dump();
}

writeFileSync(new URL('./w6-saveA.json', import.meta.url), buildSaveA());
writeFileSync(new URL('./w6-saveB.json', import.meta.url), buildSaveB());
console.log('w6-saveA.json / w6-saveB.json 已產出');
