// Phase 4.6 §2 — 重演舞台：結算頁（DOM 層、主賽場不在場）的全編制重演。
//
// 範式沿 ritualStage／beatStage：獨立 renderer/canvas、WebGL 失敗＝建構丟例外（呼叫端
// 退化文字紀錄卡）、dispose 慣例齊全。與那兩者的差別是量級——這裡是十二人＋球＋
// 場地線＋網，所以**直接重用主賽場模組**（matchView/ballView/court/cameraRig），
// 不另建一套：重演的人必須和比賽中的人是同一批像素，否則「這是我打的那顆球」的
// 說服力就沒了。
//
// **場館＝不做**（拍板）：暗場＋球場光池，人與球是唯一亮點。理由入卷：冠軍點發生在
// 冠軍館，用常規館幾何＝錯棚；搬冠軍館穹頂＝為一顆球扛全遊戲最重場景。
// 回放是記憶，不是現場重現——與 ritualStage 聚光／幕三坦白光帶／夜賽剪影同一套語彙。
//
// 重演過程**零 sim 寫入**：吃的是 rallyTape 重演器自己的 state 副本，不進 Intent/rand
// 路徑，也不碰任何 career 存檔。
import * as THREE from 'three';
import { SIM_DT } from '../sim/constants.js';
import { getQuality } from './quality.js';
import { createCourt } from './court.js';
import { createMatchView } from './matchView.js';
import { createBallView } from './ballView.js';
import { createCameraRig } from './cameraRig.js';
import { createRallyPlayer } from '../app/rallyTape.js';
import { buildDirectorScript, stepAtExact, shotAt } from './replayDirector.js';
import { createBeatTimeline, driveTimeline } from '../ui/presentation.js';

const MAX_DT = 0.1;

// 暗場光池（球場範圍的地面光池；夜賽聚光語彙的簡化版）
function buildLights(scene) {
  scene.add(new THREE.HemisphereLight(0x24334d, 0x05070c, 0.28));
  // 一盞高位聚光罩住球場（強度經實跑截圖校正：900 檔地板被打成一片橘＝場館感
  // 回來了，與「暗場光池」的意圖相反——記憶只留人與球）
  const key = new THREE.SpotLight(0xfff1d0, 430, 34, 0.5, 0.72, 1.15);
  key.position.set(2.5, 13, 6);
  key.target.position.set(0, 0.8, 0);
  scene.add(key);
  scene.add(key.target);
  const fill = new THREE.DirectionalLight(0x9ec4ff, 0.3);
  fill.position.set(-6, 5, -8);
  scene.add(fill);
  // 光暈疊在地板之上（不是之下——貼在 y<0 會被地板整片蓋掉）
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(11, 48),
    new THREE.MeshBasicMaterial({ color: 0x8fb6ff, transparent: true, opacity: 0.07 }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.006;
  scene.add(pool);
  return { key, fill, pool };
}

// 建重演舞台。tape＝rallyTape 卷（v2 或舊格式皆可）。
// 回傳 { el, script, play, pause, skip, dispose, stats }；WebGL 失敗＝throw。
export async function createReplayStage({ tape, width = 640, height = 360, onDone = null } = {}) {
  const script = buildDirectorScript(tape);
  const player = createRallyPlayer(tape);
  const quality = getQuality();

  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'width:min(640px, 96vw)', 'margin:0 auto', 'position:relative',
    'border-radius:14px', 'overflow:hidden', 'background:#04060c',
  ].join(';');

  const renderer = new THREE.WebGLRenderer({ antialias: quality.antialias, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = quality.shadowSize > 0;
  renderer.domElement.style.cssText = 'width:100%;height:auto;display:block';
  wrap.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060c);
  scene.fog = new THREE.Fog(0x04060c, 16, 46);
  const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 90);

  const lights = buildLights(scene);
  const court = createCourt(scene, quality);
  // 暗場地板（重用 W4 三館制的換色把手，不另建一套材質）：常規館的橘色木地板
  // 在聚光下會亮成一整片，把「暗場」吃掉
  court.setFloorPalette({ zone: 0x0e1626, court: 0x18243c });
  const ballView = createBallView(scene, quality);
  // 十二人：吃重演器自己的 state（唯讀）；錨＝腳本第一顆鏡頭的主體
  const anchor0 = script.shots[0]?.cam.anchorId ?? Object.keys(player.state.players)[0];
  // 「你·」前綴與足下光圈標的是**玩家本人**（卷裡錄的受控者），不是鏡頭錨點——
  // 導播會把鏡頭錨到各種人身上，錨點跟著標「你」會把別人認成自己
  const heroId = tape.steps?.find((st) => st.c)?.c ?? anchor0;
  const matchView = await createMatchView(scene, quality, player.state, heroId);
  const rig = createCameraRig(camera, anchor0);

  // 快轉到開場起點（不渲染）：發球前的佈陣等待不是戲（導播腳本 skipTo）
  player.fastForward(script.skipTo);

  let frames = 0;
  let elapsedSec = 0;
  let lastNow = null;
  let curAnchor = anchor0;

  // 一幀：把重演推到腳本指定的步、套鏡位、渲染。**絕對式 apply**（吃 t 定狀態），
  // 這是演出時鐘「跳過＝播完終態逐值一致」的前提（presentation.js 契約）
  function apply(t) {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const dt = lastNow === null ? 1 / 60 : Math.min((now - lastNow) / 1000, MAX_DT);
    lastNow = now;
    elapsedSec += dt;
    frames += 1;

    const exact = stepAtExact(script, t);
    const target = Math.floor(exact);
    const from = player.index;
    const frameEvents = [];
    while (player.index < target && !player.done) frameEvents.push(...player.step());
    const jumped = player.index - from > 60; // 跳過／快轉：不是逐幀播出來的

    const shot = shotAt(script, player.index);
    if (shot) {
      if (shot.cam.anchorId && shot.cam.anchorId !== curAnchor) {
        curAnchor = shot.cam.anchorId;
        rig.setPlayerId(curAnchor); // 鏡頭錨；matchView 的 highlight 恆是玩家本人
      }
      rig.setSigBeat(shot.cam.mode === 'sig' ? shot.cam.sig : null);
      rig.setSetScan(shot.cam.mode === 'sset');
      // 特寫段收掉頭上標籤（回放是記憶不是 HUD）
      matchView.setTagsVisible(shot.cam.mode !== 'sig');
    }

    const alpha = Math.min(Math.max(exact - target, 0), 1);
    const state = player.state;
    court.update(dt, state.ball); // 觸網漣漪（主賽場同一套；純視覺）
    matchView.sync(state, alpha, dt, frameEvents);
    ballView.sync(state.ball, alpha, dt,
      state.rally?.profile === 'serve' && state.rally?.serveStyle === 'float');
    rig.update(state, alpha, dt);
    // 跳過＝定格終態必須連鏡頭一起到位：rig 內建過場插值（TRANSITION_SEC）與三人稱
    // 跟隨平滑是時間積分的，只呼叫一次會停在半路——大跳時多跑幾拍讓它收斂
    // （演出時鐘契約：finish() 與播完逐值一致）
    if (jumped) for (let i = 0; i < 6; i += 1) rig.update(state, alpha, 0.1);
    // 重演鏡位拉遠（實跑截圖校正）：sig 三構圖是為「賽中死球窗、位置已分散」調的，
    // 重演任意時刻套用會把鏡頭插進別人後腦。沿視線後退＝構圖不變、只是站遠一點看
    // ——比為重演另開一套鏡位常數乾淨（cameraRig 的賽中手感一格不動）
    const pull = shot?.cam.pullback ?? 0;
    if (pull > 0) {
      const dir = camera.getWorldDirection(new THREE.Vector3());
      camera.position.addScaledVector(dir, -pull);
    }
    renderer.render(scene, camera);
  }

  const timeline = createBeatTimeline([{ dur: script.totalMs, apply }]);
  let drive = null;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onDone?.();
  };

  apply(0); // 首幀：立刻有畫面（不等 rAF）

  return {
    el: wrap,
    script,
    get playing() { return drive !== null && !done; },
    play() {
      if (drive || done) return;
      lastNow = null;
      drive = driveTimeline(timeline, {
        onDone() { drive = null; finish(); },
      });
    },
    pause() {
      drive?.stop();
      drive = null;
    },
    // 跳過＝定格終態（與播完逐值一致——演出時鐘契約）
    skip() {
      if (drive) { drive.skip(); drive = null; return; }
      timeline.finish();
      finish();
    },
    // §2-4 效能資料收集（非閘門）：重演中的平均 FPS
    stats() {
      return { frames, seconds: elapsedSec, fps: elapsedSec > 0 ? frames / elapsedSec : 0 };
    },
    dispose() {
      drive?.stop();
      drive = null;
      court.dispose?.();
      lights.pool.geometry.dispose();
      lights.pool.material.dispose();
      scene.traverse((o) => {
        if (o.isMesh || o.isPoints || o.isLine || o.isSprite) {
          o.geometry?.dispose?.();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose?.());
          else m?.map?.dispose?.();
          if (!Array.isArray(m)) m?.dispose?.();
        }
      });
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss?.();
      wrap.replaceChildren();
    },
  };
}

// 真機 FPS 取樣（§2-4 三段量測：進重演前／重演中／退出後）——牆鐘 rAF 數幀，
// 不干擾任何狀態。回傳 Promise<fps>
export function sampleFps(ms = 1000) {
  return new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => {
      n += 1;
      const dt = performance.now() - t0;
      if (dt >= ms) resolve((n * 1000) / dt);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
