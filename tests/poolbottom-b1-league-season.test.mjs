// 池底卷 批1 P3「聯盟全員數據埋點」——驗收凍結
// docs/kickoffs/poolbottom-kickoff-20260831.md：季末 archiveSeasonSummary 同時寫入
// leagueSeason（各隊戰績＋各球員該季估算數據，estimated 標註；玩家自隊用真實 totals）。
// AI 隊伍無 box score（勘查確認：boxScore.buildTeamBox 只在玩家自己那一場記帳，見
// matchCareer.js 只傳 myTeam）——leagueSeason.js 純函式生成決定論風味資料，本檔
// 直測純函式（buildLeagueSeason/leagueSeasonOf）＋透過真實 careerStore.advanceSeason
// 流程驗證整條寫入/讀取管線（uniSave/playSeason 慣例沿用 tests/uni-year2-advance.test.mjs）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY, archiveSeasonSummary } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { buildLeagueSeason, leagueSeasonOf, LEAGUE_SEASON } from '../src/career/leagueSeason.js';
import { OPPONENTS } from '../src/career/opponents.js';

// ---- 純函式：buildLeagueSeason / leagueSeasonOf ----

test('buildLeagueSeason：同 seed 逐值可重現', () => {
  const season = { index: 1, seed: 12345, results: [] };
  const totals = { kills: 10, tipKills: 1, aces: 2, blockPoints: 3, perfects: 4, digs: 5, assistDigs: 6, rallySaves: 7 };
  const a = buildLeagueSeason(season, totals);
  const b = buildLeagueSeason(season, totals);
  assert.deepEqual(a, b, '同一份 season/totals 兩次生成必須逐值相同');
});

test('buildLeagueSeason：涵蓋 OPPONENTS 全員＋玩家隊，AI 隊伍 estimated:true、玩家隊 estimated:false', () => {
  const totals = { kills: 10, tipKills: 1, aces: 2, blockPoints: 3, perfects: 4, digs: 5, assistDigs: 6, rallySaves: 7 };
  const ls = buildLeagueSeason({ index: 1, seed: 1, results: [] }, totals);
  assert.equal(ls.teams.length, OPPONENTS.length + 1, '全聯盟 AI 隊伍＋玩家隊');
  const playerTeam = ls.teams.find((t) => t.id === '__player__');
  assert.ok(playerTeam, '玩家隊必須存在');
  assert.equal(playerTeam.players.length, 1);
  assert.equal(playerTeam.players[0].estimated, false, '玩家自隊不是估算');
  assert.equal(playerTeam.players[0].kills, totals.kills, '玩家自隊沿用真實 totals，不重新估算');
  assert.equal(playerTeam.players[0].digs, totals.digs);
  for (const o of OPPONENTS) {
    const team = ls.teams.find((t) => t.id === o.id);
    assert.ok(team, `${o.id} 應該在聯盟名單裡`);
    assert.equal(team.players.length, 7, '6 先發＋1 自由人');
    assert.ok(team.players.every((p) => p.estimated === true), 'AI 隊伍全員皆估算');
    assert.ok(team.players.every((p) => Number.isInteger(p.kills) && Number.isInteger(p.digs)
      && Number.isInteger(p.aces) && Number.isInteger(p.blocks)), '壓縮存整數（P3 規格）');
    assert.ok(Number.isInteger(team.wins) && Number.isInteger(team.losses)
      && team.wins + team.losses === LEAGUE_SEASON.games, '戰績場數需等於模擬球季場數');
  }
});

test('buildLeagueSeason：不同 seed 產出不同資料（兩季各自獨立的前提）', () => {
  const totals = { kills: 0, tipKills: 0, aces: 0, blockPoints: 0, perfects: 0, digs: 0, assistDigs: 0, rallySaves: 0 };
  const a = buildLeagueSeason({ index: 1, seed: 111, results: [] }, totals);
  const b = buildLeagueSeason({ index: 2, seed: 222, results: [] }, totals);
  assert.notDeepEqual(a.teams, b.teams, '不同 seed 的 AI 隊伍風味資料應該不同');
});

test('buildLeagueSeason：單季 leagueSeason 序列化大小 ≤ 約 10KB', () => {
  const totals = { kills: 120, tipKills: 15, aces: 20, blockPoints: 18, perfects: 30, digs: 90, assistDigs: 25, rallySaves: 12 };
  const ls = buildLeagueSeason({ index: 1, seed: 42, results: [] }, totals);
  const bytes = Buffer.byteLength(JSON.stringify(ls), 'utf8');
  assert.ok(bytes <= 10 * 1024, `序列化大小 ${bytes} bytes 應 ≤ 10KB`);
});

test('leagueSeasonOf：舊封存（無 leagueSeason 欄位）回落空殼，不炸', () => {
  const legacyEntry = { index: 3, wins: 5, losses: 3, champion: false, finish: 'quarterfinal', totals: {} };
  assert.doesNotThrow(() => leagueSeasonOf(legacyEntry));
  assert.deepEqual(leagueSeasonOf(legacyEntry), { seed: null, teams: [] });
  assert.deepEqual(leagueSeasonOf(null), { seed: null, teams: [] }, 'entry 本身是 null 也不炸');
});

// ---- archiveSeasonSummary：leagueSeason 與既有 totals 同一次封存產出 ----

test('archiveSeasonSummary：回傳值含 leagueSeason，玩家隊數據＝同一份 totals（不重算）', () => {
  const season = {
    index: 1,
    seed: 777,
    results: [
      { matchId: 'm1', won: true, stats: { kills: 5, tipKills: 1, aces: 1, blockPoints: 2, perfects: 3 } },
      { matchId: 'm2', won: false, stats: { kills: 3, tipKills: 0, aces: 0, blockPoints: 1, perfects: 1 } },
    ],
  };
  const summary = archiveSeasonSummary(season);
  assert.ok(summary.leagueSeason, 'archiveSeasonSummary 必須帶出 leagueSeason');
  const playerTeam = summary.leagueSeason.teams.find((t) => t.id === '__player__');
  assert.equal(playerTeam.players[0].kills, summary.totals.kills);
  assert.equal(playerTeam.players[0].digs, summary.totals.digs);
  assert.equal(playerTeam.wins, 1, '玩家隊戰績＝這屆真實 wins（won:true 恰一場）');
  assert.equal(playerTeam.losses, 1);
});

// ---- 整條管線：透過真實 careerStore.advanceSeason 寫入＋loadSeasonArchive 讀出 ----

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function uniSave(schoolId) {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 99, playerName: '小夢' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3;
  raw.roster = { capacity: 12, members: buildStarterMembers(), alumni: [] };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  createCareerStore(storage).enterUniversity(schoolId);
  return storage;
}

function playSeason(storage, played = null) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const league = c.schedule.filter((m) => m.round === 'league');
  const n = played ?? league.length;
  s.saveCareer({
    ...c,
    results: league.slice(0, n).map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
}

test('①整條管線：advanceSeason 封存後 loadSeasonArchive() 帶出 leagueSeason', () => {
  const storage = uniSave('meixi');
  playSeason(storage);
  const store = createCareerStore(storage);
  store.advanceSeason();
  const seasons = store.loadSeasonArchive();
  const last = seasons.at(-1);
  assert.ok(last.leagueSeason, 'loadSeasonArchive() 帶出的封存項要含 leagueSeason');
  assert.ok(last.leagueSeason.teams.length > 0);
});

test('①同 seed 逐值可重現：整份存檔重演，advanceSeason 後 SAVE_KEY 逐值相同（含 leagueSeason）', () => {
  const a = uniSave('meixi'); playSeason(a); createCareerStore(a).advanceSeason();
  const b = uniSave('meixi'); playSeason(b); createCareerStore(b).advanceSeason();
  assert.equal(a.getItem(SAVE_KEY), b.getItem(SAVE_KEY));
});

test('③連續封存兩季各自獨立：兩屆 leagueSeason.seed 不同、資料不逐值相同', () => {
  const storage = uniSave('meixi');
  playSeason(storage);
  const store = createCareerStore(storage);
  store.advanceSeason(); // 第一屆封存
  playSeason(storage);
  store.advanceSeason(); // 第二屆封存
  const seasons = store.loadSeasonArchive();
  assert.ok(seasons.length >= 2, '應該有至少兩屆封存');
  const [s1, s2] = seasons;
  assert.notEqual(s1.leagueSeason.seed, s2.leagueSeason.seed, '兩屆種子不同（衍生鏈）');
  assert.notDeepEqual(s1.leagueSeason.teams, s2.leagueSeason.teams, '兩屆風味資料各自獨立');
});

test('②舊封存（無 leagueSeason 欄位）載入不炸、正常回落', () => {
  const storage = uniSave('meixi');
  playSeason(storage);
  const store = createCareerStore(storage);
  store.advanceSeason();
  // 模擬「這批上線前」的舊封存：手動拿掉剛封存那筆的 leagueSeason 欄位
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  delete raw.career.seasons.at(-1).leagueSeason;
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  assert.doesNotThrow(() => createCareerStore(storage).loadSeasonArchive());
  const seasons = createCareerStore(storage).loadSeasonArchive();
  const legacy = seasons.at(-1);
  assert.equal(legacy.leagueSeason, undefined, '舊封存本身確實沒有這個欄位');
  assert.deepEqual(leagueSeasonOf(legacy), { seed: null, teams: [] }, '讀取端回退不炸');
});
