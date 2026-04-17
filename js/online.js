// Simple online multiplayer using PeerJS (WebRTC) — host authoritative.
// Host creates a room code; up to 6 clients connect.
// The host runs the full Game and broadcasts state on every change.

const PEER_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';

let PeerLib = null;
async function loadPeer() {
  if (PeerLib) return PeerLib;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PEER_CDN;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  PeerLib = window.Peer;
  return PeerLib;
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const PEER_PREFIX = 'loveletter-';

export async function createHost({ hostName, onLobby, onClientMsg, onDisconnect }) {
  await loadPeer();
  const code = makeCode();
  const peer = new PeerLib(PEER_PREFIX + code, { debug: 1 });
  const clients = new Map(); // conn.peer -> { conn, name, slot }
  await new Promise((resolve, reject) => {
    peer.on('open', resolve);
    peer.on('error', reject);
  });
  peer.on('connection', conn => {
    conn.on('open', () => {
      clients.set(conn.peer, { conn, name: 'Invité', slot: null });
      onLobby && onLobby({ code, clients: [...clients.values()].map(c => c.name) });
    });
    conn.on('data', data => {
      const c = clients.get(conn.peer);
      if (data.type === 'hello') { c.name = data.name; onLobby && onLobby({ code, clients: [...clients.values()].map(c => c.name) }); }
      onClientMsg && onClientMsg(conn.peer, data);
    });
    conn.on('close', () => {
      clients.delete(conn.peer);
      onDisconnect && onDisconnect(conn.peer);
    });
  });
  return {
    code,
    peer,
    clients,
    broadcast(msg) { for (const c of clients.values()) c.conn.send(msg); },
    sendTo(peerId, msg) { clients.get(peerId)?.conn.send(msg); },
    close() { peer.destroy(); },
  };
}

export async function joinHost({ code, name, onMsg, onConnect, onDisconnect }) {
  await loadPeer();
  const peer = new PeerLib({ debug: 1 });
  await new Promise((resolve, reject) => {
    peer.on('open', resolve);
    peer.on('error', reject);
  });
  const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
  await new Promise((resolve, reject) => {
    conn.on('open', () => { conn.send({ type: 'hello', name }); resolve(); });
    conn.on('error', reject);
    setTimeout(() => reject(new Error('Connexion échouée (code introuvable ?)')), 8000);
  });
  conn.on('data', data => onMsg && onMsg(data));
  conn.on('close', () => onDisconnect && onDisconnect());
  onConnect && onConnect();
  return {
    peer,
    conn,
    send(msg) { conn.send(msg); },
    close() { peer.destroy(); },
  };
}
