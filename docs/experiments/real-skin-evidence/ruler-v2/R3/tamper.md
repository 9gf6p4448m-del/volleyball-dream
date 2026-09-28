# R3 驗收 2：故意改壞凍結檔 → 報錯停止

在 8720597 拋棄式工作樹內另建 `tools-tamper/` 副本（量尺、lib 與改壞的凍結檔；`../src` 仍指向 8720597 的 src），每次從正式凍結檔（sha256 9a8a840b55eb…）改一處，跑 `node tools-tamper/real-skin-penetration-v2.mjs --faces=20k`。副本跑完已刪除。

```
### 改壞：Sb-tri（node tools-tamper/real-skin-penetration-v2.mjs --faces=20k；凍結檔 sha256 2e9d9ed445d0）
exit=1
      if (v !== F.sha[k]) throw new Error(`凍結集合 ${faces}.${k} 的 sha256 與內容不符（檔案被改過？）`);
Error: 凍結集合 20k.Sb 的 sha256 與內容不符（檔案被改過？）
### 改壞：normal（node tools-tamper/real-skin-penetration-v2.mjs --faces=20k；凍結檔 sha256 4903c40ecf02）
exit=1
      if (v !== F.sha[k]) throw new Error(`凍結集合 ${faces}.${k} 的 sha256 與內容不符（檔案被改過？）`);
Error: 凍結集合 20k.SbNormal 的 sha256 與內容不符（檔案被改過？）
### 改壞：tris（node tools-tamper/real-skin-penetration-v2.mjs --faces=20k；凍結檔 sha256 4508340338e0）
exit=1
  if (R.index.length / 3 !== F.tris) throw new Error(`凍結集合與白模不相容：三角形 ${R.index.length / 3} ≠ ${F.tris}`);
Error: 凍結集合與白模不相容：三角形 20000 ≠ 19999
### 改壞：bindPosSha（node tools-tamper/real-skin-penetration-v2.mjs --faces=20k；凍結檔 sha256 3e20f454ff72）
exit=1
  if (R.n < F.verts || bindPosSha(R.P, F.verts) !== F.bindPosSha) throw new Error('凍結集合與白模不相容：綁定位置不同');
Error: 凍結集合與白模不相容：綁定位置不同
### 改壞：none（node tools-tamper/real-skin-penetration-v2.mjs --faces=20k；凍結檔 sha256 9a8a840b55eb）
exit=0
# real-skin-penetration-v2（faces=20k）
集合指紋（排序後 ID 的 sha256 前 12 碼）：S_b d6d98a384bc6、S_e a04194c4e319、手臂 右 0d964abdccf5／左 395e81b110ca（S_e 依當前權重的主骨、S_b 與手臂依 src 地標選取；--baseline 會逐集合比對）
```
