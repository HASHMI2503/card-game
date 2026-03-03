'use strict';

/**
 * RULES LAYER
 * ────────────
 * Pure functions that evaluate game rules and return decisions.
 * No state mutation. No side effects.
 * Called by the transitions layer to determine outcomes.
 */

const { MINDI_RANK, MINDI_MAJORITY, TEAM } = require('./constants');

// ─── Team assignment ─────────────────────────────────────────────────────────

/**
 * Seat parity determines team:
 *   Odd seats  (1,3,5,7) → Team A
 *   Even seats (2,4,6,8) → Team B
 */
function getTeamForSeat(seatNumber) {
  return seatNumber % 2 === 1 ? TEAM.A : TEAM.B;
}

// ─── Trick winner resolution ─────────────────────────────────────────────────

/**
 * Determine the winner of a completed trick.
 *
 * Resolution order:
 *   1. Trump cards beat all non-trump.
 *   2. Among trump: highest rank wins; duplicate rank → first played wins.
 *   3. No trump played: highest card of led suit wins; duplicate → first played wins.
 *   4. Cards of other suits (not led, not trump) never win.
 *
 * @param {{ leadPlayerId, ledSuit, plays: Array<{ playerId, card, order }> }} trick
 * @param {string|null} trumpSuit
 * @returns {{ winnerPlayerId: string, mindisCaptured: number }}
 */
function resolveTrickWinner(trick, trumpSuit) {
  const { ledSuit, plays } = trick;

  // Separate plays into trump and non-trump eligible (led suit)
  const trumpPlays = trumpSuit
    ? plays.filter(p => p.card.suit === trumpSuit)
    : [];

  const eligiblePlays = trumpPlays.length > 0
    ? trumpPlays
    : plays.filter(p => p.card.suit === ledSuit);

  // Sort: highest value first; for ties, lowest order (earliest played) wins
  const sorted = eligiblePlays.slice().sort((a, b) => {
    if (b.card.value !== a.card.value) return b.card.value - a.card.value;
    return a.order - b.order; // earlier play wins on duplicate
  });

  const winnerPlay = sorted[0];

  // Count mindis (10s) captured in this trick
  const mindisCaptured = plays.filter(p => p.card.rank === MINDI_RANK).length;

  return {
    winnerPlayerId: winnerPlay.playerId,
    mindisCaptured,
  };
}

// ─── Suit-follow check ───────────────────────────────────────────────────────

/**
 * Determine if a player can follow the led suit.
 * @param {Card[]} hand
 * @param {string|null} ledSuit
 * @returns {boolean}
 */
function canFollowSuit(hand, ledSuit) {
  if (!ledSuit) return false; // leading: no constraint
  return hand.some(c => c.suit === ledSuit);
}

// ─── Next player in seat order ───────────────────────────────────────────────

/**
 * Returns the playerId of the player who sits immediately after `currentPlayerId`
 * in ascending seat order, wrapping around.
 *
 * @param {{ [seatNumber]: playerId }} seats
 * @param {string} currentPlayerId
 * @param {{ [playerId]: { seatNumber } }} players
 * @returns {string}
 */
function getNextPlayerInOrder(seats, currentPlayerId, players) {
  const seatNumbers = Object.keys(seats).map(Number).sort((a, b) => a - b);
  const currentSeat = players[currentPlayerId].seatNumber;
  const currentIdx  = seatNumbers.indexOf(currentSeat);
  const nextSeat    = seatNumbers[(currentIdx + 1) % seatNumbers.length];
  return seats[nextSeat];
}

// ─── All players in trick order starting from leader ─────────────────────────

/**
 * Returns ordered array of playerIds starting from leadPlayerId
 * going around the table in ascending seat order.
 */
function getTrickOrder(seats, leadPlayerId, players) {
  const seatNumbers = Object.keys(seats).map(Number).sort((a, b) => a - b);
  const leadSeat    = players[leadPlayerId].seatNumber;
  const leadIdx     = seatNumbers.indexOf(leadSeat);

  return seatNumbers.map((_, i) => {
    const seat = seatNumbers[(leadIdx + i) % seatNumbers.length];
    return seats[seat];
  });
}

// ─── Bidding score (for tie-breaking by timestamp) ───────────────────────────

/**
 * Given two bids, returns true if bidA beats bidB.
 * Higher amount wins; on equal amount, earlier timestamp wins.
 */
function bidBeats(bidA, bidB) {
  if (bidA.amount !== bidB.amount) return bidA.amount > bidB.amount;
  return bidA.timestamp < bidB.timestamp;
}

// ─── Match result calculation ─────────────────────────────────────────────────

/**
 * CONTRACT mode: bidding team wins if they captured >= bid amount of tricks.
 *
 * @param {GameState} state
 * @returns {{ winnerTeam: string|null, isDraw: boolean }}
 */
function evaluateContractResult(state) {
  const { biddingWinner, highestBid } = state.biddingState;
  const bidAmount   = highestBid.amount;
  const bidderTeam  = state.players[biddingWinner].teamId;
  const otherTeam   = bidderTeam === TEAM.A ? TEAM.B : TEAM.A;
  const teamTricks  = state.score.tricksWonByTeam[bidderTeam];

  const bidTeamWon = teamTricks >= bidAmount;
  return {
    winnerTeam: bidTeamWon ? bidderTeam : otherTeam,
    isDraw:     false,
  };
}

/**
 * MINDI mode: team with majority of mindis (10s) wins.
 * 4-player: majority = 3 of 4; exact 2-2 = draw.
 * 6/8-player: majority = 5 of 8; no draw possible.
 *
 * @param {GameState} state
 * @returns {{ winnerTeam: string|null, isDraw: boolean }}
 */
function evaluateMindiResult(state) {
  const majority    = MINDI_MAJORITY[state.playerCount];
  const { A, B }    = state.score.mindisByTeam;

  if (A >= majority) return { winnerTeam: TEAM.A, isDraw: false };
  if (B >= majority) return { winnerTeam: TEAM.B, isDraw: false };
  // Only possible in 4-player 2-2 split
  return { winnerTeam: null, isDraw: true };
}

// ─── Next dealer after match ──────────────────────────────────────────────────

/**
 * Losing team deals next. On draw, same dealer deals again.
 *
 * @param {string} currentDealerTeam
 * @param {string|null} winnerTeam - null on draw
 * @returns {string} next dealer team
 */
function getNextDealerTeam(currentDealerTeam, winnerTeam) {
  if (winnerTeam === null) return currentDealerTeam; // draw → same dealer
  // Winning team does NOT deal; loser deals
  return winnerTeam === TEAM.A ? TEAM.B : TEAM.A;
}

module.exports = {
  getTeamForSeat,
  resolveTrickWinner,
  canFollowSuit,
  getNextPlayerInOrder,
  getTrickOrder,
  bidBeats,
  evaluateContractResult,
  evaluateMindiResult,
  getNextDealerTeam,
};
