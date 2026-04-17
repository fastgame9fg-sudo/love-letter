// Love Letter card definitions for 3 modes.
// Each card: { id, value, name, icon, desc, count }
// "count" depends on the mode. Effects are identified by id and handled in game.js.

const IMG = (name) => `assets/cards/${name}.png`;

// Note: Default `value` fields below match the Premium edition numbering
// (King=6, Countess=7, Princess=8). Classic/Extended modes use the modern
// 2019 numbering (King=7, Countess=8, Princess=9) via `cardForMode` overrides.
// Darija names map to the modern numbering's positions.
export const CARD_DEFS = {
  // Base cards
  guard:     { id: 'guard',     value: 1, name: 'Garde',     darijaName: 'الڭارديان',      icon: '⚔️',  img: IMG('guard'),     desc: "Choisis un autre joueur et nomme un personnage autre que Garde. S'il a cette carte, il quitte la manche." },
  priest:    { id: 'priest',    value: 2, name: 'Prêtre',    darijaName: 'الجارة',          icon: '🕯️',  img: IMG('priest'),    desc: "Choisis un autre joueur et regarde sa main (sans la montrer)." },
  baron:     { id: 'baron',     value: 3, name: 'Baron',     darijaName: 'المسطي',          icon: '⚖️',  img: IMG('baron'),     desc: "Compare discrètement ta main avec un autre joueur. La valeur la plus faible quitte la manche. Égalité : rien." },
  handmaid:  { id: 'handmaid',  value: 4, name: 'Servante',  darijaName: 'البلغة الضايعة',  icon: '🛡️',  img: IMG('handmaid'),  desc: "Jusqu'à ton prochain tour, les autres joueurs ne peuvent pas te cibler." },
  prince:    { id: 'prince',    value: 5, name: 'Prince',    darijaName: 'المخازني',        icon: '👑',  img: IMG('prince'),    desc: "Choisis n'importe quel joueur (toi inclus). Il défausse sa main (sans effet) et en pioche une nouvelle." },
  king:      { id: 'king',      value: 6, name: 'Roi',       darijaName: 'القايد',          icon: '🤴',  img: IMG('king'),      desc: "Choisis un autre joueur et échange vos mains." },
  countess:  { id: 'countess',  value: 7, name: 'Comtesse',  darijaName: 'للاّ',             icon: '👸',  img: IMG('countess'),  desc: "Aucun effet. Si ta main contient le Roi ou un Prince, tu dois jouer la Comtesse." },
  princess:  { id: 'princess',  value: 8, name: 'Princesse', darijaName: 'العروسة',         icon: '💖',  img: IMG('princess'),  desc: "Si tu la joues ou la défausses, tu quittes la manche." },

  // Cards from the "édition intégrale" / Premium only
  spy:       { id: 'spy',       value: 0, name: 'Espionne',  darijaName: 'الڭريمة',         icon: '🕵️',  img: IMG('spy'),       desc: "En fin de manche, si tu es seul à avoir joué au moins une Espionne, tu gagnes 1 pion Faveur supplémentaire." },
  chancellor:{ id: 'chancellor',value: 6, name: 'Chancelier',darijaName: 'العڭوزة',         icon: '📜',                         desc: "Pioche 2 cartes. Garde 1 et remets les 2 autres sous la pioche dans l'ordre de ton choix." },
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

// Resolve the display name based on mode.
// In Classic/Extended modes, show the Darija name when available; Premium keeps French.
export function cardName(card, mode) {
  if ((mode === 'classic' || mode === 'extended') && card.darijaName) return card.darijaName;
  return card.name;
}

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
      spy: 2, chancellor: 1, jester: 1, assassin: 1, cardinal: 2, baroness: 2,
      sycophant: 2, count: 2, constable: 2, queen: 1, bishop: 1,
    },
  },
};

// Tokens needed to win the match based on player count (2019 PDF rules).
// 2p→6, 3p→5, 4p→4, extrapolated for 5-6 players.
export const TOKENS_TO_WIN = {
  2: 6, 3: 5, 4: 4, 5: 4, 6: 3,
};

// Apply mode-specific overrides on top of base card defs.
// Classic/Extended modes use the modern 2019 numbering: King=7, Countess=8, Princess=9.
// Premium uses the original numbering (King=6, Countess=7, Princess=8).
export function cardForMode(cardId, mode) {
  const base = CARD_DEFS[cardId];
  if (!base) return null;
  if (mode === 'classic' || mode === 'extended') {
    if (cardId === 'king')     return { ...base, value: 7 };
    if (cardId === 'countess') return { ...base, value: 8 };
    if (cardId === 'princess') return { ...base, value: 9 };
  }
  return base;
}

export function buildDeck(mode) {
  const def = DECKS[mode];
  const deck = [];
  let uid = 0;
  for (const [cardId, count] of Object.entries(def.cards)) {
    const tpl = cardForMode(cardId, mode);
    for (let i = 0; i < count; i++) {
      deck.push({ uid: uid++, ...tpl });
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
