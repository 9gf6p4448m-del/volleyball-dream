// 多人連線卷 批3 —— WebRTC 手動貼碼傳輸（拍板 7：零伺服器）
//
// ★ 本檔是 src/net/ 裡**唯一**准碰瀏覽器 API（RTCPeerConnection／navigator）的檔 ★
//   ——A3-2 的靜態掃描測試在機械執行這條。鎖步邏輯（lockstep.js）與編解碼（codec.js）
//   都是純資料，headless 測試不需要瀏覽器。
//
// 流程（手動 signaling，訊息用 LINE 之類的管道人肉傳遞）：
//   主機 hostCreate() → 產生「邀請碼」→ 傳給對方
//   客機 guestJoin(邀請碼) → 產生「回覆碼」→ 傳回主機
//   主機 accept(回覆碼) → DataChannel 開通（ordered+reliable＝鎖步要的保序交付）
//
// 打洞邊界（凍結檔 §二 誠實揭露）：只借 Google 公開 STUN、無 TURN 中繼——
// 雙方都在對稱型 NAT 後會連不上；那是這個方案的邊界，不是 bug。
// 連不上時 iceconnectionstatechange 會走到 failed，onClose 帶 reason 明講。
import { encodeMsg, decodeMsg } from './codec.js';

const RTC_CONFIG = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};
const GATHER_TIMEOUT_MS = 4000; // ICE 蒐集上限：蒐滿或逾時就出碼（逾時＝用已蒐到的）

// ---- 連線碼編碼：SDP → deflate-raw → base64url（目標 ≤4000 字元，A3-3）----
async function compressText(text) {
  const bytes = new TextEncoder().encode(text);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = await new Response(stream).arrayBuffer();
  return b64urlFromBytes(new Uint8Array(buf));
}
async function decompressText(code) {
  const bytes = bytesFromB64url(code);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}
function b64urlFromBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function bytesFromB64url(code) {
  const bin = atob(code.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function descToCode(desc) {
  return compressText(JSON.stringify({ t: desc.type, s: desc.sdp }));
}
async function codeToDesc(code) {
  const o = JSON.parse(await decompressText(code.trim()));
  if (!o?.t || !o?.s) throw new Error('連線碼格式不對');
  return { type: o.t, sdp: o.s };
}

// 等 ICE 蒐集完成（或逾時），回傳含 candidates 的完整 localDescription
function gatheredDescription(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') { resolve(pc.localDescription); return; }
    const timer = setTimeout(() => resolve(pc.localDescription), GATHER_TIMEOUT_MS);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(timer); resolve(pc.localDescription); }
    });
  });
}

function wireChannel(pc, ch, handlers, api) {
  ch.onopen = () => handlers.onOpen?.(api);
  ch.onmessage = (e) => {
    const msg = decodeMsg(e.data);
    if (msg) handlers.onMessage?.(msg);
  };
  ch.onclose = () => handlers.onClose?.('channel-closed');
  pc.addEventListener('iceconnectionstatechange', () => {
    if (pc.iceConnectionState === 'failed') handlers.onClose?.('ice-failed');
    if (pc.iceConnectionState === 'disconnected') handlers.onDisrupt?.();
    if (pc.iceConnectionState === 'connected') handlers.onRecover?.();
  });
}

function makeApi(pc, ch) {
  return {
    send(obj) {
      if (ch.readyState === 'open') ch.send(encodeMsg(obj));
    },
    get open() { return ch.readyState === 'open'; },
    close() { try { ch.close(); } catch { /* 已關 */ } try { pc.close(); } catch { /* 已關 */ } },
  };
}

// 主機端：回 { inviteCode, accept(answerCode) }；channel 開通時 handlers.onOpen(api)
export async function hostCreate(handlers = {}) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const ch = pc.createDataChannel('vd', { ordered: true });
  const api = makeApi(pc, ch);
  wireChannel(pc, ch, handlers, api);
  await pc.setLocalDescription(await pc.createOffer());
  const desc = await gatheredDescription(pc);
  return {
    inviteCode: await descToCode(desc),
    async accept(answerCode) {
      await pc.setRemoteDescription(await codeToDesc(answerCode));
    },
    api,
  };
}

// 客機端：吃邀請碼、回 { answerCode }；channel 開通時 handlers.onOpen(api)
export async function guestJoin(inviteCode, handlers = {}) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  let api = null;
  pc.ondatachannel = (e) => {
    api = makeApi(pc, e.channel);
    wireChannel(pc, e.channel, handlers, api);
  };
  await pc.setRemoteDescription(await codeToDesc(inviteCode));
  await pc.setLocalDescription(await pc.createAnswer());
  const desc = await gatheredDescription(pc);
  return {
    answerCode: await descToCode(desc),
    // 表單審視（08-28）：lobby 返回鍵要能收掉「等主機開賽」中的連線——
    // 沒這把手，玩家按返回後 pc 還掛著，重新加入會有兩條半死的連線搶訊息
    close() { try { pc.close(); } catch { /* 已關 */ } },
  };
}
