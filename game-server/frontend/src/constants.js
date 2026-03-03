'use strict';

// ─── PHASES ──────────────────────────────────────────────────────────────────
const PHASE = Object.freeze({
  WAITING:         'WAITING',
  DEALING:         'DEALING',
  HIDING_CARD:     'HIDING_CARD',
  BIDDING:         'BIDDING',
  TRUMP_SELECTION: 'TRUMP_SELECTION',
  PLAYING:         'PLAYING',
  RESOLVING:       'RESOLVING',
  COMPLETE:        'COMPLETE',
});

// ─── SUITS ───────────────────────────────────────────────────────────────────
const SUIT = Object.freeze({
  SPADES:   'S',
  HEARTS:   'H',
  DIAMONDS: 'D',
  CLUBS:    'C',
});
const ALL_SUITS = Object.freeze(['S', 'H', 'D', 'C']);

// ─── RANKS ───────────────────────────────────────────────────────────────────
// Full deck ranks for 4-player (52 cards)
const RANKS_4P = Object.freeze(['2','3','4','5','6','7','8','9','10','J','Q','K','A']);
// Reduced ranks for 6/8-player (6-A only)
const RANKS_6_8P = Object.freeze(['6','7','8','9','10','J','Q','K','A']);

// Rank value maps (higher = stronger)
const RANK_VALUE_4P = Object.freeze(
  Object.fromEntries(RANKS_4P.map((r, i) => [r, i + 2]))
  // 2→2, 3→3 … A→14
);
const RANK_VALUE_6_8P = Object.freeze(
  Object.fromEntries(RANKS_6_8P.map((r, i) => [r, i + 6]))
  // 6→6, 7→7 … A→14
);

// ─── GAME MODES ──────────────────────────────────────────────────────────────
const GAME_MODE = Object.freeze({
  CONTRACT: 'CONTRACT',
  MINDI:    'MINDI',
});

// ─── TEAM IDS ────────────────────────────────────────────────────────────────
const TEAM = Object.freeze({ A: 'A', B: 'B' });

// ─── BID LIMITS ──────────────────────────────────────────────────────────────
const BID_LIMITS = Object.freeze({
  4: { min: 8,  max: 13 },
  6: { min: 7,  max: 12 },
  8: { min: 7,  max: 9  },
});

// ─── CARD COUNTS ─────────────────────────────────────────────────────────────
const HAND_SIZE = Object.freeze({ 4: 13, 6: 12, 8: 9 });
const TOTAL_TRICKS = Object.freeze({ 4: 13, 6: 12, 8: 9 });

// Mindi = the 10s. Majority thresholds:
// 4-player: 4 mindis total → majority = 3; draw at 2-2
// 6/8-player: 8 mindis total → majority = 5; no draw possible
const MINDI_TOTAL     = Object.freeze({ 4: 4,  6: 8, 8: 8 });
const MINDI_MAJORITY  = Object.freeze({ 4: 3,  6: 5, 8: 5 });
const MINDI_RANK = '10';

// ─── ERROR CODES ─────────────────────────────────────────────────────────────
const ERROR = Object.freeze({
  INVALID_PLAYER_COUNT:   'INVALID_PLAYER_COUNT',
  SEAT_TAKEN:             'SEAT_TAKEN',
  SEAT_OUT_OF_RANGE:      'SEAT_OUT_OF_RANGE',
  GAME_FULL:              'GAME_FULL',
  INVALID_PLAYER:         'INVALID_PLAYER',
  DUPLICATE_PLAYER:       'DUPLICATE_PLAYER',
  WRONG_PHASE:            'WRONG_PHASE',
  WRONG_TURN:             'WRONG_TURN',
  CARD_NOT_IN_HAND:       'CARD_NOT_IN_HAND',
  MUST_FOLLOW_SUIT:       'MUST_FOLLOW_SUIT',
  BID_TOO_LOW:            'BID_TOO_LOW',
  BID_OUT_OF_RANGE:       'BID_OUT_OF_RANGE',
  BIDDING_CLOSED:         'BIDDING_CLOSED',
  ALREADY_PASSED:         'ALREADY_PASSED',
  NOT_BIDDING_WINNER:     'NOT_BIDDING_WINNER',
  INVALID_SUIT:           'INVALID_SUIT',
  ALREADY_REVEALED:       'ALREADY_REVEALED',
  NOT_HIDING_TEAM:        'NOT_HIDING_TEAM',
  CANNOT_REVEAL:          'CANNOT_REVEAL',
  WRONG_DEALER_TEAM:      'WRONG_DEALER_TEAM',
  NOT_IN_ROOM:            'NOT_IN_ROOM',
  NO_SEAT_SELECTED:       'NO_SEAT_SELECTED',
  REVEAL_NOT_LEGAL:       'REVEAL_NOT_LEGAL',
  PEEK_NOT_ALLOWED:       'PEEK_NOT_ALLOWED',
});

module.exports = {
  PHASE, SUIT, ALL_SUITS,
  RANKS_4P, RANKS_6_8P,
  RANK_VALUE_4P, RANK_VALUE_6_8P,
  GAME_MODE, TEAM,
  BID_LIMITS, HAND_SIZE, TOTAL_TRICKS,
  MINDI_TOTAL, MINDI_MAJORITY, MINDI_RANK,
  ERROR,
};
