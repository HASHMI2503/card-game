'use strict';

/**
 * VALIDATORS LAYER
 * ─────────────────
 * All functions are PURE: (state, ...args) -> { valid: boolean, error?: string }
 * They never mutate state. They are called by the transitions layer before
 * any state change is attempted.
 */

const { PHASE, ALL_SUITS, BID_LIMITS, ERROR, TEAM } = require('./constants');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fail(error) { return { valid: false, error }; }
function ok()        { return { valid: true }; }

// ─── Phase guards ────────────────────────────────────────────────────────────

function requirePhase(state, ...phases) {
  if (!phases.includes(state.phase)) return fail(ERROR.WRONG_PHASE);
  return ok();
}

// ─── Player membership ───────────────────────────────────────────────────────

function requirePlayer(state, playerId) {
  if (!state.players[playerId]) return fail(ERROR.INVALID_PLAYER);
  return ok();
}

// ─── addPlayer validation ────────────────────────────────────────────────────

function validateAddPlayer(state, playerId, seatNumber) {
  const phaseCheck = requirePhase(state, PHASE.WAITING);
  if (!phaseCheck.valid) return phaseCheck;

  if (state.players[playerId]) return fail(ERROR.DUPLICATE_PLAYER);

  const playerCount = Object.keys(state.players).length;
  if (playerCount >= state.playerCount) return fail(ERROR.GAME_FULL);

  if (
    typeof seatNumber !== 'number' ||
    seatNumber < 1 ||
    seatNumber > state.playerCount
  ) return fail(ERROR.SEAT_OUT_OF_RANGE);

  if (state.seats[seatNumber]) return fail(ERROR.SEAT_TAKEN);

  return ok();
}

// ─── startDeal validation ────────────────────────────────────────────────────

function validateStartDeal(state, playerId) {
  const phaseCheck = requirePhase(state, PHASE.WAITING, PHASE.DEALING);
  if (!phaseCheck.valid) return phaseCheck;

  // Must have all players seated
  const seated = Object.keys(state.players).length;
  if (seated < state.playerCount) return fail(ERROR.GAME_FULL); // not enough players yet

  const playerCheck = requirePlayer(state, playerId);
  if (!playerCheck.valid) return playerCheck;

  // After first match, only the designated nextDealerTeam can initiate deal
  if (!state.firstMatch) {
    const playerTeam = state.players[playerId].teamId;
    if (playerTeam !== state.nextDealerTeam) return fail(ERROR.WRONG_DEALER_TEAM);
  }

  return ok();
}

// ─── selectHiddenCard validation ─────────────────────────────────────────────

function validateSelectHiddenCard(state, playerId, cardIndex) {
  const phaseCheck = requirePhase(state, PHASE.HIDING_CARD);
  if (!phaseCheck.valid) return phaseCheck;

  const playerCheck = requirePlayer(state, playerId);
  if (!playerCheck.valid) return playerCheck;

  const player = state.players[playerId];
  if (player.teamId !== state.hidingTeam) return fail(ERROR.NOT_HIDING_TEAM);

  const hand = state.hands[playerId] ?? [];
  if (
    typeof cardIndex !== 'number' ||
    cardIndex < 0 ||
    cardIndex >= hand.length
  ) return fail(ERROR.CARD_NOT_IN_HAND);

  return ok();
}

// ─── peekHiddenCard validation ───────────────────────────────────────────────

function validatePeekHiddenCard(state, playerId) {
  // Allowed: CONTRACT mode, only bidding winner, card not yet revealed
  if (state.gameMode !== 'CONTRACT') return fail(ERROR.PEEK_NOT_ALLOWED);
  if (state.biddingState.biddingWinner !== playerId) return fail(ERROR.NOT_BIDDING_WINNER);
  if (state.hiddenCardRevealed) return fail(ERROR.ALREADY_REVEALED);

  const playerCheck = requirePlayer(state, playerId);
  if (!playerCheck.valid) return playerCheck;

  return ok();
}

// ─── startBidding validation ─────────────────────────────────────────────────

function validateStartBidding(state, deadlineTimestamp) {
  const phaseCheck = requirePhase(state, PHASE.HIDING_CARD);
  if (!phaseCheck.valid) return phaseCheck;

  if (!state.hiddenCard) return fail(ERROR.WRONG_PHASE); // hidden card must be set first

  if (typeof deadlineTimestamp !== 'number' || deadlineTimestamp <= 0) {
    return fail(ERROR.WRONG_PHASE);
  }

  return ok();
}

// ─── submitBid validation ────────────────────────────────────────────────────

function validateSubmitBid(state, playerId, amount, timestamp) {
  const phaseCheck = requirePhase(state, PHASE.BIDDING);
  if (!phaseCheck.valid) return phaseCheck;

  if (!state.biddingState.isOpen) return fail(ERROR.BIDDING_CLOSED);

  const playerCheck = requirePlayer(state, playerId);
  if (!playerCheck.valid) return playerCheck;

  if (state.biddingState.passedPlayers.includes(playerId)) return fail(ERROR.ALREADY_PASSED);

  const limits = BID_LIMITS[state.playerCount];
  if (amount < limits.min || amount > limits.max) return fail(ERROR.BID_OUT_OF_RANGE);

  const current = state.biddingState.highestBid;
  if (current !== null) {
    if (amount < current.amount) return fail(ERROR.BID_TOO_LOW);
    if (amount === current.amount) {
      // Tie: earlier timestamp wins — so same-amount bid from later timestamp is rejected
      if (timestamp >= current.timestamp) return fail(ERROR.BID_TOO_LOW);
    }
  }

  return ok();
}

// ─── passBid validation ──────────────────────────────────────────────────────

function validatePassBid(state, playerId) {
  const phaseCheck = requirePhase(state, PHASE.BIDDING);
  if (!phaseCheck.valid) return phaseCheck;

  if (!state.biddingState.isOpen) return fail(ERROR.BIDDING_CLOSED);

  const playerCheck = requirePlayer(state, playerId);
  if (!playerCheck.valid) return playerCheck;

  if (state.biddingState.passedPlayers.includes(playerId)) return fail(ERROR.ALREADY_PASSED);

  return ok();
}

// ─── closeBidding validation ─────────────────────────────────────────────────

function validateCloseBidding(state) {
  const phaseCheck = requirePhase(state, PHASE.BIDDING);
  if (!phaseCheck.valid) return phaseCheck;

  if (!state.biddingState.isOpen) return fail(ERROR.BIDDING_CLOSED);

  return ok();
}

// ─── selectTrumpSuit validation ──────────────────────────────────────────────

function validateSelectTrumpSuit(state, playerId, suit) {
  const phaseCheck = requirePhase(state, PHASE.TRUMP_SELECTION);
  if (!phaseCheck.valid) return phaseCheck;

  const playerCheck = requirePlayer(state, playerId);
  if (!playerCheck.valid) return playerCheck;

  if (state.biddingState.biddingWinner !== playerId) return fail(ERROR.NOT_BIDDING_WINNER);

  if (!ALL_SUITS.includes(suit)) return fail(ERROR.INVALID_SUIT);

  return ok();
}

// ─── playCard validation ─────────────────────────────────────────────────────

function validatePlayCard(state, playerId, cardIndex) {
  const phaseCheck = requirePhase(state, PHASE.PLAYING);
  if (!phaseCheck.valid) return phaseCheck;

  const playerCheck = requirePlayer(state, playerId);
  if (!playerCheck.valid) return playerCheck;

  if (state.turn !== playerId) return fail(ERROR.WRONG_TURN);

  const hand = state.hands[playerId] ?? [];
  if (
    typeof cardIndex !== 'number' ||
    cardIndex < 0 ||
    cardIndex >= hand.length
  ) return fail(ERROR.CARD_NOT_IN_HAND);

  return ok();
}

// ─── suit-follow validation ───────────────────────────────────────────────────

/**
 * Checks if playing the card at cardIndex is legal given the led suit.
 * Must follow suit if any card of the led suit is in hand.
 *
 * @param {GameState} state
 * @param {string} playerId
 * @param {number} cardIndex
 * @returns {{ valid: boolean, error?: string, canFollow: boolean }}
 */
function validateSuitFollow(state, playerId, cardIndex) {
  const ledSuit = state.currentTrick.ledSuit;

  // No led suit yet (this player is leading the trick) — any card is fine
  if (ledSuit === null) return { valid: true, canFollow: true };

  const hand = state.hands[playerId];
  const card = hand[cardIndex];
  const hasLedSuit = hand.some(c => c.suit === ledSuit);

  if (hasLedSuit && card.suit !== ledSuit) {
    return { valid: false, error: ERROR.MUST_FOLLOW_SUIT, canFollow: true };
  }

  return { valid: true, canFollow: hasLedSuit };
}

// ─── requestHiddenCardReveal validation ──────────────────────────────────────

/**
 * Reveal is legal only when:
 *   - Phase is PLAYING
 *   - It is this player's turn
 *   - Card has not already been revealed
 *   - The player cannot follow the led suit (canFollow = false)
 */
function validateReveal(state, playerId, cardIndex) {
  if (state.phase !== PHASE.PLAYING) return fail(ERROR.WRONG_PHASE);
  if (state.turn !== playerId) return fail(ERROR.WRONG_TURN);
  if (state.hiddenCardRevealed) return fail(ERROR.ALREADY_REVEALED);
  if (!state.hiddenCard) return fail(ERROR.WRONG_PHASE);

  const { canFollow } = validateSuitFollow(state, playerId, cardIndex);
  if (canFollow) return fail(ERROR.REVEAL_NOT_LEGAL); // can follow suit, so reveal not allowed

  return ok();
}

module.exports = {
  validateAddPlayer,
  validateStartDeal,
  validateSelectHiddenCard,
  validatePeekHiddenCard,
  validateStartBidding,
  validateSubmitBid,
  validatePassBid,
  validateCloseBidding,
  validateSelectTrumpSuit,
  validatePlayCard,
  validateSuitFollow,
  validateReveal,
  requirePhase,
  requirePlayer,
};
