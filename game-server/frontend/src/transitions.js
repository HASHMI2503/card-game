'use strict';

/**
 * TRANSITIONS LAYER
 * ──────────────────
 * All public state-transition functions live here.
 * Each function follows the pattern:
 *   1. Validate (validators layer) → return failure if invalid
 *   2. Evaluate rules (rules layer) → determine outcome
 *   3. Derive new state (stateFactory.deriveState) → never mutate input
 *   4. Check invariants (invariants layer) → throw on structural corruption
 *   5. Return { success: true, state } or { success: false, error, state }
 *
 * Input state is NEVER mutated.
 */

const { PHASE, TEAM, GAME_MODE, HAND_SIZE, TOTAL_TRICKS, MINDI_RANK } = require('./constants');
const { deriveState } = require('./stateFactory');
const { generateDeck, shuffleDeck } = require('./deck');
const { checkInvariants } = require('./invariants');
const {
  validateAddPlayer, validateStartDeal, validateSelectHiddenCard,
  validatePeekHiddenCard, validateStartBidding, validateSubmitBid,
  validatePassBid, validateCloseBidding, validateSelectTrumpSuit,
  validatePlayCard, validateSuitFollow, validateReveal,
} = require('./validators');
const {
  getTeamForSeat, resolveTrickWinner, getNextPlayerInOrder,
  getTrickOrder, bidBeats, evaluateContractResult,
  evaluateMindiResult, getNextDealerTeam,
} = require('./rules');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function succeed(state) {
  return { success: true, state };
}

function failure(error, state) {
  return { success: false, error, state };
}

function runInvariants(state) {
  checkInvariants(state); // throws on violation
}

// ─── addPlayer ───────────────────────────────────────────────────────────────

function addPlayer(state, playerId, seatNumber) {
  const v = validateAddPlayer(state, playerId, seatNumber);
  if (!v.valid) return failure(v.error, state);

  const teamId     = getTeamForSeat(seatNumber);
  const existingA  = state.teams[TEAM.A].playerIds;
  const existingB  = state.teams[TEAM.B].playerIds;

  const newPlayers = Object.freeze({
    ...state.players,
    [playerId]: Object.freeze({ seatNumber, teamId, joinedAt: Date.now() }),
  });

  const newSeats = Object.freeze({ ...state.seats, [seatNumber]: playerId });

  const newTeams = Object.freeze({
    [TEAM.A]: Object.freeze({
      playerIds: Object.freeze(
        teamId === TEAM.A ? [...existingA, playerId] : existingA
      ),
    }),
    [TEAM.B]: Object.freeze({
      playerIds: Object.freeze(
        teamId === TEAM.B ? [...existingB, playerId] : existingB
      ),
    }),
  });

  const newState = deriveState(state, {
    players: newPlayers,
    seats:   newSeats,
    teams:   newTeams,
  });

  runInvariants(newState);
  return succeed(newState);
}

// ─── startDeal ───────────────────────────────────────────────────────────────

function startDeal(state, initiatorPlayerId, shuffleRng) {
  const v = validateStartDeal(state, initiatorPlayerId);
  if (!v.valid) return failure(v.error, state);

  // Determine dealer team:
  // First match → initiator's team; subsequent → nextDealerTeam (already validated)
  const dealerTeam = state.firstMatch
    ? state.players[initiatorPlayerId].teamId
    : state.nextDealerTeam;

  const newState = deriveState(state, {
    phase:      PHASE.DEALING,
    dealerTeam,
  });

  // Immediately deal cards
  return dealCards(newState, shuffleRng);
}

// ─── dealCards ───────────────────────────────────────────────────────────────

function dealCards(state, shuffleRng) {
  const deck      = generateDeck(state.playerCount);
  const shuffled  = shuffleDeck(deck, shuffleRng);
  const handSize  = HAND_SIZE[state.playerCount];

  // Order players by seat number for dealing
  const orderedPlayerIds = Object.keys(state.seats)
    .map(Number)
    .sort((a, b) => a - b)
    .map(seat => state.seats[seat]);

  const hands = {};
  const playedCardsByPlayer = {};
  for (let i = 0; i < orderedPlayerIds.length; i++) {
    const pid = orderedPlayerIds[i];
    hands[pid] = Object.freeze(shuffled.slice(i * handSize, (i + 1) * handSize));
    playedCardsByPlayer[pid] = Object.freeze([]);
  }

  // Hiding team:
  // Match 1 → non-dealer team
  // Later   → previous match winner (draw → same dealer team hides again)
  let hidingTeam;
  if (state.firstMatch) {
    hidingTeam = state.dealerTeam === TEAM.A ? TEAM.B : TEAM.A;
  } else {
    // matchResult.winnerTeam null means draw → same dealer again, so hiding = same as before
    const lastWinner = state.matchResult?.winnerTeam ?? null;
    hidingTeam = lastWinner !== null
      ? lastWinner                   // winner team hides card
      : state.hidingTeam;            // draw: carry over
  }

  const newState = deriveState(state, {
    phase:        PHASE.HIDING_CARD,
    deck:         shuffled,
    hands:        Object.freeze(hands),
    playedCardsByPlayer: Object.freeze(playedCardsByPlayer),
    hidingTeam,
    hiddenCard:         null,
    hiddenCardRevealed: false,
    revealedHiddenCard: null,
    trumpSuit:          null,
    gameMode:           null,
    turn:               null,
    currentTrick: Object.freeze({ leadPlayerId: null, ledSuit: null, plays: Object.freeze([]) }),
    trickHistory:       Object.freeze([]),
    score: Object.freeze({
      tricksWonByTeam: Object.freeze({ A: 0, B: 0 }),
      mindisByTeam:    Object.freeze({ A: 0, B: 0 }),
    }),
    matchResult: null,
    biddingState: Object.freeze({
      isOpen:        false,
      deadline:      null,
      highestBid:    null,
      bids:          Object.freeze({}),
      passedPlayers: Object.freeze([]),
      biddingWinner: null,
    }),
  });

  runInvariants(newState);
  return succeed(newState);
}

// ─── selectHiddenCard ────────────────────────────────────────────────────────

function selectHiddenCard(state, playerId, cardIndex) {
  const v = validateSelectHiddenCard(state, playerId, cardIndex);
  if (!v.valid) return failure(v.error, state);

  const hand = state.hands[playerId];
  const card = hand[cardIndex];

  // Card stays in hand — Mendikot hidden card is face-DOWN not removed.
  // It is marked with isHidden:true so getPublicState can mask it for opponents.
  // The card IS still played during tricks; hiding only affects visibility.
  const markedCard = Object.freeze({ ...card, isHidden: true });
  const newHand    = Object.freeze(hand.map((c, i) => i === cardIndex ? markedCard : c));
  const newHands   = Object.freeze({ ...state.hands, [playerId]: newHand });

  // hiddenCard stores { card (unmarked), ownerPlayerId } for server-side tracking
  const hiddenCard = Object.freeze({ card, ownerPlayerId: playerId, handIndex: cardIndex });

  const newState = deriveState(state, {
    hands:      newHands,
    hiddenCard,
    turn: playerId,
  });

  runInvariants(newState);
  return succeed(newState);
}

// ─── peekHiddenCard ──────────────────────────────────────────────────────────

/**
 * Returns the hidden card value to the bidding winner.
 * This does NOT mutate state — it returns a supplemental data field.
 * { success: true, state, hiddenCard: Card }
 */
function peekHiddenCard(state, playerId) {
  const v = validatePeekHiddenCard(state, playerId);
  if (!v.valid) return failure(v.error, state);

  // State is unchanged; we just expose the card value in the return
  return { success: true, state, hiddenCard: state.hiddenCard.card };
}

// ─── startBidding ────────────────────────────────────────────────────────────

function startBidding(state, deadlineTimestamp) {
  const v = validateStartBidding(state, deadlineTimestamp);
  if (!v.valid) return failure(v.error, state);

  const newState = deriveState(state, {
    phase: PHASE.BIDDING,
    biddingState: Object.freeze({
      isOpen:        true,
      deadline:      deadlineTimestamp,
      highestBid:    null,
      bids:          Object.freeze({}),
      passedPlayers: Object.freeze([]),
      biddingWinner: null,
    }),
  });

  runInvariants(newState);
  return succeed(newState);
}

// ─── submitBid ───────────────────────────────────────────────────────────────

function submitBid(state, playerId, amount, timestamp) {
  const v = validateSubmitBid(state, playerId, amount, timestamp);
  if (!v.valid) return failure(v.error, state);

  const newBid = Object.freeze({ playerId, amount, timestamp });
  const newBids = Object.freeze({
    ...state.biddingState.bids,
    [playerId]: newBid,
  });

  const newBiddingState = Object.freeze({
    ...state.biddingState,
    highestBid: newBid,
    bids:       newBids,
  });

  const newState = deriveState(state, { biddingState: newBiddingState });
  runInvariants(newState);
  return succeed(newState);
}

// ─── passBid ─────────────────────────────────────────────────────────────────

function passBid(state, playerId, timestamp) {
  const v = validatePassBid(state, playerId);
  if (!v.valid) return failure(v.error, state);

  const newPassed = Object.freeze([...state.biddingState.passedPlayers, playerId]);
  const newBiddingState = Object.freeze({
    ...state.biddingState,
    passedPlayers: newPassed,
  });

  const newState = deriveState(state, { biddingState: newBiddingState });
  runInvariants(newState);
  return succeed(newState);
}

// ─── closeBidding ────────────────────────────────────────────────────────────

function closeBidding(state, closedAtTimestamp) {
  const v = validateCloseBidding(state);
  if (!v.valid) return failure(v.error, state);

  const { highestBid } = state.biddingState;
  const allPassed      = highestBid === null;

  if (allPassed) {
    // MINDI mode: no trump declared; start playing immediately
    const newBiddingState = Object.freeze({
      ...state.biddingState,
      isOpen: false,
    });
    const newState = deriveState(state, {
      phase:     PHASE.PLAYING,
      gameMode:  GAME_MODE.MINDI,
      biddingState: newBiddingState,
      // The hidden-card owner leads first trick
      // turn was already set to hiddenCard.ownerPlayerId in selectHiddenCard
    });
    runInvariants(newState);
    return succeed(newState);
  }

  // CONTRACT mode: winner picks trump
  const newBiddingState = Object.freeze({
    ...state.biddingState,
    isOpen:        false,
    biddingWinner: highestBid.playerId,
  });

  const newState = deriveState(state, {
    phase:     PHASE.TRUMP_SELECTION,
    gameMode:  GAME_MODE.CONTRACT,
    biddingState: newBiddingState,
  });

  runInvariants(newState);
  return succeed(newState);
}

// ─── determineGameMode ────────────────────────────────────────────────────────

/**
 * Pure read — returns the game mode without changing state.
 * Useful for callers to inspect mode after closeBidding.
 */
function determineGameMode(state) {
  return state.gameMode;
}

// ─── selectTrumpSuit ─────────────────────────────────────────────────────────

function selectTrumpSuit(state, playerId, suit) {
  const v = validateSelectTrumpSuit(state, playerId, suit);
  if (!v.valid) return failure(v.error, state);

  const newState = deriveState(state, {
    phase:     PHASE.PLAYING,
    trumpSuit: suit,
    // Hidden card owner leads first trick (turn already set from selectHiddenCard)
  });

  runInvariants(newState);
  return succeed(newState);
}

// ─── requestHiddenCardReveal ─────────────────────────────────────────────────

/**
 * Standalone reveal call. Also used internally by playCard when
 * options.requestReveal = true.
 */
function requestHiddenCardReveal(state, playerId, cardIndex) {
  const v = validateReveal(state, playerId, cardIndex);
  if (!v.valid) return failure(v.error, state);

  return applyReveal(state);
}

/**
 * Internal: apply the reveal effect to state.
 */
function applyReveal(state) {
  const hiddenCardSuit = state.hiddenCard.card.suit;
  const newState = deriveState(state, {
    hiddenCardRevealed: true,
    revealedHiddenCard: state.hiddenCard.card,
    trumpSuit:          hiddenCardSuit,
  });
  runInvariants(newState);
  return succeed(newState);
}

// ─── playCard ────────────────────────────────────────────────────────────────

/**
 * @param {GameState} state
 * @param {string} playerId
 * @param {number} cardIndex
 * @param {{ requestReveal?: boolean }} [options]
 */
function playCard(state, playerId, cardIndex, options = {}) {
  // Phase + turn + card existence
  const vPlay = validatePlayCard(state, playerId, cardIndex);
  if (!vPlay.valid) return failure(vPlay.error, state);

  // Atomic reveal: if player requests reveal, validate and apply it first
  let workingState = state;
  if (options.requestReveal) {
    const vReveal = validateReveal(state, playerId, cardIndex);
    if (!vReveal.valid) return failure(vReveal.error, state);
    const revealResult = applyReveal(state);
    if (!revealResult.success) return revealResult;
    workingState = revealResult.state;
  }

  // Suit-follow validation (after potential trump change from reveal)
  const vSuit = validateSuitFollow(workingState, playerId, cardIndex);
  if (!vSuit.valid) return failure(vSuit.error, state);

  // Remove card from hand
  const hand    = workingState.hands[playerId];
  const card    = hand[cardIndex];
  const newHand = Object.freeze(hand.filter((_, i) => i !== cardIndex));

  // Determine led suit for this trick
  const isLeading = workingState.currentTrick.ledSuit === null;
  const ledSuit   = isLeading ? card.suit : workingState.currentTrick.ledSuit;

  // Append play to current trick
  const playOrder = workingState.currentTrick.plays.length;
  const newPlay   = Object.freeze({ playerId, card, order: playOrder });
  const newPlays  = Object.freeze([...workingState.currentTrick.plays, newPlay]);

  const newTrick = Object.freeze({
    leadPlayerId: workingState.currentTrick.leadPlayerId ?? playerId,
    ledSuit,
    plays: newPlays,
  });

  const newHands = Object.freeze({
    ...workingState.hands,
    [playerId]: newHand,
  });

  const newPlayedByPlayer = Object.freeze({
    ...workingState.playedCardsByPlayer,
    [playerId]: Object.freeze([...(workingState.playedCardsByPlayer[playerId] ?? []), card]),
  });

  // If trick is complete (all players have played), resolve it
  if (newPlays.length === workingState.playerCount) {
    const intermediate = deriveState(workingState, {
      hands:               newHands,
      playedCardsByPlayer: newPlayedByPlayer,
      currentTrick:        newTrick,
    });
    return resolveTrick(intermediate);
  }

  // Trick still in progress: advance turn to next player
  const nextPlayer = getNextPlayerInOrder(
    workingState.seats, playerId, workingState.players
  );

  const newState = deriveState(workingState, {
    hands:               newHands,
    playedCardsByPlayer: newPlayedByPlayer,
    currentTrick:        newTrick,
    turn:                nextPlayer,
  });

  runInvariants(newState);
  return succeed(newState);
}

// ─── validateMove (public API wrapper) ───────────────────────────────────────

function validateMove(state, playerId, cardIndex) {
  const v1 = validatePlayCard(state, playerId, cardIndex);
  if (!v1.valid) return { valid: false, error: v1.error };
  const v2 = validateSuitFollow(state, playerId, cardIndex);
  if (!v2.valid) return { valid: false, error: v2.error };
  return { valid: true };
}

// ─── resolveTrick ────────────────────────────────────────────────────────────

function resolveTrick(state) {
  // Only call when currentTrick.plays.length === playerCount
  const trick  = state.currentTrick;
  const result = resolveTrickWinner(trick, state.trumpSuit);
  const { winnerPlayerId, mindisCaptured } = result;

  const winnerTeam = state.players[winnerPlayerId].teamId;

  // Update trick-level score
  const newTricksWon = Object.freeze({
    ...state.score.tricksWonByTeam,
    [winnerTeam]: state.score.tricksWonByTeam[winnerTeam] + 1,
  });
  const newMindis = Object.freeze({
    ...state.score.mindisByTeam,
    [winnerTeam]: state.score.mindisByTeam[winnerTeam] + mindisCaptured,
  });

  const newScore = Object.freeze({
    tricksWonByTeam: newTricksWon,
    mindisByTeam:    newMindis,
  });

  // Archive completed trick
  const completedTrick = Object.freeze({
    ...trick,
    winnerPlayerId,
    winnerTeam,
    mindisCaptured,
  });
  const newHistory = Object.freeze([...state.trickHistory, completedTrick]);

  const totalTricksPlayed = newHistory.length;
  const totalTricksForMatch = TOTAL_TRICKS[state.playerCount];
  const matchOver = totalTricksPlayed >= totalTricksForMatch;

  if (matchOver) {
    // Move to RESOLVING; resolveMatch() is called separately
    const newState = deriveState(state, {
      phase:        PHASE.RESOLVING,
      trickHistory: newHistory,
      score:        newScore,
      turn:         null,
      currentTrick: Object.freeze({ leadPlayerId: null, ledSuit: null, plays: Object.freeze([]) }),
    });
    runInvariants(newState);
    return resolveMatch(newState);
  }

  // Next trick: winner leads
  const newState = deriveState(state, {
    trickHistory: newHistory,
    score:        newScore,
    turn:         winnerPlayerId,
    currentTrick: Object.freeze({
      leadPlayerId: winnerPlayerId,
      ledSuit:      null,
      plays:        Object.freeze([]),
    }),
  });

  runInvariants(newState);
  return succeed(newState);
}

// ─── resolveMatch ────────────────────────────────────────────────────────────

function resolveMatch(state) {
  if (state.gameMode === GAME_MODE.CONTRACT) {
    return applyContractResult(state);
  } else {
    return applyMindiResult(state);
  }
}

// ─── applyContractResult ─────────────────────────────────────────────────────

function applyContractResult(state) {
  const { winnerTeam, isDraw } = evaluateContractResult(state);
  return _finalizeMatch(state, winnerTeam, isDraw);
}

// ─── applyMindiResult ────────────────────────────────────────────────────────

function applyMindiResult(state) {
  const { winnerTeam, isDraw } = evaluateMindiResult(state);
  return _finalizeMatch(state, winnerTeam, isDraw);
}

// ─── _finalizeMatch ───────────────────────────────────────────────────────────

function _finalizeMatch(state, winnerTeam, isDraw) {
  const nextDealerTeam = getNextDealerTeam(state.dealerTeam, winnerTeam);

  const matchResult = Object.freeze({
    winnerTeam,
    isDraw,
    gameMode:       state.gameMode,
    tricksWonByTeam: state.score.tricksWonByTeam,
    mindisByTeam:    state.score.mindisByTeam,
    bidAmount:       state.biddingState.highestBid?.amount ?? null,
    biddingWinner:   state.biddingState.biddingWinner ?? null,
  });

  // Update cumulative match record
  const oldRecord = state.matchRecord;
  let newByTeam;
  if (isDraw) {
    newByTeam = Object.freeze({
      A: Object.freeze({ ...oldRecord.byTeam.A, draws: oldRecord.byTeam.A.draws + 1 }),
      B: Object.freeze({ ...oldRecord.byTeam.B, draws: oldRecord.byTeam.B.draws + 1 }),
    });
  } else {
    const loserTeam = winnerTeam === TEAM.A ? TEAM.B : TEAM.A;
    newByTeam = Object.freeze({
      [winnerTeam]: Object.freeze({
        ...oldRecord.byTeam[winnerTeam],
        wins: oldRecord.byTeam[winnerTeam].wins + 1,
      }),
      [loserTeam]: Object.freeze({
        ...oldRecord.byTeam[loserTeam],
        losses: oldRecord.byTeam[loserTeam].losses + 1,
      }),
    });
  }

  const newMatchRecord = Object.freeze({
    totalMatches: oldRecord.totalMatches + 1,
    byTeam:       newByTeam,
  });

  const newState = deriveState(state, {
    phase:          PHASE.COMPLETE,
    matchResult,
    matchRecord:    newMatchRecord,
    nextDealerTeam,
  });

  runInvariants(newState);
  return succeed(newState);
}

// ─── resetMatch ──────────────────────────────────────────────────────────────

function resetMatch(state) {
  if (state.phase !== PHASE.COMPLETE) {
    return failure('WRONG_PHASE', state);
  }

  // Preserve: roomId, playerCount, seats, players, teams, matchRecord, nextDealerTeam
  // Clear everything match-scoped
  const newState = deriveState(state, {
    phase:        PHASE.WAITING,
    deck:         Object.freeze([]),
    hands:        Object.freeze({}),
    playedCardsByPlayer: Object.freeze({}),
    hiddenCard:         null,
    hiddenCardRevealed: false,
    revealedHiddenCard: null,
    trumpSuit:          null,
    gameMode:           null,
    turn:               null,
    hidingTeam:         null,
    dealerTeam:         null,
    currentTrick: Object.freeze({ leadPlayerId: null, ledSuit: null, plays: Object.freeze([]) }),
    trickHistory:       Object.freeze([]),
    score: Object.freeze({
      tricksWonByTeam: Object.freeze({ A: 0, B: 0 }),
      mindisByTeam:    Object.freeze({ A: 0, B: 0 }),
    }),
    matchResult: null,
    biddingState: Object.freeze({
      isOpen:        false,
      deadline:      null,
      highestBid:    null,
      bids:          Object.freeze({}),
      passedPlayers: Object.freeze([]),
      biddingWinner: null,
    }),
    firstMatch: false,
  });

  runInvariants(newState);
  return succeed(newState);
}

module.exports = {
  addPlayer,
  startDeal,
  dealCards,
  selectHiddenCard,
  peekHiddenCard,
  startBidding,
  submitBid,
  passBid,
  closeBidding,
  determineGameMode,
  selectTrumpSuit,
  requestHiddenCardReveal,
  playCard,
  validateMove,
  resolveTrick,
  resolveMatch,
  applyContractResult,
  applyMindiResult,
  resetMatch,
};
