// 即時比賽播報（決策模式的記分板下行）——取代舊版全手動操作提示
// 純文字引擎：零 DOM、時間由外部注入（可單元測試）；顯示由 scoreboard 負責。
// 分工：pointBanner＝死球後大字「誰得分＋為什麼」；本層＝rally 過程與敘事節奏點。
// 優先序：可操作提示（發球/選攻擊區）＞ 事件節奏點（TTL）＞ 環境句（拍數/開場敵情）

import { serverId } from '../sim/match.js';

const BEAT_TTL = 2200;        // 一般節奏點顯示時長（ms）
const STREAK_TTL = 3000;      // 敘事節奏點（連得分/追平/逆轉）顯示時長
const LONG_RALLY_AT = 8;      // 幾拍起算「多拍攻防」
const TIP_POWER = 0.45;       // TOUCH.power 低於此＝輕吊
const HEAVY_POWER = 0.9;      // 高於此＝全力重扣
const PERFECT_POWER = 0.95;   // Perfect 一傳
const DIG_LOW_Y = 0.5;        // 貼地撈球高度

export function createCommentary(opponentDef = null) {
  let beat = null;            // { text, until }——單槽，新節奏點直接蓋舊的
  let rallyStartFlight = 0;   // 本球起始 flight（拍數＝差值）
  let streakTeam = null;      // 連得分追蹤
  let streakN = 0;
  let prevLeader = null;      // 領先隊（逆轉判定）
  let lastTotal = 0;          // 總分倒退＝換局重開，內部狀態歸零

  const oppName = opponentDef?.name ?? '對方';
  const teamLabel = (game, team, controlledId) =>
    team === game.players[controlledId]?.teamId ? '我方' : oppName;
  const nameOf = (game, playerId) => game.players[playerId]?.name ?? playerId;

  const setBeat = (text, now, ttl = BEAT_TTL) => { beat = { text, until: now + ttl }; };

  return {
    // 每 frame 把 sim 事件餵進來（與 pointBanner 同一條事件流）
    onEvents(events, game, aiState, now, controlledId) {
      for (const e of events) {
        if (e.type === 'SERVE') {
          rallyStartFlight = game.rally.flightId;
          if (e.playerId !== controlledId) setBeat(`${nameOf(game, e.playerId)} 發球`, now, 1400);
        } else if (e.type === 'TOUCH' && e.blown) {
          // 爆接（真噴）：接噴救球鏈的開場哨——優先於魚躍播報（撲到但接爆＝報爆）
          setBeat(`${nameOf(game, e.playerId)} 接爆了——球飛了！`, now);
        } else if (e.type === 'TOUCH' && e.kind === 'dive') {
          setBeat(`${nameOf(game, e.playerId)} 魚躍救球！！`, now);
        } else if (e.type === 'TOUCH' && e.kind === 'receive' && game.rally.touches === 1) {
          // 只播有戲的一傳：Perfect 或貼地撈球（逐球碎唸會蓋掉重要節奏點）
          if ((e.power ?? 0) >= PERFECT_POWER) {
            setBeat(`${nameOf(game, e.playerId)} Perfect 一傳！`, now);
          } else if ((e.ballY ?? 1) < DIG_LOW_Y) {
            setBeat(`${nameOf(game, e.playerId)} 貼地撈起來了！`, now);
          }
        } else if (e.type === 'TOUCH' && e.kind === 'set') {
          const kind = aiState?.attackerId ? aiState.attackKind : null;
          if (kind === 'quick') setBeat('中路快攻——！', now);
          else if (kind === 'pipe') setBeat('後排 pipe 攻擊！', now);
          else if (kind === 'dball') setBeat('右後 D 球！', now);
        } else if (e.type === 'TOUCH' && e.kind === 'spike') {
          if (e.touches === 2 && game.players[e.playerId]?.currentRole === 'setter') {
            setBeat('二次球偷襲！', now);
          } else if ((e.power ?? 1) <= TIP_POWER) {
            setBeat('輕吊——！', now);
          } else if ((e.power ?? 0) >= HEAVY_POWER) {
            setBeat(`${nameOf(game, e.playerId)} 全力重扣！`, now);
          }
        } else if (e.type === 'BLOCK_DECEIVED') {
          setBeat(`${nameOf(game, e.blockerId)} 被晃過去了！`, now); // 假動作騙贏攔網
        } else if (e.type === 'BLOCK_TOUCH') {
          // 擦手＝球擦進攔網方半場（隊友快救）；攔死回彈＝攻方那邊球還活著
          setBeat(e.graze
            ? `${nameOf(game, e.playerId)} 指尖擦到！球還活著——快救！`
            : `${nameOf(game, e.playerId)} 攔網拍到！球被打回去了！`, now);
        } else if (e.type === 'SCORE') {
          const { score } = game.match;
          const total = score.A + score.B;
          if (total < lastTotal) { streakTeam = null; streakN = 0; prevLeader = null; }
          lastTotal = total;
          // 連得分
          if (e.team === streakTeam) streakN += 1;
          else { streakTeam = e.team; streakN = 1; }
          // 敘事優先序：逆轉 ＞ 追平 ＞ 連得分（同一分只講最大的事）
          const leader = score.A === score.B ? null : (score.A > score.B ? 'A' : 'B');
          const label = teamLabel(game, e.team, controlledId);
          if (leader && prevLeader && leader !== prevLeader) {
            setBeat(`${teamLabel(game, leader, controlledId)}逆轉超前！`, now, STREAK_TTL);
          } else if (!leader && total > 0) {
            setBeat(`追平了 ${score.A}:${score.B}！`, now, STREAK_TTL);
          } else if (streakN >= 3) {
            setBeat(`${label}連下 ${streakN} 分！`, now, STREAK_TTL);
          }
          if (leader) prevLeader = leader;
        }
      }
    },

    // 每 frame 取當前該顯示的一行：{ text, kind }
    // kind：'action'＝可操作提示（泡泡琥珀色）、'beat'＝節奏點（pop 進場）、
    // 'ambient'＝環境句（淡入不 pop——拍數這類高頻變化不能一直彈）；text ''＝安靜
    line(game, aiState, controlledId, now) {
      if (game.phase === 'set_over') return { text: '', kind: 'ambient' };
      const me = game.players[controlledId];
      // 1) 可操作提示（永遠壓過播報——玩家該做事的時刻不能被蓋台）
      if (game.phase === 'serve') {
        if (serverId(game.match) === controlledId) {
          return { text: '你發球——從面板選個落點！', kind: 'action' };
        }
      } else if (
        aiState?.claimId === controlledId &&
        game.rally.possession === me?.teamId &&
        (game.rally.touches === 1 || game.rally.touches === 2)
      ) {
        return { text: '舉球給你——讀攔網、點攻擊區！', kind: 'action' };
      }
      // 2) 事件節奏點（未過期）
      if (beat && now < beat.until) return { text: beat.text, kind: 'beat' };
      // 3) 環境句
      if (game.phase === 'serve') {
        const { score } = game.match;
        if (opponentDef && score.A === 0 && score.B === 0) {
          return { text: `對手 ${opponentDef.name}：${opponentDef.trait}`, kind: 'ambient' };
        }
        return { text: `${teamLabel(game, game.match.servingTeam, controlledId)}發球`, kind: 'ambient' };
      }
      const rallyN = game.rally.flightId - rallyStartFlight;
      if (rallyN >= LONG_RALLY_AT) return { text: `第 ${rallyN} 拍攻防！`, kind: 'ambient' };
      return { text: '', kind: 'ambient' };
    },
  };
}
