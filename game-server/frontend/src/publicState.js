'use strict';

/**
 * PUBLIC STATE LAYER
 * ──────────────────
 * Returns a view of GameState that is safe to send to a specific player.
 *
 * Rules:
 *   - Other players' hands are NEVER visible
 *   - Hidden card value is masked unless:
 *       (a) card has been revealed (hiddenCardRevealed = true), OR
 *       (b) viewer is the bidding winner in CONTRACT mode
 */

function getPublicState(state, viewerPlayerId) {
  const isBiddingWinner =
    state.gameMode === 'CONTRACT' &&
    state.biddingState.biddingWinner === viewerPlayerId;

  const canSeeHiddenCard = state.hiddenCardRevealed || isBiddingWinner;

  // Build masked hands: viewer sees own hand fully; hidden card masked for opponents
  const maskedHands = {};
  for (const [playerId, hand] of Object.entries(state.hands)) {
    if (playerId === viewerPlayerId) {
      maskedHands[playerId] = hand; // full hand visible (including own hidden card marker)
    } else {
      maskedHands[playerId] = hand.map(c => {
        // Mask the hidden card for opponents unless it's been revealed
        if (c.isHidden && !canSeeHiddenCard) {
          return Object.freeze({ masked: true, isHiddenCard: true });
        }
        return c;
      });
    }
  }

  return Object.freeze({
    roomId:       state.roomId,
    playerCount:  state.playerCount,
    phase:        state.phase,
    seats:        state.seats,
    players:      state.players,
    teams:        state.teams,
    dealerTeam:   state.dealerTeam,
    hidingTeam:   state.hidingTeam,
    gameMode:     state.gameMode,
    trumpSuit:    state.trumpSuit,
    turn:         state.turn,
    matchNumber:  state.matchRecord.totalMatches + 1,

    // My hand (full)
    myHand: state.hands[viewerPlayerId] ?? [],

    // All hands (my full, others masked)
    hands: maskedHands,

    // Hidden card: full if allowed, else just presence indicator
    hiddenCard: state.hiddenCard
      ? canSeeHiddenCard
        ? state.hiddenCard          // { card, ownerPlayerId }
        : { ownerPlayerId: state.hiddenCard.ownerPlayerId, card: null }
      : null,

    hiddenCardRevealed: state.hiddenCardRevealed,
    revealedHiddenCard: state.revealedHiddenCard,

    // Bidding: show all bids and passes (amounts visible to all — open bidding)
    biddingState: {
      isOpen:        state.biddingState.isOpen,
      deadline:      state.biddingState.deadline,
      highestBid:    state.biddingState.highestBid,
      bids:          state.biddingState.bids,
      passedPlayers: state.biddingState.passedPlayers,
      biddingWinner: state.biddingState.biddingWinner,
    },

    currentTrick:   state.currentTrick,
    trickHistory:   state.trickHistory,
    score:          state.score,
    matchResult:    state.matchResult,
    matchRecord:    state.matchRecord,
    firstMatch:     state.firstMatch,
  });
}

module.exports = { getPublicState };
