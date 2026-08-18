// Thin wrapper over PeerJS (loaded globally via a <script> tag in index.html
// — see https://peerjs.com) for establishing a direct WebRTC data channel
// between two browsers, found via a short human-typeable room code instead
// of PeerJS's long default peer IDs. PeerJS's free public broker is only
// used to help the two browsers find each other; once connected, game data
// flows peer-to-peer when possible, or relays through TURN below when a
// direct path can't be established (see ICE_CONFIG).
//
// History, in case this needs touching again - two earlier rounds both got
// this wrong in opposite directions, full detail in CLAUDE.md:
//   1. Passed a custom `config` pointing at a public demo TURN relay,
//      thinking PeerJS's default was STUN-only. `config` REPLACES PeerJS's
//      default rather than merging with it, and that public demo relay
//      turned out to be dead (shared "openrelayproject" credentials no
//      longer accepted - confirmed via ice-test.js: DNS resolved fine, but
//      the TURN server rejected the ALLOCATE request with 400).
//   2. Removed the custom config entirely, trusting PeerJS's own default -
//      but PeerJS's cloud broker doesn't actually provide a working TURN
//      relay either (this is a known, documented limitation of their free
//      public server, not specific to this project - see the peers/peerjs
//      GitHub issues). STUN-only is exactly the failure mode that was
//      being debugged in the first place: it only works when neither
//      player is behind a NAT/firewall that blocks direct traversal,
//      which is common, not an edge case.
// Fixed for real this time with the user's own free Metered.ca TURN
// account (20GB/month free tier, real credentials rather than a shared
// public demo) - verified reachable and authenticating via ice-test.js
// before shipping.
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username: 'e71f1a3504bea05e9a295cd1', credential: 'D6HWx0d7nlG/MRqD' },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: 'e71f1a3504bea05e9a295cd1', credential: 'D6HWx0d7nlG/MRqD' },
    { urls: 'turn:global.relay.metered.ca:443', username: 'e71f1a3504bea05e9a295cd1', credential: 'D6HWx0d7nlG/MRqD' },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'e71f1a3504bea05e9a295cd1', credential: 'D6HWx0d7nlG/MRqD' },
  ],
};

const ROOM_PREFIX = 'throne-wars-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
// without this, a connection that never opens (see the ICE_CONFIG comment
// above) just hangs the "Ждём соперника…"/"Подключаемся…" status forever
// with no feedback at all - better to fail loudly after a wait than never
const CONNECT_TIMEOUT_MS = 25000;

function randomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export function hostRoom({ onStatus } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    function attempt(triesLeft) {
      const code = randomCode();
      const peer = new Peer(ROOM_PREFIX + code, { debug: 0, config: ICE_CONFIG });
      peer.on('open', () => {
        onStatus?.(`Комната создана: ${code}. Ждём соперника…`);
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          peer.destroy();
          reject(new Error('Соперник не подключился (истекло время ожидания). Проверьте код и повторите попытку.'));
        }, CONNECT_TIMEOUT_MS);
        peer.on('connection', (conn) => {
          conn.on('open', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ code, conn, peer });
          });
        });
      });
      peer.on('error', (err) => {
        if (settled) return;
        if (err && err.type === 'unavailable-id' && triesLeft > 0) { peer.destroy(); attempt(triesLeft - 1); return; }
        settled = true;
        reject(err);
      });
    }
    attempt(5);
  });
}

export function joinRoom(code, { onStatus } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const peer = new Peer(undefined, { debug: 0, config: ICE_CONFIG });
    peer.on('open', () => {
      onStatus?.('Подключаемся…');
      const conn = peer.connect(ROOM_PREFIX + code.trim().toUpperCase(), { reliable: true });
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        peer.destroy();
        reject(new Error('Не удалось подключиться (истекло время ожидания). Проверьте код и повторите попытку.'));
      }, CONNECT_TIMEOUT_MS);
      conn.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ code, conn, peer });
      });
      conn.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
    peer.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

// wraps a raw PeerJS DataConnection with a small send/onMessage interface
export function makeLink(conn, { onClose } = {}) {
  const listeners = [];
  conn.on('data', (msg) => { for (const fn of listeners) fn(msg); });
  conn.on('close', () => onClose?.());
  return {
    send(msg) { if (conn.open) conn.send(msg); },
    onMessage(fn) { listeners.push(fn); },
    close() { conn.close(); },
  };
}
