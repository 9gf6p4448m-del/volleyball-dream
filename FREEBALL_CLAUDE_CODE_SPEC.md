# 《排球夢》Free Ball 街機物理手感重構白皮書（Claude Code 執行總綱）
> **本文件專供 Claude Code 作為系統重構、手感優化與主聯賽整合之唯一權威指導規格書。**
> 包含：Steam《Free Ball》核心手感逆向分析、全套物理數學公式、扣球/接球/攔網判定算法、相機與打擊反饋矩陣、無痛整合指引，以及一鍵啟動 Claude Code 的 Master Prompt。

---

## 目錄
1. [專案背景與重構目標](#1-專案背景與重構目標)
2. [Steam《Free Ball》手感逆向工程矩陣](#2-steamfree-ball手感逆向工程矩陣)
3. [現有架構診斷與模組清單](#3-現有架構診斷與模組清單)
4. [核心物理與幾何算法規格（純函數實現）](#4-核心物理與幾何算法規格純函數實現)
5. [進攻多樣性：重扣 (Smash)、輕吊 (Tip) 與打手出界 (Tool)](#5-進攻多樣性重扣-smash輕吊-tip-與打手出界-tool)
6. [防守手感：自主走位墊球 (Dig) 與魚躍撲救 (Dive)](#6-防守手感自主走位墊球-dig-與魚躍撲救-dive)
7. [攔網手掌物理碰撞體系 (Block Colliders)](#7-攔網手掌物理碰撞體系-block-colliders)
8. [動態視角與打擊打擊感（Dynamic Camera & Juice）](#8-動態視角與打擊打擊感dynamic-camera--juice)
9. [行動端雙手交互與 UI 反饋規格](#9-行動端雙手交互與-ui-反饋規格)
10. [主遊戲移植與重構實施路線圖（無回歸原則）](#10-主遊戲移植與重構實施路線圖無回歸原則)
11. [Claude Code 一鍵執行指令集（Master Prompts）](#11-claude-code-一鍵執行指令集master-prompts)

---

## 1. 專案背景與重構目標

### 1.1 核心痛點分析
《排球夢》原版為策略型手遊架構，其核心問題在於：
1. **磁吸定格感強**：排球進入接球區或擊球區時，會觸發狀態鎖定或彈出選單，割裂流暢體驗。
2. **缺乏垂直空間知覺**：在手機 2D 螢幕中，玩家難以判斷下落中排球的確切空間高度與下落時程。
3. **助跑與起跳脫節**：原地起跳與跑動起跳高度相同，缺乏街機遊戲的動能回饋感。
4. **打擊感單薄**：擊球瞬間無畫面頓幀（Hitstop）與衝擊視覺。

### 1.2 重構目標（對標 Steam 熱門遊戲《Free Ball》）
- **第三人稱追尾視角**（Over-the-shoulder chase camera）。
- **零磁吸牛頓物理**：排球軌跡 100% 由初速度向量、重力加速度與剛體碰撞驅動。
- **自主跑位與雙環時機收斂**：利用地面投影圈與收斂時機圈，將空間判定轉化為直覺節奏判定。
- **兩段式動能起跳與空中下釘**：水平助跑速度轉換為垂直摸高；空中最高點下壓擊球。
- **2508 條單元測試零破壞（Zero Regression）**：所有重構必須保持向下相容，不破壞既有生涯模式與確定性模擬。

---

## 2. Steam《Free Ball》手感逆向工程矩陣

| 特性維度 | 原版《Free Ball》(Steam) | 原《排球夢》現狀 | 沙盒模式已達成 | 下階段目標（交棒 Claude Code） |
| :--- | :--- | :--- | :--- | :--- |
| **空中子彈時間** | 起跳摸高點時間流速降至 ~0.3x，鏡頭推近，充裕瞄準 | 無慢動作，固定時間倒數 | $0.28\times$ 慢動作 + FOV $48^\circ$ 特寫，擊球恢復 $1.0\times$ + Hitstop | 完善攻防全流程體驗，微調吊球與攔網節奏 |
| **進攻多樣性** | 下釘 (Smash)、單手輕吊 (Tip)、打手出界 (Tool) | 依選單按鈕決定球路 | 下釘 (Smash)、輕吊 (Tip)、攔網碰撞檢測 (Roof/Tool) | **修正吊球動作**：目前誤用兩手托球，需改為單手高舉輕挑 (Tip) |
| **視角系統** | 第三人稱動態追尾，助跑拉近，扣殺拉遠微震 | 側面偏斜全場俯瞰視角，鏡頭固定 | 第三人稱 Chase Cam，FOV Kick ($55^\circ \rightarrow 48^\circ \rightarrow 63^\circ$) | 完善接球時後場視角跟隨 |
| **三拍攻防閉環** | 接球 (Dig) ➔ 舉球 (Set) ➔ 扣球 (Spike) vs 攔網 (Block) | 狀態機輪流結算 | 已具備主動二傳高托與攔網起跳 | **將接球 (Dig) 正式串回完整 Rally 循環**，死球後重開防守 |
| **攔網博弈** | 攔網手起跳封網，真實手掌碰撞判定 | 數值比拼 (roll dice) | 已實作 checkBlockCollision (Roof 攔死 / Tool 打手出界) | 實機微調攔網手橫向跟隨與手掌判定容差 |

---

## 3. 現有架構診斷與模組清單

專案現有獨立 Free Ball 沙盒架構位於以下路徑，均為純 ES Module：

```
src/
├── sim/
│   ├── physicsMath.js        # 拋物線逆解、落點預測、扣殺衝量、墊球反彈、吊球初速、攔網碰撞 (純函數，2508 測試保證)
│   ├── game.js               # 主遊戲確定性物理狀態機（保持 100% 測試綠燈）
│   ├── ball.js / flight.js   # 主遊戲原有排球飛行與拋物線計算
├── render/
│   ├── ballIndicator.js      # 地面投影雙環收斂指示器
│   ├── freeballJuice.js      # Hitstop 凍結幀 (38ms)、相機隨機震動、FOV Kick
│   ├── freeballVfx.js        # 3D 衝擊環、地板光環 (Decal)、起跳揚塵 (Dust)
│   ├── geoAnimator.js        # 幾何角色程序化動畫（windup, spike, overhead, blockJump 等）
│   ├── geoCharacter.js       # InstancedMesh 球員骨架池
│   ├── facing.js             # 球員朝向與平滑轉向
│   ├── ballView.js           # 排球視覺渲染（金色拖尾、火花粒子）
├── input/
│   ├── freeballControls.js   # 雙拇指控制器（浮動左搖桿、情境動作按鈕、拖曳瞄準）
│   ├── matchControls.js      # 主遊戲舊版選單控制器
├── app/
│   ├── freeballSandbox.js    # Free Ball 物理沙盒練習場（?mode=freeball）
│   ├── matchLoop.js          # 主遊戲比賽主迴圈
└── main.js                   # 入口路由
```

---

## 4. 核心物理與幾何算法規格（純函數實現）

### 4.1 二傳高球拋物線逆解（Ballistic Launch Velocity Solver）
給定起點 $P_{start}$、目標點 $P_{target}$、期望最高點高度 $H_{apex}$ 與重力加速度 $g = 9.81\text{ m/s}^2$：

$$v_y = \sqrt{2g(H_{apex} - P_{start}.y)}$$
$$t_{up} = \frac{v_y}{g}, \quad t_{down} = \sqrt{\frac{2(H_{apex} - P_{target}.y)}{g}}$$
$$t_{total} = t_{up} + t_{down}$$
$$v_x = \frac{P_{target}.x - P_{start}.x}{t_{total}}, \quad v_z = \frac{P_{target}.z - P_{start}.z}{t_{total}}$$

### 4.2 解析落點與著地剩餘時間預測（Landing Predictor）
給定當前位置 $(x_0, y_0, z_0)$ 與速度 $(v_x, v_y, v_z)$，當到達高度 $y_{ground}$ 時：

$$\Delta y = y_0 - y_{ground}$$
$$\text{判別式 } D = v_y^2 + 2g\Delta y$$
$$t_{land} = \frac{v_y + \sqrt{D}}{g}$$
$$x_{land} = x_0 + v_x \cdot t_{land}, \quad z_{land} = z_0 + v_z \cdot t_{land}$$

### 4.3 扣殺下釘初速度與物理偏折計算（Spike Impulse Calculation）
扣殺並非單純直線飛行，而是賦予向下的俯衝速度並施加重力補償：

$$H_{dist} = \sqrt{\Delta x^2 + \Delta z^2}$$
$$V_{base} = 18.0 \text{ m/s} \times \text{Multiplier}(TimingGrade)$$
- $\text{PERFECT}$: $1.35\times$（約 $24.3\text{ m/s}$，解鎖超高速音效與火花）
- $\text{GOOD}$: $1.0\times \sim 1.15\times$（約 $18\sim 20\text{ m/s}$）
- $\text{LATE / EARLY}$: $0.65\times$（球路軟弱，易被攔截）

向下衝擊垂直速度 $v_y$：
$$t_{impact} = \max\left(\frac{H_{dist}}{V_{final}}, 0.16\right)$$
$$v_y = \frac{0 - P_{ball}.y}{t_{impact}} + 0.5 \cdot g \cdot t_{impact}$$

---

## 5. 進攻多樣性：重扣 (Smash)、單手輕吊 (Tip) 與打手出界 (Tool)

在空中擊球時，根據玩家右手動作按鈕的**滑動手勢向量（Swipe Vector）**或右側按鈕決定攻擊手段：

```
           [ 向上輕滑 / 點擊「🎯 輕吊」]
                    ▲
                    │  ➔ 單手輕吊球 (Soft Tip / Roll Shot)
                    │
[ 向左微劃 ] ◄─── 中心 ───► [ 向右微劃 ]
(大斜線 Cross)     │      (直線 Line / 打手 Wipe)
                    │
                    ▼  ➔ 爆裂下釘扣殺 (Power Smash)
         [ 向下猛劃 / 點擊「⚡ 扣殺」]
```

### 5.1 輕吊球（Soft Tip）動作與物理規格
- **⚠️ 動作關鍵修復**：目前 `attemptSoftTip` 誤調用了 `overhead`（兩手高舉托球動作）。在排球中，吊球是**單手高舉、手指彈撥輕挑**，左手應自然下擺維持平衡。需在 `geoAnimator.js` 中新增/指定單手吊球動作（例如 `tip` 序列：單手伸直向前上方輕挑，手腕微彈）。
- **出球角度**：仰角 $+35^\circ \sim +45^\circ$，輕微拋物線越過前排攔網手。
- **出球速度**：初速縮減為 $6.5\text{ m/s}$，飛行時間拉長至 $1.1\text{ s}$。
- **目標落點**：球網後方 $1.5\text{ m} \sim 2.5\text{ m}$ 處（三米線前空檔）。

### 5.2 打手出界（Tooling / Wipe off Block）
- 當攔網手在前方（$Z$ 距離 $< 0.8\text{ m}$），玩家朝外側邊線大幅度平抹揮擊。
- 球擊中攔網手側邊後，水平速度反彈並增加向外分量，直接彈出界外得分。

---

## 6. 防守手感：自主走位墊球 (Dig) 與魚躍撲救 (Dive)

### 6.1 空間相對站位判定公式（The Dig Sweet Spot）
排球下落時，玩家必須自主走位至球的正下方偏後處：

設球員中心為 $P_{player}$，排球在接球高度（約 $0.9\text{ m}$）的預測落點為 $P_{ball\_land}$：
$$\vec{\Delta} = P_{ball\_land} - P_{player}$$
- **水平距離**：$d_{horiz} = \sqrt{\Delta x^2 + \Delta z^2}$。
- **前後偏角**：排球落點應在球員正前方 $0.2\text{ m} \sim 0.5\text{ m}$（即面對球網時 $\Delta z \in [-0.5, -0.2]$）。

#### 接球品質評估：
1. **完美到位（PERFECT DIG）**：$d_{horiz} \in [0.2, 0.45]$ 且站在球後方。
   - 排球以完美弧線反彈向二傳手站位點（$x=1.2, z=1.5, y=3.2$），初速由 `calculateDigVelocity` 自動逆解。
2. **位置過深（LATE / ON-HEAD）**：$d_{horiz} < 0.15$（球打在頭頂或胸口）。
   - 球向後方或垂直炸起，無法組織有效二傳。
3. **距離過遠（REACHING / DIVE NEEDED）**：$d_{horiz} \in [1.2, 2.4]$。
   - 點擊動作鍵觸發**魚躍撲救（Dive）**，呼叫 `animator.trigger('dive')`，平地滑行一段距離救起球。

---

## 7. 攔網手掌物理碰撞體系 (Block Colliders)

### 7.1 攔網手掌碰撞盒幾何體
在攔網球員起跳到達最高點時，於球網上方建立雙手平面 Collider：
- **位置**：$Y \in [2.43\text{ m}, 2.75\text{ m}]$（男網高 $2.43\text{ m}$），$Z = 0$（球網鉛直面）。
- **覆蓋寬度**：單人攔網寬度 $0.65\text{ m}$，雙人合攔寬度 $1.3\text{ m}$。

### 7.2 物理反射計算（Elastic Collision with Hand Normal）
當扣殺球體軌跡線段穿過手掌平面時：
- **正面攔死（Solid Roof Block）**：
  - 手掌稍微前壓（手腕下壓夾角 $\theta_{press} = 15^\circ$）。
  - 反彈法向量 $\vec{N} = (0, -0.2, 0.98)$。
  - 球直接以 $0.65\times$ 的殘存速度垂直下扎回進攻方地板！
- **擦手指尖（Graze / Tool）**：
  - 球穿過攔網頂端或側邊邊緣（距離邊界 $< 0.1\text{ m}$）。
  - 觸發減速偏折，球速減半並向後方或場外飛出。

---

## 8. 動態視角與打擊打擊感（Dynamic Camera & Juice）

### 8.1 視角追焦與 FOV Kick 曲線
相機掛載於球員身後上方，隨遊戲節奏動態調整：
- **待命巡航態**：相機偏移 $(x \cdot 0.65, 3.6, z + 5.2)$，$\text{FOV} = 55^\circ$。
- **空中慢動作瞄準態**：起跳且球在攻擊窗時，$\text{FOV} \rightarrow 48^\circ$ 特寫推近，時鐘 $0.28\times$ 慢動作。
- **扣殺瞬間（FOV Kick）**：命中 Perfect Smash 瞬間，$\text{FOV}$ 瞬間彈跳至 $63^\circ$，隨後在 180ms 內平滑衰減回 $55^\circ$。

### 8.2 Hitstop 凍結幀規格
- **時長**：嚴格鎖定於 **$38\text{ ms}$（約 2.3 幀）**。
- **實作方式**：在 `freeballJuice.js` 中，當 `hitstopRemainingMs > 0` 時，暫停排球位移、物理演算與人物骨架旋轉，僅執行 WebGL 繪製與相機隨機抖動。

---

## 9. 行動端雙手交互與 UI 反饋規格

```
┌────────────────────────────────────────────────────────┐
│  [✕ 返回]               🏐 Free Ball 物理沙盒     [↺ 重發]  │
│                                                        │
│                                                        │
│                         [排球]                          │
│                           │                            │
│                           ▼ (下墜)                      │
│                    ◎ 外環(收斂中)                       │
│                    ● 內環(落點)                         │
│                                                        │
│                                                        │
│  ╭───────╮                             ╭───────────╮  │
│  │   ●   │ 浮動虛擬搖桿                 │  ⚡ 扣殺   │  │
│  │       │ (任意碰觸左半螢幕生成)         │ (助跑起跳) │  │
│  ╰───────╯                             ╰───────────╯  │
│  左手走位                               右手動作按鈕    │
└────────────────────────────────────────────────────────┘
```

1. **左半螢幕（動態浮動搖桿）**：
   - 觸碰瞬間生成搖桿底座（半徑 $55\text{ px}$），滑動輸出向量 $(-1 \sim 1)$。
   - 手指抬起時立即平滑歸零，不保留漂移。
2. **右半螢幕（情境動作大按鈕）**：
   - **地面狀態**：按鈕顯示為天藍色「助跑起跳」，點擊觸發起跳加速。
   - **空中狀態**：按鈕平滑過渡為螢光橙紅色「⚡ 扣殺」與「🎯 輕吊」，按住可向外滑動拖曳瞄準。
   - **按鈕觸控穿透處理**：按鈕本身設為 `pointer-events: none`，由全螢幕 `pointerdown` 事件依點擊座標統一分發，杜絕行動端延遲。

---

## 10. Claude Code 核心任務指令（交棒任務書）

```markdown
Hello Claude Code,

我們正在將《排球夢》的手機端核心玩法與物理手感，全面重構對標 Steam 熱門遊戲《Free Ball》的純物理、街機爽快節奏與高自主走位判定。
請你立即研讀專案根目錄下的 【FREEBALL_CLAUDE_CODE_SPEC.md】 技術白皮書！

請嚴格遵守以下四項不妥協原則：
1. 思考先於編碼（Think Before Coding）：嚴格遵守 SPEC.md 的物理公式與模組劃分。
2. 零回歸保證（Zero Regression）：全專案 2508 條單元測試（node --test）必須全程保持 100% 通過，嚴禁在 src/sim/ 內加入 Math.random 或修改純函數簽名。
3. 保持純 JavaScript + Three.js：不引入外部肥大依賴，維持 60 FPS 無 GC 尖峰的高性能架構。
4. 手術式修改（Surgical Changes）：僅修改相關模組，乾淨俐落。

【你的具體任務清單】
任務 1：【修正吊球動作】
- 檢查 `src/app/freeballSandbox.js` 中的 `attemptSoftTip`。
- 目前錯誤調用了 `playerAnimator.trigger('overhead')`（這是雙手托球動作）。
- 請在 `src/render/geoAnimator.js` 中新增或使用專屬單手挑球姿勢 `tip`（單臂向上伸展、手指輕挑彈撥，非雙手高舉托球），讓吊球視覺符合排球真實單手輕挑動作！

任務 2：【串聯完整三拍攻防閉環（3-Touch Rally Loop）】
- 將目前的「對打練習」升級為「接球 (Dig) ➔ 舉球 (Set) ➔ 扣球/吊球 (Spike/Tip) ➔ 攔網 (Block) ➔ 反彈再次防守」的無限攻防閉環。
- 開局由對手發球或反彈球到後場，玩家使用左搖桿走位到位墊球（`calculateDigVelocity` 判定距離與方位），高拋給二傳手。
- 二傳手自動到位並托出開網高球（`overhead`）。
- 玩家助跑起跳，在空中慢動作（Bullet Time 0.28x）下觀察攔網手位置，決定下釘扣殺、大斜線避開手掌、或輕吊過網！
- 攔網手若攔到球（Roof Block），球回彈至我方後場，玩家需迅速後撤自主救球，實現真正不間斷的連續對打！

任務 3：【驗證與部署】
- 執行 `npm test` 確認 2508 測試全部通過。
- 執行 `npm run build` 確認生產打包無誤。
- 測試並回報改動成果。

請先簡要說明你的執行步驟，然後開始修改！
```

---
*本白皮書已同步保存於專案根目錄 `FREEBALL_CLAUDE_CODE_SPEC.md`。*

