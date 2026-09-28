# R3 驗收 2：故意改壞凍結檔 → 報錯停止

在 8720597 拋棄式工作樹內另建 `tools-tamper/` 副本（放量尺、lib 與改壞的凍結檔；`../src` 仍指向 8720597 的 src）。每次從正式凍結檔（sha256 87122d5a2aa6…，對抗審查修補後重產）只改一處，然後跑 `node tools-tamper/real-skin-penetration-v2.mjs --faces=20k`。副本跑完已刪除。

```
### 改壞：Sb-tri（凍結檔 sha256 34ad0e82a50b）
exit=1
Error: 凍結集合 20k.Sb 的 sha256 與內容不符（檔案被改過？）
### 改壞：normal（凍結檔 sha256 606805303671）
exit=1
Error: 凍結集合 20k.SbNormal 的 sha256 與內容不符（檔案被改過？）
### 改壞：indexSha（凍結檔 sha256 fc70cb87a4e9）
exit=1
Error: 凍結集合 20k.indexSha 的 sha256 與內容不符（檔案被改過？）
### 改壞：tris（凍結檔 sha256 02839f53bdaf）
exit=1
Error: 凍結集合與白模不相容：三角形 20000 ≠ 19999
### 改壞：bindPosSha（凍結檔 sha256 f53e0e5275b1）
exit=1
Error: 凍結集合與白模不相容：綁定位置不同
### 改壞：none（凍結檔 sha256 87122d5a2aa6）
exit=0
# real-skin-penetration-v2（faces=20k）
```
