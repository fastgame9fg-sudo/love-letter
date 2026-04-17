// Love Letter card definitions for 3 modes.
// Each card: { id, value, name, icon, desc, count }
// "count" depends on the mode. Effects are identified by id and handled in game.js.

export const CARD_DEFS = {
  // Classic cards (1..8)
  guard:     { id: 'guard',     value: 1, name: 'Garde',     icon: '⚔️',  desc: "Nomme un type (non-Garde). Si l'adversaire l'a, il est éliminé." },
  priest:    { id: 'priest',    value: 2, name: 'Prêtre',    icon: '🕯️',  desc: "Regarde en secret la main d'un adversaire." },
  baron:     { id: 'baron',     value: 3, name: 'Baron',     icon: '⚖️',  desc: "Compare en secret avec un adversaire. Le plus faible est éliminé." },
  handmaid:  { id: 'handmaid',  value: 4, name: 'Servante',  icon: '🛡️',  desc: "Tu es protégé jusqu'à ton prochain tour." },
  prince:    { id: 'prince',    value: 5, name: 'Prince',    icon: '👑',  desc: "Un joueur (toi inclus) défausse sa main et en pioche une nouvelle." },
  king:      { id: 'king',      value: 6, name: 'Roi',       icon: '🤴',  desc: "Échange ta main avec celle d'un adversaire." },
  countess:  { id: 'countess',  value: 7, name: 'Comtesse',  icon: '👸',  desc: "Doit être défaussée si tu as aussi le Roi ou le Prince." },
  princess:  { id: 'princess',  value: 8, name: 'Princesse', icon: '💖',  desc: "Si tu la défausses, tu es éliminé." },

  // Premium-only cards
  jester:    { id: 'jester',    value: 0, name: 'Bouffon',   icon: '🃏',  desc: "Parie sur un joueur. S'il gagne la manche, tu gagnes un jeton." },
  assassin:  { id: 'assassin',  value: 0, name: 'Assassin',  icon: '🗡️',  desc: "Si un Garde te désigne, il est éliminé au lieu de toi." },
  cardinal:  { id: 'cardinal',  value: 2, name: 'Cardinal',  icon: '⛪',  desc: "Deux joueurs échangent leur main, puis tu regardes la main de l'un d'eux." },
  baroness:  { id: 'baroness',  value: 3, name: 'Baronne',   icon: '👁️',  desc: "Regarde la main d'un ou deux adversaires." },
  sycophant: { id: 'sycophant', value: 4, name: 'Courtisan', icon: '🎭',  desc: "Désigne un joueur. La prochaine carte jouée doit le cibler (si possible)." },
  count:     { id: 'count',     value: 5, name: 'Comte',     icon: '🧮',  desc: "+1 à la valeur de ta carte en fin de manche (par Comte défaussé)." },
  constable: { id: 'constable', value: 6, name: 'Connétable',icon: '🎖️',  desc: "Si tu es éliminé alors qu'il est défaussé, tu gagnes un jeton." },
  queen:     { id: 'queen',     value: 7, name: 'Reine-mère',icon: '👵',  desc: "Compare ta main avec un adversaire. Le PLUS FORT est éliminé." },
  bishop:    { id: 'bishop',    value: 9, name: 'Évêque',    icon: '⛪',  desc: "Devine la carte d'un adversaire. Correct = 1 jeton (il peut se défausser)." },
};

// Mode deck compositions
export const DECKS = {
  classic: {
    name: 'Classique',
    players: [2, 3, 4],
    cards: {
      guard: 5, priest: 2, baron: 2, handmaid: 2, prince: 2,
      king: 1, countess: 1, princess: 1,
    },
  },
  extended: {
    name: 'Classique étendu',
    players: [2, 3, 4, 5, 6],
    cards: {
      guard: 8, priest: 3, baron: 3, handmaid: 3, prince: 3,
      king: 2, countess: 1, princess: 1,
    },
  },
  premium: {
    name: 'Premium',
    players: [2, 3, 4, 5, 6],
    cards: {
      guard: 8, priest: 2, baron: 2, handmaid: 2, prince: 2,
      king: 1, countess: 1, princess: 1,
      jester: 1, assassin: 1, cardinal: 2, baroness: 2,
      sycophant: 2, count: 2, constable: 2, queen: 1, bishop: 1,
    },
  },
};

// Tokens needed to win the match based on player count
// (official rule: 2p→7, 3p→5, 4p→4, extended for more players)
export const TOKENS_TO_WIN = {
  2: 7, 3: 5, 4: 4, 5: 4, 6: 3,
};

export function buildDeck(mode) {
  const def = DECKS[mode];
  const deck = [];
  let uid = 0;
  for (const [cardId, count] of Object.entries(def.cards)) {
    for (let i = 0; i < count; i++) {
      deck.push({ uid: uid++, ...CARD_DEFS[cardId] });
    }
  }
  return deck;
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deterministic seeded PRNG (mulberry32).
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
