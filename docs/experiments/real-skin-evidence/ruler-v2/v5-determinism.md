# V5 決定性（同輸入連跑兩次，輸出逐位元相同）

- 輸入：src＝8720597（暫存工作樹 git worktree add --detach … 8720597），量尺 tools/real-skin-penetration-v2.mjs sha256 前 12 碼 c600445a42af、驗證工具 tools/real-skin-penetration-v2-verify.mjs 728f4b10e6d0（commit ae0b304），glb 與 lib 同 before-*.txt 表頭。
- 第 1 次＝本目錄的正式產物；第 2 次＝同指令另開 node 行程、輸出到暫存目錄。指令：
  - `node tools/real-skin-penetration-v2.mjs --faces=<20k|5k> --json=<dir>/before-<faces>.json --txt=<dir>/before-<faces>.txt`
  - `node tools/real-skin-penetration-v2-verify.mjs --faces=<20k|5k> --out=<dir> --label=SRC-8720597 --only=V0,V1,V2,V3,V4 --oldref=<repo>/docs/experiments/real-skin-evidence --oldprefix=before`

| 檔案 | 第 1 次 sha256 | 第 2 次 sha256 | 結果 |
|---|---|---|---|
| before-20k.txt | `2b0d8b04a14c74bae9e20c46adb64e0a17e6f4ca31b3dda3c946ed84dc5b0e78` | `2b0d8b04a14c74bae9e20c46adb64e0a17e6f4ca31b3dda3c946ed84dc5b0e78` | 相同 |
| before-20k.json | `3bec1cb1cc28dee49963f1e3c094aee440838e03fe757baf720e45a05e72bc63` | `3bec1cb1cc28dee49963f1e3c094aee440838e03fe757baf720e45a05e72bc63` | 相同 |
| before-5k.txt | `6b98d2fed0b4493988d3f630b62b415d6a1136ddb91e7699b1c7e4230a8a8298` | `6b98d2fed0b4493988d3f630b62b415d6a1136ddb91e7699b1c7e4230a8a8298` | 相同 |
| before-5k.json | `9c48bdb1780ecc22484b9434fda6122fb20dcdef91caf52e20bd4cb82c30cb2d` | `9c48bdb1780ecc22484b9434fda6122fb20dcdef91caf52e20bd4cb82c30cb2d` | 相同 |
| verify-V0V1V2V3V4-20k.txt | `ec5222d039c4a8173224a3cf1e3f551d0859d635f1fe1d1a2e7e1603572c483a` | `ec5222d039c4a8173224a3cf1e3f551d0859d635f1fe1d1a2e7e1603572c483a` | 相同 |
| verify-V0V1V2V3V4-20k.json | `44862da7fd1577c09dacb496c7394f39037ec62853b528b6ea613a6b013c9331` | `44862da7fd1577c09dacb496c7394f39037ec62853b528b6ea613a6b013c9331` | 相同 |
| verify-V0V1V2V3V4-5k.txt | `4084918cf17345f3dcd29934d6b85aa769f4538fec62c9d47bede7412fada699` | `4084918cf17345f3dcd29934d6b85aa769f4538fec62c9d47bede7412fada699` | 相同 |
| verify-V0V1V2V3V4-5k.json | `54f30a6c1067a7121d16d2fd866eb26c14a508de560dba6b83395e07486710e2` | `54f30a6c1067a7121d16d2fd866eb26c14a508de560dba6b83395e07486710e2` | 相同 |
| v4-K4b-20k.png | `bb18d8804e2c75e771686ae4cf7af684f4bbe61f08abcc169ea37950e9e024ad` | `bb18d8804e2c75e771686ae4cf7af684f4bbe61f08abcc169ea37950e9e024ad` | 相同 |
| v4-K1a-20k.png | `fc952740a3bafa11c2ea34523f045b24aa5e923c5720813ee9e352c62d54f21f` | `fc952740a3bafa11c2ea34523f045b24aa5e923c5720813ee9e352c62d54f21f` | 相同 |
| v4-K1b-20k.png | `fbf9544d28a73a13f43ab3508f1cbd23856ac0cd4315c500ef153902a07c0835` | `fbf9544d28a73a13f43ab3508f1cbd23856ac0cd4315c500ef153902a07c0835` | 相同 |
| v4-K4b-5k.png | `6ea8ef7d7db6154161df2c801c32a46e3eda0e591417f73666671bfa2cb9e698` | `6ea8ef7d7db6154161df2c801c32a46e3eda0e591417f73666671bfa2cb9e698` | 相同 |
| v4-K1a-5k.png | `5304e03d3758169b221dbeaf7f11a5665699652755eb0a0091283f2697340c09` | `5304e03d3758169b221dbeaf7f11a5665699652755eb0a0091283f2697340c09` | 相同 |
| v4-K1b-5k.png | `54abc7bb5ac8549c5b161787e755fdcc80573344ea5016e68cfee30008adffc5` | `54abc7bb5ac8549c5b161787e755fdcc80573344ea5016e68cfee30008adffc5` | 相同 |

判定：14/14 檔逐位元相同 → V5 過。
