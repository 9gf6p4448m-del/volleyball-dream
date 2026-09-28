# V5 決定性（同輸入連跑兩次，輸出逐位元相同）

- 輸入：src＝8720597（暫存工作樹 `git worktree add --detach … 8720597`），量尺 tools/real-skin-penetration-v2.mjs（sha256 前 12 碼 48486173ac2e）、驗證工具 tools/real-skin-penetration-v2-verify.mjs（1b3695779f85），皆為 commit 5bd9aa8；glb 與 lib 雜湊見 before-*.txt 表頭。
- 第 1 次＝本目錄的正式產物；第 2 次＝同指令另開 node 行程、輸出到暫存目錄。指令：
  - `node tools/real-skin-penetration-v2.mjs --faces=<20k|5k> --json=<dir>/before-<faces>.json --txt=<dir>/before-<faces>.txt`
  - `node tools/real-skin-penetration-v2-verify.mjs --faces=<20k|5k> --out=<dir> --label=SRC-8720597 --only=V0,V1,V2,V3,V4,V6 --cli=<dir>/before-<faces>.json --oldref=<repo>/docs/experiments/real-skin-evidence --oldprefix=before`

| 檔案 | 第 1 次 sha256 | 第 2 次 sha256 | 結果 |
|---|---|---|---|
| before-20k.txt | `89fc91c49a6c95d871f1621717301e24817a4c4e509f7fe9c0f7db755f9e2eb3` | `89fc91c49a6c95d871f1621717301e24817a4c4e509f7fe9c0f7db755f9e2eb3` | 相同 |
| before-20k.json | `263ecd80bae6d8e667cc01ab2e5fcd619100863e916fb71c2d68af3d30959a74` | `263ecd80bae6d8e667cc01ab2e5fcd619100863e916fb71c2d68af3d30959a74` | 相同 |
| before-5k.txt | `266c1254ce2a172c95ae25ed8a8951e71b1f2ee97d20eb03ab653dcf3a41cc9a` | `266c1254ce2a172c95ae25ed8a8951e71b1f2ee97d20eb03ab653dcf3a41cc9a` | 相同 |
| before-5k.json | `c3ba06624fb34b2f6dd00b42d337dd3326cd0b50b8a1c509d8cf0000115d6725` | `c3ba06624fb34b2f6dd00b42d337dd3326cd0b50b8a1c509d8cf0000115d6725` | 相同 |
| verify-V0V1V2V3V4V6-20k.txt | `b22fc0777fb73f1b05131b4de77ffd0ef6d5b7cb9c352cc8dce35c840c68a9bf` | `b22fc0777fb73f1b05131b4de77ffd0ef6d5b7cb9c352cc8dce35c840c68a9bf` | 相同 |
| verify-V0V1V2V3V4V6-20k.json | `b21c21f78c06ed0baa44960144c3f6e8926017c96017e066ea580c756526cbf1` | `b21c21f78c06ed0baa44960144c3f6e8926017c96017e066ea580c756526cbf1` | 相同 |
| verify-V0V1V2V3V4V6-5k.txt | `42f109f47614ce5bd881e3092d046d09ec9b3c628f88bb1350eb4d3d2db42445` | `42f109f47614ce5bd881e3092d046d09ec9b3c628f88bb1350eb4d3d2db42445` | 相同 |
| verify-V0V1V2V3V4V6-5k.json | `e8ac2902dc31b9aec3954bfddb47a74bd85b6b1ca252cd33393f35170201e078` | `e8ac2902dc31b9aec3954bfddb47a74bd85b6b1ca252cd33393f35170201e078` | 相同 |
| v4-K4b-20k.png | `bb18d8804e2c75e771686ae4cf7af684f4bbe61f08abcc169ea37950e9e024ad` | `bb18d8804e2c75e771686ae4cf7af684f4bbe61f08abcc169ea37950e9e024ad` | 相同 |
| v4-K1a-20k.png | `fc952740a3bafa11c2ea34523f045b24aa5e923c5720813ee9e352c62d54f21f` | `fc952740a3bafa11c2ea34523f045b24aa5e923c5720813ee9e352c62d54f21f` | 相同 |
| v4-K1b-20k.png | `fbf9544d28a73a13f43ab3508f1cbd23856ac0cd4315c500ef153902a07c0835` | `fbf9544d28a73a13f43ab3508f1cbd23856ac0cd4315c500ef153902a07c0835` | 相同 |
| v4-K4b-5k.png | `6ea8ef7d7db6154161df2c801c32a46e3eda0e591417f73666671bfa2cb9e698` | `6ea8ef7d7db6154161df2c801c32a46e3eda0e591417f73666671bfa2cb9e698` | 相同 |
| v4-K1a-5k.png | `5304e03d3758169b221dbeaf7f11a5665699652755eb0a0091283f2697340c09` | `5304e03d3758169b221dbeaf7f11a5665699652755eb0a0091283f2697340c09` | 相同 |
| v4-K1b-5k.png | `54abc7bb5ac8549c5b161787e755fdcc80573344ea5016e68cfee30008adffc5` | `54abc7bb5ac8549c5b161787e755fdcc80573344ea5016e68cfee30008adffc5` | 相同 |

判定：14/14 檔逐位元相同 → V5 過。

註：檔案以 LF 產生；本 repo `core.autocrlf=true`，在 Windows 取出後 txt/json 若被轉成 CRLF，雜湊會與表中不同、內容相同。量尺表頭的輸入雜湊自修正 2 起先去 CR 再算，跨 checkout 穩定。
