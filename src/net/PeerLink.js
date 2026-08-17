// Thin wrapper over PeerJS (loaded globally via a <script> tag in index.html
// — see https://peerjs.com) for establishing a direct WebRTC data channel
// between two browsers, found via a short human-typeable room code instead
// of PeerJS's long default peer IDs. PeerJS's free public broker is only
// used to help the two browsers find each other; once connected, game data
// normally flows peer-to-peer, not through any server of ours — except
// PeerJS's default ICE config is STUN-only (no TURN relay fallback), which
// only ever works when both peers can reach each other directly. Whenever
// either side is behind a NAT/firewall that direct traversal can't punch
// through (common: different ISPs, mobile networks, restrictive routers),
// the connection just hangs forever with no error on either side — this
// was confirmed with two real headless-browser instances (a first for
// this project; previously there was no way to test the actual WebRTC
// handshake at all, only reason about the code by inspection). Explicit
// TURN servers (a free public relay, so traffic routes through a third
// party when direct P2P isn't possible) fix that failure mode. Can't
// fully verify from this sandboxed environment whether these specific
// public TURN servers stay reachable/available long-term — if connecting
// still fails after this, that's the next thing to check.
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:global.relay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
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
