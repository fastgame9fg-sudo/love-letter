// Love Letter game engine. UI-agnostic.
import { buildDeck, shuffle, TOKENS_TO_WIN, CARD_DEFS, mulberry32 } from './cards.js';

export class Game {
  constructor(config) {
    // config: { mode, players: [{id, name, isBot}], seed? }
    this.mode = config.mode;
    this.seed = (config.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
    this.rng = mulberry32(this.seed);
    this.players = config.players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: !!p.isBot,
      tokens: 0,
      hand: [],
      discard: [],
      eliminated: false,
      protected: false,
      constableActive: false,
      countDiscards: 0,
    }));
    this.tokensToWin = TOKENS_TO_WIN[this.players.length] || 4;
    this.round = 0;
    this.deck = [];
    this.removedFaceDown = null;
    this.removedFaceUp = [];
    this.currentIdx = 0;
    this.log = [];
    this.phase = 'lobby'; // lobby | round | roundEnd | matchEnd
    this.matchWinner = null;
    this.pendingSycophant = null; // { byPlayerIdx, targetIdx }
    this.jesterBets = []; // { bettor, target }
    this.lastStartWinner = 0;
    this.matchEnded = false;
  }

  // ========== ROUND LIFECYCLE ==========
  startRound() {
    this.round++;
    this.phase = 'round';
    this.log = [];
    this.jesterBets = [];
    this.pendingSycophant = null;
    this.pushLog(`── Manche ${this.round} ──`, 'highlight');

    // Reset player state
    for (const p of this.players) {
      p.hand = [];
      p.discard = [];
      p.eliminated = false;
      p.protected = false;
      p.constableActive = false;
      p.countDiscards = 0;
    }

    // Build & shuffle deck (deterministic from seed)
    this.deck = shuffle(buildDeck(this.mode), this.rng);

    // Remove 1 face-down (and 3 face-up in 2p)
    this.removedFaceDown = this.deck.pop();
    this.removedFaceUp = [];
    if (this.players.length === 2) {
      for (let i = 0; i < 3; i++) this.removedFaceUp.push(this.deck.pop());
    }

    // Deal 1 card each
    for (const p of this.players) {
      p.hand.push(this.deck.pop());
    }

    // Set start player (previous round winner or initial)
    this.currentIdx = this.lastStartWinner % this.players.length;

    // Draw for first player
    this.drawForCurrent();
  }

  drawForCurrent() {
    const p = this.players[this.currentIdx];
    if (this.deck.length > 0) {
      p.hand.push(this.deck.pop());
    } else {
      // deck empty → round ends immediately at comparison
      this.endRoundByDeck();
      return;
    }
    p.protected = false;
  }

  // ========== PLAY CARD ==========
  // intent: { cardUid, targetIdx?, guessCardId?, target2Idx?, jesterTargetIdx?, baronessTargets? (array 1 or 2), lookAtIdx? (for Cardinal) }
  playCard(intent) {
    const player = this.players[this.currentIdx];
    const idx = player.hand.findIndex(c => c.uid === intent.cardUid);
    if (idx === -1) throw new Error('Card not in hand');

    // Countess rule: must play Countess if also holding King or Prince
    const hasCountess = player.hand.find(c => c.id === 'countess');
    const hasForcing = player.hand.find(c => c.id === 'king' || c.id === 'prince');
    const played = player.hand[idx];
    if (hasCountess && hasForcing && played.id !== 'countess') {
      throw new Error('Tu dois jouer la Comtesse');
    }

    // Sycophant enforcement
    if (this.pendingSycophant) {
      const forcedTarget = this.pendingSycophant.targetIdx;
      const needsTarget = this.cardNeedsTarget(played);
      const targetIsValid = this.isValidTarget(played, forcedTarget);
      if (needsTarget && targetIsValid && intent.targetIdx !== forcedTarget) {
        // For Prince it also must target self if sycophant targets self, covered by valid check.
        throw new Error('Le Courtisan oblige à cibler ' + this.players[forcedTarget].name);
      }
    }
    this.pendingSycophant = null;

    // Remove from hand and add to discard
    player.hand.splice(idx, 1);
    player.discard.push(played);
    if (played.id === 'count') player.countDiscards++;
    if (played.id === 'constable') player.constableActive = true;

    this.pushLog(`<b>${player.name}</b> joue <b>${played.name}</b>`, 'highlight');

    // Apply effect
    this.applyEffect(played, intent, player);

    if (this.phase === 'round') this.endTurn();
  }

  cardNeedsTarget(card) {
    return ['guard', 'priest', 'baron', 'prince', 'king', 'queen', 'bishop', 'cardinal', 'baroness'].includes(card.id);
  }

  isValidTarget(card, targetIdx) {
    if (targetIdx == null) return false;
    const t = this.players[targetIdx];
    if (!t || t.eliminated) return false;
    if (card.id === 'prince') return !t.protected || targetIdx === this.currentIdx;
    if (card.id === 'cardinal') return true; // handled separately
    if (targetIdx === this.currentIdx) return false;
    return !t.protected;
  }

  applyEffect(card, intent, player) {
    switch (card.id) {
      case 'guard': this.effectGuard(intent, player); break;
      case 'priest': this.effectPriest(intent, player); break;
      case 'baron': this.effectBaron(intent, player); break;
      case 'handmaid': player.protected = true; this.pushLog(`<b>${player.name}</b> est protégé·e jusqu'au prochain tour`); break;
      case 'prince': this.effectPrince(intent, player); break;
      case 'king': this.effectKing(intent, player); break;
      case 'countess': this.pushLog(`<b>${player.name}</b> défausse la Comtesse (aucun effet)`); break;
      case 'princess': this.eliminate(this.currentIdx, `${player.name} défausse la Princesse !`); break;
      // Premium
      case 'jester': this.effectJester(intent, player); break;
      case 'assassin': this.pushLog(`${player.name} défausse l'Assassin (aucun effet direct)`); break;
      case 'spy': this.pushLog(`${player.name} défausse l'Espionne`); break;
      case 'cardinal': this.effectCardinal(intent, player); break;
      case 'baroness': this.effectBaroness(intent, player); break;
      case 'sycophant': this.effectSycophant(intent, player); break;
      case 'count': this.pushLog(`Le Comte ajoutera +1 à la valeur finale de ${player.name}`); break;
      case 'constable': this.pushLog(`Le Connétable est armé pour ${player.name}`); break;
      case 'queen': this.effectQueen(intent, player); break;
      case 'bishop': this.effectBishop(intent, player); break;
    }
  }

  // ========== EFFECTS ==========
  effectGuard(intent, player) {
    if (intent.targetIdx == null) { this.pushLog(`${player.name} ne peut cibler personne`); return; }
    const target = this.players[intent.targetIdx];
    const guess = intent.guessCardId;
    const targetCard = target.hand[0];
    // Assassin riposte (premium)
    if (targetCard && targetCard.id === 'assassin') {
      this.pushLog(`<b>${target.name}</b> révèle l'Assassin ! <b>${player.name}</b> est éliminé·e`, 'elim');
      // target discards the Assassin
      target.hand.shift();
      target.discard.push(targetCard);
      this.eliminate(this.currentIdx, `${player.name} tombe sur l'Assassin`);
      return;
    }
    if (targetCard && targetCard.id === guess) {
      this.pushLog(`<b>${player.name}</b> devine juste : <b>${target.name}</b> avait ${CARD_DEFS[guess].name}`, 'elim');
      this.eliminate(intent.targetIdx, `${target.name} éliminé·e`);
    } else {
      this.pushLog(`${player.name} devine ${CARD_DEFS[guess].name} — manqué`);
    }
  }

  effectPriest(intent, player) {
    if (intent.targetIdx == null) return this.pushLog(`${player.name} ne peut cibler personne`);
    const target = this.players[intent.targetIdx];
    this.pendingReveal = { viewer: this.currentIdx, revealed: [{ playerIdx: intent.targetIdx, card: target.hand[0] }] };
    this.pushLog(`${player.name} regarde la main de ${target.name}`);
  }

  effectBaron(intent, player) {
    if (intent.targetIdx == null) return this.pushLog(`${player.name} ne peut cibler personne`);
    const target = this.players[intent.targetIdx];
    const mine = player.hand[0];
    const theirs = target.hand[0];
    if (!theirs || !mine) return;
    // Private reveal to BOTH duelers (they both see the comparison)
    this.pendingReveal = { viewers: [this.currentIdx, intent.targetIdx], revealed: [
      { playerIdx: this.currentIdx, card: mine },
      { playerIdx: intent.targetIdx, card: theirs },
    ], note: 'Duel Baron' };
    // Public log: only mention elimination (loser's card becomes public via discard).
    // Never reveal the winner's value.
    if (mine.value > theirs.value) {
      this.eliminate(intent.targetIdx, `${target.name} perd le duel Baron`);
    } else if (theirs.value > mine.value) {
      this.eliminate(this.currentIdx, `${player.name} perd le duel Baron`);
    } else {
      this.pushLog(`Égalité au Baron — aucun effet`);
    }
  }

  effectPrince(intent, player) {
    if (intent.targetIdx == null) return this.pushLog(`${player.name} ne peut cibler personne`);
    const target = this.players[intent.targetIdx];
    const discarded = target.hand.shift();
    target.discard.push(discarded);
    if (discarded.id === 'count') target.countDiscards++;
    if (discarded.id === 'constable') target.constableActive = true;
    this.pushLog(`<b>${target.name}</b> défausse <b>${discarded.name}</b> (Prince)`);
    if (discarded.id === 'princess') {
      this.eliminate(intent.targetIdx, `${target.name} défausse la Princesse`);
      return;
    }
    // Draw replacement (from deck, else face-down removed)
    let draw;
    if (this.deck.length > 0) draw = this.deck.pop();
    else if (this.removedFaceDown) { draw = this.removedFaceDown; this.removedFaceDown = null; }
    if (draw) target.hand.push(draw);
  }

  effectKing(intent, player) {
    if (intent.targetIdx == null) return this.pushLog(`${player.name} ne peut cibler personne`);
    const target = this.players[intent.targetIdx];
    const mine = player.hand.shift();
    const theirs = target.hand.shift();
    player.hand.push(theirs);
    target.hand.push(mine);
    this.pushLog(`${player.name} échange sa main avec ${target.name}`);
  }

  effectJester(intent, player) {
    if (intent.jesterTargetIdx == null) return this.pushLog(`${player.name} ne peut parier`);
    const target = this.players[intent.jesterTargetIdx];
    this.jesterBets.push({ bettor: this.currentIdx, target: intent.jesterTargetIdx });
    this.pushLog(`${player.name} parie sur ${target.name} (Bouffon)`);
  }

  effectCardinal(intent, player) {
    // target and target2 swap hands, then viewer looks at one
    const a = intent.targetIdx, b = intent.target2Idx;
    if (a == null || b == null) return this.pushLog(`Cardinal sans cibles`);
    const pa = this.players[a], pb = this.players[b];
    const tmp = pa.hand; pa.hand = pb.hand; pb.hand = tmp;
    this.pushLog(`${player.name} échange les mains de ${pa.name} et ${pb.name}`);
    const look = intent.lookAtIdx ?? a;
    const lp = this.players[look];
    this.pendingReveal = { viewer: this.currentIdx, revealed: [{ playerIdx: look, card: lp.hand[0] }] };
  }

  effectBaroness(intent, player) {
    const targets = intent.baronessTargets || [];
    const rev = [];
    for (const t of targets) {
      if (t == null) continue;
      const tp = this.players[t];
      if (!tp || tp.eliminated || tp.protected || t === this.currentIdx) continue;
      rev.push({ playerIdx: t, card: tp.hand[0] });
    }
    if (rev.length === 0) { this.pushLog(`Baronne sans cibles valides`); return; }
    this.pendingReveal = { viewer: this.currentIdx, revealed: rev };
    this.pushLog(`${player.name} espionne ${rev.map(r => this.players[r.playerIdx].name).join(' et ')}`);
  }

  effectSycophant(intent, player) {
    if (intent.targetIdx == null) return this.pushLog(`Courtisan sans cible`);
    this.pendingSycophant = { byPlayerIdx: this.currentIdx, targetIdx: intent.targetIdx };
    this.pushLog(`${player.name} désigne ${this.players[intent.targetIdx].name} (Courtisan)`);
  }

  effectQueen(intent, player) {
    if (intent.targetIdx == null) return this.pushLog(`${player.name} ne peut cibler personne`);
    const target = this.players[intent.targetIdx];
    const mine = player.hand[0], theirs = target.hand[0];
    // Both duelers see the comparison privately
    this.pendingReveal = { viewers: [this.currentIdx, intent.targetIdx], revealed: [
      { playerIdx: this.currentIdx, card: mine },
      { playerIdx: intent.targetIdx, card: theirs },
    ], note: 'Reine-mère' };
    if (mine.value > theirs.value) {
      this.eliminate(this.currentIdx, `${player.name} est éliminé·e (Reine-mère)`);
    } else if (theirs.value > mine.value) {
      this.eliminate(intent.targetIdx, `${target.name} est éliminé·e (Reine-mère)`);
    } else {
      this.pushLog(`Égalité Reine-mère — aucun effet`);
    }
  }

  effectBishop(intent, player) {
    if (intent.targetIdx == null) return;
    const target = this.players[intent.targetIdx];
    if (target.hand[0] && target.hand[0].id === intent.guessCardId) {
      player.tokens++;
      this.pushLog(`<b>${player.name}</b> devine juste (Évêque) +1 jeton`, 'highlight');
      this.pendingBishopOffer = { playerIdx: intent.targetIdx };
      if (player.tokens >= this.tokensToWin) { this.declareMatchWinner(this.currentIdx); }
    } else {
      this.pushLog(`${player.name} rate (Évêque)`);
    }
  }

  bishopDiscardChoice(accept) {
    if (!this.pendingBishopOffer) return;
    const t = this.players[this.pendingBishopOffer.playerIdx];
    if (accept && !t.eliminated) {
      const discarded = t.hand.shift();
      t.discard.push(discarded);
      if (discarded.id === 'princess') {
        this.eliminate(this.pendingBishopOffer.playerIdx, `${t.name} défausse la Princesse`);
      } else {
        let draw = this.deck.length > 0 ? this.deck.pop() : (this.removedFaceDown ? (() => { const c = this.removedFaceDown; this.removedFaceDown = null; return c; })() : null);
        if (draw) t.hand.push(draw);
        this.pushLog(`${t.name} accepte de défausser et repiocher (Évêque)`);
      }
    }
    this.pendingBishopOffer = null;
  }

  // ========== ELIMINATION / TURN END ==========
  eliminate(idx, reason) {
    const p = this.players[idx];
    if (p.eliminated) return;
    p.eliminated = true;
    // Discard remaining hand face-up
    while (p.hand.length) p.discard.push(p.hand.shift());
    this.pushLog(reason, 'elim');
    // Constable bonus
    if (p.constableActive) {
      p.tokens++;
      this.pushLog(`${p.name} gagne 1 jeton (Connétable)`, 'highlight');
      if (p.tokens >= this.tokensToWin) this.declareMatchWinner(idx);
    }
  }

  endTurn() {
    // Check round end by eliminations
    const alive = this.players.map((p, i) => ({ p, i })).filter(x => !x.p.eliminated);
    if (alive.length <= 1) {
      this.endRoundByElimination(alive[0]?.i ?? this.currentIdx);
      return;
    }
    if (this.deck.length === 0) {
      this.endRoundByDeck();
      return;
    }
    // Next player
    do {
      this.currentIdx = (this.currentIdx + 1) % this.players.length;
    } while (this.players[this.currentIdx].eliminated);
    this.drawForCurrent();
  }

  endRoundByElimination(winnerIdx) {
    this.awardRound([winnerIdx], 'dernier·e survivant·e');
  }

  endRoundByDeck() {
    const alive = this.players.map((p, i) => ({ p, i })).filter(x => !x.p.eliminated);
    // Compute effective value: base + countDiscards
    const withVal = alive.map(x => ({ ...x, val: (x.p.hand[0]?.value || 0) + x.p.countDiscards }));
    const max = Math.max(...withVal.map(x => x.val));
    let top = withVal.filter(x => x.val === max);
    if (top.length > 1) {
      // tiebreaker: highest sum of discard values
      const sums = top.map(x => ({ ...x, sum: x.p.discard.reduce((s, c) => s + c.value, 0) }));
      const maxSum = Math.max(...sums.map(x => x.sum));
      top = sums.filter(x => x.sum === maxSum);
    }
    this.awardRound(top.map(x => x.i), `pioche vide (valeur ${max})`);
  }

  awardRound(winnerIdxs, reason) {
    this.phase = 'roundEnd';
    for (const idx of winnerIdxs) {
      this.players[idx].tokens++;
      this.pushLog(`<b>${this.players[idx].name}</b> gagne la manche (${reason})`, 'highlight');
    }
    // Jester bets
    for (const bet of this.jesterBets) {
      if (winnerIdxs.includes(bet.target)) {
        this.players[bet.bettor].tokens++;
        this.pushLog(`<b>${this.players[bet.bettor].name}</b> remporte son pari Bouffon +1`, 'highlight');
      }
    }
    // Spy: only player with >=1 spy in discard gains 1 token
    const spyOwners = this.players
      .map((p, i) => ({ p, i, n: p.discard.filter(c => c.id === 'spy').length }))
      .filter(x => x.n > 0);
    if (spyOwners.length === 1) {
      const s = spyOwners[0];
      s.p.tokens++;
      this.pushLog(`<b>${s.p.name}</b> gagne 1 jeton (seule Espionne)`, 'highlight');
    }
    this.lastStartWinner = winnerIdxs[0];
    // Check match end
    const winner = this.players.find(p => p.tokens >= this.tokensToWin);
    if (winner) {
      this.declareMatchWinner(this.players.indexOf(winner));
    }
  }

  declareMatchWinner(idx) {
    this.phase = 'matchEnd';
    this.matchEnded = true;
    this.matchWinner = idx;
    this.pushLog(`🏆 ${this.players[idx].name} remporte la partie !`, 'highlight');
  }

  currentPlayer() { return this.players[this.currentIdx]; }

  nextPlayerIdx() {
    if (this.phase !== 'round') return null;
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const idx = (this.currentIdx + k) % n;
      if (!this.players[idx].eliminated) return idx;
    }
    return null;
  }
  pushLog(text, cls = '') { this.log.push({ text, cls, round: this.round }); }

  // Helpers for UI
  validTargets(card, fromIdx = this.currentIdx) {
    return this.players
      .map((p, i) => ({ p, i }))
      .filter(x => !x.p.eliminated && !x.p.protected && x.i !== fromIdx)
      .map(x => x.i);
  }

  mustPlayCountess() {
    const p = this.currentPlayer();
    return p.hand.find(c => c.id === 'countess') && p.hand.find(c => c.id === 'king' || c.id === 'prince');
  }
}
