// 位置體檢探針 —— 五個可玩位置（OH/OPP/MB/S/L）的「參與度」量測。
//
// 目的：內容盤點另有人做，這裡只量「機會」——玩這個位置的人每一局實際上有多少次
// 球到手／要下決定的時刻。走真實 createGame + aiCollectIntents + stepGame 路徑，
// 受控玩家（AI 代打，量的是機會不是操作品質）依序頂替五個位置，同一組 seed 對照
// （否則位置間差異會混進運氣），零 src 改動。
//
// 設位方式：
//   - OH/OPP/MB/S：createCareerPlayer 後改 player.currentRole，lineup 傳 null 讓
//     careerMatchSetup 內部用 defaultLineup(members, player.id, player.currentRole)
//     自動把玩家排進對應槽位（見 careerState.js:521-524）。
//   - L（自由人）：currentRole==='libero' 不夠——careerMatchSetup 認的是「外部傳入
//     的 lineup.libero === player.id」這個原始參數（careerState.js:504），不是它
//     內部重算的 lu。傳 null 會導致小守頂替、玩家沒有真的上場。必須顯式算好
//     defaultLineup(..., 'libero') 當作 lineup 參數傳入。
//
// 驗證真的生效（不假設成功）：
//   - 逐位置逐局檢查 game.players[meId].currentRole 是否等於要求角色
//   - L 額外檢查 game.liberos.A.liberoId === meId（異色球衣真的是玩家在穿）
//   - 非 L 額外檢查玩家 id 真的出現在該局先發序（lineup.starters）裡
//
// 跑法：node tools/position-load-probe.mjs [每位置局數=20]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';

const SETS = Number.parseInt(process.argv[2] ?? '20', 10);
const OPPONENT_ID = 'obsidian'; // 中立基準對手，與既有 block-card-career-probe 同隊
const SEED_BASE = 900000;
const SEED_STRIDE = 7919; // 五個位置逐 run 用同一顆種子（run 索引相同→種子相同）

const POSITIONS = [
  { role: 'outside', label: 'OH 主攻' },
  { role: 'opposite', label: 'OPP 副攻(接應)' },
  { role: 'middle', label: 'MB 中攻' },
  { role: 'setter', label: 'S 舉球' },
  { role: 'libero', label: 'L 自由人' },
];

function freshTally() {
  return {
    setsPlayed: 0,
    spikes: 0,       // 進攻出手數
    receives: 0,     // 一傳/接發觸球數（kind='receive'：serve receive + 站姿墊球一律同一 action）
    dives: 0,        // 魚躍救球（另一種防守參與，獨立列出不併入 receives）
    sets: 0,         // 舉球/二傳觸球數
    touchEvents: 0,  // 總觸球數＝直接統計 TOUCH 事件（=spikes+receives+dives+sets，engine 保證同義）
    blockWindows: 0, // 攔網參與數：進入攔網窗次數（非「摸到球」，那是 BLOCK_TOUCH，語意不同）
    calls: 0,        // 叫戰術/要球資格觸發次數（CALL_BALL）
    teamASpikes: 0,  // A 隊全隊扣球總數（球權占比分母）
    rallies: 0,
    ralliesWithOpportunity: 0, // proxy：本回合玩家有 TOUCH 或攔網窗或叫戰術任一發生
    notMeasurable: null,
    startersSampled: null, // 第一局先發槽位快照，供人工核對
  };
}

function runPosition(role) {
  const tally = freshTally();
  for (let run = 0; run < SETS; run += 1) {
    const seed = SEED_BASE + run * SEED_STRIDE;
    const career = createCareer({ seed, playerName: '探針' });
    const player = createCareerPlayer('探針');
    player.currentRole = role;
    player.naturalRole = role; // 量負載不量轉位敘事，兩欄一致避免混淆
    const roster = { capacity: 12, members: buildStarterMembers() };
    const entry = { id: 'group-3', stage: 'group', opponentId: OPPONENT_ID, label: '' };
    const lineup = role === 'libero'
      ? defaultLineup(roster.members, player.id, 'libero')
      : null;
    const effectiveLineup = lineup ?? defaultLineup(roster.members, player.id, role);
    const setup = careerMatchSetup(career, player, entry, roster, lineup);
    const game = createGame({
      seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
      liberos: setup.liberos, setTarget: 25, comboScale: setup.comboScale,
      ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
      ...(setup.benches ? { benches: setup.benches } : {}),
    });
    const meId = Object.keys(game.players)
      .find((pid) => game.players[pid]?.name === '探針')
      ?? Object.keys(game.players).find((pid) => game.players[pid]?.isPlayer);
    if (!meId) {
      tally.notMeasurable = `找不到玩家角色（role=${role}）`;
      break;
    }
    // ---- 驗證真的生效 ----
    const actualRole = game.players[meId]?.currentRole;
    if (actualRole !== role) {
      tally.notMeasurable = `設定失敗：要求 ${role}，玩家物件實際 currentRole=${actualRole}`;
      break;
    }
    if (role === 'libero') {
      const liberoAId = game.liberos?.A?.liberoId;
      if (liberoAId !== meId) {
        tally.notMeasurable = `L 設定失敗：game.liberos.A.liberoId=${liberoAId}，非玩家 ${meId}`;
        break;
      }
    } else if (!effectiveLineup.starters.includes(meId)) {
      tally.notMeasurable = `設定失敗：玩家 ${meId} 不在該局先發序 ${JSON.stringify(effectiveLineup.starters)}`;
      break;
    }
    if (tally.startersSampled === null) {
      tally.startersSampled = role === 'libero'
        ? `libero=${meId}（異色球衣）`
        : `starters=${JSON.stringify(effectiveLineup.starters)}（玩家=${meId} 排 index ${effectiveLineup.starters.indexOf(meId)}）`;
    }

    const ai = createAiState();
    let lastBlockStartTick = game.actors[meId].blockStartTick;
    let flag = { touch: false, block: false, call: false };
    let guard = 0;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
      guard += 1;
      const intents = aiCollectIntents(game, ai, []);
      const events = stepGame(game, intents);
      for (const e of events) {
        if (e.type === 'TOUCH') {
          if (e.playerId === meId) {
            tally.touchEvents += 1;
            flag.touch = true;
            if (e.kind === 'spike') tally.spikes += 1;
            else if (e.kind === 'receive') tally.receives += 1;
            else if (e.kind === 'dive') tally.dives += 1;
            else if (e.kind === 'set') tally.sets += 1;
          }
          if (e.kind === 'spike' && e.team === 'A') tally.teamASpikes += 1;
        } else if (e.type === 'CALL_BALL' && e.playerId === meId) {
          tally.calls += 1;
          flag.call = true;
        } else if (e.type === 'DEAD_BALL') {
          tally.rallies += 1;
          if (flag.touch || flag.block || flag.call) tally.ralliesWithOpportunity += 1;
          flag = { touch: false, block: false, call: false };
        }
      }
      const curBlockStart = game.actors[meId].blockStartTick;
      if (curBlockStart !== lastBlockStartTick) {
        tally.blockWindows += 1;
        flag.block = true;
        lastBlockStartTick = curBlockStart;
      }
    }
    if (tally.notMeasurable) break;
    tally.setsPlayed += 1;
  }
  return tally;
}

const results = POSITIONS.map(({ role, label }) => ({ role, label, tally: runPosition(role) }));

console.log(`位置體檢：五位置各 ${SETS} 局，同一組 seed 對照，對手=${OPPONENT_ID}\n`);

for (const { role, label, tally: t } of results) {
  console.log(`---- ${label}（${role}）----`);
  if (t.notMeasurable) {
    console.log(`  無法量測：${t.notMeasurable}（已完成 ${t.setsPlayed} 局後中止）`);
    continue;
  }
  console.log(`  先發驗證樣本：${t.startersSampled}`);
}

const header = ['位置', 'n(局)', '進攻出手', '一傳/接發', '魚躍', '舉球觸球', '總觸球', '攔網參與', '有機會回合%', '球權占比%'];
const rows = results.map(({ label, tally: t }) => {
  if (t.notMeasurable) return [label, '無法量測', '-', '-', '-', '-', '-', '-', '-', '-'];
  const perGame = (n) => (n / t.setsPlayed).toFixed(1);
  const oppPct = t.rallies > 0 ? ((t.ralliesWithOpportunity / t.rallies) * 100).toFixed(1) : 'N/A';
  const sharePct = t.teamASpikes > 0 ? ((t.spikes / t.teamASpikes) * 100).toFixed(1) : '0.0';
  return [
    label, String(t.setsPlayed), perGame(t.spikes), perGame(t.receives), perGame(t.dives),
    perGame(t.sets), perGame(t.touchEvents), perGame(t.blockWindows), `${oppPct}`, `${sharePct}`,
  ];
});

console.log('\n=== 每局平均（含 n）===');
console.log(header.join('\t'));
for (const r of rows) console.log(r.join('\t'));

console.log('\n=== 定義備忘 ===');
console.log('進攻出手/一傳接發/魚躍/舉球觸球：TOUCH 事件依 kind 分類（spike/receive/dive/set）逐局平均。');
console.log('總觸球＝TOUCH 事件直接計數（＝上四項之和，engine 保證同義，非另行推算）。');
console.log('攔網參與＝進入攔網窗次數（actor.blockStartTick 變化偵測），非「摸到球」（那是 BLOCK_TOUCH，語意不同，未列入本表）。');
console.log('有機會回合%＝代理指標：該回合玩家有 TOUCH 或攔網窗或 CALL_BALL 任一發生的回合，占全部回合(以 DEAD_BALL 計數)的比例。');
console.log('  這只量「有沒有真的動手」，不量「理論上有沒有資格」——沒被分配到球但站在該位置本該有攻擊/攔網資格的回合不算在內，屬於保守低估。');
console.log('球權占比%＝該位置扣球數 ÷ A 隊全隊扣球總數。');
