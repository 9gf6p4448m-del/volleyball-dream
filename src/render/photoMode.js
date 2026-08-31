// 池底卷 批2 P1：照片模式——凍結／相機／快門三支邏輯（DOM/three 依賴走注入或防禦式
// typeof 檢查，方便無瀏覽器的 `node --test` 環境直接測）。
// 崩潰自我停用：任何一步失敗都吞掉、回落成「這次沒有照片模式／這張沒拍成」，
// 絕不讓比賽本體跟著死（同 moppers.js／fireworks.js 慣例）。
//
// 牆鐘時間軸的選擇（如實記錄——凍結檔 P1 原文「暫停或至少不炸，自行選實作」）：
// 本實作選「視覺凍結、邏輯不補償」。matchLoop.js 的 frameStep 一旦偵測到 `s.photoMode`
// 就整幀早退（比 `s.replay` 還早一層），celebration/mvpShow/openingShow/lineupIntro/
// crowdAnim/moppers/fireworks 這些以 performance.now() 為準的時間軸完全沒有被呼叫，
// 畫面因此真的靜止；但它們內部記的 startedAt 等絕對時間戳沒有被平移。退出後如果凍結
// 夠久，下一幀重新呼叫這些系統時會發現「牆鐘早就過了」而直接以既有的 clamp 邏輯收尾
//（不會拋錯、不會卡死）——是「不炸」而非嚴格「暫停」，代價是換來零額外的時間平移
// 狀態需要維護。fireworks 的 update() 吃的是 delta 而非絕對時間，這支反而是真暫停
//（沒被呼叫＝完全沒有推進）。
import { createCameraControls } from '../input/cameraControls.js';

export const PHOTO_BAR_ID = 'vd-photo-bar';
// index.html 的靜態容器（畫布/偵錯角標/載入畫面）＋本模組自己的工具列——批次隱藏
// 必須繞過這幾個，否則會把畫布本身或照片模式自己的工具列一起藏起來
const HUD_SKIP_IDS = new Set(['app', 'hud', 'loading', 'fatal-error', PHOTO_BAR_ID]);

// 批次 HUD 隱藏/還原（凍結檔「一鈕隱藏/還原」）：body 直接子節點裡，除了上面的白名單
// 全部一鍵 visibility 切換。刻意不逐一改各 UI 模組的 display 邏輯——新模組天然被涵蓋，
// 不必回頭補接線；用 visibility 而非 display 是因為部分模組自己管理 display（例如
// comebackBtn 的可見性判斷），覆寫 display 會在退出時把那份狀態弄丟。
export function setHudHidden(hidden, doc = (typeof document !== 'undefined' ? document : null)) {
  try {
    if (!doc?.body?.children) return;
    for (const el of Array.from(doc.body.children)) {
      if (!el || el.tagName === 'SCRIPT') continue;
      if (el.id && HUD_SKIP_IDS.has(el.id)) continue;
      if (!el.style || !el.dataset) continue;
      if (hidden) {
        if (el.dataset.vdPrevVis === undefined) el.dataset.vdPrevVis = el.style.visibility || '';
        el.style.visibility = 'hidden';
      } else if (el.dataset.vdPrevVis !== undefined) {
        el.style.visibility = el.dataset.vdPrevVis;
        delete el.dataset.vdPrevVis;
      }
    }
  } catch {
    // 非瀏覽器環境或 DOM 例外：靜默略過，不阻塞照片模式本身
  }
}

// 相機接管：複用 cameraControls.js 的 OrbitControls 封裝（單指環繞/雙指縮放原生支援）。
// 進場即接手當下相機位姿（不重置 camera.position，只是換一個操作它的人）；建置失敗
//（無 domElement、非瀏覽器環境、three 版本不相容）回傳 null，呼叫端據此無害回落。
export function createPhotoOrbit(camera, domElement) {
  try {
    if (!camera || !domElement) return null;
    const controls = createCameraControls(camera, domElement);
    if (!controls) return null;
    return {
      controls,
      dispose() { try { controls.dispose(); } catch { /* 釋放失敗不阻塞退出 */ } },
    };
  } catch {
    return null; // 崩潰自我停用：接管失敗＝這次沒有照片模式，比賽照常
  }
}

// 快門：當幀 render 後同步 canvas.toBlob（不常駐 preserveDrawingBuffer、不改 renderer
// 設定——手動補畫一次確保 canvas 內容就是玩家眼前看到的那一幀，toBlob 讀的是這次補畫
// 的結果）。DOM 環境不足（無 toBlob，例如 node --test 無真實 canvas）時回傳 null，
// 呼叫鏈仍完整跑過 render→toBlob 這一段（見 tests/poolbottom-b2-photomode.test.mjs）。
export function capturePhoto({ renderer, scene, camera }) {
  return new Promise((resolve) => {
    try {
      renderer.render(scene, camera);
      const canvas = renderer.domElement;
      if (!canvas || typeof canvas.toBlob !== 'function') { resolve(null); return; }
      canvas.toBlob((blob) => resolve(blob ?? null), 'image/png');
    } catch {
      resolve(null); // 崩潰自我停用：拍不成功＝靜默失敗，不擋比賽、不擋退出
    }
  });
}

export function photoFilename(now = Date.now()) {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
    + `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `volleyball-dream-${stamp}.png`;
}

// 送達＝下載/分享（凍結檔用語）：優先 Web Share API（手機分享到相簿/訊息，體感比強制
// 下載好——Sawmah 永遠用手機試玩）；不支援、使用者取消、或環境不足一律落回下載連結。
// env 供測試注入假 document/navigator/URL/File，正常執行時全部落回真實全域物件。
export async function deliverPhoto(blob, filename = photoFilename(), env = {}) {
  if (!blob) return false;
  const doc = env.document ?? (typeof document !== 'undefined' ? document : null);
  const nav = env.navigator ?? (typeof navigator !== 'undefined' ? navigator : null);
  const Url = env.URL ?? (typeof URL !== 'undefined' ? URL : null);
  const FileCtor = env.File ?? (typeof File !== 'undefined' ? File : null);
  try {
    if (nav?.canShare && nav?.share && FileCtor) {
      const file = new FileCtor([blob], filename, { type: blob.type || 'image/png' });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: '排球夢' });
        return true;
      }
    }
  } catch {
    // 分享取消／不支援：不算失敗，落回下載
  }
  try {
    if (!doc?.body || !Url) return false;
    const url = Url.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = filename;
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { try { Url.revokeObjectURL(url); } catch { /* 已釋放或環境不支援 */ } }, 4000);
    return true;
  } catch {
    return false; // 崩潰自我停用：連下載都失敗＝靜默放棄，不拋給呼叫端
  }
}
