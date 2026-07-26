// Phase 4 W3 — L 三欄 box score 介面契約（附錄 A4④：W3 立契約＋記帳，W4 數值頁）
// Q9 原則：sim 決定論事件流攔截記帳、非新算——輸入＝game.events 原始流，純函式。
// 三欄：digs（起球數：一傳/防守起球）、assistDigs（助攻一傳：我的起球→隊友舉→
// 隊友攻擊得分——A3① 得分鏡頭給扣球者、帳記給起球的人）、rallySaves（rally 續命：
// 頂住對方攻擊第三擊的起球＝球沒死在我們地板）。
// 事件序注意：pointTo 先發 DEAD_BALL 再發 SCORE——判助攻要吃 DEAD_BALL 前的觸球鏈快照。
export function boxScoreLFor(events, playerId) {
  let digs = 0;
  let assistDigs = 0;
  let rallySaves = 0;
  let playerTeam = null;
  let chain = []; // 本 rally 的 TOUCH 序
  let lastChain = []; // DEAD_BALL 當下的鏈快照（SCORE 在其後）
  let lastTouch = null;
  for (const e of events ?? []) {
    if (e.type === 'TOUCH') {
      if (e.playerId === playerId) playerTeam = e.team;
      const isDig = e.playerId === playerId && e.touches === 1
        && (e.kind === 'receive' || e.kind === 'dive');
      if (isDig) {
        digs += 1;
        // 續命：上一觸＝對方扣球（spike）＝我把必死球頂了起來
        if (lastTouch && lastTouch.team !== e.team && lastTouch.kind === 'spike') {
          rallySaves += 1;
        }
      }
      chain.push(e);
      lastTouch = e;
    } else if (e.type === 'DEAD_BALL') {
      lastChain = chain;
      chain = [];
      lastTouch = null;
    } else if (e.type === 'SCORE') {
      if (playerTeam && e.team === playerTeam && lastChain.length >= 3) {
        const [d, st, atk] = lastChain.slice(-3);
        if (d.playerId === playerId && d.touches === 1
          && (d.kind === 'receive' || d.kind === 'dive')
          && st.team === playerTeam && st.touches === 2
          && atk.team === playerTeam && atk.touches === 3 && atk.kind === 'spike') {
          assistDigs += 1;
        }
      }
      lastChain = [];
    }
  }
  return { digs, assistDigs, rallySaves };
}
