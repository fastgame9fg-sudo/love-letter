// Higher-level online controller sitting on top of online.js.
// Host-authoritative: host broadcasts intents/events; everyone applies locally
// against a deterministic Game (shared seed).
import { createHost, joinHost } from './online.js';

export class HostController {
  constructor({ hostName, onLobbyUpdate, onStart, onIntent, onBishopAccept, onNextRound, onDraw, onChancellor }) {
    this.hostName = hostName;
    this.onLobbyUpdate = onLobbyUpdate;
    this.onIntent = onIntent;
    this.onBishopAccept = onBishopAccept;
    this.onNextRound = onNextRound;
    this.onDraw = onDraw;
    this.onChancellor = onChancellor;
    this.onStart = onStart;
    this.server = null;
    this.connectedGuests = []; // [{peerId, name}]
  }

  async start() {
    this.server = await createHost({
      hostName: this.hostName,
      onLobby: ({ code, clients }) => {
        this.connectedGuests = [...this.server.clients.values()].map(c => ({ peerId: c.conn.peer, name: c.name }));
        this.onLobbyUpdate && this.onLobbyUpdate(this.lobbyState());
      },
      onClientMsg: (peerId, data) => {
        if (data.type === 'hello') {
          this.connectedGuests = [...this.server.clients.values()].map(c => ({ peerId: c.conn.peer, name: c.name }));
          this.onLobbyUpdate && this.onLobbyUpdate(this.lobbyState());
        } else if (data.type === 'intent') {
          // Rebroadcast as action
          this.broadcastAction(data.intent);
        } else if (data.type === 'bishopAccept') {
          this.broadcastBishop(data.accept);
        } else if (data.type === 'drawRequest') {
          this.broadcastDraw();
        } else if (data.type === 'chancellor') {
          this.broadcastChancellor(data.keepUid);
        }
      },
      onDisconnect: () => {
        this.connectedGuests = [...this.server.clients.values()].map(c => ({ peerId: c.conn.peer, name: c.name }));
        this.onLobbyUpdate && this.onLobbyUpdate(this.lobbyState());
      },
    });
    return this.server.code;
  }

  lobbyState() {
    return {
      code: this.server?.code,
      host: { name: this.hostName, isHost: true },
      guests: this.connectedGuests,
    };
  }

  // Called by host when starting the game
  startGame(config) {
    const seed = Math.floor(Math.random() * 2 ** 31) >>> 0;
    const fullConfig = { ...config, seed };
    // Send slot assignment per client
    const players = fullConfig.players; // array of {id, name, isBot}
    // Host is slot 0 by convention (slot of hostName within players)
    const slotByGuest = new Map();
    const guestIds = this.connectedGuests.map(g => g.peerId);
    let gi = 0;
    for (let i = 0; i < players.length; i++) {
      if (players[i].peerId && players[i].peerId !== 'host' && !players[i].isBot) {
        // already assigned
        slotByGuest.set(players[i].peerId, i);
      }
    }
    // Broadcast config
    for (const [peerId, slot] of slotByGuest.entries()) {
      this.server.sendTo(peerId, { type: 'start', config: fullConfig, yourSlot: slot });
    }
    this.onStart && this.onStart(fullConfig, 0);
  }

  broadcastAction(intent) {
    this.server.broadcast({ type: 'action', intent });
    this.onIntent && this.onIntent(intent);
  }

  broadcastBishop(accept) {
    this.server.broadcast({ type: 'bishopAccept', accept });
    this.onBishopAccept && this.onBishopAccept(accept);
  }

  broadcastNextRound() {
    this.server.broadcast({ type: 'nextRound' });
    this.onNextRound && this.onNextRound();
  }

  broadcastDraw() {
    this.server.broadcast({ type: 'draw' });
    this.onDraw && this.onDraw();
  }

  broadcastChancellor(keepUid) {
    this.server.broadcast({ type: 'chancellor', keepUid });
    this.onChancellor && this.onChancellor(keepUid);
  }

  sendIntent(intent) { this.broadcastAction(intent); }
  sendBishop(accept) { this.broadcastBishop(accept); }
  sendNextRound() { this.broadcastNextRound(); }
  sendDraw() { this.broadcastDraw(); }
  sendChancellor(keepUid) { this.broadcastChancellor(keepUid); }
  close() { this.server?.close(); }
}

export class GuestController {
  constructor({ name, code, onLobbyUpdate, onStart, onIntent, onBishopAccept, onNextRound, onDraw, onChancellor, onDisconnect }) {
    this.name = name;
    this.code = code;
    this.onLobbyUpdate = onLobbyUpdate;
    this.onStart = onStart;
    this.onIntent = onIntent;
    this.onBishopAccept = onBishopAccept;
    this.onNextRound = onNextRound;
    this.onDraw = onDraw;
    this.onChancellor = onChancellor;
    this.onDisconnect = onDisconnect;
    this.client = null;
  }

  async start() {
    this.client = await joinHost({
      code: this.code,
      name: this.name,
      onMsg: (data) => {
        if (data.type === 'start') {
          this.yourSlot = data.yourSlot;
          this.onStart && this.onStart(data.config, data.yourSlot);
        } else if (data.type === 'action') {
          this.onIntent && this.onIntent(data.intent);
        } else if (data.type === 'bishopAccept') {
          this.onBishopAccept && this.onBishopAccept(data.accept);
        } else if (data.type === 'nextRound') {
          this.onNextRound && this.onNextRound();
        } else if (data.type === 'draw') {
          this.onDraw && this.onDraw();
        } else if (data.type === 'chancellor') {
          this.onChancellor && this.onChancellor(data.keepUid);
        } else if (data.type === 'lobby') {
          this.onLobbyUpdate && this.onLobbyUpdate(data);
        }
      },
      onConnect: () => {},
      onDisconnect: () => this.onDisconnect && this.onDisconnect(),
    });
  }

  sendIntent(intent) { this.client.send({ type: 'intent', intent }); }
  sendBishop(accept) { this.client.send({ type: 'bishopAccept', accept }); }
  sendDraw() { this.client.send({ type: 'drawRequest' }); }
  sendChancellor(keepUid) { this.client.send({ type: 'chancellor', keepUid }); }
  close() { this.client?.close(); }
}
