'use strict';

/**
 * INVARIANTS LAYER
 * ─────────────────
 * Verifies structural integrity of a GameState after every transition.
 * Throws a descriptive error if any invariant is violated.
 * This catches bugs in the transitions layer during testing.
 *
 * Production usage: wrap calls in try/catch; log invariant violations as
 * critical errors and alert on-call.
 */

const { PHASE, HAND_SIZE, MINDI_TOTAL, TOTAL_TRICKS } = require('./constants');

/**
 * Run all invariant checks on a state.
 * @param {GameState} state
 * @throws {Error} if any invariant is violated
 */
function checkInvariants(state) {
  checkTeamConsistency(state);
  checkSeatConsistency(state);
  if (state.phase !== PHASE.WAITING && state.phase !== PHASE.DEALING) {
    checkCardConservation(state);
  }
  checkTrickConsistency(state);
  checkBiddingMonotonicity(state);
  checkScoreConsistency(state);
  checkTurnConsistency(state);
}

// ─── Team / seat consistency ─────────────────────────────────────────────────

function checkTeamConsistency(state) {
  for (const [playerId, player] of Object.entries(state.players)) {
    const team = state.teams[player.teamId];
    if (!team || !team.playerIds.includes(playerId)) {
      throw new Error(`INVARIANT: player ${playerId} teamId=${player.teamId} not in teams`);
    }
  }

  // Team A = odd seats, Team B = even seats
  for (const [playerId, player] of Object.entries(state.players)) {
    const expected = player.seatNumber % 2 === 1 ? 'A' : 'B';
    if (player.teamId !== expected) {
      throw new Error(`INVARIANT: player ${playerId} seat=${player.seatNumber} expected team ${expected}, got ${player.teamId}`);
    }
  }
}

function checkSeatConsistency(state) {
  for (const [seat, pid] of Object.entries(state.seats)) {
    if (!state.players[pid]) {
      throw new Error(`INVARIANT: seat ${seat} has unknown playerId ${pid}`);
    }
    if (state.players[pid].seatNumber !== Number(seat)) {
      throw new Error(`INVARIANT: seat map mismatch for ${pid}`);
    }
  }
}

// ─── Card conservation ───────────────────────────────────────────────────────

/**
 * Total cards in hands + hidden + played in all tricks + current trick
 * must equal the original deck size.
 */
function checkCardConservation(state) {
  if (!state.hands || Object.keys(state.hands).length === 0) return;

  const deckSize = state.playerCount === 4 ? 52 : 72;

  let total = 0;

  // All cards remain in hands (hidden card stays in hand, just marked).
  for (const hand of Object.values(state.hands)) {
    total += hand.length;
  }

  // Cards played in past tricks
  for (const trick of state.trickHistory) {
    total += trick.plays.length;
  }

  // Cards in current trick (removed from hands when played)
  total += state.currentTrick.plays.length;

  if (total !== deckSize) {
    throw new Error(
      `INVARIANT: card conservation violated. Expected ${deckSize}, got ${total}. ` +
      `phase=${state.phase}`
    );
  }
}

// ─── Trick consistency ───────────────────────────────────────────────────────

function checkTrickConsistency(state) {
  // Current trick plays must not exceed player count
  if (state.currentTrick.plays.length > state.playerCount) {
    throw new Error(`INVARIANT: currentTrick has ${state.currentTrick.plays.length} plays for ${state.playerCount} players`);
  }

  // Each completed trick must have exactly playerCount plays
  for (let i = 0; i < state.trickHistory.length; i++) {
    const t = state.trickHistory[i];
    if (t.plays.length !== state.playerCount) {
      throw new Error(`INVARIANT: trickHistory[${i}] has ${t.plays.length} plays, expected ${state.playerCount}`);
    }
  }

  // Total tricks in history must not exceed totalTricks for this match
  const maxTricks = TOTAL_TRICKS[state.playerCount];
  if (state.trickHistory.length > maxTricks) {
    throw new Error(`INVARIANT: trickHistory has ${state.trickHistory.length} tricks, max is ${maxTricks}`);
  }
}

// ─── Bidding monotonicity ────────────────────────────────────────────────────

function checkBiddingMonotonicity(state) {
  const { biddingState } = state;
  if (!biddingState || !biddingState.bids) return;

  const { highestBid, bids } = biddingState;
  if (!highestBid) return;

  // Every bid in the record must be <= highestBid.amount
  for (const [pid, bid] of Object.entries(bids)) {
    if (bid.amount > highestBid.amount) {
      throw new Error(`INVARIANT: player ${pid} bid ${bid.amount} exceeds highestBid ${highestBid.amount}`);
    }
  }
}

// ─── Score consistency ───────────────────────────────────────────────────────

function checkScoreConsistency(state) {
  const { tricksWonByTeam, mindisByTeam } = state.score;
  const totalTricksPlayed = state.trickHistory.length;

  const scoredTricks = (tricksWonByTeam.A ?? 0) + (tricksWonByTeam.B ?? 0);
  if (scoredTricks !== totalTricksPlayed) {
    throw new Error(
      `INVARIANT: score tricks ${scoredTricks} !== trickHistory.length ${totalTricksPlayed}`
    );
  }

  const totalMindis = MINDI_TOTAL[state.playerCount];
  const scoredMindis = (mindisByTeam.A ?? 0) + (mindisByTeam.B ?? 0);
  if (scoredMindis > totalMindis) {
    throw new Error(
      `INVARIANT: scoredMindis ${scoredMindis} exceeds total ${totalMindis}`
    );
  }
}

// ─── Turn consistency ────────────────────────────────────────────────────────

function checkTurnConsistency(state) {
  if (state.phase === PHASE.PLAYING && state.turn !== null) {
    if (!state.players[state.turn]) {
      throw new Error(`INVARIANT: turn=${state.turn} is not a known player`);
    }
  }
}

module.exports = { checkInvariants };
