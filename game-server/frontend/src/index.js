'use strict';

/**
 * PUBLIC API — Mendikot Game Engine
 * ───────────────────────────────────
 * Single entry point. Consumers import only from here.
 */

const { createGame }     = require('./stateFactory');
const { generateDeck, shuffleDeck } = require('./deck');
const { getPublicState } = require('./publicState');
const {
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
} = require('./transitions');
const { PHASE, SUIT, GAME_MODE, TEAM, BID_LIMITS, ERROR } = require('./constants');

module.exports = {
  // ── State creation ──────────────────────────────────────
  createGame,

  // ── Deck utilities ──────────────────────────────────────
  generateDeck,
  shuffleDeck,

  // ── All transitions ─────────────────────────────────────
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

  // ── View ─────────────────────────────────────────────────
  getPublicState,

  // ── Constants (re-exported for consumers) ───────────────
  PHASE,
  SUIT,
  GAME_MODE,
  TEAM,
  BID_LIMITS,
  ERROR,
};
