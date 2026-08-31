// 即時比賽播報（決策模式的記分板下行）——取代舊版全手動操作提示
// 純文字引擎：零 DOM、時間由外部注入（可單元測試）；顯示由 scoreboard 負責。
// 分工：pointBanner＝死球後大字「誰得分＋為什麼」；本層＝rally 過程與敘事節奏點。
// 優先序：可操作提示（發球/選攻擊區）＞ 事件節奏點（TTL）＞ 環境句（拍數/開場敵情）

import { serverId } from '../sim/match.js';
import { otherTeam } from '../sim/rotation.js';
import { blockPersonaOf } from '../sim/ai.js';
// 情報層（2026-08-07）：攔網人格的中文語彙——與 BLOCK_PERSONA 同處，不另立第二份
import { BLOCK_PERSONA, BLOCK_PERSONA_INTEL } from '../sim/blockRead.js';

const BEAT_TTL = 2200;        // 一般節奏點顯示時長（ms）
const STREAK_TTL = 3000;      // 敘事節奏點（連得分/追平/逆轉）顯示時長
const LONG_RALLY_AT = 8;      // 幾拍起算「多拍攻防」
const TIP_POWER = 0.45;       // TOUCH.power 低於此＝輕吊
const HEAVY_POWER = 0.9;      // 高於此＝全力重扣
const PERFECT_POWER = 0.95;   // Perfect 一傳
const DIG_LOW_Y = 0.5;        // 貼地撈球高度

// W7.1 四輪 #2：轉播保護期——beat 單槽加分級。小事（SERVE/舉球攻擊種類/…）隨時可被蓋寫；
// 大事（Perfect 一傳/爆接/魚躍救球/晃過攔網/擦手/攔死/貼地撈起/體力播報/暫停/連得分敘事）
// 設下 2000ms 保護期，期間只有「同級或更高」（＝另一件大事）能蓋過去，小事會被丟棄。
const LEVEL_MINOR = 0;
const LEVEL_MAJOR = 1;
const PROTECT_MS = 1500; // Sawmah 補充拍板：2000 太黏、流動感要保留，降到 1500ms

// 攔網站位提示（純函式）：前排＋對方組織進攻中＋自己還在攔網帶外（|z|≥2.2）＝
// 提醒往前。條件刻意嚴（要對方持球且已一傳）——不在對方接發階段就催人上網
export const BLOCK_BAND_Z = 2.2;
export function blockStepHint(game, controlledId) {
  const me = game.players?.[controlledId];
  const a = game.actors?.[controlledId];
  if (!me || !a || game.phase !== 'rally') return false;
  const rot = game.match?.rotations?.[me.teamId] ?? [];
  const idx = rot.indexOf(controlledId);
  const frontRow = idx === 1 || idx === 2 || idx === 3;
  const r = game.rally;
  return frontRow && r.possession && r.possession !== me.teamId && r.touches >= 1 &&
    Math.abs(a.z) >= BLOCK_BAND_Z;
}

// W7 A4 附：王牌判定——該隊場上 trust.fromSetter 最高者，同分取 id 序（決定論）
function isAceOnCourt(game, team, playerId) {
  const rot = game.match.rotations?.[team] ?? [];
  let best = null;
  for (const id of rot) {
    const trust = game.players[id]?.trust?.fromSetter ?? 0;
    if (!best || trust > best.trust || (trust === best.trust && id < best.id)) best = { id, trust };
  }
  return best?.id === playerId;
}

// 同一死球窗撞車取重要度高者：王牌＞角色球員；同級再比檔位、id 序（皆決定論）
function pickStaminaWinner(candidates, game) {
  if (!candidates.length) return null;
  const scored = candidates.map((c) => ({ ...c, ace: isAceOnCourt(game, c.team, c.playerId) ? 1 : 0 }));
  scored.sort((a, b) => (b.ace - a.ace) || (b.tier - a.tier) || (a.playerId < b.playerId ? -1 : 1));
  return scored[0];
}

// revenge（W7 D3 舊隊情結）：[{ id, name }]＝本場對戰原隊的我方隊友——
// 開賽環境句＋首次建功播報加一句；空陣列＝行為不變
export function createCommentary(opponentDef = null, revenge = []) {
  let beat = null;            // { text, until }——單槽，新節奏點直接蓋舊的
  let rallyStartFlight = 0;   // 本球起始 flight（拍數＝差值）
  // 2026-08-07：賽前攔網情報「這一場說一次」（第二／三局開局比分同為 0:0，見下方用處）
  let intelSaid = false;
  let streakTeam = null;      // 連得分追蹤
  let streakN = 0;
  let prevLeader = null;      // 領先隊（逆轉判定）
  let lastTotal = 0;          // 總分倒退＝換局重開，內部狀態歸零
  // W7 A4 附：體力播報節流——tier1 每人每場一次（雙方共用一個集合，playerId 天生跨隊唯一）、
  // 我方 tier2 再播一次（獨立集合）；staminaWindow＝本死球窗候選，DEAD_BALL 時結算取王牌
  const tier1Fired = new Set();
  const tier2AllyFired = new Set();
  let staminaWindow = [];
  // W7 D3 舊隊情結：復仇名單＋首次建功追蹤（每人每場一次）；
  // SCORE 時 rally 已被 setupServePhase 重置，最後觸球者由 TOUCH/BLOCK_TOUCH 自行追蹤
  const revengeIds = new Set(revenge.map((r) => r.id));
  const revengeFired = new Set();
  let lastTouchInfo = null; // { playerId, team }
  // 命名工程 07-25：對方王牌稱號播報（首度得分、每場一次）——
  // opponents.js ace.slot 0-5 對 B1..B6、'L'＝自由人 BL（自由人得分罕見＝天然更稀）
  const ace = opponentDef?.ace ?? null;
  const aceId = ace ? (ace.slot === 'L' ? 'BL' : `B${ace.slot + 1}`) : null;
  let aceFired = false;

  const oppName = opponentDef?.name ?? '對方';
  const teamLabel = (game, team, controlledId) =>
    team === game.players[controlledId]?.teamId ? '我方' : oppName;
  const nameOf = (game, playerId) => game.players[playerId]?.name ?? playerId;

  // level：LEVEL_MINOR（預設、隨時可蓋）｜LEVEL_MAJOR（設下 2000ms 保護期，期內只有
  // 同級或更高才蓋得掉）。protectUntil 與 until（顯示 TTL）是兩回事——大事可能顯示更久
  // （STREAK_TTL 3000ms）但保護期只有 2000ms，過了保護期、還沒過顯示期，小事一樣能蓋
  // team（試玩回饋 07-25：我方/敵方播報同一位置分不清）：'A'|'B'＝事件所屬隊、null＝中性
  // ——line() 轉成相對視角 ally/enemy，泡泡據此染隊色（青/暖，同氣勢計顏色語言）
  const setBeat = (text, now, ttl = BEAT_TTL, level = LEVEL_MINOR, team = null) => {
    if (beat && now < beat.protectUntil && level < beat.level) return; // 保護期內、蓋不掉
    beat = {
      text, until: now + ttl, level, team,
      protectUntil: level === LEVEL_MAJOR ? now + PROTECT_MS : now,
    };
  };

  // 體力播報（命名工程定稿）：我方＝教練席提醒口吻／敵方＝戰術情報口吻
  const staminaLine = (cand, game, myTeam) => {
    const name = nameOf(game, cand.playerId);
    if (cand.team === myTeam) {
      return cand.tier === 2 ? `${name} 已經在硬撐了——該讓他下來喘口氣` : `${name} 腳步變重了，留意他的體力`;
    }
    return `對面的 ${name} 動得慢了——朝他那邊打`; // 敵方恆 tier1（tier2 已在收集階段濾掉）
  };

  // 教學局（2026-08-12）：教練的逐步喊話。
  // ★ 為什麼是獨立一格、不走 setBeat ★ beat 是「剛剛發生了什麼」的播報通道，會被下一顆
  // 球的播報蓋掉；教練喊的是「現在該做什麼」——那是 action 語意（`line()` 第 1 段），
  // 而且在教學局裡它必須**壓過**內建的操作提示（那幾句假設玩家已經知道自己在幹嘛）。
  let coachLine = null; // { text, until }
  return {
    // 教學局逐步喊話：ttl 到期後自動讓位回內建提示（不必呼叫端清）
    coach(text, now, ttl = 5200) {
      coachLine = text ? { text, until: now + ttl } : null;
    },
    // 每 frame 把 sim 事件餵進來（與 pointBanner 同一條事件流）
    onEvents(events, game, aiState, now, controlledId) {
      for (const e of events) {
        // W7 D3：最後觸球者追蹤（SCORE 歸因用；BLOCK_TOUCH＝攔網方成為最後觸球）
        if (e.type === 'TOUCH' || e.type === 'BLOCK_TOUCH') {
          lastTouchInfo = { playerId: e.playerId, team: e.team };
        }
        const evTeam = e.team ?? game.players[e.playerId]?.teamId ?? null;
        if (e.type === 'SERVE') {
          rallyStartFlight = game.rally.flightId;
          // 小事：隨時可蓋寫
          if (e.playerId !== controlledId) {
            setBeat(`${nameOf(game, e.playerId)} 發球`, now, 1400, LEVEL_MINOR, evTeam);
          }
        } else if (e.type === 'TOUCH' && e.blown) {
          // 爆接（真噴）：接噴救球鏈的開場哨——優先於魚躍播報（撲到但接爆＝報爆）；大事：保護期
          setBeat(`${nameOf(game, e.playerId)} 接爆了——球飛了！`, now, BEAT_TTL, LEVEL_MAJOR, evTeam);
        } else if (e.type === 'TOUCH' && e.kind === 'dive') {
          setBeat(`${nameOf(game, e.playerId)} 魚躍救球！！`, now, BEAT_TTL, LEVEL_MAJOR, evTeam); // 大事
        } else if (e.type === 'TOUCH' && e.kind === 'receive' && game.rally.touches === 1) {
          // 只播有戲的一傳：Perfect 或貼地撈球（逐球碎唸會蓋掉重要節奏點）；兩者皆大事
          if ((e.power ?? 0) >= PERFECT_POWER) {
            // 試玩回饋 07-24：單槽會被下一觸球播報秒蓋→升敘事級存活（同連得分待遇）
            setBeat(`${nameOf(game, e.playerId)} Perfect 一傳！`, now, STREAK_TTL, LEVEL_MAJOR, evTeam);
          } else if ((e.ballY ?? 1) < DIG_LOW_Y) {
            setBeat(`${nameOf(game, e.playerId)} 貼地撈起來了！`, now, BEAT_TTL, LEVEL_MAJOR, evTeam);
          }
        } else if (e.type === 'TOUCH' && e.kind === 'set') {
          // 小事（舉球攻擊種類）：隨時可蓋寫
          const kind = aiState?.attackerId ? aiState.attackKind : null;
          if (kind === 'quick') setBeat('中路快攻——！', now, BEAT_TTL, LEVEL_MINOR, evTeam);
          else if (kind === 'pipe') setBeat('後排 pipe 攻擊！', now, BEAT_TTL, LEVEL_MINOR, evTeam);
          else if (kind === 'dball') setBeat('右後 D 球！', now, BEAT_TTL, LEVEL_MINOR, evTeam);
        } else if (e.type === 'TOUCH' && e.kind === 'spike') {
          // 小事（未列入保護期清單，維持隨時可蓋寫）
          if (e.touches === 2 && game.players[e.playerId]?.currentRole === 'setter') {
            setBeat('二次球偷襲！', now, BEAT_TTL, LEVEL_MINOR, evTeam);
          } else if ((e.power ?? 1) <= TIP_POWER) {
            setBeat('輕吊——！', now, BEAT_TTL, LEVEL_MINOR, evTeam);
          } else if ((e.power ?? 0) >= HEAVY_POWER) {
            setBeat(`${nameOf(game, e.playerId)} 全力重扣！`, now, BEAT_TTL, LEVEL_MINOR, evTeam);
          }
        } else if (e.type === 'BLOCK_DECEIVED') {
          // 大事：晃過攔網（主詞＝被晃的攔網者，隊色跟他）
          const blkTeam = game.players[e.blockerId]?.teamId ?? null;
          setBeat(`${nameOf(game, e.blockerId)} 被晃過去了！`, now, BEAT_TTL, LEVEL_MAJOR, blkTeam);
        } else if (e.type === 'BLOCK_SWALLOW') {
          // 統一敘事卷 N2：吞下去播報（主詞＝攻擊手；名字取不到就講球不講人）
          const swTeam = game.players[e.spikerId]?.teamId ?? null;
          setBeat(e.spikerId != null && game.players[e.spikerId]
            ? `${nameOf(game, e.spikerId)} 這球吞進去了！`
            : '這球吞進去了！', now, BEAT_TTL, LEVEL_MAJOR, swTeam);
        } else if (e.type === 'NET_DUEL_TOOL') {
          // 統一敘事卷 N2：打手出界播報（合成事件，來源＝matchLoop netDuelFire 'tool'）
          setBeat(e.playerId != null && game.players[e.playerId]
            ? `${nameOf(game, e.playerId)} 借手得分！`
            : '借手得分！', now, BEAT_TTL, LEVEL_MAJOR, evTeam);
        } else if (e.type === 'BLOCK_TOUCH') {
          // 擦手＝球擦進攔網方半場（隊友快救）；攔死回彈＝攻方那邊球還活著；兩者皆大事
          setBeat(e.graze
            ? `${nameOf(game, e.playerId)} 指尖擦到！球還活著——快救！`
            : `${nameOf(game, e.playerId)} 攔網拍到！球被打回去了！`,
          now, BEAT_TTL, LEVEL_MAJOR, evTeam);
        } else if (e.type === 'SCORE') {
          const { score } = game.match;
          const total = score.A + score.B;
          if (total < lastTotal) { streakTeam = null; streakN = 0; prevLeader = null; }
          lastTotal = total;
          // 連得分
          if (e.team === streakTeam) streakN += 1;
          else { streakTeam = e.team; streakN = 1; }
          // 敘事優先序：逆轉 ＞ 追平 ＞ 連得分（同一分只講最大的事）；三者皆「連得分敘事」大事
          const leader = score.A === score.B ? null : (score.A > score.B ? 'A' : 'B');
          const label = teamLabel(game, e.team, controlledId);
          if (leader && prevLeader && leader !== prevLeader) {
            setBeat(`${teamLabel(game, leader, controlledId)}逆轉超前！`, now, STREAK_TTL, LEVEL_MAJOR, leader);
          } else if (!leader && total > 0) {
            setBeat(`追平了 ${score.A}:${score.B}！`, now, STREAK_TTL, LEVEL_MAJOR);
          } else if (streakN >= 3) {
            setBeat(`${label}連下 ${streakN} 分！`, now, STREAK_TTL, LEVEL_MAJOR, e.team);
          }
          if (leader) prevLeader = leader;
          // 命名工程：對方王牌首度得分——稱號亮相（每場一次；先於復仇播報＝復仇可蓋過）
          if (
            ace && !aceFired && lastTouchInfo &&
            lastTouchInfo.team === e.team && lastTouchInfo.playerId === aceId
          ) {
            aceFired = true;
            setBeat(`王牌 ${ace.name}——「${ace.title}」名不虛傳！`, now, STREAK_TTL, LEVEL_MAJOR,
              lastTouchInfo.team);
          }
          // W7 D3 舊隊情結：復仇者首次建功（得分方最後觸球者在復仇名單）——蓋過連得分槽；
          // 同屬敘事大事（同一批 STREAK_TTL 待遇）
          if (
            lastTouchInfo && lastTouchInfo.team === e.team &&
            revengeIds.has(lastTouchInfo.playerId) && !revengeFired.has(lastTouchInfo.playerId)
          ) {
            revengeFired.add(lastTouchInfo.playerId);
            setBeat(`${nameOf(game, lastTouchInfo.playerId)} 把這一分打給老東家看！`,
              now, STREAK_TTL, LEVEL_MAJOR, lastTouchInfo.team);
          }
        } else if (e.type === 'STAMINA_LOW') {
          // W7 A4 附：節流收集（不即時播）——主角豁免；敵方 tier2 豁免（heavyExempt 段無播報）；
          // tier1 每人每場一次；我方 tier2 再播一次。同一死球窗的候選 DEAD_BALL 時才結算取王牌
          const myTeam = game.players[controlledId]?.teamId;
          if (e.playerId === controlledId) {
            // 主角豁免所有體力播報（讓位給 C1 教練對話，避免同事兩講）
          } else if (e.team !== myTeam && e.tier === 2) {
            // 敵方重度豁免段無播報
          } else if (e.tier === 1 && !tier1Fired.has(e.playerId)) {
            tier1Fired.add(e.playerId);
            staminaWindow.push({ playerId: e.playerId, team: e.team, tier: 1 });
          } else if (e.tier === 2 && e.team === myTeam && !tier2AllyFired.has(e.playerId)) {
            tier2AllyFired.add(e.playerId);
            staminaWindow.push({ playerId: e.playerId, team: e.team, tier: 2 });
          }
        } else if (e.type === 'DEAD_BALL') {
          // 本死球窗（剛結束的那球）累積的體力候選在此結算：撞車取王牌，零丟訊息也零多播；大事
          if (staminaWindow.length) {
            const winner = pickStaminaWinner(staminaWindow, game);
            staminaWindow = [];
            if (winner) {
              setBeat(staminaLine(winner, game, game.players[controlledId]?.teamId),
                now, STREAK_TTL, LEVEL_MAJOR, winner.team);
            }
          }
        } else if (e.type === 'TIMEOUT') {
          // W7 B3：暫停播報——我方（含玩家點擊與隊友視角一致）＝提醒口吻／對方 AI 喊＝戰術情報口吻；大事
          const label = teamLabel(game, e.team, controlledId);
          const mine = e.team === game.players[controlledId]?.teamId;
          setBeat(mine ? `${label}請求暫停——穩住呼吸，重新來` : `${label}喊了暫停——他們被打疼了`,
            now, STREAK_TTL, LEVEL_MAJOR, e.team);
        } else if (e.type === 'TIMEOUT_BOOST') {
          // W8（07-26 拍板）：暫停教練選項公開——對手選了什麼是可據以應對的情報
          // （穩住＝他們在回血、長球磨他更有利／燃起來＝要衝氣勢，先穩住一傳）；
          // 我方自選有浮字＋戰術板，播報只報對手那邊，不重複蓋自家台詞
          const mineB = e.team === game.players[controlledId]?.teamId;
          if (!mineB) {
            setBeat(e.boost === 'calm'
              ? `${oppName}選擇調整呼吸——他們在回血`
              : `${oppName}在場邊喊聲——他們要衝一波`, now, STREAK_TTL, LEVEL_MAJOR, e.team);
          }
        }
      }
    },

    // 每 frame 取當前該顯示的一行：{ text, kind }
    // kind：'action'＝可操作提示（泡泡琥珀色）、'beat'＝節奏點（pop 進場）、
    // 'ambient'＝環境句（淡入不 pop——拍數這類高頻變化不能一直彈）；text ''＝安靜
    line(game, aiState, controlledId, now) {
      if (game.phase === 'set_over') return { text: '', kind: 'ambient' };
      const me = game.players[controlledId];
      // 0) 教練喊話（教學局）：壓過下面所有內建提示——那幾句是寫給「已經知道怎麼玩」
      // 的人看的，教學局裡玩家正在被教的就是這一步，蓋掉教練等於把課上到一半打斷
      if (coachLine && now < coachLine.until) return { text: coachLine.text, kind: 'action' };
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
      } else if (blockStepHint(game, controlledId)) {
        // 實測（tools/block-defend-probe.mjs）：前排基準站位 z=3.0 在自動跳攔帶（2.2）外
        // ——站著不動整場開窗 0 次＝玩家以為攔網壞了；走到位命中率 45%。
        // 走位＝攔網技術表達（拍板不自動帶位），缺的只是「該往前」這句話
        return { text: '對方要打過來了——往前一步，把牆補上！', kind: 'action' };
      }
      // 2) 事件節奏點（未過期）——team 轉相對視角：ally=我方（青）/enemy=敵方（暖）/無=中性
      if (beat && now < beat.until) {
        const myTeam = me?.teamId;
        const side = beat.team && myTeam ? (beat.team === myTeam ? 'ally' : 'enemy') : null;
        return { text: beat.text, kind: 'beat', ...(side ? { team: side } : {}) };
      }
      // 3) 環境句
      if (game.phase === 'serve') {
        const { score } = game.match;
        // W7 D3：舊隊情結開賽環境句（有復仇者時取代敵情句——敵情已在生涯畫面看過）
        if (revenge.length && score.A === 0 && score.B === 0) {
          return {
            text: `${revenge[0].name} 對上老東家 ${oppName}——這一場他等很久了`,
            kind: 'ambient',
          };
        }
        if (opponentDef && score.A === 0 && score.B === 0) {
          return { text: `對手 ${opponentDef.name}：${opponentDef.trait}`, kind: 'ambient' };
        }
        // ★ 2026-08-07 情報層：快速比賽的攔網人格出口 ★
        // 生涯有賽前對手卡（careerScreen 的 intel 區）可以放這條情報，**快速比賽沒有
        // 任何賽前畫面**——`matchConfig.js` 不注入 aiProfiles ⇒ 對手恆為跟球型，
        // 而玩家完全不知道，於是他在快速比賽裡永遠在盲按內切。
        // 條件刻意寫成「開賽 0-0」而不是「沒有 opponentDef」：資料源是
        // `blockPersonaOf`（sim 的同一支回退邏輯），生涯若哪天沒給 trait 也照樣有這句。
        // ★ 2026-08-07 稽核修正：加 `!intelSaid` 一次性閘 ★ 只寫 `score 0:0` 的話，
        //   第二局、第三局開局比分同樣是 0:0 ⇒ 同一句賽前情報會再播兩次。
        //   閘掛在 commentary 實例上（matchStage 每場建一個）＝語意就是「這一場說一次」。
        if (me && !intelSaid && score.A === 0 && score.B === 0) {
          intelSaid = true;
          const intel = BLOCK_PERSONA_INTEL[blockPersonaOf(game, otherTeam(me.teamId))]
            ?? BLOCK_PERSONA_INTEL[BLOCK_PERSONA.READ];
          return {
            text: `對面的牆是${intel.label}——${intel.tag}。${intel.hint}`,
            kind: 'ambient',
          };
        }
        return { text: `${teamLabel(game, game.match.servingTeam, controlledId)}發球`, kind: 'ambient' };
      }
      const rallyN = game.rally.flightId - rallyStartFlight;
      if (rallyN >= LONG_RALLY_AT) return { text: `第 ${rallyN} 拍攻防！`, kind: 'ambient' };
      return { text: '', kind: 'ambient' };
    },
  };
}
