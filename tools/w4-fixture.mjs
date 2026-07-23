// W4 驗收固定裝置（一次性治具）：產出兩份 v2 存檔 JSON 供 Playwright 注入
//   saveA＝生涯中途態（obsidian 已入隊、其餘進度混合）→ 招募區/排陣器板凳截圖
//   saveB＝north-tech 條件剛達成未入隊 → 載入即觸發入隊儀式截圖
// 用法：node tools/w4-fixture.mjs <輸出目錄>
import { writeFileSync } from 'node:fs';
import { createCareer, createCareerPlayer, recordResult } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';
import { buildRecruitMember, RECRUIT_TRUST } from '../src/career/recruitment.js';
import { createSaveV2, serializeSave } from '../src/career/schema.js';
import { EVENT_DEFS } from '../src/career/events.js';
import { serializePlayer } from '../src/sim/player.js';

const outDir = process.argv[2] ?? '.';
const SEED = 20260723;

function baseCareer() {
  let c = createCareer({ seed: SEED, playerName: '小夢' });
  c = recordResult(c, { matchId: 'group-1', won: true, scoreFor: 25, scoreAgainst: 18, gp: 6 });
  c = recordResult(c, { matchId: 'group-2', won: true, scoreFor: 25, scoreAgainst: 21, gp: 5 });
  c = recordResult(c, { matchId: 'group-3', won: true, scoreFor: 25, scoreAgainst: 23, gp: 7 });
  // 劇情事件全部標已播（截圖不被對話框攔截）
  return { ...c, events: EVENT_DEFS.map((e) => e.id) };
}

function buildSave({ recruitObsidian, northTechWins }) {
  const career = baseCareer();
  const player = createCareerPlayer('小夢');
  const members = buildStarterMembers();
  const recruited = [];
  const lineup = defaultLineup(members);
  if (recruitObsidian) {
    const r1 = buildRecruitMember('obsidian', SEED, 'R1');
    members.push(r1);
    lineup.trust = { ...lineup.trust, [r1.id]: RECRUIT_TRUST };
    recruited.push('obsidian');
  }
  const save = createSaveV2({ career, player: JSON.parse(serializePlayer(player)) });
  save.roster = { capacity: 10, members };
  save.lineup = lineup;
  save.recruitment = {
    progress: {
      'north-tech': { wins: northTechWins, feat: 0, stageCleared: false },
      'white-wave': { wins: 1, feat: 1, stageCleared: false },
      obsidian: { wins: 2, feat: 5, stageCleared: false },
      'iron-mist': { wins: 0, feat: 3, stageCleared: false },
    },
    recruited,
  };
  return save;
}

writeFileSync(`${outDir}/w4-saveA.json`, serializeSave(buildSave({ recruitObsidian: true, northTechWins: 2 })));
writeFileSync(`${outDir}/w4-saveB.json`, serializeSave(buildSave({ recruitObsidian: true, northTechWins: 3 })));
console.log('fixtures written to', outDir);
