// 隊伍配色（配色卷批 1，2026-08-24）——純資料取用與守門，零 THREE 依賴、node 可測。
//
// kit 欄位住在各隊 def（opponents.js／universities.js）：
//   kit: { jersey, shorts, trim, libero: { jersey, shorts, trim }, banner? }
// banner＝客場橫幅／應援色（選填，缺省用 jersey）——天鷹用它保住既有 #7db2ff 視覺錨。
//
// 設計約定（驗收 K2/K3，checkKitPalette 在測試永久守門）：
// - 撞色治理＝設計時保證，零 runtime 機制（拍板題 2）——色票本身就與我方
//   藍/金拉開距離，兩隊同場的組合恆為「我方(恆定) × 某一隊」，不會出現隊×隊。
// - 我方錨定色（恆定，拍板題 1 C 案）：球衣 0x2e7bff、自由人 0xffc531。

// 我方錨定色（可讀性硬約束的比較基準；改我方配色＝改 geoCharacter.TEAM_KIT.A，
// 這兩個值要跟著同步——checkKitPalette 的守門以本檔為準）
export const OUR_ANCHORS = { jersey: 0x2e7bff, libero: 0xffc531 };

// 驗收凍結門檻（acceptance-kit-batch1.md）：identity 兩兩 ≥100、
// 對我方兩色與隊內自由人對比 ≥150（redmean；「該撞」參照對全在 90 以下）
export const IDENTITY_MIN = 100;
export const READABILITY_MIN = 150;

// 取用單一入口：def 沒有 kit ⇒ null ⇒ 消費端回落側別預設（K5 回退安全）
export function kitFor(def) {
  return def?.kit ?? null;
}

// 0xRRGGBB → CSS '#rrggbb'（橫幅/DOM 消費）
export function cssColor(hex) {
  return `#${(hex >>> 0).toString(16).padStart(6, '0')}`;
}

// redmean 加權 RGB 距離（近似感知；純算術決定論）
export function colorDistance(a, b) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const rm = (ar + br) / 2;
  const dr = ar - br, dg = ag - bg, db = ab - bb;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

// 全色票守門：entries＝[{ id, kit }]。回傳違規清單（空＝過）。
// 不丟例外——測試斷言空陣列、鑑別力對照斷言「壞色票必有違規」。
export function checkKitPalette(entries) {
  const bad = [];
  for (const { id, kit } of entries) {
    if (!kit) { bad.push(`${id}: 缺 kit`); continue; }
    // 欄位齊備守門（覆審 MEDIUM 08-24）：缺 shorts/trim 時 THREE.Color 吃到
    // undefined 會靜默變白、任何色距檢查都抓不到——在資料層就擋下
    for (const f of ['jersey', 'shorts', 'trim']) {
      if (kit[f] == null) bad.push(`${id}: kit 缺 ${f}`);
      if (kit.libero?.[f] == null) bad.push(`${id}: kit.libero 缺 ${f}`);
    }
    for (const [tag, c] of [['球衣', kit.jersey], ['自由人', kit.libero?.jersey]]) {
      if (c == null) { bad.push(`${id}: 缺${tag}色`); continue; }
      if (colorDistance(c, OUR_ANCHORS.jersey) < READABILITY_MIN) {
        bad.push(`${id}: ${tag}與我方球衣距離 ${Math.round(colorDistance(c, OUR_ANCHORS.jersey))} < ${READABILITY_MIN}`);
      }
      if (colorDistance(c, OUR_ANCHORS.libero) < READABILITY_MIN) {
        bad.push(`${id}: ${tag}與我方自由人距離 ${Math.round(colorDistance(c, OUR_ANCHORS.libero))} < ${READABILITY_MIN}`);
      }
    }
    if (kit.jersey != null && kit.libero?.jersey != null
      && colorDistance(kit.jersey, kit.libero.jersey) < READABILITY_MIN) {
      bad.push(`${id}: 隊內自由人對比 ${Math.round(colorDistance(kit.jersey, kit.libero.jersey))} < ${READABILITY_MIN}`);
    }
  }
  for (let i = 0; i < entries.length; i += 1) {
    for (let k = i + 1; k < entries.length; k += 1) {
      const a = entries[i].kit?.jersey, b = entries[k].kit?.jersey;
      if (a == null || b == null) continue;
      const v = colorDistance(a, b);
      if (v < IDENTITY_MIN) {
        bad.push(`identity ${entries[i].id}×${entries[k].id} ${Math.round(v)} < ${IDENTITY_MIN}`);
      }
    }
  }
  return bad;
}
