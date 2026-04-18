// UI controller. Wires the DOM to the Game engine.
import { Game } from './game.js';
import { CARD_DEFS, DECKS, cardName, cardForMode } from './cards.js';
import { aiChooseIntent, aiBishopAccept } from './ai.js';

const $ = (sel) => document.querySelector(sel);

let game = null;
let online = null; // online controller if online mode
let localSeat = 0; // which player index is "me" in online mode
let passThroughActive = false;

// ===== SETUP =====
export function initSetup({ onStart }) {
  let mode = 'classic';
  let count = 4;
  let players = [];

  const countBtns = $('#player-count').querySelectorAll('button');
  const modeBtns = document.querySelectorAll('.mode-btn');

  function updateCountsAvailability() {
    const allowed = DECKS[mode].players;
    countBtns.forEach(b => {
      const c = Number(b.dataset.count);
      b.disabled = !allowed.includes(c);
      if (!allowed.includes(c) && b.classList.contains('active')) {
        b.classList.remove('active');
        const fallback = [...countBtns].find(bb => !bb.disabled && Number(bb.dataset.count) >= 2);
        if (fallback) { fallback.classList.add('active'); count = Number(fallback.dataset.count); }
      }
    });
    renderPlayerList();
  }

  function renderPlayerList() {
    const list = $('#player-list');
    list.innerHTML = '';
    players = [];
    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.className = 'player-row';
      const defaultName = i === 0 ? 'Toi' : `Joueur ${i + 1}`;
      row.innerHTML = `
        <input type="text" value="${defaultName}" data-idx="${i}" />
        <label><input type="checkbox" data-bot="${i}" ${i > 0 ? 'checked' : ''}/> Bot</label>
      `;
      list.appendChild(row);
      players.push({ id: 'p' + i, name: defaultName, isBot: i > 0 });
    }
    list.querySelectorAll('input[type="text"]').forEach(inp => {
      inp.addEventListener('input', (e) => {
        players[+e.target.dataset.idx].name = e.target.value || `Joueur ${+e.target.dataset.idx + 1}`;
      });
    });
    list.querySelectorAll('input[type="checkbox"]').forEach(inp => {
      inp.addEventListener('change', (e) => {
        players[+e.target.dataset.bot].isBot = e.target.checked;
      });
    });
  }

  modeBtns.forEach(b => {
    b.addEventListener('click', () => {
      modeBtns.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      mode = b.dataset.mode;
      updateCountsAvailability();
    });
  });
  countBtns.forEach(b => {
    b.addEventListener('click', () => {
      if (b.disabled) return;
      countBtns.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      count = Number(b.dataset.count);
      renderPlayerList();
    });
  });

  $('#start-btn').addEventListener('click', () => {
    onStart({ mode, players: players.slice(0, count) });
  });

  // Initial render
  renderPlayerList();
}

// ===== GAME DRIVER =====
export function startGame(config, opts = {}) {
  game = new Game(config);
  online = opts.online || null;
  localSeat = opts.localSeat ?? 0;
  $('#mode-label').textContent = DECKS[config.mode].name;
  showScreen('game-screen');
  game.startRound();
  renderAll();
  nextAction();
}

export function getGame() { return game; }
export function applyRemoteIntent(intent) {
  // Defensive: if we're still awaiting draw (desync), catch up by drawing first.
  if (game.awaitingDraw) {
    game.drawCard();
  }
  // Look up the card about to be played (from the current player's hand) to
  // trigger the cinematic BEFORE the state mutation moves it to discard.
  const actor = game.currentPlayer();
  const cardBeingPlayed = actor?.hand.find(c => c.uid === intent.cardUid);
  try { game.playCard(intent); }
  catch (e) { console.error('applyRemoteIntent failed', e); return; }
  if (cardBeingPlayed) playCinematic(cardBeingPlayed, () => handleAfterPlay());
  else handleAfterPlay();
}
export function applyRemoteBishop(accept) {
  game.bishopDiscardChoice(accept);
  handleAfterPlay();
}
export function applyRemoteChancellor(keepUid) {
  game.chancellorResolve(keepUid);
  handleAfterPlay();
}
export function startNextRound() {
  if (game.matchEnded) return showMatchEnd();
  game.startRound();
  lastShownSeat = -1;
  showScreen('game-screen');
  renderAll();
  nextAction();
}

function nextAction() {
  if (game.phase === 'matchEnd') { return showMatchEnd(); }
  if (game.phase === 'roundEnd') { return showRoundEnd(); }
  const p = game.currentPlayer();
  // Online: bots run on host only
  if (online) {
    if (p.isBot && online.isHost) {
      setTimeout(() => runBotTurn(), 700);
    }
    renderAll();
    return;
  }
  // Local hotseat
  if (p && !p.isBot && shouldShowPass()) {
    return showPassScreen();
  }
  if (p.isBot) {
    setTimeout(() => runBotTurn(), 700);
  } else {
    renderAll();
  }
}

export function applyRemoteDraw() {
  game.drawCard();
  renderAll();
}

let lastShownSeat = -1;
function shouldShowPass() {
  const humans = game.players.filter(p => !p.isBot && !p.eliminated);
  if (humans.length <= 1) return false;
  if (game.currentIdx === lastShownSeat) return false;
  return true;
}

function showPassScreen() {
  const p = game.currentPlayer();
  $('#pass-name').textContent = p.name;
  showScreen('pass-screen');
  passThroughActive = true;
}

function closePassScreen() {
  passThroughActive = false;
  lastShownSeat = game.currentIdx;
  showScreen('game-screen');
  renderAll();
}

function runBotTurn() {
  // Bots draw first if needed
  if (game.awaitingDraw) {
    if (online && online.isHost) {
      online.sendDraw();
    } else {
      game.drawCard();
    }
    // Delay to visualize the draw, then play
    setTimeout(() => runBotTurn(), 500);
    return;
  }
  const intent = aiChooseIntent(game);
  if (online && online.isHost) {
    online.sendIntent(intent);
    return;
  }
  const actor = game.currentPlayer();
  const card = actor?.hand.find(c => c.uid === intent.cardUid);
  try {
    game.playCard(intent);
  } catch (e) {
    console.error(e);
  }
  if (card) playCinematic(card, () => handleAfterPlay());
  else handleAfterPlay();
}

function handleAfterPlay() {
  // If reveal pending, show it (only to intended viewer(s))
  if (game.pendingReveal) {
    const rev = game.pendingReveal;
    const viewers = rev.viewers || (rev.viewer != null ? [rev.viewer] : []);
    const isForMe = online
      ? viewers.includes(localSeat)
      : viewers.some(v => !game.players[v].isBot);
    if (isForMe) {
      showReveal(rev);
      game.pendingReveal = null;
      return;
    } else {
      game.pendingReveal = null;
    }
  }
  if (game.pendingBishopOffer) {
    const t = game.pendingBishopOffer.playerIdx;
    const tp = game.players[t];
    if (online) {
      if (t === localSeat) { askBishop(t); return; }
      renderAll();
      return;
    }
    if (tp.isBot) {
      game.bishopDiscardChoice(aiBishopAccept());
    } else {
      askBishop(t);
      return;
    }
  }
  if (game.pendingChancellor) {
    const t = game.pendingChancellor.playerIdx;
    const tp = game.players[t];
    if (online) {
      if (t === localSeat) { askChancellor(); return; }
      renderAll();
      return;
    }
    if (tp.isBot) {
      // Bot keeps the highest value card
      const hand = tp.hand.slice();
      hand.sort((a, b) => b.value - a.value);
      const keep = hand[0];
      game.chancellorResolve(keep.uid);
    } else {
      askChancellor();
      return;
    }
  }
  renderAll();
  if (game.phase !== 'round') { nextAction(); return; }
  nextAction();
}

function askChancellor() {
  const me = game.players[game.pendingChancellor.playerIdx];
  const ov = $('#overlay');
  $('#overlay-title').textContent = 'Chancelier';
  $('#overlay-subtitle').textContent = 'Choisis une carte à garder, les 2 autres vont sous la pioche.';
  const opts = $('#overlay-options');
  opts.innerHTML = '';
  me.hand.forEach(c => {
    const b = document.createElement('button');
    b.innerHTML = `<b>${c.value} — ${cardName(c, game.mode)}</b> ${c.icon}`;
    b.addEventListener('click', () => {
      ov.classList.add('hidden');
      if (online) online.sendChancellor(c.uid);
      else { game.chancellorResolve(c.uid); handleAfterPlay(); }
    });
    opts.appendChild(b);
  });
  $('#overlay-cancel').classList.add('hidden');
  ov.classList.remove('hidden');
}

function askBishop(targetIdx) {
  const ov = $('#overlay');
  $('#overlay-title').textContent = 'Évêque';
  $('#overlay-subtitle').textContent = 'Accepter de défausser et repiocher ?';
  const opts = $('#overlay-options');
  opts.innerHTML = '';
  const y = document.createElement('button'); y.textContent = 'Oui, défausser';
  const n = document.createElement('button'); n.textContent = 'Non, garder';
  const choose = (accept) => {
    ov.classList.add('hidden');
    if (online) online.sendBishop(accept);
    else { game.bishopDiscardChoice(accept); handleAfterPlay(); }
  };
  y.addEventListener('click', () => choose(true));
  n.addEventListener('click', () => choose(false));
  opts.appendChild(y); opts.appendChild(n);
  $('#overlay-cancel').classList.add('hidden');
  ov.classList.remove('hidden');
}

function showReveal(reveal) {
  const ov = $('#reveal');
  $('#reveal-title').textContent = reveal.note || 'Révélation';
  const wrap = $('#reveal-cards');
  wrap.innerHTML = '';
  const isDuel = reveal.revealed.length === 2 && ['Duel Baron', 'Reine-mère'].includes(reveal.note);
  reveal.revealed.forEach((r, i) => {
    const col = document.createElement('div');
    col.className = 'reveal-col';
    const isMe = r.playerIdx === viewerIdx();
    const label = isMe ? 'TA CARTE' : game.players[r.playerIdx].name;
    col.innerHTML = `<div class="reveal-label${isMe ? ' me' : ''}">${label}</div>`;
    col.appendChild(renderCard(r.card, false));
    wrap.appendChild(col);
    if (isDuel && i === 0) {
      const vs = document.createElement('div');
      vs.className = 'reveal-vs';
      vs.textContent = 'VS';
      wrap.appendChild(vs);
    }
  });
  ov.classList.remove('hidden');
  $('#reveal-ok').onclick = () => {
    ov.classList.add('hidden');
    handleAfterPlay();
  };
}

// ===== RENDER =====
function renderAll() {
  renderHeader();
  renderOpponents();
  renderPlayArea();
  renderHand();
  renderLog();
}

function renderHeader() {
  $('#deck-count').textContent = game.deck.length;
  $('#round-number').textContent = game.round;
}

function renderOpponents() {
  const wrap = $('#opponents');
  wrap.innerHTML = '';
  const nextIdx = game.nextPlayerIdx();
  game.players.forEach((p, i) => {
    if (i === viewerIdx()) return;
    const div = document.createElement('div');
    div.className = 'opponent';
    if (i === game.currentIdx) div.classList.add('current');
    else if (i === nextIdx) div.classList.add('next');
    if (p.eliminated) div.classList.add('eliminated');
    if (p.protected) div.classList.add('protected');
    div.dataset.idx = i;

    // Turn badge
    if (i === game.currentIdx) {
      const badge = document.createElement('div'); badge.className = 'turn-badge'; badge.textContent = '● Tour';
      div.appendChild(badge);
    } else if (i === nextIdx) {
      const badge = document.createElement('div'); badge.className = 'turn-badge'; badge.textContent = 'Suivant';
      div.appendChild(badge);
    }

    // Token count
    const tok = document.createElement('div'); tok.className = 'token-count'; tok.textContent = p.tokens;
    div.appendChild(tok);

    const name = document.createElement('div'); name.className = 'opp-name'; name.textContent = p.name;
    const hand = document.createElement('div'); hand.className = 'opp-hand';
    p.hand.forEach(() => {
      const cb = document.createElement('div'); cb.className = 'card-back'; hand.appendChild(cb);
    });
    const disc = document.createElement('div'); disc.className = 'opp-discard';
    p.discard.slice(-6).forEach(c => {
      const m = document.createElement('div'); m.className = 'mini-card'; m.textContent = c.value; m.title = cardName(c, game.mode);
      disc.appendChild(m);
    });

    div.appendChild(name);
    div.appendChild(hand);
    div.appendChild(disc);
    wrap.appendChild(div);
  });
}

function renderPlayArea() {
  const wrap = $('#play-area');
  wrap.innerHTML = '';
  // show current player's discard as summary of recent plays
  const me = game.players[viewerIdx()];
  if (me && me.discard.length > 0) {
    me.discard.slice(-5).forEach(c => wrap.appendChild(renderCard(c, true)));
  }
}

function renderHand() {
  const me = game.players[viewerIdx()];
  const nextIdx = game.nextPlayerIdx();
  const myTurn = game.currentIdx === viewerIdx();
  const mySuivant = viewerIdx() === nextIdx;
  const cp = $('#current-player');
  cp.classList.toggle('my-turn', myTurn);
  cp.classList.toggle('my-next', mySuivant && !myTurn);
  let label = me.name;
  if (myTurn && game.awaitingDraw) label = '● À TOI · pioche une carte';
  else if (myTurn) label = '● À TOI · joue une carte';
  else if (mySuivant) label = 'Tu joues après · ' + me.name;
  $('#current-name').textContent = label;
  $('#current-tokens').textContent = '💝 ' + me.tokens;
  const hand = $('#hand');
  hand.innerHTML = '';
  const isMyTurn = myTurn && !me.eliminated && game.phase === 'round' && (!online || localSeat === viewerIdx());

  // Show Pioche button if it's my turn and I haven't drawn yet
  if (isMyTurn && game.awaitingDraw) {
    const drawBtn = document.createElement('button');
    drawBtn.className = 'draw-btn';
    drawBtn.innerHTML = `<div class="draw-pile"><span>${game.deck.length}</span></div><div class="draw-label">Pioche</div>`;
    drawBtn.addEventListener('click', () => onDrawClick());
    hand.appendChild(drawBtn);
    // Still render the 1 existing card as disabled
    me.hand.forEach(card => {
      const el = renderCard(card, false);
      el.classList.add('disabled');
      hand.appendChild(el);
    });
    return;
  }

  const mustCountess = game.mustPlayCountess();
  me.hand.forEach(card => {
    const el = renderCard(card, false);
    const disabled = !isMyTurn || (mustCountess && card.id !== 'countess');
    if (disabled) el.classList.add('disabled');
    el.addEventListener('click', () => {
      if (disabled) return;
      onHandCardClick(card);
    });
    hand.appendChild(el);
  });
}

function onDrawClick() {
  if (online) {
    online.sendDraw();
  } else {
    game.drawCard();
    renderAll();
  }
}

function renderLog() {
  const wrap = $('#log');
  wrap.innerHTML = '<div class="log-header">Journal de la partie</div>';
  game.log.slice(-40).forEach(entry => {
    const div = document.createElement('div');
    div.className = 'log-entry ' + (entry.cls || '');
    div.innerHTML = entry.text;
    wrap.appendChild(div);
  });
  wrap.scrollTop = wrap.scrollHeight;
}

function viewerIdx() {
  if (online) return localSeat;
  // hotseat: current active human
  const p = game.players[game.currentIdx];
  if (p && !p.isBot) return game.currentIdx;
  // fallback: first human or 0
  const h = game.players.findIndex(p => !p.isBot);
  return h >= 0 ? h : 0;
}

// ===== Cinematic card play =====
let cinematicActive = false;
function playCinematic(card, onDone) {
  if (cinematicActive) { onDone && onDone(); return; }
  cinematicActive = true;
  const overlay = document.createElement('div');
  overlay.className = 'play-cinematic';

  const stage = document.createElement('div');
  stage.className = 'cine-stage';

  // Main card element
  const cardEl = document.createElement('div');
  cardEl.className = 'cine-card';
  const bg = card.img ? `<div class="portrait-frame" style="background-image:url('${card.img}')"></div>` : '';
  cardEl.innerHTML = `
    <div class="value">${card.value}</div>
    <div class="name" dir="auto">${cardName(card, game?.mode || 'classic')}</div>
    ${bg}
    <div class="cine-desc">${card.desc}</div>
  `;
  stage.appendChild(cardEl);

  // Character "emerging" layer — same illustration but larger & floating above
  if (card.img) {
    const emerge = document.createElement('div');
    emerge.className = 'cine-emerge';
    emerge.style.backgroundImage = `url('${card.img}')`;
    stage.appendChild(emerge);
  }

  // Particle sparks
  const sparks = document.createElement('div');
  sparks.className = 'cine-sparks';
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span');
    const angle = (Math.PI * 2 * i) / 14 + (Math.random() - 0.5) * 0.3;
    const dist = 160 + Math.random() * 100;
    s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    s.style.setProperty('--dy', Math.sin(angle) * dist - 40 + 'px');
    s.style.animationDelay = (i * 30) + 'ms';
    sparks.appendChild(s);
  }
  stage.appendChild(sparks);

  overlay.appendChild(stage);
  document.body.appendChild(overlay);

  const holdMs = 1100;
  setTimeout(() => {
    overlay.classList.add('exiting');
    setTimeout(() => {
      overlay.remove();
      cinematicActive = false;
      onDone && onDone();
    }, 350);
  }, holdMs);
}

function renderCard(card, compact) {
  const el = document.createElement('div');
  el.className = 'card' + (compact ? ' played-card' : '') + (card.img ? ' has-img' : '');
  const art = card.img
    ? `<div class="portrait" style="background-image:url('${card.img}')"></div>`
    : `<div class="icon">${card.icon}</div>`;
  const displayName = cardName(card, game?.mode || 'classic');
  el.innerHTML = `
    <div class="value">${card.value}</div>
    ${art}
    <div class="name" dir="auto">${displayName}</div>
    <div class="desc">${card.desc}</div>
    <div class="value-br">${card.value}</div>
  `;
  return el;
}

// ===== HAND CARD CLICK =====
function onHandCardClick(card) {
  // Determine whether target/guess/etc is needed
  const needsTarget = game.cardNeedsTarget(card);
  const validOpps = game.validTargets(card);

  // Sycophant forced target check
  if (game.pendingSycophant) {
    const forced = game.pendingSycophant.targetIdx;
    if (needsTarget && game.isValidTarget(card, forced)) {
      // Force this target
      promptSpecificTarget(card, forced);
      return;
    }
  }

  if (card.id === 'guard') return pickTargetThen(validOpps, (t) => pickGuess((g) => playIntent({ cardUid: card.uid, targetIdx: t, guessCardId: g })));
  if (card.id === 'bishop') return pickTargetThen(validOpps, (t) => pickGuess((g) => playIntent({ cardUid: card.uid, targetIdx: t, guessCardId: g }), true));
  if (card.id === 'prince') {
    const targets = [...validOpps, game.currentIdx];
    return pickTargetThen(targets, (t) => playIntent({ cardUid: card.uid, targetIdx: t }));
  }
  if (card.id === 'cardinal') {
    const all = game.players.map((p, i) => i).filter(i => !game.players[i].eliminated);
    return pickTargetThen(all, (a) => pickTargetThen(all.filter(i => i !== a), (b) => pickTargetThen([a, b], (l) => playIntent({ cardUid: card.uid, targetIdx: a, target2Idx: b, lookAtIdx: l }), 'Voir la main de :'), 'Second joueur :'), 'Premier joueur :');
  }
  if (card.id === 'baroness') {
    if (validOpps.length === 0) return playIntent({ cardUid: card.uid });
    // pick up to 2
    return pickMultiTargets(validOpps, 2, (sel) => playIntent({ cardUid: card.uid, baronessTargets: sel }));
  }
  if (card.id === 'jester') {
    const pool = game.players.map((p, i) => i).filter(i => i !== game.currentIdx && !game.players[i].eliminated);
    return pickTargetThen(pool, (t) => playIntent({ cardUid: card.uid, jesterTargetIdx: t }));
  }
  if (needsTarget) {
    if (validOpps.length === 0) return playIntent({ cardUid: card.uid });
    return pickTargetThen(validOpps, (t) => playIntent({ cardUid: card.uid, targetIdx: t }));
  }
  playIntent({ cardUid: card.uid });
}

function promptSpecificTarget(card, forcedIdx) {
  const ov = $('#overlay');
  $('#overlay-title').textContent = 'Courtisan impose la cible';
  $('#overlay-subtitle').textContent = `Tu dois cibler ${game.players[forcedIdx].name}.`;
  const opts = $('#overlay-options'); opts.innerHTML = '';
  const b = document.createElement('button'); b.textContent = 'OK';
  b.addEventListener('click', () => {
    ov.classList.add('hidden');
    if (card.id === 'guard' || card.id === 'bishop') {
      pickGuess((g) => playIntent({ cardUid: card.uid, targetIdx: forcedIdx, guessCardId: g }), card.id === 'bishop');
    } else {
      playIntent({ cardUid: card.uid, targetIdx: forcedIdx });
    }
  });
  opts.appendChild(b);
  $('#overlay-cancel').classList.add('hidden');
  ov.classList.remove('hidden');
}

function pickTargetThen(opts, cb, title = 'Choisis une cible') {
  if (opts.length === 0) { cb(null); return; }
  if (opts.length === 1) { cb(opts[0]); return; }
  const ov = $('#overlay');
  $('#overlay-title').textContent = title;
  $('#overlay-subtitle').textContent = '';
  const box = $('#overlay-options'); box.innerHTML = '';
  opts.forEach(i => {
    const b = document.createElement('button');
    b.textContent = game.players[i].name + (i === game.currentIdx ? ' (toi-même)' : '');
    b.addEventListener('click', () => { ov.classList.add('hidden'); cb(i); });
    box.appendChild(b);
  });
  const cancel = $('#overlay-cancel');
  cancel.classList.remove('hidden');
  cancel.onclick = () => { ov.classList.add('hidden'); renderAll(); };
  ov.classList.remove('hidden');
}

function pickMultiTargets(opts, max, cb) {
  const ov = $('#overlay');
  $('#overlay-title').textContent = 'Choisis jusqu\'à ' + max + ' joueurs';
  $('#overlay-subtitle').textContent = 'Clique pour sélectionner, puis valide.';
  const box = $('#overlay-options'); box.innerHTML = '';
  const selected = new Set();
  const buttons = new Map();
  opts.forEach(i => {
    const b = document.createElement('button');
    b.textContent = game.players[i].name;
    b.addEventListener('click', () => {
      if (selected.has(i)) { selected.delete(i); b.style.background = ''; }
      else if (selected.size < max) { selected.add(i); b.style.background = 'rgba(255,107,157,0.3)'; }
    });
    buttons.set(i, b);
    box.appendChild(b);
  });
  const go = document.createElement('button');
  go.textContent = 'Valider';
  go.style.background = 'linear-gradient(135deg,var(--accent),var(--accent-2))';
  go.addEventListener('click', () => {
    if (selected.size === 0) return;
    ov.classList.add('hidden');
    cb([...selected]);
  });
  box.appendChild(go);
  $('#overlay-cancel').classList.add('hidden');
  ov.classList.remove('hidden');
}

function pickGuess(cb, allowGuard = false) {
  const ov = $('#overlay');
  $('#overlay-title').textContent = 'Devine la carte';
  $('#overlay-subtitle').textContent = allowGuard ? '' : 'Tu ne peux pas deviner Garde.';
  const box = $('#overlay-options'); box.innerHTML = '';
  // Get available cards for this mode
  const mode = game.mode;
  const cardIds = Object.keys(DECKS[mode].cards).filter(id => allowGuard || id !== 'guard');
  cardIds.forEach(id => {
    const c = cardForMode(id, mode);
    const b = document.createElement('button');
    b.innerHTML = `<b>${c.value} — ${cardName(c, game.mode)}</b> ${c.icon}`;
    b.addEventListener('click', () => { ov.classList.add('hidden'); cb(id); });
    box.appendChild(b);
  });
  $('#overlay-cancel').classList.remove('hidden');
  $('#overlay-cancel').onclick = () => { ov.classList.add('hidden'); renderAll(); };
  ov.classList.remove('hidden');
}

function playIntent(intent) {
  if (online) {
    online.sendIntent(intent);
    return;
  }
  const actor = game.currentPlayer();
  const card = actor?.hand.find(c => c.uid === intent.cardUid);
  try {
    game.playCard(intent);
  } catch (e) {
    alert(e.message);
    renderAll();
    return;
  }
  if (card) playCinematic(card, () => handleAfterPlay());
  else handleAfterPlay();
}

// ===== END SCREENS =====
function showRoundEnd() {
  showScreen('round-end-screen');
  $('#round-end-title').textContent = `Fin de la manche ${game.round}`;
  const winners = game.players.filter(p => p.tokens > 0 && !p.eliminated)
    .sort((a, b) => b.tokens - a.tokens);
  $('#round-end-winner').textContent = game.log.filter(e => e.cls === 'highlight').slice(-2).map(e => e.text.replace(/<[^>]+>/g, '')).join(' · ');
  const scores = $('#round-end-scores');
  scores.innerHTML = '';
  game.players.forEach(p => {
    const r = document.createElement('div');
    r.className = 'score-row';
    r.innerHTML = `<span>${p.name}</span><span class="toks">${'💝'.repeat(p.tokens) || '0'}</span>`;
    scores.appendChild(r);
  });
  $('#next-round-btn').onclick = () => {
    if (online) {
      if (online.isHost) online.sendNextRound();
      return;
    }
    startNextRound();
  };
  // In online mode, only host sees the next-round button enabled
  if (online && !online.isHost) {
    $('#next-round-btn').textContent = 'En attente de l\'hôte…';
    $('#next-round-btn').disabled = true;
  } else {
    $('#next-round-btn').textContent = 'Manche suivante';
    $('#next-round-btn').disabled = false;
  }
}

function showMatchEnd() {
  showScreen('match-end-screen');
  const w = game.players[game.matchWinner];
  $('#match-end-winner').textContent = `${w.name} remporte la partie !`;
  const scores = $('#match-end-scores');
  scores.innerHTML = '';
  const sorted = [...game.players].sort((a, b) => b.tokens - a.tokens);
  sorted.forEach(p => {
    const r = document.createElement('div');
    r.className = 'score-row' + (p === w ? ' winner' : '');
    r.innerHTML = `<span>${p.name}</span><span class="toks">${'💝'.repeat(p.tokens) || '0'}</span>`;
    scores.appendChild(r);
  });
  $('#restart-btn').onclick = () => {
    showScreen('setup-screen');
  };
}

// ===== UTIL =====
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('#' + id).classList.add('active');
}

// Pass screen button
document.addEventListener('DOMContentLoaded', () => {
  $('#pass-btn')?.addEventListener('click', () => {
    closePassScreen();
  });
  $('#rules-btn')?.addEventListener('click', () => showRules());
  $('#rules-close')?.addEventListener('click', () => $('#rules-modal').classList.add('hidden'));
});

function showRules() {
  const m = $('#rules-modal');
  const wrap = $('#rules-content');
  wrap.innerHTML = `
    <p>Fais parvenir ta lettre à la Princesse. Soit le dernier en lice ou aie la carte la plus forte quand la pioche est vide. Le premier à <b>${game.tokensToWin}</b> jetons remporte la partie.</p>
    <h4>Cartes (${DECKS[game.mode].name})</h4>
    <ul>
      ${Object.keys(DECKS[game.mode].cards).map(id => {
        const c = cardForMode(id, game.mode);
        return `<li><b>${c.value} ${cardName(c, game.mode)}</b> ${c.icon} — ${c.desc}</li>`;
      }).join('')}
    </ul>
    <h4>Points clés</h4>
    <ul>
      <li>À ton tour : pioche 1, joue 1, applique l'effet.</li>
      <li>Comtesse + (Roi ou Prince) → la Comtesse est obligatoire.</li>
      <li>Servante : tu es protégé jusqu'à ton prochain tour.</li>
      <li>Défausser la Princesse = élimination immédiate.</li>
    </ul>
  `;
  m.classList.remove('hidden');
}
