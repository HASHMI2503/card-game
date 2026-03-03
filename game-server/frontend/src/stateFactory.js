'use strict';

const { PHASE, TEAM } = require('./constants');

/**
 * Creates a fresh GameState for a new room.
 * This is the ONLY place a state object is created from scratch.
 * All other transitions return copies of an existing state.
 *
 * @param {string} roomId
 * @param {number} playerCount - 4 | 6 | 8
 * @returns {GameState}
 */
function createGame(roomId, playerCount) {
  return Object.freeze({
    // ── Room identity ──────────────────────────────────
    roomId,
    playerCount,
    phase: PHASE.WAITING,

    // ── Seating: seatNumber(1-N) -> playerId ──────────
    seats: Object.freeze({}),

    // ── Players: playerId -> { seatNumber, teamId, joinedAt } ──
    players: Object.freeze({}),

    // ── Teams: A -> { playerIds[] }, B -> { playerIds[] } ──
    teams: Object.freeze({
      [TEAM.A]: Object.freeze({ playerIds: Object.freeze([]) }),
      [TEAM.B]: Object.freeze({ playerIds: Object.freeze([]) }),
    }),

    // ── Dealer control ────────────────────────────────
    dealerTeam:     null,   // team that dealt this match
    nextDealerTeam: null,   // loser of last match (or same on draw)
    hidingTeam:     null,   // team that hides the card this match

    // ── Cards ─────────────────────────────────────────
    deck:   Object.freeze([]),
    // hands: playerId -> Card[]  (visible hand, hidden card removed)
    hands:  Object.freeze({}),
    // playedCardsByPlayer: playerId -> Card[]
    playedCardsByPlayer: Object.freeze({}),

    // ── Hidden card ───────────────────────────────────
    hiddenCard:         null,   // { card, ownerPlayerId }
    hiddenCardRevealed: false,
    revealedHiddenCard: null,   // card object, once revealed

    // ── Trump / mode ──────────────────────────────────
    trumpSuit: null,
    gameMode:  null,

    // ── Bidding ───────────────────────────────────────
    biddingState: Object.freeze({
      isOpen:       false,
      deadline:     null,
      highestBid:   null,   // { playerId, amount, timestamp }
      bids:         Object.freeze({}),  // playerId -> { amount, timestamp }
      passedPlayers: Object.freeze([]),
      biddingWinner: null,
    }),

    // ── Tricks ────────────────────────────────────────
    // currentTrick: { leadPlayerId, ledSuit, plays: [{ playerId, card, order }] }
    currentTrick: Object.freeze({
      leadPlayerId: null,
      ledSuit:      null,
      plays:        Object.freeze([]),
    }),
    trickHistory: Object.freeze([]),

    // ── Score for current match ───────────────────────
    score: Object.freeze({
      tricksWonByTeam: Object.freeze({ A: 0, B: 0 }),
      mindisByTeam:    Object.freeze({ A: 0, B: 0 }),
    }),

    // ── Match result ──────────────────────────────────
    matchResult: null,

    // ── Cumulative record across matches ──────────────
    matchRecord: Object.freeze({
      totalMatches: 0,
      byTeam: Object.freeze({
        A: Object.freeze({ wins: 0, losses: 0, draws: 0 }),
        B: Object.freeze({ wins: 0, losses: 0, draws: 0 }),
      }),
    }),

    // ── Turn ──────────────────────────────────────────
    turn: null,   // playerId whose turn it is

    // ── Match flags ───────────────────────────────────
    firstMatch: true,

    // ── Internal integrity marker ─────────────────────
    invariantsVersion: 0,
  });
}

/**
 * Returns a shallow-frozen deep copy of a state with the given overrides.
 * Nested objects that are overridden must be explicitly frozen by caller.
 * Use this as the canonical way to produce new state objects.
 *
 * @param {GameState} state
 * @param {Partial<GameState>} overrides
 * @returns {GameState}
 */
function deriveState(state, overrides) {
  return Object.freeze(Object.assign({}, state, overrides, {
    invariantsVersion: (state.invariantsVersion ?? 0) + 1,
  }));
}

module.exports = { createGame, deriveState };
