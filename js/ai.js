// Simple heuristic AI for Love Letter bots.
import { CARD_DEFS } from './cards.js';

export function aiChooseIntent(game) {
  const p = game.currentPlayer();
  const [a, b] = p.hand;
  const validOpponents = game.players
    .map((pp, i) => ({ pp, i }))
    .filter(x => !x.pp.eliminated && !x.pp.protected && x.i !== game.currentIdx)
    .map(x => x.i);

  // Forced Countess
  if (game.mustPlayCountess()) {
    const c = p.hand.find(cc => cc.id === 'countess');
    return { cardUid: c.uid };
  }

  // Score each card for playing
  const choices = p.hand.map(card => ({ card, score: scoreCard(card, p.hand, validOpponents, game) }));
  choices.sort((x, y) => y.score - x.score);
  const choice = choices[0].card;

  return buildIntent(game, choice, validOpponents);
}

function scoreCard(card, hand, validOpponents, game) {
  const other = hand.find(c => c.uid !== card.uid);
  // Never discard Princess
  if (card.id === 'princess') return -1000;
  // Avoid high cards we'd rather keep
  let s = 0;
  // Prefer playing lower-value early
  s += (10 - card.value);
  // Prince self-discard is bad if we have princess
  if (card.id === 'prince' && validOpponents.length === 0 && hand.find(c => c.id === 'princess')) s -= 100;
  // Handmaid is always fine
  if (card.id === 'handmaid') s += 3;
  // Guard with info is great (we don't track memory, so just baseline)
  if (card.id === 'guard') s += 1;
  // Countess forced-check
  if (card.id === 'countess' && (other?.id === 'king' || other?.id === 'prince')) s += 50;
  // King/Prince when no targets = weak
  if (['king', 'prince', 'baron', 'queen'].includes(card.id) && validOpponents.length === 0) s -= 20;
  return s;
}

function buildIntent(game, card, validOpponents) {
  const intent = { cardUid: card.uid };
  if (!game.cardNeedsTarget(card)) return intent;
  if (validOpponents.length === 0) return intent;

  // pick random opponent
  const target = pick(validOpponents);

  if (card.id === 'guard') {
    // guess something not-Guard; weight toward common values
    const pool = Object.values(CARD_DEFS).filter(c => c.id !== 'guard');
    intent.targetIdx = target;
    intent.guessCardId = pick(pool).id;
    return intent;
  }
  if (card.id === 'bishop') {
    const pool = Object.values(CARD_DEFS).filter(c => c.id !== 'guard');
    intent.targetIdx = target;
    intent.guessCardId = pick(pool).id;
    return intent;
  }
  if (card.id === 'prince') {
    // Prefer targeting opponent if we have Princess in hand; else can target self safely
    const hasPrincess = game.currentPlayer().hand.find(c => c.id === 'princess');
    if (!hasPrincess && Math.random() < 0.15) intent.targetIdx = game.currentIdx;
    else intent.targetIdx = target;
    return intent;
  }
  if (card.id === 'cardinal') {
    const pool = game.players.map((p, i) => i).filter(i => !game.players[i].eliminated);
    if (pool.length < 2) return intent;
    const a = pick(pool);
    let b = pick(pool.filter(i => i !== a));
    intent.targetIdx = a;
    intent.target2Idx = b;
    intent.lookAtIdx = Math.random() < 0.5 ? a : b;
    return intent;
  }
  if (card.id === 'baroness') {
    const pool = validOpponents.slice();
    const n = Math.min(pool.length, Math.random() < 0.5 ? 2 : 1);
    intent.baronessTargets = [];
    for (let i = 0; i < n; i++) {
      const t = pick(pool);
      pool.splice(pool.indexOf(t), 1);
      intent.baronessTargets.push(t);
    }
    return intent;
  }
  if (card.id === 'jester') {
    const pool = game.players.map((p, i) => i).filter(i => i !== game.currentIdx && !game.players[i].eliminated);
    intent.jesterTargetIdx = pick(pool);
    return intent;
  }
  intent.targetIdx = target;
  return intent;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function aiBishopAccept() { return Math.random() < 0.5; }
