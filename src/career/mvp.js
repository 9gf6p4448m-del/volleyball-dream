// 大作感三卷 批2：MVP 選定（純函式，K2-2）——吃勝方 box rows（buildTeamBox 產物）。
// 排序：得分 > 扣球得分 > 攔網；rows 空/非陣列＝null（null＝不演，直接走現行 overlay）。
export function selectMvp(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const best = [...rows].sort(
    (a, b) => (b.points - a.points) || (b.kills - a.kills) || (b.blocks - a.blocks),
  )[0];
  if (!best || best.pid == null) return null;
  return {
    pid: best.pid,
    name: best.name ?? String(best.pid),
    role: best.role ?? 'outside',
    stats: { points: best.points ?? 0, kills: best.kills ?? 0, blocks: best.blocks ?? 0 },
  };
}
