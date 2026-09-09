# 《排球夢》Free Ball 街機物理手感重構完整技術規格書
> **給 Claude Code 的全整合導航文件與優化指南**
> 本檔案整合了所有重構代碼、數學公式、物理彈道模型、雙環收斂指示器、打擊頓幀與行動端雙手操作架構，可直接作為 Claude Code 進行後續深化優化與整合入主聯賽的規格書。

---

## 1. 專案背景與重構核心哲學

### 1.1 現狀問題與痛點
原先《排球夢》的核心手感較為乾硬，原因在於：
1. **磁吸式/固定判定窗**：球員接近球時，依賴狀態機與鎖步倒數，缺乏真實剛體碰撞與自主搶位的成就感。
2. **缺乏空間深度提示**：在手機 2D 螢幕上看 3D 排球下落，難以判斷垂直高度與抵達摸高點的時間差。
3. **無助跑動能起跳**：起跳高度固定，跑動與起跳脫節。
4. **缺乏下釘衝擊反饋**：扣球缺乏爆發力與打擊頓幀（Hitstop）。

### 1.2 對標 Steam《Free Ball》四大不妥協原則
1. **Zero Magnetic Snapping（零磁吸）**：球體始終由牛頓物理推進，完全依靠初速向量、重力加速度與碰撞反彈。
2. **Two-Step Kinetic Jump（助跑動能起跳）**：水平移動速度線性轉化為垂直起跳高度 $H_{apex} = 1.05 + v_{run} \times 0.12\text{ m}$。
3. **Concentric Convergence Rings（雙環收斂光圈）**：
   - 地面投影環（Shadow Ring）：標定球體在場上的正下方 XZ 座標。
   - 收斂時機環（Convergence Ring）：隨球體下落向內坍縮，在球落入摸高點瞬間以 1:1 精準閉合，化身節奏遊戲般的精確反饋。
4. **Hitstop & Screen Shake（衝擊定格與螢幕震動）**：Perfect 扣殺瞬間觸發 38ms 畫面微凍結（Hitstop）、相機高頻震動與手機觸覺震動，打出向下釘穿地面的極速暴扣。

---

## 2. 專案架構與檔案目錄

所有新增的 Free Ball 模組均保持與主聯賽 2505 條單元測試的絕對隔離，透過 `?mode=freeball` 參數進入：

```
src/
├── sim/
│   └── physicsMath.js          # [模組 1] 彈道發射速度求解器、解析落點預測、Timing 窗口判定
├── render/
│   ├── ballIndicator.js        # [模組 2] 地面投影雙環時機收斂光圈
│   ├── freeballJuice.js        # [模組 3] Hitstop 凍結頓幀、相機隨機震動、手機震動
│   └── facing.js               # [既有] approachYaw, shortestArc (朝向平滑旋轉)
├── input/
│   └── freeballControls.js     # [模組 4] 行動端雙拇指控制器（左側動態浮動搖桿、右側情境動作按鈕）
├── app/
│   └── freeballSandbox.js      # [主場景] 獨立練習沙盒模式、對打訓練反彈牆、球員模型與主迴圈
└── main.js                     # 入口路由擴充：?mode=freeball -> runFreeballSandbox(ctx)
```

---

## 3. 各核心模組完整實作與細節

### 模組 1：`src/sim/physicsMath.js` (物理數學引擎)
純數學無依賴，支援 Node.js 單元測試，負責初速逆解、拋物線解析求解與扣球向量。

```javascript
export const TIMING_GRADE = {
  PERFECT: 'PERFECT',
  GOOD: 'GOOD',
  EARLY: 'EARLY',
  LATE: 'LATE',
  MISS: 'MISS',
};

/**
 * 彈道發射速度求解器
 * 給定起點、目標點、頂點高度與重力，逆解初速向量與飛行時間
 */
export function calculateLaunchVelocity(start, target, apexHeight, gravity = 9.81) {
  const g = Math.abs(gravity);
  const effectiveApex = Math.max(apexHeight, Math.max(start.y, target.y) + 0.1);

  const vy = Math.sqrt(2 * g * Math.max(effectiveApex - start.y, 0.01));
  const tUp = vy / g;
  const tDown = Math.sqrt(2 * Math.max(effectiveApex - target.y, 0.01) / g);
  const tTotal = Math.max(tUp + tDown, 0.05);

  return {
    vx: (target.x - start.x) / tTotal,
    vy,
    vz: (target.z - start.z) / tTotal,
    time: tTotal,
  };
}

/**
 * 解析落點預測器
 */
export function predictLandingAnalytical(pos, vel, groundY = 0, gravity = 9.81) {
  const g = Math.abs(gravity);
  const deltaY = pos.y - groundY;
  const discriminant = vel.vy * vel.vy + 2 * g * deltaY;
  if (discriminant < 0) {
    return { x: pos.x, z: pos.z, time: 0 };
  }
  const t = (vel.vy + Math.sqrt(discriminant)) / g;
  const safeT = Math.max(0, t);
  return {
    x: pos.x + vel.vx * safeT,
    z: pos.z + vel.vz * safeT,
    time: safeT,
  };
}

/**
 * 扣殺下釘速度計算
 */
export function calculateSpikeVelocity(from, targetAim, baseSpeed = 18, timingScore = 1.0, timingGrade = TIMING_GRADE.PERFECT) {
  const dx = targetAim.x - from.x;
  const dz = targetAim.z - from.z;
  const horizDist = Math.hypot(dx, dz) || 1;

  let speedMultiplier = 1.0;
  if (timingGrade === TIMING_GRADE.PERFECT) speedMultiplier = 1.35;
  else if (timingGrade === TIMING_GRADE.GOOD) speedMultiplier = 1.0 + (timingScore - 0.5) * 0.3;
  else speedMultiplier = 0.65;

  const finalSpeed = baseSpeed * speedMultiplier;
  const flightTime = Math.max(horizDist / finalSpeed, 0.16);
  const gravityCompensation = 0.5 * 9.81 * flightTime;
  const downwardPush = (0 - from.y) / flightTime;
  const vy = downwardPush + gravityCompensation;

  return {
    vx: (dx / horizDist) * finalSpeed * 0.9,
    vy,
    vz: (dz / horizDist) * finalSpeed * 0.9,
    speed: finalSpeed,
  };
}
```

---

### 模組 2：`src/render/ballIndicator.js` (雙環收斂指示器)
- **內環（投影底點）**：半徑隨高度微幅外擴，透明度反比於高度。
- **外環（收斂時機）**：半徑正比於「球心與目標摸高點」之垂直落差。
- **重疊判定**：當兩環半徑差 $< 0.12$ 且球正在下墜時，外環變為翠綠色（PERFECT）；若差 $< 0.32$ 則為金色（GOOD）。

```javascript
import * as THREE from 'three';

const COLOR_PERFECT = 0x38ef7d;
const COLOR_GOOD = 0xffd166;
const COLOR_NORMAL = 0x6ee7ff;
const COLOR_MISS = 0xff4b4b;

export function createBallIndicator(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const innerGeo = new THREE.RingGeometry(0.32, 0.42, 32);
  const innerMat = new THREE.MeshBasicMaterial({ color: COLOR_NORMAL, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  const innerRing = new THREE.Mesh(innerGeo, innerMat);
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.02;
  group.add(innerRing);

  const outerGeo = new THREE.RingGeometry(0.9, 1.0, 32);
  const outerMat = new THREE.MeshBasicMaterial({ color: COLOR_NORMAL, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const outerRing = new THREE.Mesh(outerGeo, outerMat);
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.022;
  group.add(outerRing);

  return {
    update(ballPos, targetHitY = 2.6, vy = 0) {
      if (!ballPos || ballPos.y < 0.1) {
        group.visible = false;
        return;
      }
      group.visible = true;
      group.position.x = ballPos.x;
      group.position.z = ballPos.z;

      const innerScale = 1.0 + Math.min(ballPos.y, 6.0) * 0.06;
      innerRing.scale.set(innerScale, innerScale, 1);

      const heightAboveTarget = ballPos.y - targetHitY;
      const isFalling = vy < 0;
      const convergenceRatio = heightAboveTarget > 0 ? (1.0 + heightAboveTarget * 0.65) : Math.max(0.4, 1.0 + heightAboveTarget * 0.4);
      const outerScale = innerScale * convergenceRatio;
      outerRing.scale.set(outerScale, outerScale, 1);

      const diff = Math.abs(outerScale - innerScale);
      if (diff < 0.12 && isFalling) {
        outerMat.color.setHex(COLOR_PERFECT);
        innerMat.color.setHex(COLOR_PERFECT);
      } else if (diff < 0.32 && isFalling) {
        outerMat.color.setHex(COLOR_GOOD);
        innerMat.color.setHex(COLOR_GOOD);
      } else {
        outerMat.color.setHex(COLOR_NORMAL);
        innerMat.color.setHex(COLOR_NORMAL);
      }
    }
  };
}
```

---

### 模組 3：`src/render/freeballJuice.js` (擊球頓幀與打擊感)
- **Hitstop 凍結幀**：Perfect 擊球瞬間，主迴圈暫停模擬 38ms，僅渲染畫面。
- **相機高頻隨機微震**：提供振幅衰減的隨機 offset。
- **手機震動（Haptics）**：串接 `navigator.vibrate`（由 `src/ui/haptics.js` 封裝，iOS Safari 自動優雅降級）。

---

### 模組 4：`src/input/freeballControls.js` (行動端雙手觸控控制器)
- **左半螢幕**：動態浮動搖桿。在手指碰觸螢幕的瞬間於該處建立錨點，拖曳輸出歸一化位移向量。
- **右半螢幕**：情境動作按鈕（Context Button）。
  - 地面：點擊觸發「助跑起跳（Approach Jump）」。
  - 空中：狀態即時切換為「⚡ 扣殺（SPIKE）」，且可向任意方向滑動進行拖曳瞄準（Drag-to-aim）。
- **觸控優化**：設置 `touch-action: none` 防止頁面捲動手勢。

---

### 模組 5：`src/app/freeballSandbox.js` (物理沙盒與渲染主迴圈)
關鍵注意事項與本次排查修復的點：
1. **模型朝向公式（Orientation Alignment）**：
   - 專案幾何球員模型（`geoCharacter`）在無旋轉時面向 $+Z$。
   - 地面移動時，正確面向角為 `targetYaw = Math.atan2(player.vx, player.vz)`。
   - 轉身平滑採用 `approachYaw(player.facingAngle, targetYaw, dt)`，杜絕 360 度亂轉。
   - 空中扣球時，面向對網標靶或瞄準方向 `Math.atan2(aimDir.x, aimDir.z)`。
2. **骨架動畫與 InstancedMesh 池（Geo Pool）**：
   - 角色創建後呼叫 `pool.finishColors()`。
   - 動作觸發：起跳調用 `animator.trigger('windup')`；扣球調用 `animator.trigger('spike')`；落地調用 `animator.trigger('landSoft')`。
   - 每幀執行 `animator.update(dt, speed, lateral)`，更新 `playerRig.root.updateMatrixWorld(true)`，寫入 `pool.writeMatrix()` 並呼叫 `pool.markDirty()`。
3. **排球外觀同步（Ball View）**：
   - 調用 `ballView.sync(ballSim, 1.0, dt, false, isSpiked ? 0.8 : 0)`，自動獲取正確排球紋理、上旋自轉、貼地黑影與扣球金色火花拖尾。
4. **對打牆循環（Wall Practice Loop）**：
   - 在 $z = -2.5$ 建立彈性牆與標靶，球砸牆後自動回彈反拋，形成單人練球 Loop。

---

## 4. 給 Claude Code 的後續優化建議與工單規劃

若你要接續使用 Claude Code 進行工程深化，以下為推薦執行的三個 Step：

### Step 1: 將 Free Ball 手感移植入正式比賽（`matchLoop.js`）
- 目前此機制運行於 `?mode=freeball` 沙盒中。
- 目標：在 `src/input/matchControls.js` 中，將原本彈出式的 `MATCH_ACTION` 選單改為情境式的「浮動左搖桿跑位 + 右按鍵助跑/起跳/扣殺」。
- 扣球判定直接接入 `src/sim/physicsMath.js` 的 `calculateSpikeVelocity`，時機圈接入 `src/render/ballIndicator.js`。

### Step 2: 攔網（Blocking）物理化
- 目前對打牆充當假想防守球員。
- 引入攔網手真實 Collider（手掌寬度與頂空），扣球球路若撞擊攔網手掌，依入射角計算物理反彈，產生爽快攔死或擦手出界。

### Step 3: 手感數值微調（Juice Tweaking）
- 可調節參數建議：
  - `freeballControls.js`: 浮動搖桿半徑（預設 64px）。
  - `physicsMath.js`: 時機窗寬度（Perfect: $\pm 0.08\text{s}$, Good: $\pm 0.18\text{s}$）。
  - `freeballJuice.js`: 頓幀時長（預設 38ms）。

---
*本技術規格書已同步保存於專案根目錄 `FREEBALL_CLAUDE_CODE_SPEC.md`。*
