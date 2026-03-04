'use strict';

const admin = require('firebase-admin');
const GameEngine = require('./index');

const FieldValue = admin.firestore.FieldValue;
const BIDDING_WINDOW_MS = 30_000;

async function persistState(roomRef, newState) {
  const batch = roomRef.firestore.batch();

  batch.set(roomRef.collection('gameState').doc('engine'), {
    state: JSON.parse(JSON.stringify(newState)),
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(roomRef.collection('gameState').doc('public'), {
    ...buildPublicSnapshot(newState),
    updatedAt: FieldValue.serverTimestamp(),
  });

  for (const [pid, hand] of Object.entries(newState.hands ?? {})) {
    batch.set(roomRef.collection('privateHands').doc(pid), {
      cards: hand,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  if (newState.matchRecord) {
    batch.set(roomRef.collection('scores').doc('main'), {
      teamA: newState.matchRecord.byTeam?.A ?? { wins: 0, losses: 0, draws: 0 },
      teamB: newState.matchRecord.byTeam?.B ?? { wins: 0, losses: 0, draws: 0 },
      totalMatches: newState.matchRecord.totalMatches ?? 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const roomMetadataUpdate = {
    'metadata.lastActivityAt': FieldValue.serverTimestamp(),
  };
  if (newState.phase === 'COMPLETE') {
    roomMetadataUpdate['metadata.status'] = 'COMPLETE';
    roomMetadataUpdate['metadata.completedAt'] = FieldValue.serverTimestamp();
  }
  batch.update(roomRef, roomMetadataUpdate);

  await batch.commit();
}

function buildPublicSnapshot(state) {
  return {
    phase: state.phase,
    gameMode: state.gameMode,
    trumpSuit: state.trumpSuit,
    turn: state.turn,
    currentTrickIndex: state.trickHistory?.length ?? 0,
    totalTricks: state.playerCount === 4 ? 13 : state.playerCount === 6 ? 12 : 9,
    hidingTeam: state.hidingTeam,
    hiddenCardHolder: state.hiddenCard?.ownerPlayerId ?? null,
    hiddenCardRevealed: state.hiddenCardRevealed ?? false,
    revealedHiddenCard: state.hiddenCardRevealed ? state.revealedHiddenCard : null,
    biddingState: {
      isOpen: state.biddingState?.isOpen ?? false,
      deadline: state.biddingState?.deadline ?? null,
      bids: state.biddingState?.bids ?? {},
      passedPlayers: state.biddingState?.passedPlayers ?? [],
      biddingWinner: state.biddingState?.biddingWinner ?? null,
      highestBid: state.biddingState?.highestBid ?? null,
    },
    currentTrick: state.currentTrick,
    trickHistory: state.trickHistory,
    score: state.score,
    matchResult: state.matchResult,
    matchRecord: state.matchRecord,
    seats: state.seats,
    players: state.players,
    teams: state.teams,
    dealerTeam: state.dealerTeam,
    firstMatch: state.firstMatch,
  };
}

async function handleSelectSeat({ state, playerId, actionData, roomRef, players }) {
  const { seatNumber } = actionData;

  const existing = Object.values(players).find(
    (p) => p.seatNumber === seatNumber && p.playerId !== playerId
  );
  if (existing) return { success: false, error: 'SEAT_TAKEN' };

  const result = GameEngine.addPlayer(state, playerId, seatNumber);
  if (!result.success) return { success: false, error: result.error };

  await roomRef.collection('players').doc(playerId).update({
    seatNumber,
    teamId: result.state.players[playerId].teamId,
  });

  await persistState(roomRef, result.state);
  return { success: true, phase: result.state.phase };
}

async function handleReady({ state, playerId, roomRef, players }) {
  await roomRef.collection('players').doc(playerId).update({ isReady: true });

  const allReady = Object.values(players).every(
    (p) => (p.playerId === playerId ? true : p.isReady) && p.seatNumber !== null
  );
  const allSeated = Object.values(players).length === state.playerCount;

  if (!(allReady && allSeated)) {
    return { success: true, phase: state.phase };
  }

  const dealtResult = GameEngine.startDeal(state, playerId);
  if (!dealtResult.success) return { success: false, error: dealtResult.error };

  const hidingTeam = dealtResult.state.hidingTeam;
  const hidingPlayerIds = Object.entries(dealtResult.state.players)
    .filter(
      ([pid, p]) =>
        p.teamId === hidingTeam &&
        (dealtResult.state.hands?.[pid]?.length ?? 0) > 0
    )
    .map(([pid]) => pid);

  if (hidingPlayerIds.length === 0) {
    return { success: false, error: 'AUTO_HIDE_FAILED' };
  }

  const hiddenOwnerPlayerId =
    hidingPlayerIds[Math.floor(Math.random() * hidingPlayerIds.length)];
  const hiddenOwnerHand = dealtResult.state.hands?.[hiddenOwnerPlayerId] ?? [];
  const hiddenCardIndex = Math.floor(Math.random() * hiddenOwnerHand.length);

  const hiddenCardResult = GameEngine.selectHiddenCard(
    dealtResult.state,
    hiddenOwnerPlayerId,
    hiddenCardIndex
  );
  if (!hiddenCardResult.success) return { success: false, error: hiddenCardResult.error };

  const biddingResult = GameEngine.startBidding(
    hiddenCardResult.state,
    Date.now() + BIDDING_WINDOW_MS
  );
  if (!biddingResult.success) return { success: false, error: biddingResult.error };

  await persistState(roomRef, biddingResult.state);
  await roomRef.update({
    'metadata.status': 'IN_PROGRESS',
    'metadata.lastActivityAt': FieldValue.serverTimestamp(),
  });

  return { success: true, phase: biddingResult.state.phase };
}

async function handleSelectHiddenCard({ state, playerId, actionData, roomRef }) {
  const { cardId } = actionData;
  const hand = state.hands[playerId] ?? [];
  const cardIndex = hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return { success: false, error: 'CARD_NOT_IN_HAND' };

  const result = GameEngine.selectHiddenCard(state, playerId, cardIndex);
  if (!result.success) return { success: false, error: result.error };

  await persistState(roomRef, result.state);

  const bidResult = GameEngine.startBidding(result.state, Date.now() + BIDDING_WINDOW_MS);
  if (!bidResult.success) return { success: false, error: bidResult.error };

  await persistState(roomRef, bidResult.state);
  return { success: true, phase: bidResult.state.phase };
}

async function handleSubmitBid({ state, playerId, actionData, roomRef }) {
  const { amount } = actionData;
  const timestamp = Date.now();

  const result = GameEngine.submitBid(state, playerId, amount, timestamp);
  if (!result.success) return { success: false, error: result.error };

  await persistState(roomRef, result.state);
  return { success: true, phase: result.state.phase };
}

async function handlePassBid({ state, playerId, roomRef }) {
  const result = GameEngine.passBid(state, playerId, Date.now());
  if (!result.success) return { success: false, error: result.error };

  const allPlayerIds = Object.keys(result.state.players);
  const allPassed = allPlayerIds.every((pid) =>
    result.state.biddingState.passedPlayers.includes(pid)
  );

  if (allPassed) {
    const closeResult = GameEngine.closeBidding(result.state, Date.now());
    if (!closeResult.success) return { success: false, error: closeResult.error };
    await persistState(roomRef, closeResult.state);
    return { success: true, phase: closeResult.state.phase };
  }

  await persistState(roomRef, result.state);
  return { success: true, phase: result.state.phase };
}

async function handleSelectTrumpSuit({ state, playerId, actionData, roomRef }) {
  const { suit } = actionData;
  const result = GameEngine.selectTrumpSuit(state, playerId, suit);
  if (!result.success) return { success: false, error: result.error };

  await persistState(roomRef, result.state);
  return { success: true, phase: result.state.phase };
}

async function handlePeekHiddenCard({ state, playerId }) {
  const result = GameEngine.peekHiddenCard(state, playerId);
  if (!result.success) return { success: false, error: result.error };
  return { success: true, hiddenCard: result.hiddenCard, phase: result.state?.phase };
}

async function handlePlayCard({ state, playerId, actionData, roomRef }) {
  const { cardId, requestReveal } = actionData;
  const hand = state.hands[playerId] ?? [];
  const cardIndex = hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return { success: false, error: 'CARD_NOT_IN_HAND' };

  const result = GameEngine.playCard(state, playerId, cardIndex, {
    requestReveal: requestReveal === true,
  });
  if (!result.success) return { success: false, error: result.error };

  await persistState(roomRef, result.state);
  return { success: true, phase: result.state.phase };
}

async function handleHiddenCardReveal({ state, playerId, actionData, roomRef }) {
  const { cardId } = actionData;
  const hand = state.hands[playerId] ?? [];
  const cardIndex = cardId ? hand.findIndex((c) => c.id === cardId) : 0;

  const result = GameEngine.requestHiddenCardReveal(state, playerId, cardIndex);
  if (!result.success) return { success: false, error: result.error };

  await persistState(roomRef, result.state);
  return { success: true, phase: result.state.phase };
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
