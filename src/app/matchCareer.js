// 賽末收束——生涯結果落檔（純資料流：吃 game 終局狀態＋careerCtx，寫入 store）
// node 可測（store 可注入假體）；three.js/DOM 一概不進本檔。
// 開賽標記也住這裡：生涯場次的「開始→結束」生命週期收在同一模組。
import {
  recordResult, mergeScouting, markPending,
} from '../career/careerState.js';
import { matchStatsFor, growthPointsFor } from '../career/growth.js';
import { applyRosterGrowth } from '../career/roster.js';
import { accrueRecruitProgress } from '../career/recruitment.js';

// 拍板 07-22：開賽即落 pending 標記——中途退出回生涯畫面＝記棄賽敗（堵 reload 白嫖）
export function markMatchStarted(careerCtx) {
  careerCtx.store.saveCareer(markPending(careerCtx.career, careerCtx.matchEntry.id));
}

// 介面契約（tests/app-career.test.js 把關）：
// settleCareerMatch({ careerCtx, game, playerId, feintsUsed }) → { saveOk, won }
// - 局終當下呼叫一次（先落檔再顯示結算畫面——點擊返回前進度已保住）
// - stage 3：從事件日誌統計表現→成長點數；假動作熟練度場終一次累積
// - 情蒐入庫：這場對手看到的我（宿敵同 id 跨賽段累積——「他們記得你」）
export function settleCareerMatch({ careerCtx, game, playerId, feintsUsed = 0 }) {
  const myTeam = game.players[playerId].teamId; // 生涯主角固定 A 隊
  const s = game.match.score;
  const won = game.match.winner === myTeam;
  const stats = matchStatsFor(game.events, playerId, myTeam);
  // W4 招募進度的重入防線：讀存檔現況判斷本場是否已結算過（recordResult 靠 results
  // 冪等，但招募 progress 是累加器——重入會重複累加，要在寫入前擋）
  const settledBefore = (careerCtx.store.loadCareer?.() ?? careerCtx.career)
    .results.some((r) => r.matchId === careerCtx.matchEntry.id);
  let saveOk = true;
  if (feintsUsed > 0) {
    careerCtx.player.techniques.feintUses =
      (careerCtx.player.techniques.feintUses ?? 0) + feintsUsed;
    saveOk = careerCtx.store.savePlayer(careerCtx.player) && saveOk;
  }
  const scouted = mergeScouting(
    careerCtx.career, careerCtx.matchEntry.opponentId, game.scoutTally[playerId],
  );
  saveOk = careerCtx.store.saveCareer(recordResult(scouted, {
    matchId: careerCtx.matchEntry.id,
    won,
    scoreFor: myTeam === 'A' ? s.A : s.B,
    scoreAgainst: myTeam === 'A' ? s.B : s.A,
    gp: growthPointsFor(stats, won),
    stats,
  })) && saveOk;
  // W2 隊友自動成長：與主角同節拍（賽末一次）、同管線（matchStatsFor 表現歸因）。
  // 讀最新 roster 走 RMW（不用 careerCtx 快照）；applyRosterGrowth 依 matchId＋屆數冪等
  // （W6 修：W5 輪迴後 matchId 每屆重複，冪等鍵不帶屆數會讓第二屆起成長全滅）
  const roster = careerCtx.store.loadRoster?.() ?? null;
  if (roster && roster.members.length > 0) {
    const grown = applyRosterGrowth(
      roster.members, game.events, myTeam, careerCtx.matchEntry.id,
      careerCtx.store.seasonIndex?.() ?? 1,
    );
    saveOk = careerCtx.store.saveRoster({ ...roster, members: grown }) && saveOk;
  }
  // W4 招募進度累加（跨賽季累積、永不重置）：勝場＋壯舉（事件流掃描）＋stage 軸。
  // 入隊本身在返回生涯畫面時執行（settleRecruitJoins——同一次賽末流程鏈的收尾）
  const recruitment = careerCtx.store.loadRecruitment?.() ?? null;
  if (recruitment && !settledBefore) {
    saveOk = careerCtx.store.saveRecruitment(accrueRecruitProgress(recruitment, {
      opponentId: careerCtx.matchEntry.opponentId,
      matchId: careerCtx.matchEntry.id,
      won,
      events: game.events,
      playerId,
      myTeam,
    })) && saveOk;
  }
  // W6 換人信任事件（新增採納 6）：被換下＝−1（輕微）、被換上且本場有建功
  // （殺球/攔網得分/ACE）＝+2；主控不計；夾限 0–100；settledBefore 防重入（同招募閘）。
  // 換下又換回者兩者相抵＝淨 +1（回歸建功的敘事獎勵）
  if (!settledBefore) {
    const lineup = careerCtx.store.loadLineup?.() ?? null;
    const subEvents = game.events.filter((e) => e.type === 'SUBSTITUTION' && e.team === myTeam);
    if (lineup?.trust && subEvents.length) {
      const clamp = (v) => Math.max(0, Math.min(100, v));
      const trust = { ...lineup.trust };
      const outs = new Set();
      const ins = new Set();
      for (const e of subEvents) {
        if (e.outId !== playerId) outs.add(e.outId);
        if (e.inId !== playerId) ins.add(e.inId);
      }
      for (const id of outs) trust[id] = clamp((trust[id] ?? 20) - 1);
      for (const id of ins) {
        const st = matchStatsFor(game.events, id, myTeam);
        if (st.kills + st.tipKills + st.blockPoints + st.aces > 0) {
          trust[id] = clamp((trust[id] ?? 20) + 2);
        }
      }
      saveOk = careerCtx.store.saveLineup({ ...lineup, trust }) && saveOk;
    }
  }
  return { saveOk, won };
}

// 局終點擊返回生涯的網址（保留測試/操作相關參數）；pathname 由呼叫端給（window 不進本檔）
export function careerReturnUrl(params, pathname) {
  const back = new URLSearchParams();
  back.set('career', 'resume');
  for (const k of ['points', 'classic', 'assist']) {
    const v = params.get(k);
    if (v !== null) back.set(k, v);
  }
  return `${pathname}?${back.toString()}`;
}
