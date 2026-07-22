// 信任參數模組（Phase 1＝架構；Phase 3 信任即戰術在此掛鉤）
// trust 存於 D1 資料層 Player.trust.fromSetter（當初即為此預留），本模組負責：
// ①trust→分配權重的映射（獨立可替換——Phase 3 可換非線性/信任崩盤斷崖）
// ②決定論抽選 ③updateTrust 介面（本階段遊戲內不呼叫）

// trust 值 → 正規化權重。entries: [{ pid, trust, rowFactor }]
// rowFactor：站位折減（後排攻擊點 0.5）——trust 決定傾向、站位決定資格與折減
export function trustToWeights(entries) {
  const raw = entries.map((e) => Math.max(0, e.trust) * (e.rowFactor ?? 1));
  const sum = raw.reduce((s, v) => s + v, 0);
  if (sum <= 0) return entries.map(() => 1 / entries.length);
  return raw.map((v) => v / sum);
}

// 依權重抽選：roll ∈ [0,1)（呼叫端以決定論 hash 產生）
export function pickByWeights(entries, weights, roll) {
  let acc = 0;
  for (let i = 0; i < entries.length; i += 1) {
    acc += weights[i];
    if (roll < acc) return entries[i];
  }
  return entries[entries.length - 1];
}

// Phase 3 掛鉤：連續失誤降 trust、得分升 trust、劇情注入初始值——
// 介面現在就定型；Phase 1 遊戲內【不得呼叫】（測試可驗證其存在與行為）
export function updateTrust(player, delta) {
  const t = player.trust.fromSetter + delta;
  player.trust.fromSetter = Math.max(0, Math.min(100, t));
  return player.trust.fromSetter;
}
