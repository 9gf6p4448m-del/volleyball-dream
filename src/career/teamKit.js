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

// ---- 隊伍配色卷批 2（背號，2026-08-24）----
// 純資料層，零 THREE 依賴、node 可直測；渲染層（geoCharacter.js／matchView.js）只消費。

// 背號可讀性（N3）：號碼色從白／黑兩個候選中，選跟球衣底色 redmean 距離較大的那個。
// 對 16 隊全部球衣/自由人色＋geoCharacter 側別預設 A/B 面實測：兩候選之一必過
// READABILITY_MIN，且最小餘裕 ~371（遠高於門檻）——見 tests/kit-batch2-numbers.test.mjs。
// 鑑別力：0xf2f4f8（B 隊自由人預設，近白）必選黑，「號碼色恆白」的壞實作在這一色會被抓紅。
export function numberTextColor(baseHex) {
  const white = 0xffffff, black = 0x000000;
  return colorDistance(white, baseHex) >= colorDistance(black, baseHex) ? white : black;
}

// ---- F1/F2 對抗覆審修正（2026-08-24）----
// F1：原本只給「開場上場 7 人」配號，賽中換人上場的板凳球員 numberSlots=null，
// 整場不會有背號。改為**全名冊配號**——涵蓋板凳，板凳球員在建 game 的當下就已經有
// 號碼，賽中換人上場沿用同一個號碼，不必臨時現配（背號的真實意義本就是「這個人的
// 號碼」，不是「這個人現在站不站在場上」）。N2 凍結的是「決定論＋同隊不撞號」，不是
// 任何特定號碼區間——這份重寫不動那兩條，只是讓涵蓋範圍從 on-court 7 人擴大成全
// 名冊，見 tests/kit-batch2-numbers.test.mjs。（配號演算法本身之後又被使用者裁定
// 改成散號，見下方「散號規則」——F1 的「涵蓋全名冊」與「決定論＋不撞號」兩件事不變，
// 只是分配數字的公式換了。）
//
// F2：原本這段「上場名單重建＋配號」邏輯內嵌在 matchView.js，測試檔另外手抄一份
// 同款邏輯驗證——兩份互為對照，一份錯了測試量不到。抽成這兩個純函式，
// matchView.js 與測試共用同一份實作。

// ---- 散號規則（2026-08-24 使用者裁定）----
// 原規則「名冊序→1 起連號」讓每隊恆是 1..N，使用者嫌假（「每隊都只有 1-6」）。
// 改：id 決定論雜湊映射到 1–25，同隊撞號往上遞補（+1 迴繞）。驗收檔
// 「號碼分配規則」段本來就寫明「提案版——使用者看圖後可改規則，改規則不動上述
// 門檻」，這裡只換算法，N2 的決定論／同隊不撞號兩條門檻不變。
//
// 雜湊函式：同款演算法在 geoCharacter.js 已有一份（idHash+mix32，用於膚色/慣用手
// 決定論取樣），這裡不 import 那份——geoCharacter.js 反向 import 本檔的
// numberTextColor，兩檔互相 import 會循環——所以在這自成一份，寫法刻意保持同款
// （×31 累加＋32-bit avalanche 混合），維護時兩份要一起看。
function numberHash(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

const MAX_NUMBER = 25;

// 全名冊決定論配號：playerList＝依名冊序排好的球員物件陣列（含 { id, teamId }，
// 例如 game.players 的 Object.values——createGame 內建順序＝各隊 rosters→liberos→
// benches，見 sim/game.js createGame）。回傳 { id: number }：號碼優先落在 1–25、
// 同隊撞號往上遞補，保持同隊唯一；不同隊各自獨立命名空間（同 F1 修前設計，A 隊與
// B 隊都可能出現同一個號碼）。
//
// ★ N6 瀏覽器覆驗抓到的不變量缺陷（2026-08-25）★ 原本遞補是無界 `while
// (taken.has(candidate)) candidate = (candidate % MAX_NUMBER) + 1`——同隊人數一旦
// > MAX_NUMBER（25），25 個號全被占滿後這個 while 永遠成立，主執行緒卡死（?devkit
// 把 16 個預覽隊全掛在 teamId:'B' 就是這樣觸發的，見下方 kitPreview.js 修法）。
// node 單測沒抓到是因為真實名冊（≤19 人/隊）本來就 < 25，這是「特定合法輸入下才會
// 卡住」的不變量缺陷，不是靠多測幾組資料能自然覆蓋到的。
// 修法：分兩段——① taken.size < MAX_NUMBER 時，1–25 裡保證至少有一個空號，
// 用「至多繞 MAX_NUMBER 圈」的有界迴圈找（不再是無界 while，找不到也會在 MAX_NUMBER
// 次內停下，不會死循環）；② taken.size 已達 MAX_NUMBER（同隊 >25 人）時，1–25 已無
// 空號，改配 MAX_NUMBER+1 起的溢出連號（26、27…，全域遞增、不重算雜湊）——任何隊伍
// 大小下都保證終止，且溢出號同樣不會與 1–25 或彼此撞號。
export function numbersForRoster(playerList) {
  const byTeam = {};
  for (const p of playerList) {
    if (!byTeam[p.teamId]) byTeam[p.teamId] = [];
    byTeam[p.teamId].push(p.id);
  }
  const numbers = {};
  for (const ids of Object.values(byTeam)) {
    const taken = new Set();
    let overflowNext = MAX_NUMBER + 1;
    for (const id of ids) {
      let candidate;
      if (taken.size >= MAX_NUMBER) {
        // 1–25 已滿（這隊人數 > MAX_NUMBER）：直接發溢出號，不再嘗試雜湊/遞補
        candidate = overflowNext;
        overflowNext += 1;
      } else {
        candidate = (numberHash(id) % MAX_NUMBER) + 1;
        // 有界：taken.size < MAX_NUMBER 保證 1..25 裡至少有一個空號，
        // 繞滿 MAX_NUMBER 圈內必定找到，不會像原本的無界 while 那樣卡死
        for (let tries = 0; taken.has(candidate) && tries < MAX_NUMBER; tries += 1) {
          candidate = (candidate % MAX_NUMBER) + 1;
        }
      }
      taken.add(candidate);
      numbers[id] = candidate;
    }
  }
  return numbers;
}

// 開場上場名單重建（N4 用）：只用來決定「哪些人一開場就該看得到背號面片 Mesh」——
// 這批人數決定 N4 的 mesh 上限（14×2＝28≤30）；其餘板凳球員賽中換人上場時才惰性
// 補建 Mesh（見 matchView.js routeEvents 的 SUBSTITUTION 分支），不計入這個上限。
// ★ createGame 開場即呼叫 setupServePhase→applyLiberoSwaps（sim/game.js:426,1873），
// 自由人可能在 t=0 就已頂替某位後排球員站進 rotations——rotations 陣列此時裝的是
// liberoId 不是被頂替者的 id。要拿到「6 名真正先發＋1 自由人」這 7 人，得用
// liberos[team].replacedId 把 rotations 裡的 liberoId 換回原本先發的 id 再補回
// liberoId 本身；沒被頂替（replacedId 尚為 null）時這個 map 是 no-op，一樣得到 7 人。
export function initialOnCourtIds(game, team) {
  const liberoId = game.liberos?.[team]?.liberoId ?? null;
  const replacedId = game.liberos?.[team]?.replacedId ?? null;
  const starters = (game.match?.rotations?.[team] ?? [])
    .map((id) => (id === liberoId ? replacedId : id))
    .filter(Boolean);
  return [...starters, liberoId].filter(Boolean);
}
