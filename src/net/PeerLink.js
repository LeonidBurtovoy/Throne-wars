// Thin wrapper over PeerJS (loaded globally via a <script> tag in index.html
// — see https://peerjs.com) for establishing a direct WebRTC data channel
// between two browsers, found via a short human-typeable room code instead
// of PeerJS's long default peer IDs. PeerJS's free public broker is only
// used to help the two browsers find each other; once connected, game data
// flows peer-to-peer, not through any server of ours.

const ROOM_PREFIX = 'throne-wars-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

function randomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export function hostRoom({ onStatus } = {}) {
  return new Promise((resolve, reject) => {
    function attempt(triesLeft) {
      const code = randomCode();
      const peer = new Peer(ROOM_PREFIX + code, { debug: 0 });
      peer.on('open', () => {
        onStatus?.(`Комната создана: ${code}. Ждём соперника…`);
        peer.on('connection', (conn) => {
          conn.on('open', () => resolve({ code, conn, peer }));
        });
      });
      peer.on('error', (err) => {
        if (err && err.type === 'unavailable-id' && triesLeft > 0) { peer.destroy(); attempt(triesLeft - 1); return; }
        reject(err);
      });
    }
    attempt(5);
  });
}

export function joinRoom(code, { onStatus } = {}) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(undefined, { debug: 0 });
    peer.on('open', () => {
      onStatus?.('Подключаемся…');
      const conn = peer.connect(ROOM_PREFIX + code.trim().toUpperCase(), { reliable: true });
      conn.on('open', () => resolve({ code, conn, peer }));
      conn.on('error', (err) => reject(err));
    });
    peer.on('error', (err) => reject(err));
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
