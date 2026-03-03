'use strict';

const {
  ALL_SUITS, RANKS_4P, RANKS_6_8P,
  RANK_VALUE_4P, RANK_VALUE_6_8P,
  MINDI_RANK,
} = require('./constants');

/**
 * Generate a card object.
 * id is globally unique across decks using deckIndex suffix.
 */
function makeCard(rank, suit, deckIndex) {
  const rankValue = deckIndex === 0
    ? (RANK_VALUE_4P[rank] ?? RANK_VALUE_6_8P[rank])
    : RANK_VALUE_6_8P[rank];
  return Object.freeze({
    id:        `${rank}${suit}_${deckIndex}`,
    rank,
    suit,
    value:     rankValue,
    isMindi:   rank === MINDI_RANK,
    deckIndex, // 0 for first deck, 1 for second
  });
}

/**
 * Generate the deck for a given player count.
 *   4 players  → 1 × 52-card deck (ranks 2-A)
 *   6 players  → 2 × 36-card decks (ranks 6-A)
 *   8 players  → 2 × 36-card decks (ranks 6-A)
 *
 * @param {4|6|8} playerCount
 * @returns {Card[]} frozen array
 */
function generateDeck(playerCount) {
  if (playerCount === 4) {
    const cards = [];
    for (const suit of ALL_SUITS) {
      for (const rank of RANKS_4P) {
        cards.push(makeCard(rank, suit, 0));
      }
    }
    return Object.freeze(cards);
  }

  // 6 or 8 players: two decks, ranks 6-A
  const cards = [];
  for (let deckIdx = 0; deckIdx < 2; deckIdx++) {
    for (const suit of ALL_SUITS) {
      for (const rank of RANKS_6_8P) {
        cards.push(makeCard(rank, suit, deckIdx));
      }
    }
  }
  return Object.freeze(cards);
}

/**
 * Fisher-Yates shuffle. Pure function; does not mutate input.
 * rng defaults to Math.random but is injectable for deterministic testing.
 *
 * @param {Card[]} deck
 * @param {() => number} [rng]
 * @returns {Card[]} new shuffled frozen array
 */
function shuffleDeck(deck, rng = Math.random) {
  const arr = deck.slice(); // mutable copy
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return Object.freeze(arr);
}

module.exports = { generateDeck, shuffleDeck };
