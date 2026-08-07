# 內切稽核（2026-08-07）探針原始輸出

## A 停手條件 — tools/inside-cut-tempo-probe.mjs（30 局／臂）
```
═══ 內切二速可行性（裁定 A 的停手條件）═══
樣本 30 局／seed 1..30｜AIR_TICKS=24｜1 tick = 1/60 s
臂：base＝現行 HEAD｜naive＝只開二速骰（弧線不動）｜arc＝二速骰＋left_inside 專屬半快弧

── 臂 base ──
    前排/left/two              n=202  起跳→擊球 p50=11  p90=13  窗內 100.0% ｜set→擊球 p50=61  ｜罰站 p50=15  >0.5s 0.0%   
                                runTicks p50=25  startRel p50=25   ｜到位誤差 p50=0.40m p90=0.51mmax=0.71m｜單tick位移 max=0.07m｜擊球 lx p50=-3.02
    前排/left/three            n=620  起跳→擊球 p50=48  p90=50  窗內 0.0%   ｜set→擊球 p50=82  ｜罰站 p50=14  >0.5s 0.0%   
                                runTicks p50=24  startRel p50=10   ｜到位誤差 p50=1.73m p90=1.73mmax=1.73m｜單tick位移 max=0.07m｜擊球 lx p50=-2.35
    前排/left_inside/two       （無樣本）
    前排/left_inside/three     n=222  起跳→擊球 p50=27  p90=29  窗內 27.0%  ｜set→擊球 p50=82  ｜罰站 p50=11  >0.5s 0.0%   
                                runTicks p50=45  startRel p50=10   ｜到位誤差 p50=0.91m p90=1.18mmax=1.35m｜單tick位移 max=0.07m｜擊球 lx p50=-1.06
    計畫數：left/three=631 left/two=210 left_inside/three=225
    計畫了沒扣成：left/three=11 left/two=8 left_inside/three=3

── 臂 naive ──
    前排/left/two              n=202  起跳→擊球 p50=11  p90=13  窗內 100.0% ｜set→擊球 p50=61  ｜罰站 p50=15  >0.5s 0.0%   
                                runTicks p50=25  startRel p50=25   ｜到位誤差 p50=0.41m p90=0.52mmax=0.71m｜單tick位移 max=0.07m｜擊球 lx p50=-3.03
    前排/left/three            n=618  起跳→擊球 p50=48  p90=51  窗內 0.0%   ｜set→擊球 p50=82  ｜罰站 p50=14  >0.5s 0.0%   
                                runTicks p50=24  startRel p50=10   ｜到位誤差 p50=1.73m p90=1.73mmax=1.73m｜單tick位移 max=0.07m｜擊球 lx p50=-2.36
    前排/left_inside/two       n=87   起跳→擊球 p50=32  p90=34  窗內 18.4%  ｜set→擊球 p50=82  ｜罰站 p50=22  >0.5s 0.0%   
                                runTicks p50=45  startRel p50=5    ｜到位誤差 p50=0.53m p90=0.61mmax=0.68m｜單tick位移 max=0.07m｜擊球 lx p50=-1.05
    前排/left_inside/three     n=137  起跳→擊球 p50=27  p90=29  窗內 25.5%  ｜set→擊球 p50=82  ｜罰站 p50=11  >0.5s 0.0%   
                                runTicks p50=45  startRel p50=10   ｜到位誤差 p50=0.91m p90=1.20mmax=1.35m｜單tick位移 max=0.07m｜擊球 lx p50=-1.07
    計畫數：left/three=631 left/two=210 left_inside/three=139 left_inside/two=88
    計畫了沒扣成：left/three=13 left/two=8 left_inside/three=2 left_inside/two=1

── 臂 arc ──
    前排/left/two              n=203  起跳→擊球 p50=12  p90=13  窗內 100.0% ｜set→擊球 p50=62  ｜罰站 p50=15  >0.5s 0.0%   
                                runTicks p50=25  startRel p50=25   ｜到位誤差 p50=0.40m p90=0.56mmax=0.71m｜單tick位移 max=0.07m｜擊球 lx p50=-3.04
    前排/left/three            n=643  起跳→擊球 p50=48  p90=50  窗內 0.0%   ｜set→擊球 p50=82  ｜罰站 p50=14  >0.5s 0.0%   
                                runTicks p50=24  startRel p50=10   ｜到位誤差 p50=1.73m p90=1.73mmax=1.73m｜單tick位移 max=0.07m｜擊球 lx p50=-2.36
    前排/left_inside/two       n=80   起跳→擊球 p50=11  p90=14  窗內 100.0% ｜set→擊球 p50=61  ｜罰站 p50=6   >0.5s 0.0%   
                                runTicks p50=45  startRel p50=5    ｜到位誤差 p50=0.50m p90=0.57mmax=0.66m｜單tick位移 max=0.07m｜擊球 lx p50=-1.38
    前排/left_inside/three     n=131  起跳→擊球 p50=27  p90=29  窗內 31.3%  ｜set→擊球 p50=82  ｜罰站 p50=11  >0.5s 0.0%   
                                runTicks p50=45  startRel p50=10   ｜到位誤差 p50=0.92m p90=1.14mmax=1.35m｜單tick位移 max=0.07m｜擊球 lx p50=-1.07
    計畫數：left/three=649 left/two=206 left_inside/three=134 left_inside/two=80
    計畫了沒扣成：left/three=7 left/two=3 left_inside/three=3 left_inside/two=0

```

## A 平衡位移 — tools/inside-cut-probe.mjs 150 局×2 對手

### 修前（HEAD 1713ed2）
```
n=485 | 得分%=53.8±2.26 | 被攔死%=3.7±0.86 | 被攔碰%(含擦手)=30.3±2.09 | 自失誤%=0.4 | 淨得分%=49.7
  攔網手涵蓋率（球過網時牆罩到這條線）=65.8±2.15（n=485）
-- B 組：普通左翼直線（left） --
n=1805 | 得分%=60.5±1.15 | 被攔死%=2.3±0.35 | 被攔碰%(含擦手)=28.8±1.07 | 自失誤%=0.2 | 淨得分%=58.0
  攔網手涵蓋率（球過網時牆罩到這條線）=47.8±1.18（n=1805）
  淨得分 Δ（A−B）= -8.3 pp

=== 對 commit 隊（曜石體中）（150 局，blockPersona=commit，scoutRead=0.7）===
-- A 組：內切（left_inside） --
n=484 | 得分%=62.0±2.21 | 被攔死%=2.5±0.71 | 被攔碰%(含擦手)=9.5±1.33 | 自失誤%=0.2 | 淨得分%=59.3
  攔網手涵蓋率（球過網時牆罩到這條線）=22.9±1.91（n=484）
-- B 組：普通左翼直線（left） --
n=2053 | 得分%=51.4±1.10 | 被攔死%=2.6±0.35 | 被攔碰%(含擦手)=16.3±0.81 | 自失誤%=0.3 | 淨得分%=48.5
  攔網手涵蓋率（球過網時牆罩到這條線）=32.0±1.03（n=2053）
  淨得分 Δ（A−B）= 10.8 pp

=== 結論輸入 ===
兩種對手、兩軸（淨得分、涵蓋率）逐一列出，供裁定「嚴格更好／有取捨／分不出/更差」。
read ：A(內切) 淨得分=49.7 涵蓋=65.8　|　B(直線) 淨得分=58.0 涵蓋=47.8
commit：A(內切) 淨得分=59.3 涵蓋=22.9　|　B(直線) 淨得分=48.5 涵蓋=32.0
```
### 修後
```
n=487 | 得分%=52.4±2.26 | 被攔死%=4.5±0.94 | 被攔碰%(含擦手)=34.9±2.16 | 自失誤%=0.4 | 淨得分%=47.4
  攔網手涵蓋率（球過網時牆罩到這條線）=68.2±2.11（n=487）
-- B 組：普通左翼直線（left） --
n=1818 | 得分%=60.8±1.15 | 被攔死%=2.1±0.34 | 被攔碰%(含擦手)=29.9±1.07 | 自失誤%=0.2 | 淨得分%=58.5
  攔網手涵蓋率（球過網時牆罩到這條線）=48.8±1.17（n=1818）
  淨得分 Δ（A−B）= -11.0 pp

=== 對 commit 隊（曜石體中）（150 局，blockPersona=commit，scoutRead=0.7）===
-- A 組：內切（left_inside） --
n=486 | 得分%=57.6±2.24 | 被攔死%=2.7±0.73 | 被攔碰%(含擦手)=10.9±1.41 | 自失誤%=0.4 | 淨得分%=54.5
  攔網手涵蓋率（球過網時牆罩到這條線）=24.5±1.95（n=486）
-- B 組：普通左翼直線（left） --
n=2032 | 得分%=51.9±1.11 | 被攔死%=2.8±0.36 | 被攔碰%(含擦手)=16.0±0.81 | 自失誤%=0.3 | 淨得分%=48.9
  攔網手涵蓋率（球過網時牆罩到這條線）=32.2±1.04（n=2032）
  淨得分 Δ（A−B）= 5.7 pp

=== 結論輸入 ===
兩種對手、兩軸（淨得分、涵蓋率）逐一列出，供裁定「嚴格更好／有取捨／分不出/更差」。
read ：A(內切) 淨得分=47.4 涵蓋=68.2　|　B(直線) 淨得分=58.5 涵蓋=48.8
commit：A(內切) 淨得分=54.5 涵蓋=24.5　|　B(直線) 淨得分=48.9 涵蓋=32.2
```

## C1 回饋可達性 — tools/cut-feedback-reach-probe.mjs（12 局／格）
```
內切回饋可達性：每格 12 局

=== 快速比賽（OH） ===
  ui        按下    96 次｜結算    96 筆｜applied/null=96
  ui-d1     按下    96 次｜結算    96 筆｜applied/null=96
  ui-d3     按下    96 次｜結算    96 筆｜applied/null=96
  ui-d10    按下    96 次｜結算    96 筆｜applied/null=96
  noguard   按下 121478 次｜結算  1911 筆｜missed/nowindow=1656  applied/already=180  missed/pass=75
  inwindow  按下 22383 次｜結算   255 筆｜applied/already=180  missed/pass=75
  observe   按下 22555 次｜結算 22555 筆｜state/OPEN=8782  state/pass=7522  state/done=4867  state/locked=1127  state/nowindow=257

=== 生涯模式（第 1 屆小組賽） ===
  ui        按下    85 次｜結算    85 筆｜applied/null=85
  ui-d1     按下    85 次｜結算    85 筆｜applied/null=85
  ui-d3     按下    85 次｜結算    85 筆｜applied/null=85
  ui-d10    按下    85 次｜結算    85 筆｜applied/null=85
  noguard   按下 110520 次｜結算  1698 筆｜missed/nowindow=1484  applied/already=143  missed/pass=71
  inwindow  按下 18941 次｜結算   214 筆｜applied/already=143  missed/pass=71
  observe   按下 17665 次｜結算 17665 筆｜state/OPEN=8070  state/pass=4914  state/done=3414  state/locked=1067  state/nowindow=200
```

## C2 cutOutcome 壽命（連續 sim tick）
```
cutOutcome 壽命（連續 sim tick）n=25  min=84 p50=88 p90=89 max=91
  壽命 ≤ 1 tick 的比例 = 0.0%  ⇒ 一幀跑 2 個 sim tick 時，這些筆的浮字整個看不到
  壽命 ≤ 2 tick 的比例 = 0.0%  ⇒ 一幀跑 3 個 sim tick 時，這些筆的浮字整個看不到
  壽命 ≤ 3 tick 的比例 = 0.0%  ⇒ 一幀跑 4 個 sim tick 時，這些筆的浮字整個看不到
  壽命 ≤ 5 tick 的比例 = 0.0%  ⇒ 一幀跑 6 個 sim tick 時，這些筆的浮字整個看不到
【窗末按下】cutOutcome 壽命（連續 sim tick）n=16 min=1 p50=1 p90=1 max=1
  壽命 ≤ 1 tick：100.0%（一幀跑 2 個 sim tick 就整筆看不到）
  壽命 ≤ 2 tick：100.0%（一幀跑 3 個 sim tick 就整筆看不到）
  壽命 ≤ 3 tick：100.0%（一幀跑 4 個 sim tick 就整筆看不到）
```
