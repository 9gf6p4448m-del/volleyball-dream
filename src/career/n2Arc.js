// 4.5A 紀慕白（小白）支線——「不落地教」3 事件制（純函式；零 DOM/存檔 IO）
// 人設＝phase4-w3-status.md §7 案 B：球不落地就還沒輸；成長弧＝學會「有些球該放」，
// 與 L 改判機制互為表裡。與宿敵對位（同一硬幣兩面）不明說、押在台詞底下。
// 事件一＝第 3 屆開幕（換季鏈新生見面後）；事件二＝真實數據決定論觸發（賽末掃描
// 「場上自由人魚躍後該 rally 失分」累積 N 次——matchCareer 記入 result.stats，
// 觸發條件純由 results 推導＝重放安全）；事件三＝屆末（生涯結算前）。
// 轉 L 差分：師徒版（數據源＝玩家自己的撲球）／未轉＝上場版；三人版併入轉位敘事
// （positionEvents acceptLinesFor）。

// 事件二觸發 n 值（裁量，快照如實記錄）：3 次——單場自由人魚躍後失分約 1-3 次，
// 3 次＝約 1-2 場的累積量，小組賽內可自然觸發
export const N2_CHASE_N = 3;

// 賽末掃描器（決定論、零新 sim 事件型別——招募壯舉 countDigs 同範式）：
// 統計「liberoPid 魚躍（TOUCH kind:'dive'）後、該 rally 以對方得分收場」的次數
// ＝「為追救不回的球失位/丟分」的機制化語意（魚躍＝倒地恢復期＝失位）
export function scanChaseLost(events, liberoPid, myTeam) {
  let count = 0;
  let dove = false;
  for (const e of events ?? []) {
    if (e.type === 'TOUCH' && e.playerId === liberoPid && e.kind === 'dive') {
      dove = true;
    } else if (e.type === 'SCORE') {
      if (dove && e.team !== myTeam) count += 1;
      dove = false;
    }
  }
  return count;
}

// 本場「作用中自由人」歸屬：玩家=L＝玩家本人；lineup 選小白＝場上 L 物件 id 恆為
// 'AL'（careerMatchSetup 覆名換屬性）——回傳 {pid, who} 或 null（小守等其他人＝不記）
export function actingLiberoFor({ player, lineup }) {
  if (player?.currentRole === 'libero') return { pid: player.id, who: 'player' };
  if (lineup?.libero === 'N2') return { pid: 'AL', who: 'N2' };
  return null;
}

// 由 results 推導累計（決定論；results 逐屆重置＝天然只算第 3 屆）
export function n2ChaseTotals(career) {
  let n2 = 0;
  let self = 0;
  let n2Courts = 0;
  for (const r of career?.results ?? []) {
    const c = r.stats?.lbChase ?? 0;
    if (r.stats?.lbWho === 'N2') {
      n2 += c;
      n2Courts += 1;
    } else if (r.stats?.lbWho === 'player') {
      self += c;
    }
  }
  return { n2, self, n2Courts };
}

// ---- 事件一・入學宣言（第 3 屆開幕，新生見面後）----
// 與宿敵的對位（都把一件事信成全部）由阿哲收尾句暗押，不明說

const EV1_BASE = [
  { speaker: '阿哲', text: '新生練習賽——喂，那顆出界了！紀慕白，不用救！' },
  { speaker: '小白', text: '……接到了。' },
  { speaker: '阿哲', text: '那顆明顯出界！你的膝蓋不要了？' },
  { speaker: '小白', text: '碰到地板之前，誰說得準。' },
  { speaker: '小白', text: '學長，我的排球只有一條規則——球不落地，就還沒輸。' },
  { speaker: '阿哲', text: '……行。但這裡是遊隼，膝蓋也是隊上的。收著點用。' },
  // 4.5B §6 專屬 beat #4：「不落地教」立教時刻——膝蓋著地定格＋WebAudio 合成悶響
  //（camera metadata＝純表現層宣告；careerScreen dialogPlay 消費、beatStage 收斂幾何）
  {
    speaker: '小白',
    text: '膝蓋碰得到地。球不行。',
    cam: 'rimlight-solo',
    camOpts: {
      heightM: 1.6, role: 'libero', teamId: 'A', subjectId: 'N2',
      pose: 'knee', sink: 0.28, sound: 'thud',
    },
  },
  { speaker: '阿哲', text: '把一件事信成全部的眼神……我在網子對面，也見過一個。' },
];

// 玩家已是 L＝前輩自由人在隊的追加（師徒線開端）
const EV1_L_EXTRA = [
  { speaker: '小白', text: '……學長也穿異色球衣。' },
  { speaker: '小白', text: '那你一定懂——得分欄裡沒有我們的名字。所以每一顆沒落地的球，都是我們的分。' },
];

export function n2OpeningLines({ freshmen = [], player = null } = {}) {
  if (!freshmen.some((f) => f.id === 'N2')) return [];
  return player?.currentRole === 'libero' ? [...EV1_BASE, ...EV1_L_EXTRA] : [...EV1_BASE];
}

// ---- 事件二・「該放的球」（真實數據決定論觸發）----

const EV2_COURT = [
  { speaker: '阿哲', text: '紀慕白。今天那幾顆——你明知道救不回來，還是撲了。' },
  { speaker: '小白', text: '救得回來。差一點而已。' },
  { speaker: '阿哲', text: '你撲出去的那一刻，你身後就空了。那幾分，是從你讓出來的地方進的。' },
  { speaker: '小白', text: '…………' },
  { speaker: '小白', text: '球不落地，就還沒輸。這句話——難道錯了嗎？' },
  { speaker: '阿哲', text: '沒有錯。只是你還沒學會它的下半句。' },
];

const EV2_MENTOR = [
  { speaker: '小白', text: '學長。今天那幾顆，你也撲了——明知道救不回來的球。' },
  { speaker: '小白', text: '我們這個位置，就該這樣嗎？每一顆都撲，撲到最後？' },
  { speaker: '小白', text: '可是你倒地的時候，我從板凳上看得最清楚——場中央，空出來一塊。' },
  { speaker: '小白', text: '改判的時候，學長封住一條線，就是放掉另一條線。……那撲球呢？撲球有沒有，該放的球？' },
  { speaker: '小白', text: '球不落地就還沒輸。那「該放的球」……算什麼？' },
];

// 場邊保底版（裁量，快照記錄）：小組賽打完、小白整個小組賽未上場——衝突鏡像成
// 「數落地的球」；「未上場」本身即決定論事實，三事件鏈不因排陣選擇而斷
const EV2_SIDELINE = [
  { speaker: '小白', text: '學長。今天的比賽，我在場邊把每一顆落地的球都數過了。' },
  { speaker: '小白', text: '有幾顆……如果是我，撲得到。至少，摸得到。' },
  { speaker: '阿哲', text: '數球的人不會有答案。想知道撲不撲得到——把位置爭來。' },
  { speaker: '小白', text: '……嗯。在那之前，午休的牆會陪我練。一百顆起跳。' },
];

export function n2PostEvents({ career, seasonIndex, player, roster }) {
  if (seasonIndex !== 3) return [];
  if (!(roster?.members ?? []).some((m) => m.id === 'N2')) return [];
  const triggered = career.events ?? [];
  if (triggered.includes('n2-arc-2')) return [];
  const t = n2ChaseTotals(career);
  const isL = player?.currentRole === 'libero';
  if (isL && t.self >= N2_CHASE_N) {
    return [{ id: 'n2-arc-2', moment: 'post', lines: EV2_MENTOR }];
  }
  if (!isL && t.n2 >= N2_CHASE_N) {
    return [{ id: 'n2-arc-2', moment: 'post', lines: EV2_COURT }];
  }
  const groupDone = (career.results ?? [])
    .filter((r) => String(r.matchId).startsWith('group-')).length >= 3;
  if (!isL && groupDone && t.n2Courts === 0) {
    return [{ id: 'n2-arc-2', moment: 'post', lines: EV2_SIDELINE }];
  }
  return [];
}

// ---- 事件三・承認（屆末，生涯結算前）：信仰升級為選擇權，非放棄 ----

const EV3_BASE = [
  { speaker: '小白', text: '學長們要畢業了。……在那之前，我想說——那句話的下半句，我找到了。' },
  { speaker: '小白', text: '球不落地，就還沒輸。所以，撲出去的每一次，要留給撲得到的球。' },
  { speaker: '小白', text: '「不落地」不是不能放手——是我選擇不放手的時候，它才是信仰。' },
  { speaker: '小白', text: '這裡的地板，之後由我來守。該救的球，一顆都不會少。' },
];

const EV3_MENTOR = [
  { speaker: '小白', text: '學長。你畢業之後，異色球衣就是我的了。' },
  { speaker: '小白', text: '這一年我一直在看你——看你撲哪些球，也看你，放哪些球。' },
  { speaker: '小白', text: '我以前以為放手就是輸。現在懂了——每放掉一條線，都是為了守住另一條。' },
  { speaker: '小白', text: '球不落地就還沒輸。但「不落地」是選擇，不是枷鎖——這是學長教我的。地板，交給我。' },
];

export function n2FinaleEvents({ career, player, roster }) {
  if (!(roster?.members ?? []).some((m) => m.id === 'N2')) return [];
  const triggered = career.events ?? [];
  if (triggered.includes('n2-arc-3')) return [];
  const lines = player?.currentRole === 'libero' ? EV3_MENTOR : EV3_BASE;
  return [{ id: 'n2-arc-3', moment: 'post', lines }];
}
