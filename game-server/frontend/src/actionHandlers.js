'use strict';

// ============================================================
// ACTION HANDLERS
// src/actionHandlers.js
//
// Each function handles one player action type.
// Pattern for every handler:
//   1. Call the pure game engine function
//   2. If success → save new state to Firestore
//   3. Return { success, error? }
//
// All game RULES live in src/ (the pure engine).
// All Firebase I/O lives here.
// ============================================================

const admin      = require('firebase-admin');
const GameEngine = require('./index');

const FieldValue = admin.firestore.FieldValue;


// ─── Shared save helper (imported from server to avoid circular dep) ─────────
// We pass saveState and buildPublicSnapshot as part of context in production.
// For simplicity here, we re-implement a lean version.

async function persistState(roomRef, newState) {
  const batch = roomRef.firestore.batch();

  batch.set(roomRef.collection('gameState').doc('engine'), {
    state:     JSON.parse(JSON.stringify(newState)),
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(roomRef.collection('gameState').doc('public'), {
    ...buildPublicSnapshot(newState),
    updatedAt: FieldValue.serverTimestamp(),
  });

  for (const [pid, hand] of Object.entries(newState.hands ?? {})) {
    batch.set(roomRef.collection('privateHands').doc(pid), {
      cards:     hand,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  if (newState.matchRecord) {
    batch.set(roomRef.collection('scores').doc('main'), {
      teamA:        newState.matchRecord.byTeam?.A ?? { wins: 0, losses: 0, draws: 0 },
      teamB:        newState.matchRecord.byTeam?.B ?? { wins: 0, losses: 0, draws: 0 },
      totalMatches: newState.matchRecord.totalMatches ?? 0,
      updatedAt:    FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
}

function buildPublicSnapshot(state) {
  return {
    phase:             state.phase,
    gameMode:          state.gameMode,
    trumpSuit:         state.trumpSuit,
    turn:              state.turn,
    currentTrickIndex: state.trickHistory?.length ?? 0,
    totalTricks:       state.playerCount === 4 ? 13 : state.playerCount === 6 ? 12 : 9,
    hidingTeam:        state.hidingTeam,
    hiddenCardHolder:  state.hiddenCard?.ownerPlayerId ?? null,
    hiddenCardRevealed: state.hiddenCardRevealed ?? false,
    revealedHiddenCard: state.hiddenCardRevealed ? state.revealedHiddenCard : null,
    biddingState: {
      isOpen:        state.biddingState?.isOpen ?? false,
      deadline:      state.biddingState?.deadline ?? null,
      bids:          state.biddingState?.bids ?? {},
      passedPlayers: state.biddingState?.passedPlayers ?? [],
      biddingWinner: state.biddingState?.biddingWinner ?? null,
      highestBid:    state.biddingState?.highestBid ?? null,
    },
    currentTrick:  state.currentTrick,
    trickHistory:  state.trickHistory,
    score:         state.score,
    matchResult:   state.matchResult,
    matchRecord:   state.matchRecord,
    seats:         state.seats,
    players:       state.players,
    teams:         state.teams,
    dealerTeam:    state.dealerTeam,
    firstMatch:    state.firstMatch,
  };
}


// ─── SELECT_SEAT ─────────────────────────────────────────────────────────────

async function handleSelectSeat({ state, playerId, actionData, roomRef, players }) {
  const { seatNumber } = actionData;

  // Check seat not already taken by someone else
  const existing = Object.values(players).find(
    p => p.seatNumber === seatNumber && p.playerId !== playerId
  );
  if (existing) return { success: false, error: 'SEAT_TAKEN' };

  // Run engine transition
  const result = GameEngine.addPlayer(state, playerId, seatNumber);
  if (!result.success) return { success: false, error: result.error };

  // Update player document in Firestore
  await roomRef.collection('players').doc(playerId).update({
    seatNumber,
    teamId: result.state.players[playerId].teamId,
  });

  await persistState(roomRef, result.state);
  return { success: true };
}


// ─── READY ───────────────────────────────────────────────────────────────────

async function handleReady({ state, playerId, roomRef, players }) {
  // Mark player ready in Firestore
  await roomRef.collection('players').doc(playerId).update({
    isReady: true,
  });

  // Check if ALL players are ready and seated
  const allReady = Object.values(players).every(
    p => (p.playerId === playerId ? true : p.isReady) && p.seatNumber !== null
  );
  const allSeated = Object.values(players).length === state.playerCount;

  if (allReady && allSeated) {
    // Everyone ready → deal cards automatically
    const result = GameEngine.startDeal(state, playerId);
    if (!result.success) return { success: false, error: result.error };
    await persistState(roomRef, result.state);

    // Update room status to IN_PROGRESS
    await roomRef.update({ 'metadata.status': 'IN_PROGRESS' });
  }

  return { success: true };
}


// ─── SELECT_HIDDEN_CARD ───────────────────────────────────────────────────────

async function handleSelectHiddenCard({ state, playerId, actionData, roomRef }) {
  const { cardId } = actionData;

  // Find card index in player's hand
  const hand      = state.hands[playerId] ?? [];
  const cardIndex = hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return { success: false, error: 'CARD_NOT_IN_HAND' };

  const result = GameEngine.selectHiddenCard(state, playerId, cardIndex);
  if (!result.success) return { success: false, error: result.error };

  await persistState(roomRef, result.state);

  // Auto-start bidding with 30-second window
  const deadline    = Date.now() + 30_000;
  const bidResult   = GameEngine.startBidding(result.state, deadline);
  if (!bidResult.success) return { success: false, error: bidResult.error };

  await persistState(roomRef, bidResult.state);
  return { success: true };
}


// ─── SUBMIT_BID ──────────────────────────────────────────────────────────────

async function handleSubmitBid({ state, playerId, actionData, roomRef }) {
  const { amount } = actionData;
  const timestamp  = Date.now();

  const result = GameEngine.submitBid(state, playerId, amount, timestamp);
  if (!result.success) return { success: false, error: result.error };

  await persistState(roomRef, result.state);
  return { success: true };
}


// ─── PASS_BID ────────────────────────────────────────────────────────────────

async function handlePassBid({ state, playerId, db, roomRef }) {
  const result = GameEngine.passBid(state, playerId, Date.now());
  if (!result.success) return { success: false, error: result.error };

  // Check if all players have now passed
  const allPlayerIds = Object.keys(result.state.players);
  const allPassed    = allPlayerIds.every(
    pid => result.state.biddingState.passedPlayers.includes(pid)
  );

  if (allPassed) {
    // Auto-close bidding → Mindi mode
    const closeResult = GameEngine.closeBidding(result.state, Date.now());
    if (!closeResult.success) return { success: false, error: closeResult.error };
    await persistState(roomRef, closeResult.state);
  } else {
    await persistState(roomRef, result.state);
  }

  return { success: true };
}


// ─── SELECT_TRUMP_SUIT ────────────────────────────────────────────────────────

async function handleSelectTrumpSuit({ state, playerId, actionData, roomRef }) {
  const { suit } = actionData;
  const result   = GameEngine.selectTrumpSuit(state, playerId, suit);
  if (!result.success) return { success: false, error: result.error };

  await persistState(roomRef, result.state);
  return { success: true };
}


// ─── PEEK_HIDDEN_CARD ─────────────────────────────────────────────────────────
// Does NOT change state. Returns card value only to the requesting player.

async function handlePeekHiddenCard({ state, playerId }) {
  const result = GameEngine.peekHiddenCard(state, playerId);
  if (!result.success) return { success: false, error: result.error };

  // Return hidden card only in the action result (not persisted to public state)
  return { success: true, hiddenCard: result.hiddenCard };
}


// ─── PLAY_CARD ────────────────────────────────────────────────────────────────

async function handlePlayCard({ state, playerId, actionData, roomRef }) {
  const { cardId, requestReveal } = actionData;

  // Find card index in player's hand
  const hand      = state.hands[playerId] ?? [];
  const cardIndex = hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return { success: false, error: 'CARD_NOT_IN_HAND' };

  const result = GameEngine.playCard(
    state, playerId, cardIndex,
    { requestReveal: requestReveal === true }
  );
  if (!result.success) return { success: false, error: result.error };

  await persistState(roomRef, result.state);
  return { success: true };
}


// ─── REQUEST_HIDDEN_CARD_REVEAL ────────────────────────────────────────────────

async function handleHiddenCardReveal({ state, playerId, actionData, roomRef }) {
  const { cardId } = actionData;
  const hand       = state.hands[playerId] ?? [];
  const cardIndex  = cardId ? hand.findIndex(c => c.id === cardId) : 0;

  const result = GameEngine.requestHiddenCardReveal(state, playerId, cardIndex);
  if (!result.success) return { success: false, error: result.error };

  await persistState(roomRef, result.state);
  return { success: true };
}


module.exports = {
  handleSelectSeat,
  handleReady,
  handleSelectHiddenCard,
  handleSubmitBid,
  handlePassBid,
  handleSelectTrumpSuit,
  handlePeekHiddenCard,
  handlePlayCard,
  handleHiddenCardReveal,
};
