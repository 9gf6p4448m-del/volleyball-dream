// 畫質設定：URL 參數解析（供真機逐項降規找上限用，禁止程式自我降級）
// ?quality=low|med|high  ?dpr=1  ?shadows=off|1024|2048|4096  ?aa=0|1  ?players=12  ?model=soldier.glb

const PRESETS = {
  low: { dpr: 1, shadowSize: 0, antialias: false },
  med: { dpr: 1.5, shadowSize: 1024, antialias: true },
  high: { dpr: 0, shadowSize: 2048, antialias: true }, // dpr 0 = 用裝置原生值
};

export function getQuality(search = window.location.search) {
  const q = new URLSearchParams(search);
  const presetName = Object.hasOwn(PRESETS, q.get('quality') ?? '') ? q.get('quality') : 'high';
  const base = PRESETS[presetName];

  const dprParam = Number.parseFloat(q.get('dpr'));
  const dpr = Number.isFinite(dprParam) && dprParam > 0
    ? Math.min(dprParam, 3)
    : (base.dpr || Math.min(window.devicePixelRatio || 1, 3));

  // 無效的 shadows 值回退到 preset 預設，不得靜默升規（會污染降規測試數據）
  const shadowSize = q.has('shadows')
    ? parseShadow(q.get('shadows'), base.shadowSize)
    : base.shadowSize;
  const antialias = q.has('aa') ? q.get('aa') !== '0' : base.antialias;

  const playersParam = Number.parseInt(q.get('players'), 10);
  const players = Number.isFinite(playersParam)
    ? Math.min(Math.max(playersParam, 1), 60)
    : 12;

  // 僅允許安全檔名，一律載入 public/models/ 下的檔案
  const modelParam = q.get('model');
  const model = modelParam && /^[\w.-]+\.glb$/.test(modelParam) ? modelParam : 'soldier.glb';

  return { preset: presetName, dpr, shadowSize, antialias, players, model };
}

function parseShadow(v, fallback) {
  if (v === 'off' || v === '0') return 0;
  const n = Number.parseInt(v, 10);
  return [512, 1024, 2048, 4096].includes(n) ? n : fallback;
}

export function describeQuality(s) {
  const shadow = s.shadowSize === 0 ? 'off' : `${s.shadowSize}`;
  return `${s.preset} · dpr ${s.dpr.toFixed(2)} · shadows ${shadow} · aa ${s.antialias ? 'on' : 'off'} · players ${s.players}`;
}
