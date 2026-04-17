// Entry point — handles setup (local + online) and wires game start.
import { initSetup, startGame, applyRemoteIntent, applyRemoteBishop, applyRemoteDraw, applyRemoteChancellor, startNextRound, showScreen, getGame } from './ui.js';
import { HostController, GuestController } from './online-controller.js';

const $ = (s) => document.querySelector(s);

let hostCtrl = null;
let guestCtrl = null;

window.addEventListener('DOMContentLoaded', () => {
  initSetup({ onStart: (config) => startGame(config) });
  wireTabs();
  wireOnlineSetup();
});

// ===== Tabs =====
function wireTabs() {
  const tabs = document.querySelectorAll('.setup-tabs .tab-btn');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    if (t.dataset.tab === 'local') {
      $('#local-setup').classList.remove('hidden');
      $('#online-setup').classList.add('hidden');
    } else {
      $('#local-setup').classList.add('hidden');
      $('#online-setup').classList.remove('hidden');
    }
  }));

  const onlineTabs = document.querySelectorAll('.online-tabs .tab-btn');
  onlineTabs.forEach(t => t.addEventListener('click', () => {
    onlineTabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    if (t.dataset.onlineTab === 'create') {
      $('#create-panel').classList.remove('hidden');
      $('#join-panel').classList.add('hidden');
    } else {
      $('#create-panel').classList.add('hidden');
      $('#join-panel').classList.remove('hidden');
    }
  }));

  // Online mode buttons
  document.querySelectorAll('#online-mode-grid .mode-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#online-mode-grid .mode-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });

  // Bots count
  document.querySelectorAll('#bots-count button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#bots-count button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });
}

// ===== Online setup =====
function wireOnlineSetup() {
  $('#create-room-btn').addEventListener('click', hostCreateRoom);
  $('#join-room-btn').addEventListener('click', guestJoinRoom);
  $('#start-online-btn').addEventListener('click', hostStartGame);
  $('#copy-code-btn').addEventListener('click', () => {
    const code = $('#room-code-display').textContent;
    navigator.clipboard?.writeText(code);
    $('#copy-code-btn').textContent = 'Copié ✓';
    setTimeout(() => ($('#copy-code-btn').textContent = 'Copier'), 1500);
  });
  $('#room-code-input').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  });
}

async function hostCreateRoom() {
  const btn = $('#create-room-btn');
  btn.disabled = true; btn.textContent = 'Création…';
  const hostName = ($('#host-name').value || 'Hôte').slice(0, 16);
  try {
    hostCtrl = new HostController({
      hostName,
      onLobbyUpdate: renderLobbyHost,
    });
    const code = await hostCtrl.start();
    $('#room-code-display').textContent = code;
    $('#lobby-host').classList.remove('hidden');
    btn.classList.add('hidden');
    renderLobbyHost(hostCtrl.lobbyState());
  } catch (e) {
    alert('Erreur : ' + e.message);
    btn.disabled = false; btn.textContent = 'Créer la salle';
  }
}

function renderLobbyHost(state) {
  const list = $('#lobby-players');
  list.innerHTML = '';
  const hostRow = document.createElement('div');
  hostRow.className = 'lobby-player host me';
  hostRow.textContent = state.host.name + ' (toi)';
  list.appendChild(hostRow);
  state.guests.forEach(g => {
    const row = document.createElement('div');
    row.className = 'lobby-player';
    row.textContent = g.name;
    list.appendChild(row);
  });
}

async function hostStartGame() {
  const mode = document.querySelector('#online-mode-grid .mode-btn.active').dataset.onlineMode;
  const bots = Number(document.querySelector('#bots-count button.active').dataset.bots);
  const hostName = $('#host-name').value || 'Hôte';
  const guests = hostCtrl.connectedGuests;

  const players = [];
  players.push({ id: 'p0', name: hostName, isBot: false, peerId: 'host' });
  for (let i = 0; i < guests.length; i++) {
    players.push({ id: 'p' + (i + 1), name: guests[i].name, isBot: false, peerId: guests[i].peerId });
  }
  for (let i = 0; i < bots; i++) {
    players.push({ id: 'bot' + i, name: 'Bot ' + (i + 1), isBot: true, peerId: 'host' });
  }

  const allowed = { classic: [2, 3, 4], extended: [2, 3, 4, 5, 6], premium: [2, 3, 4, 5, 6] };
  if (!allowed[mode].includes(players.length)) {
    alert(`${mode} ne supporte pas ${players.length} joueurs. Ajoute/retire des bots.`);
    return;
  }

  const seed = Math.floor(Math.random() * 2 ** 31) >>> 0;
  const config = { mode, players, seed };

  // Tell guests their slots & config
  for (const g of guests) {
    const slot = players.findIndex(p => p.peerId === g.peerId);
    hostCtrl.server.sendTo(g.peerId, { type: 'start', config, yourSlot: slot });
  }

  // Wire host controller callbacks
  hostCtrl.onIntent = (intent) => applyRemoteIntent(intent);
  hostCtrl.onBishopAccept = (accept) => applyRemoteBishop(accept);
  hostCtrl.onNextRound = () => startNextRound();
  hostCtrl.onDraw = () => applyRemoteDraw();
  hostCtrl.onChancellor = (keepUid) => applyRemoteChancellor(keepUid);

  const onlineAdapter = buildHostAdapter(hostCtrl);
  startGame(config, { online: onlineAdapter, localSeat: 0 });
}

function buildHostAdapter(h) {
  return {
    isHost: true,
    sendIntent: (intent) => h.sendIntent(intent),
    sendBishop: (accept) => h.sendBishop(accept),
    sendNextRound: () => h.sendNextRound(),
    sendDraw: () => h.sendDraw(),
    sendChancellor: (keepUid) => h.sendChancellor(keepUid),
  };
}

async function guestJoinRoom() {
  const btn = $('#join-room-btn');
  btn.disabled = true; btn.textContent = 'Connexion…';
  const name = ($('#guest-name').value || 'Joueur').slice(0, 16);
  const code = ($('#room-code-input').value || '').trim().toUpperCase();
  if (code.length !== 4) {
    alert('Code invalide (4 caractères)');
    btn.disabled = false; btn.textContent = 'Rejoindre';
    return;
  }
  try {
    guestCtrl = new GuestController({
      name, code,
      onStart: (config, yourSlot) => {
        const onlineAdapter = buildGuestAdapter(guestCtrl);
        startGame(config, { online: onlineAdapter, localSeat: yourSlot });
      },
      onIntent: (intent) => applyRemoteIntent(intent),
      onBishopAccept: (accept) => applyRemoteBishop(accept),
      onNextRound: () => startNextRound(),
      onDraw: () => applyRemoteDraw(),
      onChancellor: (keepUid) => applyRemoteChancellor(keepUid),
      onDisconnect: () => alert('Déconnecté de l\'hôte'),
    });
    await guestCtrl.start();
    $('#lobby-guest').classList.remove('hidden');
    $('#guest-status').textContent = 'Connecté, en attente de l\'hôte…';
    btn.disabled = true;
    btn.textContent = 'Connecté ✓';
  } catch (e) {
    alert('Erreur : ' + e.message);
    btn.disabled = false; btn.textContent = 'Rejoindre';
  }
}

function buildGuestAdapter(g) {
  return {
    isHost: false,
    sendIntent: (intent) => g.sendIntent(intent),
    sendBishop: (accept) => g.sendBishop(accept),
    sendNextRound: () => {},
    sendDraw: () => g.sendDraw(),
    sendChancellor: (keepUid) => g.sendChancellor(keepUid),
  };
}
