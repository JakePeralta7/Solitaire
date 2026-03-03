'use strict';

// ─── Card constants ────────────────────────────────────────────────────────────
// rank: 1 (Ace) – 13 (King)
// suit: 'S' (Spades), 'H' (Hearts), 'D' (Diamonds), 'C' (Clubs)
// Black suits: S, C  |  Red suits: H, D

const SUITS = ['S', 'H', 'D', 'C'];

/** Return true when the suit is red (Hearts or Diamonds). */
function isRed(suit) {
  return suit === 'H' || suit === 'D';
}

// ─── Deck ──────────────────────────────────────────────────────────────────────

/** Build a fresh 52-card deck. */
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle — mutates and returns the deck. */
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ─── Deal ──────────────────────────────────────────────────────────────────────

/**
 * Create a fresh Klondike game state.
 * @param {1|3} drawMode  – cards flipped from stock per draw action
 * @returns {object}       full game state (server-authoritative)
 */
function deal(drawMode) {
  const deck = shuffle(createDeck());

  // Build 7 tableau columns.
  // Column i has i face-down cards then 1 face-up card (0-indexed: col 0 = 1 card).
  const tableau = [];
  let deckIdx = 0;
  for (let col = 0; col < 7; col++) {
    const column = [];
    for (let row = 0; row <= col; row++) {
      const card = deck[deckIdx++];
      column.push({ ...card, faceUp: row === col });
    }
    tableau.push(column);
  }

  // Remaining 24 cards form the stock (index 0 = bottom, last = top of draw pile).
  const stock = deck.slice(deckIdx);

  return {
    stock,                      // face-down draw pile
    waste: [],                  // face-up discard pile (last element = top)
    foundations: [[], [], [], []], // 4 piles, built Ace-up per suit
    tableau,
    drawMode,
    moves: 0,
    recycleCount: 0,
  };
}

// ─── Draw stock ────────────────────────────────────────────────────────────────

/**
 * Flip `state.drawMode` cards from stock to waste.
 * If stock is empty, recycle all waste cards back (face-down) into stock.
 * Mutates state and returns it.
 */
function drawStock(state) {
  if (state.stock.length === 0) {
    // Recycle waste → stock (reverse so original draw order is preserved)
    state.stock = state.waste.reverse().map(c => ({ ...c, faceUp: false }));
    state.waste = [];
    state.recycleCount++;
    state.moves++;
    return state;
  }

  const count = Math.min(state.drawMode, state.stock.length);
  for (let i = 0; i < count; i++) {
    const card = state.stock.pop();
    state.waste.push({ ...card, faceUp: true });
  }
  state.moves++;
  return state;
}

// ─── Validation helpers ────────────────────────────────────────────────────────

/**
 * True when `card` can legally be placed on top of `targetCard` in a tableau column.
 * Rule: alternating colour, descending rank.
 * A King (rank 13) can go on an empty column (targetCard === null).
 */
function isValidTableauMove(card, targetCard) {
  if (targetCard === null) return card.rank === 13; // King to empty column
  return isRed(card.suit) !== isRed(targetCard.suit) && card.rank === targetCard.rank - 1;
}

/**
 * True when `card` can legally be placed on the given foundation pile.
 * Rule: same suit, ascending rank, starting with Ace.
 */
function isValidFoundationMove(card, foundationCards) {
  if (foundationCards.length === 0) return card.rank === 1; // Ace starts a pile
  const top = foundationCards[foundationCards.length - 1];
  return card.suit === top.suit && card.rank === top.rank + 1;
}

// ─── Move cards ────────────────────────────────────────────────────────────────

/**
 * Execute a move and return `{ ok: boolean, error?: string }`.
 * Mutates state on success.
 *
 * `from` options
 *   { pile: 'waste' }
 *   { pile: 'tableau', col: 0-6, cardIndex: N }  – N = index in column array; all cards from N upward move together
 *   { pile: 'foundation', index: 0-3 }
 *
 * `to` options
 *   { pile: 'tableau', col: 0-6 }
 *   { pile: 'foundation', index: 0-3 }  OR  { pile: 'foundation' } to auto-place
 */
function moveCards(state, from, to) {
  // ── Pick up cards ────────────────────────────────────────────────────────
  let cards;

  if (from.pile === 'waste') {
    if (state.waste.length === 0) return { ok: false, error: 'Waste is empty' };
    cards = [state.waste[state.waste.length - 1]];
  } else if (from.pile === 'tableau') {
    const col = state.tableau[from.col];
    if (!col || from.cardIndex == null || from.cardIndex < 0 || from.cardIndex >= col.length) {
      return { ok: false, error: 'Invalid tableau source' };
    }
    if (!col[from.cardIndex].faceUp) return { ok: false, error: 'Card is face-down' };
    cards = col.slice(from.cardIndex);
  } else if (from.pile === 'foundation') {
    const pile = state.foundations[from.index];
    if (!pile || pile.length === 0) return { ok: false, error: 'Foundation pile is empty' };
    cards = [pile[pile.length - 1]];
  } else {
    return { ok: false, error: 'Unknown source pile' };
  }

  // ── Validate destination ──────────────────────────────────────────────────

  if (to.pile === 'tableau') {
    const targetCol = state.tableau[to.col];
    if (!targetCol) return { ok: false, error: 'Invalid tableau target' };
    const targetTop = targetCol.length === 0 ? null : targetCol[targetCol.length - 1];
    if (!isValidTableauMove(cards[0], targetTop)) {
      return { ok: false, error: 'Invalid tableau move' };
    }

    // Only single cards can come from foundation; sequences can be whole runs
    if (from.pile === 'foundation' && cards.length > 1) {
      return { ok: false, error: 'Cannot move a sequence from foundation' };
    }
  } else if (to.pile === 'foundation') {
    if (cards.length !== 1) return { ok: false, error: 'Only one card can go to foundation at a time' };
    const card = cards[0];

    // Auto-detect foundation index if not specified
    let foundIdx = to.index;
    if (foundIdx == null) {
      // Try to find the matching foundation pile
      foundIdx = state.foundations.findIndex(f => isValidFoundationMove(card, f));
      if (foundIdx === -1) return { ok: false, error: 'No valid foundation for this card' };
    } else {
      if (!isValidFoundationMove(card, state.foundations[foundIdx])) {
        return { ok: false, error: 'Invalid foundation move' };
      }
    }
    // Resolve auto-detected index back into `to` so the commit step uses it
    to = { ...to, index: foundIdx };
  } else {
    return { ok: false, error: 'Unknown destination pile' };
  }

  // ── Commit: remove from source ────────────────────────────────────────────

  if (from.pile === 'waste') {
    state.waste.pop();
  } else if (from.pile === 'tableau') {
    state.tableau[from.col].splice(from.cardIndex);
    // Flip the newly exposed top card of the source column
    const srcCol = state.tableau[from.col];
    if (srcCol.length > 0 && !srcCol[srcCol.length - 1].faceUp) {
      srcCol[srcCol.length - 1].faceUp = true;
    }
  } else if (from.pile === 'foundation') {
    state.foundations[from.index].pop();
  }

  // ── Commit: add to destination ────────────────────────────────────────────

  if (to.pile === 'tableau') {
    state.tableau[to.col].push(...cards);
  } else if (to.pile === 'foundation') {
    state.foundations[to.index].push(cards[0]);
  }

  state.moves++;
  return { ok: true };
}

// ─── Win condition ─────────────────────────────────────────────────────────────

/** True when all four foundation piles each have 13 cards (game complete). */
function isWon(state) {
  return state.foundations.every(f => f.length === 13);
}

// ─── Client-safe view ─────────────────────────────────────────────────────────

/**
 * Return a sanitised copy of the state for the client.
 * - Stock cards are hidden (only count exposed).
 * - Face-down tableau cards are replaced with `{ faceUp: false }`.
 */
function clientState(state) {
  return {
    stockCount: state.stock.length,
    // Expose top drawMode waste cards (always face-up)
    waste: state.waste.map(c => ({ rank: c.rank, suit: c.suit, faceUp: true })),
    foundations: state.foundations.map(pile =>
      pile.map(c => ({ rank: c.rank, suit: c.suit, faceUp: true }))
    ),
    tableau: state.tableau.map(col =>
      col.map(c => c.faceUp ? { rank: c.rank, suit: c.suit, faceUp: true } : { faceUp: false })
    ),
    drawMode: state.drawMode,
    moves: state.moves,
    recycleCount: state.recycleCount,
  };
}

// ─── Exports ───────────────────────────────────────────────────────────────────

module.exports = { deal, drawStock, moveCards, isWon, clientState };
