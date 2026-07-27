// W4(P4) Q9 — box score 記帳（純函式、零 DOM/three；sim 決定論事件流攔截，非新算）
// 單場全員記帳＋位置差異欄位（S 分配/二次球）＋對手 ace 記帳＋導師契約供給（mentor.js）。
// 歸因慣例與 growth.matchStatsFor 同源：SCORE 前最後觸球者＝得分歸屬；死球歸零。

const TIP_POWER = 0.45; // 與 GROWTH.TIP_POWER 同值（輕吊界線）；box 層不分吊/扣、合計殺球

// 全隊逐人記帳：rows[pid]＝{ name, role, points, kills, spikes, blocks, aces,
//   serves, receives, recvGood, perfects, sets, dumps, dumpKills }
// - attackPct＝kills/spikes（顯示層算）；接發成功率＝recvGood/receives（power≥0.75 到位帶）
// - S 欄：sets＝舉球分配數（set 觸球）、dumps＝二次球（touches===2 的 spike）、dumpKills
// - MB 攔網歸因＝blocks（與治具 MB 訊號同一條歸因鏈）
export function buildTeamBox(events, players, teamId) {
  const rows = {};
  const rowOf = (pid) => {
    if (!rows[pid]) {
      const p = players[pid];
      rows[pid] = {
        pid,
        name: p?.name ?? pid,
        role: p?.currentRole ?? 'outside',
        points: 0,
        kills: 0,
        spikes: 0,
        blocks: 0,
        aces: 0,
        serves: 0,
        receives: 0,
        recvGood: 0,
        perfects: 0,
        sets: 0,
        dumps: 0,
        dumpKills: 0,
      };
    }
    return rows[pid];
  };
  let lastTouch = null; // { pid, team, kind, power, dump }
  for (const e of events) {
    if (e.type === 'SERVE') {
      if (e.team === teamId && e.playerId) rowOf(e.playerId).serves += 1;
      lastTouch = { pid: e.playerId, team: e.team, kind: 'serve' };
    } else if (e.type === 'TOUCH') {
      const mine = e.team === teamId && e.playerId;
      if (mine) {
        const r = rowOf(e.playerId);
        if (e.kind === 'spike') {
          r.spikes += 1;
          if (e.touches === 2) r.dumps += 1; // 二次球（S 偷襲／AI setterDump 同一條 sim 路徑）
        } else if (e.kind === 'receive') {
          r.receives += 1;
          if ((e.power ?? 0) >= 0.75) r.recvGood += 1;
          if ((e.power ?? 0) >= 0.95) r.perfects += 1;
        } else if (e.kind === 'set') {
          r.sets += 1;
        }
      }
      lastTouch = {
        pid: e.playerId, team: e.team, kind: e.kind, power: e.power,
        dump: e.kind === 'spike' && e.touches === 2,
      };
    } else if (e.type === 'BLOCK_TOUCH') {
      lastTouch = { pid: e.playerId, team: e.team, kind: 'block' };
    } else if (e.type === 'SCORE') {
      if (lastTouch && lastTouch.team === e.team && e.team === teamId && lastTouch.pid) {
        const r = rowOf(lastTouch.pid);
        if (lastTouch.kind === 'spike') {
          r.kills += 1;
          r.points += 1;
          if (lastTouch.dump) r.dumpKills += 1;
        } else if (lastTouch.kind === 'serve') {
          r.aces += 1;
          r.points += 1;
        } else if (lastTouch.kind === 'block') {
          r.blocks += 1;
          r.points += 1;
        }
      }
      lastTouch = null; // 死球歸零，下一分重新歸因
    }
  }
  return rows;
}

// 對手 ace 單人記帳（Q9：餵情蒐的宿敵感數據面）：aceId＝對面王牌的 pid（呼叫端由
// 名冊對映）；回傳該 pid 的 box row（無觸球＝零值 row）
export function buildAceBox(events, players, acePid, oppTeamId) {
  const rows = buildTeamBox(events, players, oppTeamId);
  return rows[acePid] ?? {
    pid: acePid,
    name: players[acePid]?.name ?? acePid,
    role: players[acePid]?.currentRole ?? 'outside',
    points: 0, kills: 0, spikes: 0, blocks: 0, aces: 0, serves: 0,
    receives: 0, recvGood: 0, perfects: 0, sets: 0, dumps: 0, dumpKills: 0,
  };
}

// 導師契約供給（mentor.js ★ 輸入契約；縫隙 1 層次二）：玩家＝S 的分配面數據。
// - sets[pid]＝玩家舉球後同隊下一觸攻擊者（分配歸因：set→spike 相鄰配對）
// - keyPoint＝關鍵分（任一隊達 target−1 之後的 rally）的分配數與成功數
// - consecErrors＝玩家舉球後該分失分的最長連續段
// initialTarget＝首局局分（SET_START 事件更新後續局；決勝局 15 自動跟上）
export function buildMentorFeed(events, players, playerId, teamId, { won, initialTarget = 25 } = {}) {
  const sets = {};
  const names = {};
  const keyPoint = { sets: 0, kills: 0 };
  let consec = 0;
  let maxConsec = 0;
  let target = initialTarget;
  const score = { A: 0, B: 0 };
  let pendingSet = null; // 玩家舉球待配對（同隊下一觸＝受配者）
  let rallyHadMySet = false; // 本分內玩家有舉球（失誤歸因）
  let rallySetKey = false;   // 本分是關鍵分且玩家有分配
  let rallyAttacker = null;
  for (const e of events) {
    if (e.type === 'SET_START') {
      target = e.target ?? target;
      score.A = 0;
      score.B = 0;
    } else if (e.type === 'TOUCH') {
      if (e.playerId === playerId && e.kind === 'set') {
        pendingSet = true;
        rallyHadMySet = true;
        if (Math.max(score.A, score.B) >= target - 1) {
          keyPoint.sets += 1;
          rallySetKey = true;
        }
      } else if (pendingSet && e.team === teamId && e.kind === 'spike' && e.playerId) {
        sets[e.playerId] = (sets[e.playerId] ?? 0) + 1;
        names[e.playerId] = players[e.playerId]?.name ?? e.playerId;
        rallyAttacker = e.playerId;
        pendingSet = null;
      }
    } else if (e.type === 'SCORE') {
      score[e.team] = e.score?.[e.team] ?? (score[e.team] + 1);
      score[e.team === 'A' ? 'B' : 'A'] = e.score?.[e.team === 'A' ? 'B' : 'A']
        ?? score[e.team === 'A' ? 'B' : 'A'];
      if (rallyHadMySet) {
        if (e.team === teamId) {
          if (rallySetKey && rallyAttacker) keyPoint.kills += 1;
          consec = 0;
        } else {
          consec += 1;
          if (consec > maxConsec) maxConsec = consec;
        }
      }
      pendingSet = null;
      rallyHadMySet = false;
      rallySetKey = false;
      rallyAttacker = null;
    }
  }
  return { sets, names, keyPoint, consecErrors: maxConsec, result: { won: !!won } };
}

// 顯示層小工具：百分率（分母 0＝null，顯示端印 '—'——不假造 0%）
export function pct(num, den) {
  if (!den) return null;
  return Math.round((num / den) * 100);
}
