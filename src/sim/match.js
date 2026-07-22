// D2 比賽狀態機 — 裁判不是教練：只吐比賽事件（得分/輪轉/死球原因/局末），
// 球員怎麼動一概不管（歸 D3 AI 與 game.js 的物理互動層）
// Phase 1 規則四條做齊：得分 / 觸球上限 3 / 輪轉換發 / 後排攻擊限制
// TODO Phase 2：輪轉站位違例、雙擊(double contact)完整判定、持球、觸網犯規、標誌桿(antenna)外過網
import { rotateLineup, otherTeam } from './rotation.js';

export const SET_TARGET = 25; // 正式局：rally point 制，需領先 2 分（deuce 完整實作）

export function createMatch({ rotationA, rotationB, servingTeam = 'A', target = SET_TARGET }) {
  return {
    score: { A: 0, B: 0 },
    servingTeam,
    target, // 局分（快速局可設 15；deuce 規則不變）
    rotations: { A: [...rotationA], B: [...rotationB] }, // index 0 = 1 號位
    setOver: false,
    winner: null,
  };
}

export function serverId(match) {
  return match.rotations[match.servingTeam][0];
}

// 一分結算：更新比分、處理換發輪轉、判斷局末（含 deuce）
// 回傳事件陣列；tick 由呼叫端補上
export function pointTo(match, team, reason) {
  if (match.setOver) return [];
  const events = [];

  events.push({ type: 'DEAD_BALL', reason });

  match.score[team] += 1;
  events.push({ type: 'SCORE', team, score: { ...match.score } });

  // 換發：得分方不是發球方 → side-out，得分方取得發球權並先輪轉
  if (team !== match.servingTeam) {
    match.rotations[team] = rotateLineup(match.rotations[team]);
    match.servingTeam = team;
    events.push({ type: 'ROTATE', team });
  }

  if (setWon(match.score, team, match.target)) {
    match.setOver = true;
    match.winner = team;
    events.push({ type: 'SET_END', winner: team, score: { ...match.score } });
  }

  return events;
}

// 達局分且領先 2 分才贏；平手續打到領先 2（deuce 是 rally point 的靈魂，不簡化）
export function setWon(score, team, target = SET_TARGET) {
  const mine = score[team];
  const theirs = score[otherTeam(team)];
  return mine >= target && mine - theirs >= 2;
}

// 觸球上限：第 4 次觸球即犯規（攔網觸球不計入，由呼叫端排除）
export function isFourHits(touchCount) {
  return touchCount >= 4;
}
